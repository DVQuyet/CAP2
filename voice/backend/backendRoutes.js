const crypto = require("crypto");
const fs = require("fs");
const { createRequire } = require("module");
const path = require("path");

const db = require("../../Backend/src/config/db");
const { verifyToken, checkRole } = require("../../Backend/src/middleware/authMiddleware");
const { ensureNotificationSchema } = require("../../Backend/src/shared/utils/notifications");

const backendRequire = createRequire(path.resolve(__dirname, "..", "..", "Backend", "package.json"));
const express = backendRequire("express");
const multer = backendRequire("multer");

const router = express.Router();

const BACKEND_DIR = path.resolve(__dirname, "..", "..", "Backend");
const STORAGE_ROOT = process.env.VOICE_STORAGE_ROOT
  ? path.resolve(process.env.VOICE_STORAGE_ROOT)
  : path.join(BACKEND_DIR, "storage");
const RECORDINGS_DIR = path.join(STORAGE_ROOT, "recordings");
const MAX_DURATION_SECONDS = Number(process.env.VOICE_MAX_DURATION_SECONDS || 180);
const MAX_FILE_MB = Number(process.env.VOICE_MAX_FILE_MB || 25);
const MAX_FILE_BYTES = Math.max(1, MAX_FILE_MB) * 1024 * 1024;
let schemaReadyPromise = null;
let scheduledJobStarted = false;

fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

const MIME_TO_EXT = {
  "audio/webm": ".webm",
  "video/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
};

const getSafeExtension = (file) => {
  const originalExt = path.extname(file.originalname || "").toLowerCase();
  const allowedExts = new Set([".webm", ".ogg", ".wav", ".mp3", ".m4a", ".aac"]);
  if (allowedExts.has(originalExt)) return originalExt;
  return MIME_TO_EXT[file.mimetype] || ".webm";
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, RECORDINGS_DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomUUID()}${getSafeExtension(file)}`),
  }),
  limits: {
    fileSize: MAX_FILE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || "").toLowerCase();
    if (MIME_TO_EXT[mime] || mime.startsWith("audio/")) {
      cb(null, true);
      return;
    }
    cb(new Error("File ghi am khong dung dinh dang audio."));
  },
});

const parsePositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
};

const splitSqlStatements = (sql) => {
  const statements = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (const char of sql) {
    current += char;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (char === ";" && !inSingle && !inDouble) {
      const statement = current.trim().replace(/;$/, "").trim();
      if (statement) statements.push(statement);
      current = "";
    }
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
};

const ensureVoiceSchema = () => {
  if (!schemaReadyPromise) {
    const schemaPath = path.resolve(__dirname, "..", "schema", "voice.schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");
    schemaReadyPromise = (async () => {
      for (const statement of splitSqlStatements(schemaSql)) {
        await db.query(statement);
      }
      const [columns] = await db.query("SHOW COLUMNS FROM recordings");
      const existingColumns = new Set(columns.map((column) => column.Field));
      const migrations = [
        ["processing_started_at", "ALTER TABLE recordings ADD COLUMN processing_started_at TIMESTAMP NULL AFTER status"],
        ["transcript_edited", "ALTER TABLE recordings ADD COLUMN transcript_edited TINYINT(1) NOT NULL DEFAULT 0 AFTER transcript"],
        ["transcript_edited_at", "ALTER TABLE recordings ADD COLUMN transcript_edited_at TIMESTAMP NULL AFTER transcript_edited"],
        ["transcribed_at", "ALTER TABLE recordings ADD COLUMN transcribed_at TIMESTAMP NULL AFTER transcript_edited_at"],
      ];

      for (const [columnName, statement] of migrations) {
        if (!existingColumns.has(columnName)) {
          await db.query(statement);
        }
      }
    })().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }
  return schemaReadyPromise;
};

const resolveStoragePath = (storagePath) => {
  const cleaned = String(storagePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  let resolved;
  if (path.isAbsolute(String(storagePath || ""))) {
    resolved = path.resolve(String(storagePath));
  } else if (cleaned.startsWith("storage/")) {
    resolved = path.resolve(BACKEND_DIR, cleaned);
  } else if (cleaned.startsWith("Backend/storage/")) {
    resolved = path.resolve(path.join(__dirname, "..", ".."), cleaned);
  } else {
    resolved = path.resolve(STORAGE_ROOT, cleaned);
  }
  const storageRootWithSep = STORAGE_ROOT.endsWith(path.sep) ? STORAGE_ROOT : `${STORAGE_ROOT}${path.sep}`;
  if (resolved !== STORAGE_ROOT && !resolved.startsWith(storageRootWithSep)) {
    throw new Error("Duong dan file ghi am khong hop le.");
  }
  return resolved;
};

const formatMysqlDateTime = (date) => {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`;
};

