const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../../config/db");
const { getRoleName } = require("../../config/roles");
const { ensureProfileCompletedColumn } = require("../../shared/utils/profileCompletion");
const {
  ensureInvitationSchema,
  markExpiredInvitations,
  normalizeEmail,
} = require("../invitations/invitation.service");

let ensuredSocialAuthSchema = false;

function normalizeProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  if (provider !== "google" && provider !== "facebook") return "";
  return provider;
}

function roleToId(role) {
  const normalized = String(role || "member").trim().toLowerCase();
  if (normalized === "admin" || normalized === "1") return 1;
  if (normalized === "manager" || normalized === "editor" || normalized === "2") return 2;
  return 3;
}

function getFrontendUrl() {
  return String(
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.INVITE_FRONTEND_URL ||
    "http://localhost:5173"
  ).replace(/\/$/, "");
}

async function ensureSocialAuthSchema() {
  if (ensuredSocialAuthSchema) return;

  await ensureProfileCompletedColumn();
  await ensureInvitationSchema();

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_auth_providers (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      provider VARCHAR(32) NOT NULL,
      provider_id VARCHAR(191) NOT NULL,
      provider_email VARCHAR(255) NULL,
      avatar_url TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_auth_provider_identity (provider, provider_id),
      KEY idx_user_auth_provider_user (user_id),
      KEY idx_user_auth_provider_email (provider_email),
      CONSTRAINT fk_user_auth_provider_account
        FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  ensuredSocialAuthSchema = true;
}

async function createSocialPasswordHash() {
  const randomPassword = crypto.randomBytes(32).toString("hex");
  return bcrypt.hash(randomPassword, 10);
}

async function findPendingInvitation(connection, email) {
  const [rows] = await connection.query(
    `SELECT *
     FROM invitations
     WHERE LOWER(TRIM(email)) = ?
       AND status = 'pending'
       AND expires_at > NOW()
     ORDER BY id DESC
     LIMIT 1
     FOR UPDATE`,
    [email]
  );
  return rows[0] || null;
}

async function linkProvider(connection, { accountId, provider, providerId, email, avatarUrl }) {
  await connection.query(
    `INSERT INTO user_auth_providers
       (user_id, provider, provider_id, provider_email, avatar_url)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       provider_email = VALUES(provider_email),
       avatar_url = VALUES(avatar_url),
       updated_at = CURRENT_TIMESTAMP`,
    [accountId, provider, providerId, email, avatarUrl || null]
  );
}

async function acceptInvitationForAccount(connection, { account, invitation }) {
  if (!invitation) return account;

  const roleId = Number(account.role_id) === 1 ? 1 : roleToId(invitation.role);
  const profileCompleted = account.person_id ? 1 : Number(account.profile_completed || 0);

  await connection.query(
    `UPDATE accounts
     SET role_id = ?, status = 'active', profile_completed = ?
     WHERE id = ?`,
    [roleId, profileCompleted, account.id]
  );

  if (invitation.clan_id) {
    try {
      await connection.query(
        `INSERT INTO account_clans (account_id, clan_id, person_id, status)
         VALUES (?, ?, ?, 'active')
         ON DUPLICATE KEY UPDATE
           clan_id = VALUES(clan_id),
           person_id = VALUES(person_id),
           status = 'active'`,
        [account.id, invitation.clan_id, account.person_id || null]
      );
    } catch (error) {
      if (error?.code !== "ER_BAD_NULL_ERROR" && error?.code !== "ER_NO_SUCH_TABLE") throw error;
    }
  }

  await connection.query(
    "UPDATE invitations SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP WHERE id = ?",
    [invitation.id]
  );

  return {
    ...account,
    role_id: roleId,
    status: "active",
    profile_completed: profileCompleted,
    invite_clan_id: invitation.clan_id || null,
    invite_generation: invitation.generation || null,
  };
}

async function getFreshAccount(connection, accountId, extra = {}) {
  const [rows] = await connection.query(
    `SELECT
       a.id,
       a.email,
       a.person_id,
       a.role_id,
       a.status,
       a.profile_completed,
       p.display_name,
       p.avatar_url,
       ac.clan_id
     FROM accounts a
     LEFT JOIN people p ON p.id = a.person_id
     LEFT JOIN account_clans ac ON ac.account_id = a.id AND ac.status = 'active'
     WHERE a.id = ?
     ORDER BY ac.id ASC
     LIMIT 1`,
    [accountId]
  );

  if (!rows.length) return null;
  return { ...rows[0], ...extra };
}

function signSocialToken(account) {
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
      status: account.status,
      auth_status: account.status,
      family_id: account.clan_id || account.invite_clan_id || null,
      clan_id: account.clan_id || account.invite_clan_id || null,
      profile_completed: Number(account.profile_completed || 0),
      invite_clan_id: account.invite_clan_id || null,
      invite_generation: account.invite_generation || null,
    },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || "24h" }
  );
}

