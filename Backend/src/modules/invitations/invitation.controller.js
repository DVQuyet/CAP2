const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../../config/db");
const { getRoleName } = require("../../config/roles");
const { sendMail, isSmtpConfigured } = require("../../shared/utils/email");
const { ensureProfileCompletedColumn } = require("../../shared/utils/profileCompletion");
const { getManagerClanId, assertClanExists } = require("../manager/managerClan.service");
const {
  createRawInviteToken,
  ensureInvitationSchema,
  hashInviteToken,
  isValidEmail,
  markExpiredInvitations,
  normalizeEmail,
  roleToId,
  roleToName,
} = require("./invitation.service");

const INVITE_TTL_HOURS = Number(process.env.INVITE_TTL_HOURS || 72);
const DEFAULT_INVITE_FRONTEND_URL = "https://cap-2-seven.vercel.app";

function getFrontendBaseUrl(req) {
  const configuredUrl =
    process.env.INVITE_FRONTEND_URL ||
    process.env.PUBLIC_APP_URL ||
    "";
  const baseUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(configuredUrl)
    ? DEFAULT_INVITE_FRONTEND_URL
    : configuredUrl || DEFAULT_INVITE_FRONTEND_URL;

  return String(baseUrl).replace(/\/$/, "");
}

function makeInviteLink(req, token) {
  return `${getFrontendBaseUrl(req)}/invite/accept?token=${encodeURIComponent(token)}`;
}

function signAuthToken(account) {
  const secret = process.env.JWT_SECRET || "GiaPhaViet_Secret_Key_2024_Backup";
  const roleName = getRoleName(account.role_id);

  return jwt.sign(
    {
      id: account.id,
      account_id: account.id,
      person_id: account.person_id || null,
      role_id: account.role_id,
      role_name: roleName,
      role: roleName,
      email: account.email,
      profile_completed: Number(account.profile_completed || 0),
      invite_clan_id: account.invite_clan_id || null,
      invite_generation: account.invite_generation || null,
    },
    secret,
    { expiresIn: "24h" }
  );
}

function buildAuthUser(account) {
  const roleName = getRoleName(account.role_id);
  return {
    id: account.id,
    account_id: account.id,
    person_id: account.person_id || null,
    role_id: account.role_id,
    role_name: roleName,
    role: roleName,
    status: account.status,
    email: account.email,
    name: account.display_name || account.email,
    profile_completed: Number(account.profile_completed || 0),
    invite_generation: account.invite_generation || null,
  };
}

function normalizeInviteGeneration(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const generation = Number(raw);
  return Number.isInteger(generation) && generation > 0 ? generation : undefined;
}

async function resolveInviteClanId(req, requestedClanId) {
  if (Number(req.user?.role_id) === 2) {
    return getManagerClanId(req.user.id || req.user.account_id);
  }

  const clanId = Number(requestedClanId);
  if (!Number.isFinite(clanId) || clanId <= 0) return null;
  return (await assertClanExists(clanId)) ? clanId : null;
}

async function sendInviteEmail({ req, email, inviteLink, expiresAt }) {
  const expiresText = new Date(expiresAt).toLocaleString("vi-VN");
  const subject = "Loi moi tham gia he thong Gia pha Viet";
  const text = [
    "Ban duoc moi tham gia he thong CAP2/Gia pha Viet.",
    "Vui long bam vao lien ket sau de hoan tat dang ky:",
    inviteLink,
    `Lien ket co thoi han den ${expiresText}.`,
  ].join("\n");
  const html = `
    <p>Ban duoc moi tham gia he thong <strong>CAP2/Gia pha Viet</strong>.</p>
    <p>Vui long bam vao lien ket sau de hoan tat dang ky:</p>
    <p><a href="${inviteLink}">${inviteLink}</a></p>
    <p>Lien ket co thoi han den <strong>${expiresText}</strong>.</p>
  `;

  if (!isSmtpConfigured()) {
    return { sent: false, skipped: true };
  }

  await sendMail({ to: email, subject, text, html });
  return { sent: true, skipped: false };
}