const parseScheduledAt = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const text = String(value).trim();
  const normalized = text.includes("T") ? text : text.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    const error = new Error("scheduled_at khong hop le.");
    error.status = 400;
    throw error;
  }
  return {
    date,
    sql: /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text) ? text.replace("T", " ").slice(0, 19) : formatMysqlDateTime(date),
  };
};

const isAdmin = (req) => Number(req.user?.role_id) === 1 || req.user?.role_name === "admin";

const getAuthorizedClanIds = async (accountId) => {
  const [rows] = await db.query(
    `
      SELECT DISTINCT clan_id
      FROM account_clans
      WHERE account_id = ? AND status = 'active' AND clan_id IS NOT NULL
    `,
    [accountId]
  );
  return rows.map((row) => Number(row.clan_id)).filter((id) => Number.isFinite(id));
};

const canUseClan = (req, authorizedClanIds, clanId) => {
  if (!clanId || isAdmin(req)) return true;
  return authorizedClanIds.includes(Number(clanId));
};

const isDeceasedPerson = (person) => Number(person?.is_living) === 0 || Boolean(person?.death_date);

const getSenderName = async (senderPersonId) => {
  if (!senderPersonId) return null;
  const [rows] = await db.query("SELECT display_name FROM people WHERE id = ? LIMIT 1", [senderPersonId]);
  return rows[0]?.display_name || null;
};

const createVoiceNotification = async (connection, recipientRow, senderName) => {
  if (!recipientRow.receiver_account_id) return null;
  await ensureNotificationSchema();
  const message = senderName
    ? `${senderName} đã gửi cho bạn một bản ghi âm kèm bản chữ.`
    : "Bạn nhận được một bản ghi âm kèm bản chữ.";
  const [result] = await connection.query(
    `
      INSERT INTO notifications (receiver_account_id, receiver_person_id, type, title, message, link_url)
      VALUES (?, ?, 'voice_recording', 'Bạn nhận được một bản ghi âm', ?, ?)
    `,
    [
      recipientRow.receiver_account_id,
      recipientRow.receiver_person_id || null,
      message,
      `/user/time-capsule?recording=${recipientRow.recording_id}`,
    ]
  );
  return result.insertId;
};

const emitVoiceNotification = (req, receiverAccountId) => {
  const socketId = req?.app?.locals?.onlineUsers?.[receiverAccountId];
  const io = req?.app?.locals?.io;
  if (io && socketId) {
    io.to(socketId).emit("new_notification", {
      type: "voice_recording",
      title: "Bạn nhận được một bản ghi âm",
      message: "Bạn có bản ghi âm mới.",
      time: new Date().toLocaleTimeString(),
    });
  }
};

