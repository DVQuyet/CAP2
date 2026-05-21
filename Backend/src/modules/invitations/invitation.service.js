const crypto = require("crypto");
const db = require("../../config/db");
const { ensureProfileCompletedColumn } = require("../../shared/utils/profileCompletion");

let ensuredInvitationSchema = false;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function createRawInviteToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashInviteToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function roleToId(role) {
  const normalized = String(role || "member").trim().toLowerCase();
  if (normalized === "manager" || normalized === "2") return 2;
  return 3;
}

function roleToName(role) {
  return roleToId(role) === 2 ? "manager" : "member";
}

async function ensureInvitationSchema() {
  if (ensuredInvitationSchema) return;

  await ensureProfileCompletedColumn();

  await db.query(`
    CREATE TABLE IF NOT EXISTS invitations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      invited_by_account_id BIGINT UNSIGNED NULL,
      clan_id BIGINT UNSIGNED NULL,
      role VARCHAR(30) NOT NULL DEFAULT 'member',
      generation INT NULL,
      status ENUM('pending','accepted','expired','revoked') NOT NULL DEFAULT 'pending',
      expires_at DATETIME NOT NULL,
      accepted_at DATETIME NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_invitations_token_hash (token_hash),
      KEY idx_invitations_email_status (email, status),
      KEY idx_invitations_clan (clan_id),
      KEY idx_invitations_invited_by (invited_by_account_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [columns] = await db.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'invitations'
      AND COLUMN_NAME = 'generation'
  `);

  if (!columns.length) {
    await db.query("ALTER TABLE invitations ADD COLUMN generation INT NULL AFTER role");
  }

  ensuredInvitationSchema = true;
}

async function markExpiredInvitations() {
  await ensureInvitationSchema();
  await db.query(
    "UPDATE invitations SET status = 'expired' WHERE status = 'pending' AND expires_at <= NOW()"
  );
}

module.exports = {
  createRawInviteToken,
  ensureInvitationSchema,
  hashInviteToken,
  isValidEmail,
  markExpiredInvitations,
  normalizeEmail,
  roleToId,
  roleToName,
};
