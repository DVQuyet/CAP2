const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("../../config/jwt");
const db = require("../../config/db");
const { getRoleName } = require("../../config/roles");
const { ensureProfileCompletedColumn } = require("../../shared/utils/profileCompletion");

function normalizeText(value) {
  return String(value ?? "").trim();
}

function splitFullName(fullName) {
  const parts = normalizeText(fullName).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { surname: "", middle_name: "", first_name: "" };
  if (parts.length === 1) return { surname: "", middle_name: "", first_name: parts[0] };
  if (parts.length === 2) return { surname: parts[0], middle_name: "", first_name: parts[1] };
  return {
    surname: parts[0],
    middle_name: parts.slice(1, -1).join(" "),
    first_name: parts[parts.length - 1],
  };
}

function normalizeGender(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "male" || raw === "1" || raw === "nam") return 1;
  if (raw === "female" || raw === "2" || raw === "nu" || raw === "nữ") return 2;
  if (raw === "other" || raw === "0" || raw === "unknown") return null;
  return undefined;
}

function normalizeDate(value) {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function toPositiveId(value) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function buildPersonName(person) {
  if (!person) return null;
  const display = normalizeText(person.display_name);
  if (display) return display;
  return [person.surname, person.middle_name, person.first_name]
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join(" ") || `Thành viên #${person.id || person.person_id}`;
}

let hasEnsuredAccountPeopleTable = false;
async function ensureAccountPeopleTable(connection = db) {
  if (hasEnsuredAccountPeopleTable && connection === db) return;
  await connection.query(`
    CREATE TABLE IF NOT EXISTS account_people (
      id BIGINT NOT NULL AUTO_INCREMENT,
      account_id INT NOT NULL,
      person_id INT NOT NULL,
      clan_id INT NOT NULL,
      role ENUM('self','manager','viewer','editor') NOT NULL DEFAULT 'self',
      is_default TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_account_people_account_person (account_id, person_id),
      KEY idx_account_people_account_default (account_id, is_default),
      KEY idx_account_people_clan_person (clan_id, person_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  if (connection === db) hasEnsuredAccountPeopleTable = true;
}

async function getAccountBaseContext(connection, accountId) {
  const [accountRows] = await connection.query(
    `
    SELECT
      a.id AS account_id,
      a.email,
      a.person_id AS account_person_id,
      a.role_id,
      a.status,
      a.profile_completed,
      ap.person_id AS mapped_person_id,
      ap.clan_id AS mapped_clan_id,
      ac.person_id AS membership_person_id,
      ac.clan_id AS membership_clan_id
    FROM accounts a
    LEFT JOIN account_people ap
      ON ap.account_id = a.id AND ap.is_default = 1
    LEFT JOIN account_clans ac
      ON ac.account_id = a.id AND ac.status = 'active'
    WHERE a.id = ?
    ORDER BY ap.id DESC, ac.id ASC
    LIMIT 1
    `,
    [accountId]
  ).catch(async (error) => {
    if (error?.code !== "ER_NO_SUCH_TABLE") throw error;
    const [fallbackRows] = await connection.query(
      `
      SELECT
        a.id AS account_id,
        a.email,
        a.person_id AS account_person_id,
        a.role_id,
        a.status,
        a.profile_completed,
        NULL AS mapped_person_id,
        NULL AS mapped_clan_id,
        ac.person_id AS membership_person_id,
        ac.clan_id AS membership_clan_id
      FROM accounts a
      LEFT JOIN account_clans ac
        ON ac.account_id = a.id AND ac.status = 'active'
      WHERE a.id = ?
      ORDER BY ac.id ASC
      LIMIT 1
      `,
      [accountId]
    );
    return [fallbackRows];
  });
  return accountRows[0] || null;
}

async function resolveMyContext(connection, accountId) {
  await ensureAccountPeopleTable(connection);
  const account = await getAccountBaseContext(connection, accountId);
  if (!account) return null;

  const preferredPersonId =
    toPositiveId(account.mapped_person_id) ||
    toPositiveId(account.account_person_id) ||
    toPositiveId(account.membership_person_id);

  let person = null;
  if (preferredPersonId) {
    const [personRows] = await connection.query(
      `
      SELECT id, clan_id, display_name, surname, middle_name, first_name, gender, generation, birth_date
      FROM people
      WHERE id = ?
      LIMIT 1
      `,
      [preferredPersonId]
    );
    person = personRows[0] || null;
  }

  const clanId =
    toPositiveId(person?.clan_id) ||
    toPositiveId(account.mapped_clan_id) ||
    toPositiveId(account.membership_clan_id);

  let clan = null;
  if (clanId) {
    const [clanRows] = await connection.query(
      "SELECT id, clan_name FROM clans WHERE id = ? LIMIT 1",
      [clanId]
    );
    clan = clanRows[0] || null;
  }

  return {
    account,
    person,
    clan,
    accountId: account.account_id,
    clanId: clanId || null,
    currentMemberId: person?.id || null,
    currentMemberName: buildPersonName(person),
  };
}

function signAuthToken(account) {
  const secret = getJwtSecret();
  const roleName = getRoleName(account.role_id);

  return jwt.sign(
    {
      id: account.id,
      account_id: account.id,
      person_id: account.person_id,
      role_id: account.role_id,
      role_name: roleName,
      role: roleName,
      email: account.email,
      profile_completed: Number(account.profile_completed || 0),
    },
    secret,
    { expiresIn: "24h" }
  );
}

function buildUser(account) {
  const roleName = getRoleName(account.role_id);
  return {
    id: account.id,
    account_id: account.id,
    person_id: account.person_id,
    role_id: account.role_id,
    role_name: roleName,
    role: roleName,
    status: account.status,
    email: account.email,
    name: account.display_name || account.email,
    display_name: account.display_name || "",
    profile_completed: Number(account.profile_completed || 0),
  };
}

async function resolveClanId(connection, accountId, jwtClanId) {
  const [membershipRows] = await connection.query(
    `SELECT clan_id FROM account_clans
     WHERE account_id = ? AND status = 'active'
     ORDER BY id ASC
     LIMIT 1`,
    [accountId]
  ).catch((error) => {
    if (error?.code === "ER_NO_SUCH_TABLE") return [[]];
    throw error;
  });
  if (membershipRows?.[0]?.clan_id) return membershipRows[0].clan_id;

  const invitedClanId = Number(jwtClanId);
  if (Number.isFinite(invitedClanId) && invitedClanId > 0) return invitedClanId;

  const [inviteRows] = await connection.query(
    `SELECT clan_id FROM invitations
     WHERE email = (SELECT email FROM accounts WHERE id = ? LIMIT 1)
       AND status = 'accepted'
       AND clan_id IS NOT NULL
     ORDER BY accepted_at DESC, id DESC
     LIMIT 1`,
    [accountId]
  ).catch((error) => {
    if (error?.code === "ER_NO_SUCH_TABLE") return [[]];
    throw error;
  });

  return inviteRows?.[0]?.clan_id || null;
}

async function resolveInviteGeneration(connection, accountId, jwtGeneration) {
  const tokenGeneration = Number(jwtGeneration);
  if (Number.isInteger(tokenGeneration) && tokenGeneration > 0) return tokenGeneration;

  const [inviteRows] = await connection.query(
    `SELECT generation FROM invitations
     WHERE email = (SELECT email FROM accounts WHERE id = ? LIMIT 1)
       AND status = 'accepted'
       AND generation IS NOT NULL
     ORDER BY accepted_at DESC, id DESC
     LIMIT 1`,
    [accountId]
  ).catch((error) => {
    if (error?.code === "ER_NO_SUCH_TABLE" || error?.code === "ER_BAD_FIELD_ERROR") return [[]];
    throw error;
  });

  const generation = Number(inviteRows?.[0]?.generation);
  return Number.isInteger(generation) && generation > 0 ? generation : null;
}

exports.updateMyProfile = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await ensureProfileCompletedColumn();

    const accountId = Number(req.user?.id || req.user?.account_id);
    if (!Number.isFinite(accountId) || accountId <= 0) {
      return res.status(401).json({ success: false, message: "Chua dang nhap." });
    }

    const fullName = normalizeText(req.body?.full_name || req.body?.display_name);
    const gender = normalizeGender(req.body?.gender);
    if (!fullName) {
      return res.status(400).json({ success: false, message: "Vui long nhap ho va ten." });
    }
    if (gender === undefined) {
      return res.status(400).json({ success: false, message: "Vui long chon gioi tinh." });
    }

    await connection.beginTransaction();

    const [accountRows] = await connection.query(
      "SELECT id, email, person_id, role_id, status FROM accounts WHERE id = ? LIMIT 1 FOR UPDATE",
      [accountId]
    );
    const account = accountRows[0];
    if (!account) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Khong tim thay tai khoan." });
    }

    const clanId = await resolveClanId(connection, accountId, req.user?.invite_clan_id);
    if (!clanId) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Khong xac dinh duoc dong ho cua loi moi." });
    }

    const nameParts = splitFullName(fullName);
    const inviteGeneration = await resolveInviteGeneration(connection, accountId, req.user?.invite_generation);
    const birthDate = normalizeDate(req.body?.birth_date);
    const phone = normalizeText(req.body?.phone) || null;
    const address = normalizeText(req.body?.address) || null;
    const hometown = normalizeText(req.body?.hometown) || null;
    const bio = normalizeText(req.body?.bio) || null;
    const avatarUrl = normalizeText(req.body?.avatar_url) || null;

    let personId = account.person_id || null;
    if (personId) {
      await connection.query(
        `UPDATE people
         SET clan_id = ?, display_name = ?, surname = ?, middle_name = ?, first_name = ?,
             gender = ?, birth_date = COALESCE(?, birth_date), phone = ?, address = ?,
             hometown = ?, bio = ?, avatar_url = COALESCE(?, avatar_url), email = COALESCE(email, ?),
             generation = COALESCE(?, generation)
         WHERE id = ?`,
        [
          clanId,
          fullName,
          nameParts.surname,
          nameParts.middle_name,
          nameParts.first_name,
          gender,
          birthDate,
          phone,
          address,
          hometown,
          bio,
          avatarUrl,
          account.email,
          inviteGeneration,
          personId,
        ]
      );
    } else {
      const [created] = await connection.query(
        `INSERT INTO people
          (clan_id, display_name, surname, middle_name, first_name, gender, birth_date,
           phone, address, hometown, bio, avatar_url, email, generation, is_living)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          clanId,
          fullName,
          nameParts.surname,
          nameParts.middle_name,
          nameParts.first_name,
          gender,
          birthDate,
          phone,
          address,
          hometown,
          bio,
          avatarUrl,
          account.email,
          inviteGeneration || 1,
        ]
      );
      personId = created.insertId;
      await connection.query("UPDATE accounts SET person_id = ? WHERE id = ?", [personId, accountId]);
    }

    await connection.query("UPDATE accounts SET profile_completed = 1 WHERE id = ?", [accountId]);

    try {
      await connection.query(
        `INSERT INTO account_clans (account_id, clan_id, person_id, status)
         VALUES (?, ?, ?, 'active')
         ON DUPLICATE KEY UPDATE clan_id = VALUES(clan_id), person_id = VALUES(person_id), status = 'active'`,
        [accountId, clanId, personId]
      );
    } catch (membershipError) {
      if (membershipError?.code !== "ER_NO_SUCH_TABLE") throw membershipError;
    }

    const [freshRows] = await connection.query(
      `SELECT a.id, a.email, a.person_id, a.role_id, a.status, a.profile_completed, p.display_name
       FROM accounts a
       LEFT JOIN people p ON p.id = a.person_id
       WHERE a.id = ?
       LIMIT 1`,
      [accountId]
    );
    const fresh = freshRows[0];

    await connection.commit();

    return res.json({
      success: true,
      message: "Da hoan thien ho so.",
      token: signAuthToken(fresh),
      user: buildUser(fresh),
      profile: {
        account_id: fresh.id,
        person_id: fresh.person_id,
        email: fresh.email,
        display_name: fresh.display_name,
        full_name: fresh.display_name,
        gender,
        generation: inviteGeneration || null,
        clan_id: clanId,
        profile_completed: 1,
      },
    });
  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    console.error("updateMyProfile error:", error);
    return res.status(500).json({ success: false, message: "Khong the luu ho so." });
  } finally {
    connection.release();
  }
};