const resolveRecipient = async (recipient, recordingClanId) => {
  const accountId = parsePositiveInt(recipient?.account_id);
  const personId = parsePositiveInt(recipient?.person_id);

  if (accountId) {
    const [rows] = await db.query(
      `
        SELECT
          a.id AS receiver_account_id,
          COALESCE(ac.person_id, a.person_id) AS receiver_person_id,
          COALESCE(ac.clan_id, p.clan_id) AS clan_id,
          p.display_name,
          p.is_living,
          p.death_date
        FROM accounts a
        LEFT JOIN account_clans ac
          ON ac.account_id = a.id
         AND ac.status = 'active'
         AND (? IS NULL OR ac.clan_id = ?)
        LEFT JOIN people p ON p.id = COALESCE(ac.person_id, a.person_id)
        WHERE a.id = ?
        ORDER BY
          CASE WHEN COALESCE(ac.clan_id, p.clan_id) = ? THEN 0 ELSE 1 END,
          ac.id ASC
        LIMIT 1
      `,
      [recordingClanId || null, recordingClanId || null, accountId, recordingClanId || null]
    );
    const row = rows[0];
    if (!row) {
      const error = new Error(`Khong tim thay account_id ${accountId}.`);
      error.status = 404;
      throw error;
    }
    return {
      receiver_account_id: row.receiver_account_id,
      receiver_person_id: row.receiver_person_id || null,
      clan_id: row.clan_id || null,
      display_name: row.display_name || `Account #${accountId}`,
      is_living: row.is_living,
      death_date: row.death_date,
    };
  }

  if (personId) {
    const [rows] = await db.query(
      `
        SELECT
          p.id AS receiver_person_id,
          p.clan_id,
          p.display_name,
          p.is_living,
          p.death_date,
          COALESCE(a.id, ac.account_id) AS receiver_account_id
        FROM people p
        LEFT JOIN accounts a ON a.person_id = p.id
        LEFT JOIN account_clans ac ON ac.person_id = p.id AND ac.status = 'active'
        WHERE p.id = ?
        ORDER BY a.id IS NULL, ac.id ASC
        LIMIT 1
      `,
      [personId]
    );
    const row = rows[0];
    if (!row) {
      const error = new Error(`Khong tim thay person_id ${personId}.`);
      error.status = 404;
      throw error;
    }
    return {
      receiver_account_id: row.receiver_account_id || null,
      receiver_person_id: row.receiver_person_id,
      clan_id: row.clan_id || null,
      display_name: row.display_name || `Person #${personId}`,
      is_living: row.is_living,
      death_date: row.death_date,
    };
  }

  const error = new Error("Moi nguoi nhan can co account_id hoac person_id.");
  error.status = 400;
  throw error;
};

const processDueVoiceRecordingRecipients = async (req = null) => {
  await ensureVoiceSchema();

  const [rows] = await db.query(
    `
      SELECT
        vrr.*,
        COALESCE(sp.display_name, sa.email) AS sender_name
      FROM voice_recording_recipients vrr
      INNER JOIN accounts sa ON sa.id = vrr.sender_account_id
      LEFT JOIN people sp ON sp.id = vrr.sender_person_id
      WHERE vrr.send_status = 'pending'
        AND vrr.scheduled_at IS NOT NULL
        AND vrr.scheduled_at <= NOW()
      ORDER BY vrr.scheduled_at ASC, vrr.id ASC
      LIMIT 100
    `
  );

  let sent = 0;
  let failed = 0;

  if (rows.some((row) => row.receiver_account_id)) {
    await ensureNotificationSchema();
  }

  for (const row of rows) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [updated] = await connection.query(
        `
          UPDATE voice_recording_recipients
          SET send_status = 'sent',
              sent_at = CURRENT_TIMESTAMP,
              error_message = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND send_status = 'pending'
        `,
        [row.id]
      );

      if (updated.affectedRows > 0) {
        await createVoiceNotification(connection, row, row.sender_name);
      }

      await connection.commit();
      if (updated.affectedRows > 0) {
        sent += 1;
        emitVoiceNotification(req, row.receiver_account_id);
      }
    } catch (error) {
      await connection.rollback();
      failed += 1;
      await db.query(
        `
          UPDATE voice_recording_recipients
          SET send_status = 'failed',
              error_message = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [String(error?.message || error).slice(0, 2000), row.id]
      );
    } finally {
      connection.release();
    }
  }

  return { scanned: rows.length, sent, failed };
};

const getRecordingById = async (id) => {
  const [rows] = await db.query(
    `
      SELECT id, account_id, person_id, clan_id, original_filename, storage_path, mime_type,
             duration_seconds, file_size_bytes, status, transcript, transcript_edited,
             transcript_edited_at, transcribed_at, processing_started_at, error_message,
             created_at, updated_at
      FROM recordings
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  );
  return rows[0] || null;
};