function buildSocialUser(account) {
  const roleName = getRoleName(account.role_id);
  return {
    id: account.id,
    account_id: account.id,
    person_id: account.person_id || null,
    role_id: account.role_id,
    role_name: roleName,
    role: roleName,
    status: account.status,
    auth_status: account.status,
    family_id: account.clan_id || account.invite_clan_id || null,
    clan_id: account.clan_id || account.invite_clan_id || null,
    email: account.email,
    name: account.display_name || account.email,
    display_name: account.display_name || "",
    avatar_url: account.avatar_url || null,
    profile_completed: Number(account.profile_completed || 0),
    invite_generation: account.invite_generation || null,
  };
}

async function handleSocialLogin({ provider, providerId, email, fullName, avatarUrl }) {
  const normalizedProvider = normalizeProvider(provider);
  const normalizedEmail = normalizeEmail(email);
  const normalizedProviderId = String(providerId || "").trim();

  if (!normalizedProvider || !normalizedProviderId) {
    const error = new Error("Nha cung cap dang nhap khong hop le.");
    error.code = "INVALID_PROVIDER";
    throw error;
  }
  if (!normalizedEmail) {
    const error = new Error("Khong lay duoc email tu tai khoan mang xa hoi.");
    error.code = "SOCIAL_EMAIL_REQUIRED";
    throw error;
  }

  await ensureSocialAuthSchema();
  await markExpiredInvitations();

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [providerRows] = await connection.query(
      `SELECT uap.user_id
       FROM user_auth_providers uap
       WHERE uap.provider = ? AND uap.provider_id = ?
       LIMIT 1
       FOR UPDATE`,
      [normalizedProvider, normalizedProviderId]
    );

    let account = null;
    let extra = {};

    if (providerRows.length) {
      const [accountRows] = await connection.query(
        "SELECT id, email, person_id, role_id, status, profile_completed FROM accounts WHERE id = ? LIMIT 1 FOR UPDATE",
        [providerRows[0].user_id]
      );
      account = accountRows[0] || null;
      if (!account) {
        throw new Error("Tai khoan lien ket OAuth khong ton tai.");
      }
      await linkProvider(connection, {
        accountId: account.id,
        provider: normalizedProvider,
        providerId: normalizedProviderId,
        email: normalizedEmail,
        avatarUrl,
      });
    } else {
      const [accountRows] = await connection.query(
        "SELECT id, email, person_id, role_id, status, profile_completed FROM accounts WHERE LOWER(TRIM(email)) = ? LIMIT 1 FOR UPDATE",
        [normalizedEmail]
      );
      account = accountRows[0] || null;
      const invitation = await findPendingInvitation(connection, normalizedEmail);

      if (!account) {
        const passwordHash = await createSocialPasswordHash();
        const roleId = invitation ? roleToId(invitation.role) : 3;
        const status = invitation ? "active" : "pending";
        const [created] = await connection.query(
          `INSERT INTO accounts (email, password, person_id, role_id, status, profile_completed)
           VALUES (?, ?, NULL, ?, ?, 0)`,
          [normalizedEmail, passwordHash, roleId, status]
        );
        account = {
          id: created.insertId,
          email: normalizedEmail,
          person_id: null,
          role_id: roleId,
          status,
          profile_completed: 0,
          display_name: fullName || normalizedEmail,
        };
      }

      await linkProvider(connection, {
        accountId: account.id,
        provider: normalizedProvider,
        providerId: normalizedProviderId,
        email: normalizedEmail,
        avatarUrl,
      });

      if (invitation) {
        account = await acceptInvitationForAccount(connection, { account, invitation });
        extra = {
          invite_clan_id: invitation.clan_id || null,
          invite_generation: invitation.generation || null,
        };
      }
    }

    const fresh = await getFreshAccount(connection, account.id, extra);
    if (String(fresh.status) === "rejected") {
      const error = new Error("Tai khoan cua ban da bi khoa hoac tu choi.");
      error.code = "ACCOUNT_BLOCKED";
      throw error;
    }

    const token = signSocialToken(fresh);
    const user = buildSocialUser(fresh);

    await connection.commit();

    return { token, user };
  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    throw error;
  } finally {
    connection.release();
  }
}

async function getAuthenticatedUser(accountId) {
  await ensureSocialAuthSchema();
  const account = await getFreshAccount(db, accountId);
  if (!account) return null;
  return buildSocialUser(account);
}

function buildOAuthRedirectUrl({ token, error, message }) {
  const url = new URL("/auth/callback", getFrontendUrl());
  if (token) url.searchParams.set("token", token);
  if (error) url.searchParams.set("error", error);
  if (message) url.searchParams.set("message", message);
  return url.toString();
}

module.exports = {
  buildOAuthRedirectUrl,
  getAuthenticatedUser,
  handleSocialLogin,
};