exports.getMyContext = async (req, res) => {
  try {
    const accountId = toPositiveId(req.user?.id || req.user?.account_id);
    if (!accountId) return res.status(401).json({ success: false, message: "Chưa đăng nhập." });

    const context = await resolveMyContext(db, accountId);
    if (!context) return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản." });

    return res.json({
      success: true,
      accountId: context.accountId,
      clanId: context.clanId,
      clanName: context.clan?.clan_name || null,
      currentMemberId: context.currentMemberId,
      currentMemberName: context.currentMemberName,
      needsPersonSelection: Boolean(context.clanId && !context.currentMemberId),
      roleId: context.account.role_id,
      status: context.account.status,
      profileCompleted: Number(context.account.profile_completed || 0),
    });
  } catch (error) {
    console.error("getMyContext error:", error);
    return res.status(500).json({ success: false, message: "Không thể lấy ngữ cảnh tài khoản." });
  }
};

exports.listContextPeople = async (req, res) => {
  try {
    const accountId = toPositiveId(req.user?.id || req.user?.account_id);
    if (!accountId) return res.status(401).json({ success: false, message: "Chưa đăng nhập." });

    const context = await resolveMyContext(db, accountId);
    if (!context?.clanId) {
      return res.status(400).json({
        success: false,
        code: "CLAN_CONTEXT_REQUIRED",
        message: "Tài khoản chưa liên kết dòng họ.",
      });
    }

    const search = normalizeText(req.query.search || req.query.q).toLowerCase();
    const limit = Math.min(Math.max(Number(req.query.limit || 80), 1), 200);
    const params = [context.clanId];
    let whereSearch = "";
    if (search) {
      whereSearch = `
        AND (
          LOWER(p.display_name) LIKE ?
          OR LOWER(CONCAT_WS(' ', p.surname, p.middle_name, p.first_name)) LIKE ?
          OR LOWER(p.first_name) LIKE ?
        )
      `;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    params.push(limit);

    const [rows] = await db.query(
      `
      SELECT
        p.id,
        p.display_name,
        p.surname,
        p.middle_name,
        p.first_name,
        p.gender,
        p.generation,
        p.birth_date,
        p.death_date
      FROM people p
      WHERE p.clan_id = ?
        ${whereSearch}
      ORDER BY p.generation ASC, p.display_order ASC, p.surname ASC, p.middle_name ASC, p.first_name ASC, p.id ASC
      LIMIT ?
      `,
      params
    );

    return res.json({
      success: true,
      clanId: context.clanId,
      people: rows.map((person) => ({
        id: person.id,
        name: buildPersonName(person),
        display_name: person.display_name,
        gender: person.gender,
        generation: person.generation,
        birth_date: person.birth_date,
        death_date: person.death_date,
      })),
    });
  } catch (error) {
    console.error("listContextPeople error:", error);
    return res.status(500).json({ success: false, message: "Không thể tải danh sách thành viên." });
  }
};

exports.setCurrentPerson = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const accountId = toPositiveId(req.user?.id || req.user?.account_id);
    const personId = toPositiveId(req.body?.personId || req.body?.person_id);
    const requestedClanId = toPositiveId(req.body?.clanId || req.body?.clan_id);
    if (!accountId || !personId) {
      return res.status(400).json({ success: false, message: "accountId hoặc personId không hợp lệ." });
    }

    await ensureAccountPeopleTable(connection);
    await connection.beginTransaction();

    const context = await resolveMyContext(connection, accountId);
    if (!context) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản." });
    }

    const [personRows] = await connection.query(
      `
      SELECT id, clan_id, display_name, surname, middle_name, first_name
      FROM people
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [personId]
    );
    const person = personRows[0];
    if (!person) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Không tìm thấy thành viên trong gia phả." });
    }

    const clanId = toPositiveId(person.clan_id);
    const allowedClanId = requestedClanId || context.clanId;
    if (!clanId || !allowedClanId || Number(clanId) !== Number(allowedClanId)) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "Thành viên không thuộc dòng họ hiện tại." });
    }

    await connection.query(
      "UPDATE account_people SET is_default = 0 WHERE account_id = ?",
      [accountId]
    );
    await connection.query(
      `
      INSERT INTO account_people (account_id, person_id, clan_id, role, is_default)
      VALUES (?, ?, ?, 'self', 1)
      ON DUPLICATE KEY UPDATE
        clan_id = VALUES(clan_id),
        role = VALUES(role),
        is_default = 1,
        updated_at = CURRENT_TIMESTAMP
      `,
      [accountId, personId, clanId]
    );
    await connection.query(
      "UPDATE accounts SET person_id = COALESCE(person_id, ?) WHERE id = ?",
      [personId, accountId]
    );
    await connection.query(
      `
      INSERT INTO account_clans (account_id, clan_id, person_id, status)
      VALUES (?, ?, ?, 'active')
      ON DUPLICATE KEY UPDATE
        clan_id = VALUES(clan_id),
        person_id = VALUES(person_id),
        status = 'active'
      `,
      [accountId, clanId, personId]
    ).catch((error) => {
      if (error?.code !== "ER_NO_SUCH_TABLE") throw error;
    });

    await connection.commit();

    return res.json({
      success: true,
      accountId,
      clanId,
      currentMemberId: personId,
      currentMemberName: buildPersonName(person),
    });
  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    console.error("setCurrentPerson error:", error);
    return res.status(500).json({ success: false, message: "Không thể lưu thành viên hiện tại." });
  } finally {
    connection.release();
  }
};