const getAccountContext = async (accountId) => {
  await ensureVoiceSchema();
  const [rows] = await db.query(
    `
      SELECT
        a.id AS account_id,
        a.person_id,
        a.role_id,
        COALESCE(p.clan_id, ac.clan_id) AS clan_id
      FROM accounts a
      LEFT JOIN people p ON p.id = a.person_id
      LEFT JOIN account_clans ac ON ac.account_id = a.id AND ac.status = 'active'
      WHERE a.id = ?
      ORDER BY ac.id ASC
      LIMIT 1
    `,
    [accountId]
  );
  return rows[0] || null;
};

const canReadRecording = async (req, recording) => {
  if (!recording) return false;
  if (Number(req.user?.role_id) === 1 || req.user?.role_name === "admin") return true;
  if (Number(recording.account_id) === Number(req.user?.id)) return true;

  if (req.user?.role_name === "manager" && recording.clan_id) {
    const ctx = await getAccountContext(req.user.id);
    return Number(ctx?.clan_id) === Number(recording.clan_id);
  }

  return false;
};

router.use((req, _res, next) => {
  const token = typeof req.query?.token === "string" ? req.query.token : "";
  if (req.method === "GET" && /\/recordings\/\d+\/audio$/.test(req.path) && token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${token}`;
  }
  next();
});

router.use(verifyToken, checkRole(["admin", "manager", "member"]));

router.post("/recordings", upload.single("audio"), async (req, res) => {
  try {
    await ensureVoiceSchema();

    if (!req.file) {
      return res.status(400).json({ success: false, message: "Khong co file ghi am." });
    }

    const durationSeconds = parsePositiveInt(req.body?.duration_seconds);
    if (durationSeconds && durationSeconds > MAX_DURATION_SECONDS) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({
        success: false,
        message: `Ban ghi am vuot qua gioi han ${MAX_DURATION_SECONDS} giay.`,
      });
    }

    const context = await getAccountContext(req.user.id);
    const storagePath = path.posix.join("recordings", req.file.filename);

    const [result] = await db.query(
      `
        INSERT INTO recordings (
          account_id, person_id, clan_id, original_filename, stored_filename,
          storage_path, mime_type, duration_seconds, file_size_bytes, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded')
      `,
      [
        req.user.id,
        context?.person_id || null,
        context?.clan_id || null,
        req.file.originalname || null,
        req.file.filename,
        storagePath,
        req.file.mimetype || "application/octet-stream",
        durationSeconds,
        req.file.size,
      ]
    );

    return res.status(201).json({
      success: true,
      recording: {
        id: result.insertId,
        status: "uploaded",
        duration_seconds: durationSeconds,
        file_size_bytes: req.file.size,
      },
    });
  } catch (error) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error("voice upload error:", error);
    return res.status(500).json({ success: false, message: "Khong the luu ghi am." });
  }
});

router.get("/recordings", async (req, res) => {
  try {
    await ensureVoiceSchema();

    const limit = Math.min(parsePositiveInt(req.query.limit) || 20, 100);
    const ctx = await getAccountContext(req.user.id);
    const isAdmin = Number(req.user?.role_id) === 1 || req.user?.role_name === "admin";
    const isManager = req.user?.role_name === "manager";

    let sql = `
      SELECT id, account_id, person_id, clan_id, original_filename, mime_type,
             duration_seconds, file_size_bytes, status, transcript, transcript_edited,
             transcript_edited_at, transcribed_at, processing_started_at, error_message,
             created_at, updated_at
      FROM recordings
    `;
    const params = [];

    if (!isAdmin && isManager && ctx?.clan_id) {
      sql += " WHERE clan_id = ?";
      params.push(ctx.clan_id);
    } else if (!isAdmin) {
      sql += " WHERE account_id = ?";
      params.push(req.user.id);
    }

    sql += " ORDER BY created_at DESC, id DESC LIMIT ?";
    params.push(limit);

    const [rows] = await db.query(sql, params);
    return res.json({ success: true, recordings: rows });
  } catch (error) {
    console.error("voice list error:", error);
    return res.status(500).json({ success: false, message: "Khong the tai danh sach ghi am." });
  }
});

router.get("/recordings/recipient-options", async (req, res) => {
  try {
    await ensureVoiceSchema();

    const ctx = await getAccountContext(req.user.id);
    const authorizedClanIds = await getAuthorizedClanIds(req.user.id);
    if (ctx?.clan_id && !authorizedClanIds.includes(Number(ctx.clan_id))) {
      authorizedClanIds.push(Number(ctx.clan_id));
    }

    const params = [];
    let clanWhere = "";
    if (!isAdmin(req)) {
      if (authorizedClanIds.length === 0) {
        return res.json({ success: true, recipients: [] });
      }
      clanWhere = `WHERE p.clan_id IN (${authorizedClanIds.map(() => "?").join(",")})`;
      params.push(...authorizedClanIds);
    }

    const [rows] = await db.query(
      `
        SELECT
          p.id AS person_id,
          p.display_name,
          p.clan_id,
          p.is_living,
          p.death_date,
          COALESCE(a.id, ac.account_id) AS account_id
        FROM people p
        LEFT JOIN accounts a ON a.person_id = p.id
        LEFT JOIN account_clans ac ON ac.person_id = p.id AND ac.status = 'active'
        ${clanWhere}
        GROUP BY p.id, p.display_name, p.clan_id, p.is_living, p.death_date, account_id
        ORDER BY p.display_name ASC, p.id ASC
        LIMIT 500
      `,
      params
    );

    return res.json({ success: true, recipients: rows });
  } catch (error) {
    console.error("voice recipient options error:", error);
    return res.status(500).json({ success: false, message: "Khong the tai danh sach nguoi nhan." });
  }
});

router.get("/recordings/:id", async (req, res) => {
  try {
    await ensureVoiceSchema();

    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "ID ghi am khong hop le." });

    const recording = await getRecordingById(id);
    if (!recording) return res.status(404).json({ success: false, message: "Khong tim thay ghi am." });

    if (!(await canReadRecording(req, recording))) {
      return res.status(403).json({ success: false, message: "Ban khong co quyen xem ghi am nay." });
    }

    return res.json({ success: true, recording });
  } catch (error) {
    console.error("voice detail error:", error);
    return res.status(500).json({ success: false, message: "Khong the tai ghi am." });
  }
});

router.post("/recordings/:id/send", async (req, res) => {
  try {
    await ensureVoiceSchema();

    const recordingId = parsePositiveInt(req.params.id);
    if (!recordingId) return res.status(400).json({ success: false, message: "ID ghi am khong hop le." });

    const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
    if (recipients.length === 0) {
      return res.status(400).json({ success: false, message: "Can chon it nhat mot nguoi nhan." });
    }
    if (recipients.length > 100) {
      return res.status(400).json({ success: false, message: "Moi lan chi gui toi da 100 nguoi nhan." });
    }

    const scheduled = parseScheduledAt(req.body?.scheduled_at);
    const recording = await getRecordingById(recordingId);
    if (!recording) return res.status(404).json({ success: false, message: "Khong tim thay ghi am." });

    if (recording.status !== "completed" || !String(recording.transcript || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "Chi co the gui recording da completed va co transcript.",
      });
    }

    if (!(await canReadRecording(req, recording))) {
      return res.status(403).json({ success: false, message: "Ban khong co quyen gui ghi am nay." });
    }

    const senderContext = await getAccountContext(req.user.id);
    const authorizedClanIds = await getAuthorizedClanIds(req.user.id);
    if (senderContext?.clan_id && !authorizedClanIds.includes(Number(senderContext.clan_id))) {
      authorizedClanIds.push(Number(senderContext.clan_id));
    }

    if (!canUseClan(req, authorizedClanIds, recording.clan_id)) {
      return res.status(403).json({ success: false, message: "Ban khong co quyen gui ghi am cua clan nay." });
    }

    const now = new Date();
    const senderName = await getSenderName(recording.person_id || senderContext?.person_id);
    const rowsToInsert = [];

    for (const item of recipients) {
      const recipient = await resolveRecipient(item, recording.clan_id);
      if (!canUseClan(req, authorizedClanIds, recipient.clan_id)) {
        return res.status(403).json({ success: false, message: "Khong duoc gui sang clan khac neu ban khong co quyen." });
      }
      if (
        !isAdmin(req) &&
        recording.clan_id &&
        recipient.clan_id &&
        Number(recording.clan_id) !== Number(recipient.clan_id)
      ) {
        return res.status(403).json({ success: false, message: "Khong duoc gui recording sang clan khac." });
      }

      const deceased = isDeceasedPerson(recipient);
      const sendNow = deceased || !scheduled || scheduled.date <= now;
      rowsToInsert.push({
        recording_id: recording.id,
        sender_account_id: req.user.id,
        sender_person_id: recording.person_id || senderContext?.person_id || null,
        clan_id: recording.clan_id || recipient.clan_id || null,
        receiver_account_id: recipient.receiver_account_id || null,
        receiver_person_id: recipient.receiver_person_id || null,
        transcript_snapshot: recording.transcript,
        audio_storage_path: recording.storage_path,
        send_status: sendNow ? "sent" : "pending",
        scheduled_at: deceased ? null : scheduled?.sql || null,
        sent_at: sendNow ? formatMysqlDateTime(now) : null,
        deceased,
      });
    }

    if (rowsToInsert.some((row) => row.send_status === "sent" && row.receiver_account_id)) {
      await ensureNotificationSchema();
    }

    const connection = await db.getConnection();
    const created = [];
    try {
      await connection.beginTransaction();

      for (const row of rowsToInsert) {
        const [result] = await connection.query(
          `
            INSERT INTO voice_recording_recipients (
              recording_id, sender_account_id, sender_person_id, clan_id,
              receiver_account_id, receiver_person_id, transcript_snapshot,
              audio_storage_path, send_status, scheduled_at, sent_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            row.recording_id,
            row.sender_account_id,
            row.sender_person_id,
            row.clan_id,
            row.receiver_account_id,
            row.receiver_person_id,
            row.transcript_snapshot,
            row.audio_storage_path,
            row.send_status,
            row.scheduled_at,
            row.sent_at,
          ]
        );
        const createdRow = { id: result.insertId, ...row };
        created.push(createdRow);
        if (createdRow.send_status === "sent" && createdRow.receiver_account_id) {
          await createVoiceNotification(connection, createdRow, senderName);
        }
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    created
      .filter((row) => row.send_status === "sent" && row.receiver_account_id)
      .forEach((row) => emitVoiceNotification(req, row.receiver_account_id));

    return res.status(201).json({
      success: true,
      recipients: created.map((row) => ({
        id: row.id,
        recording_id: row.recording_id,
        receiver_account_id: row.receiver_account_id,
        receiver_person_id: row.receiver_person_id,
        send_status: row.send_status,
        scheduled_at: row.scheduled_at,
        sent_at: row.sent_at,
        deceased: row.deceased,
      })),
    });
  } catch (error) {
    console.error("voice send error:", error);
    return res.status(error.status || 500).json({ success: false, message: error?.message || "Khong the gui ghi am." });
  }
});