exports.createInvitation = async (req, res) => {
  try {
    await ensureInvitationSchema();
    await markExpiredInvitations();

    const email = normalizeEmail(req.body?.email);
    const role = roleToName(req.body?.role);
    const roleId = roleToId(role);
    const generation = normalizeInviteGeneration(req.body?.generation);

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Email khong hop le." });
    }
    if (generation === undefined) {
      return res.status(400).json({ success: false, message: "Doi gia pha khong hop le." });
    }
    if (Number(req.user?.role_id) === 2 && roleId !== 3) {
      return res.status(403).json({ success: false, message: "Manager chi duoc moi thanh vien." });
    }

    const clanId = await resolveInviteClanId(req, req.body?.clan_id);
    if (!clanId) {
      return res.status(400).json({ success: false, message: "Khong xac dinh duoc dong ho de gui loi moi." });
    }

    const [existingAccounts] = await db.query(
      "SELECT id, status FROM accounts WHERE LOWER(TRIM(email)) = ? LIMIT 1",
      [email]
    );
    const existingAccount = existingAccounts[0] || null;
    if (existingAccount && String(existingAccount.status) === "active") {
      return res.status(409).json({
        success: false,
        message: "Email nay da co tai khoan dang hoat dong.",
      });
    }

    const rawToken = createRawInviteToken();
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);
    const invitedBy = req.user?.id || req.user?.account_id || null;

    await db.query(
      `UPDATE invitations
       SET status = 'revoked'
       WHERE email = ? AND clan_id = ? AND status = 'pending'`,
      [email, clanId]
    );

    const [result] = await db.query(
      `INSERT INTO invitations
        (email, token_hash, invited_by_account_id, clan_id, role, generation, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [email, tokenHash, invitedBy, clanId, role, generation, expiresAt]
    );

    const inviteLink = makeInviteLink(req, rawToken);
    let mail = { sent: false, skipped: false };
    try {
      mail = await sendInviteEmail({ req, email, inviteLink, expiresAt });
    } catch (error) {
      console.error("send invite email error:", error);
      return res.status(500).json({ success: false, message: "Khong gui duoc email moi. Kiem tra cau hinh SMTP." });
    }

    return res.status(201).json({
      success: true,
      message: mail.sent ? "Da gui email moi." : "Da tao loi moi. SMTP chua cau hinh nen tra ve link de test.",
      invitation: {
        id: result.insertId,
        email,
        clan_id: clanId,
        role,
        generation,
        status: "pending",
        expires_at: expiresAt,
      },
      invite_link: mail.sent ? undefined : inviteLink,
      smtp_configured: isSmtpConfigured(),
    });
  } catch (error) {
    console.error("createInvitation error:", error);
    return res.status(500).json({ success: false, message: "Khong the tao loi moi." });
  }
};

exports.listInvitations = async (req, res) => {
  try {
    await ensureInvitationSchema();
    await markExpiredInvitations();

    let where = "1 = 1";
    const params = [];

    if (Number(req.user?.role_id) === 2) {
      const clanId = await getManagerClanId(req.user.id || req.user.account_id);
      if (!clanId) return res.json({ success: true, invitations: [] });
      where += " AND i.clan_id = ?";
      params.push(clanId);
    }

    const [rows] = await db.query(
      `SELECT i.id, i.email, i.clan_id, c.clan_name, i.role, i.generation, i.status, i.expires_at,
              i.accepted_at, i.created_at, inviter.email AS invited_by_email
       FROM invitations i
       LEFT JOIN clans c ON c.id = i.clan_id
       LEFT JOIN accounts inviter ON inviter.id = i.invited_by_account_id
       WHERE ${where}
       ORDER BY i.created_at DESC
       LIMIT 100`,
      params
    );

    return res.json({ success: true, invitations: rows });
  } catch (error) {
    console.error("listInvitations error:", error);
    return res.status(500).json({ success: false, message: "Khong the tai danh sach loi moi." });
  }
};

exports.verifyInvitation = async (req, res) => {
  try {
    await ensureInvitationSchema();
    await markExpiredInvitations();

    const token = String(req.query?.token || "").trim();
    if (!token) {
      return res.status(400).json({ success: false, message: "Thieu token loi moi." });
    }

    const [rows] = await db.query(
      `SELECT id, email, role, clan_id, generation, status, expires_at, accepted_at
       FROM invitations
       WHERE token_hash = ?
       LIMIT 1`,
      [hashInviteToken(token)]
    );
    const invitation = rows[0];

    if (!invitation) {
      return res.status(404).json({ success: false, message: "Loi moi khong hop le." });
    }

    const expired = new Date(invitation.expires_at).getTime() <= Date.now() || invitation.status === "expired";
    const used = invitation.status === "accepted" || Boolean(invitation.accepted_at);
    const revoked = invitation.status === "revoked";

    if (expired) {
      return res.status(410).json({ success: false, expired: true, used: false, message: "Loi moi da het han." });
    }
    if (used) {
      return res.status(409).json({ success: false, expired: false, used: true, message: "Loi moi da duoc su dung." });
    }
    if (revoked) {
      return res.status(409).json({ success: false, expired: false, used: false, message: "Loi moi da bi thu hoi." });
    }

    return res.json({
      success: true,
      email: invitation.email,
      expired: false,
      used: false,
      role: invitation.role,
      clan_id: invitation.clan_id,
      generation: invitation.generation || null,
      expires_at: invitation.expires_at,
    });
  } catch (error) {
    console.error("verifyInvitation error:", error);
    return res.status(500).json({ success: false, message: "Khong the kiem tra loi moi." });
  }
};

exports.acceptInvitation = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await ensureInvitationSchema();
    await markExpiredInvitations();

    const token = String(req.body?.token || "").trim();
    const password = String(req.body?.password || "");
    const confirmPassword = String(req.body?.confirm_password || "");

    if (!token) return res.status(400).json({ success: false, message: "Thieu token loi moi." });
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: "Mat khau toi thieu 6 ky tu." });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Mat khau xac nhan khong khop." });
    }

    await connection.beginTransaction();

    const [inviteRows] = await connection.query(
      `SELECT *
       FROM invitations
       WHERE token_hash = ?
       LIMIT 1
       FOR UPDATE`,
      [hashInviteToken(token)]
    );
    const invitation = inviteRows[0];

    if (!invitation) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Loi moi khong hop le." });
    }
    if (invitation.status === "accepted" || invitation.accepted_at) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: "Loi moi da duoc su dung." });
    }
    if (invitation.status === "revoked") {
      await connection.rollback();
      return res.status(409).json({ success: false, message: "Loi moi da bi thu hoi." });
    }
    if (new Date(invitation.expires_at).getTime() <= Date.now() || invitation.status === "expired") {
      await connection.query("UPDATE invitations SET status = 'expired' WHERE id = ?", [invitation.id]);
      await connection.rollback();
      return res.status(410).json({ success: false, message: "Loi moi da het han." });
    }

    const email = normalizeEmail(invitation.email);
    const roleId = roleToId(invitation.role);
    const hashedPassword = await bcrypt.hash(password, 10);

    const [accountRows] = await connection.query(
      "SELECT id, email, person_id, role_id, status, profile_completed FROM accounts WHERE LOWER(TRIM(email)) = ? LIMIT 1 FOR UPDATE",
      [email]
    );

    let accountId;
    let personId = null;
    if (accountRows.length) {
      const existing = accountRows[0];
      if (String(existing.status) === "active" && Number(existing.profile_completed) === 1) {
        await connection.rollback();
        return res.status(409).json({ success: false, message: "Email nay da co tai khoan. Vui long dang nhap." });
      }

      accountId = existing.id;
      personId = existing.person_id || null;
      await connection.query(
        `UPDATE accounts
         SET password = ?, role_id = ?, status = 'active', profile_completed = ?
         WHERE id = ?`,
        [hashedPassword, roleId, personId ? 1 : 0, accountId]
      );
    } else {
      const [created] = await connection.query(
        `INSERT INTO accounts (email, password, person_id, role_id, status, profile_completed)
         VALUES (?, ?, NULL, ?, 'active', 0)`,
        [email, hashedPassword, roleId]
      );
      accountId = created.insertId;
    }

    if (invitation.clan_id) {
      try {
        await connection.query(
          `INSERT INTO account_clans (account_id, clan_id, person_id, status)
           VALUES (?, ?, ?, 'active')
           ON DUPLICATE KEY UPDATE clan_id = VALUES(clan_id), person_id = VALUES(person_id), status = 'active'`,
          [accountId, invitation.clan_id, personId]
        );
      } catch (membershipError) {
        if (membershipError?.code !== "ER_BAD_NULL_ERROR") throw membershipError;
      }
    }

    await connection.query(
      "UPDATE invitations SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP WHERE id = ?",
      [invitation.id]
    );

    const [freshRows] = await connection.query(
      `SELECT a.id, a.email, a.person_id, a.role_id, a.status, a.profile_completed, p.display_name
       FROM accounts a
       LEFT JOIN people p ON p.id = a.person_id
       WHERE a.id = ?
       LIMIT 1`,
      [accountId]
    );
    const fresh = {
      ...freshRows[0],
      invite_clan_id: invitation.clan_id || null,
      invite_generation: invitation.generation || null,
    };

    await connection.commit();

    return res.json({
      success: true,
      message: "Da chap nhan loi moi.",
      token: signAuthToken(fresh),
      user: buildAuthUser(fresh),
      next: Number(fresh.profile_completed) === 1 ? null : "/complete-profile",
    });
  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    console.error("acceptInvitation error:", error);
    return res.status(500).json({ success: false, message: "Khong the chap nhan loi moi." });
  } finally {
    connection.release();
  }
};