router.get("/recordings/:id/audio", async (req, res) => {
  try {
    await ensureVoiceSchema();

    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "ID ghi am khong hop le." });

    const recording = await getRecordingById(id);
    if (!recording) return res.status(404).json({ success: false, message: "Khong tim thay ghi am." });

    if (!(await canReadRecording(req, recording))) {
      return res.status(403).json({ success: false, message: "Ban khong co quyen nghe ghi am nay." });
    }

    const audioPath = resolveStoragePath(recording.storage_path);
    if (!fs.existsSync(audioPath)) {
      return res.status(404).json({ success: false, message: "File ghi am khong ton tai." });
    }

    const stat = fs.statSync(audioPath);
    res.setHeader("Content-Type", recording.mime_type || "application/octet-stream");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Cache-Control", "private, max-age=0, no-cache");
    return fs.createReadStream(audioPath).pipe(res);
  } catch (error) {
    console.error("voice audio stream error:", error);
    return res.status(500).json({ success: false, message: "Khong the phat file ghi am." });
  }
});

router.post("/recording-recipients/process-due", async (req, res) => {
  try {
    if (!isAdmin(req) && req.user?.role_name !== "manager") {
      return res.status(403).json({ success: false, message: "Ban khong co quyen xu ly lich gui voice." });
    }
    const result = await processDueVoiceRecordingRecipients(req);
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error("voice scheduled processing error:", error);
    return res.status(500).json({ success: false, message: "Khong the xu ly lich gui voice." });
  }
});

router.patch("/recordings/:id/transcript", async (req, res) => {
  try {
    await ensureVoiceSchema();

    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "ID ghi am khong hop le." });

    const transcript = String(req.body?.transcript || "").trim();
    if (!transcript) {
      return res.status(400).json({ success: false, message: "Transcript khong duoc de trong." });
    }
    if (transcript.length > 50000) {
      return res.status(400).json({ success: false, message: "Transcript toi da 50.000 ky tu." });
    }

    const recording = await getRecordingById(id);
    if (!recording) return res.status(404).json({ success: false, message: "Khong tim thay ghi am." });

    if (!(await canReadRecording(req, recording))) {
      return res.status(403).json({ success: false, message: "Ban khong co quyen sua transcript nay." });
    }

    await db.query(
      `
        UPDATE recordings
        SET transcript = ?,
            transcript_edited = 1,
            transcript_edited_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [transcript, id]
    );

    const updated = await getRecordingById(id);
    return res.json({ success: true, recording: updated });
  } catch (error) {
    console.error("voice transcript update error:", error);
    return res.status(500).json({ success: false, message: "Khong the cap nhat transcript." });
  }
});

router.post("/recordings/:id/retry", async (req, res) => {
  try {
    await ensureVoiceSchema();

    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "ID ghi am khong hop le." });

    const recording = await getRecordingById(id);
    if (!recording) return res.status(404).json({ success: false, message: "Khong tim thay ghi am." });

    if (!(await canReadRecording(req, recording))) {
      return res.status(403).json({ success: false, message: "Ban khong co quyen xu ly lai ghi am nay." });
    }

    await db.query(
      `
        UPDATE recordings
        SET status = 'uploaded',
            error_message = NULL,
            processing_started_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [id]
    );

    const updated = await getRecordingById(id);
    return res.json({ success: true, recording: updated });
  } catch (error) {
    console.error("voice retry error:", error);
    return res.status(500).json({ success: false, message: "Khong the dua ghi am ve hang doi." });
  }
});

router.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ success: false, message: `File ghi am toi da ${MAX_FILE_MB}MB.` });
  }
  return res.status(400).json({ success: false, message: error?.message || "Upload ghi am that bai." });
});

if (!scheduledJobStarted && process.env.VOICE_SCHEDULED_JOB_DISABLED !== "true") {
  scheduledJobStarted = true;
  const intervalMs = Math.max(30, Number(process.env.VOICE_SCHEDULED_JOB_SECONDS || 60)) * 1000;
  setInterval(() => {
    processDueVoiceRecordingRecipients().catch((error) => {
      console.error("voice scheduled job error:", error);
    });
  }, intervalMs).unref?.();
}

module.exports = router;
