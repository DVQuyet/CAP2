const crypto = require("crypto");
const db = require("../../config/db");

const TREE_EDIT_KEY_HEADER = "x-tree-edit-key";
const TEMP_EDIT_TTL_MS = 60 * 60 * 1000;

let hasEnsuredMemberTreeEditKeysTable = false;

const asArray = (value) => (Array.isArray(value) ? value : []);

const uniqueNumericIds = (values) =>
  [...new Set(asArray(values).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0))];

const hashTreeEditKey = (rawKey) =>
  crypto.createHash("sha256").update(String(rawKey || "").trim(), "utf8").digest("hex");

async function ensureMemberTreeEditKeysTable() {
  if (hasEnsuredMemberTreeEditKeysTable) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS member_tree_edit_keys (
      id INT PRIMARY KEY AUTO_INCREMENT,
      member_account_id INT NOT NULL,
      member_person_id INT NOT NULL,
      clan_id INT NOT NULL,
      raw_key VARCHAR(80) NULL,
      key_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_by_account_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_member_tree_edit_key_member (member_account_id),
      KEY idx_member_tree_edit_key_person (member_person_id),
      KEY idx_member_tree_edit_key_expires (expires_at),
      CONSTRAINT fk_member_tree_edit_key_account FOREIGN KEY (member_account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      CONSTRAINT fk_member_tree_edit_key_person FOREIGN KEY (member_person_id) REFERENCES people(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [columns] = await db.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'member_tree_edit_keys'
        AND COLUMN_NAME = 'raw_key'
    `,
  );
  if (!columns.length) {
    await db.query("ALTER TABLE member_tree_edit_keys ADD COLUMN raw_key VARCHAR(80) NULL AFTER clan_id");
  }

  hasEnsuredMemberTreeEditKeysTable = true;
}

function generateRawTreeEditKey() {
  return `GPEK-${crypto.randomBytes(18).toString("hex").toUpperCase()}`;
}

async function createTemporaryTreeEditKey({ memberAccountId, memberPersonId, clanId, createdByAccountId }) {
  await ensureMemberTreeEditKeysTable();

  const rawKey = generateRawTreeEditKey();
  const expiresAt = new Date(Date.now() + TEMP_EDIT_TTL_MS);

  await db.query("DELETE FROM member_tree_edit_keys WHERE member_account_id = ?", [memberAccountId]);
  await db.query(
    `
      INSERT INTO member_tree_edit_keys (
        member_account_id,
        member_person_id,
        clan_id,
        raw_key,
        key_hash,
        expires_at,
        created_by_account_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [memberAccountId, memberPersonId, clanId, rawKey, hashTreeEditKey(rawKey), expiresAt, createdByAccountId],
  );

  return {
    rawKey,
    expiresAt,
  };
}

function readTreeEditKeyFromRequest(req) {
  const headerValue = req?.headers?.[TREE_EDIT_KEY_HEADER];
  if (typeof headerValue === "string" && headerValue.trim()) return headerValue.trim();
  const bodyValue = req?.body?.tree_edit_key;
  if (typeof bodyValue === "string" && bodyValue.trim()) return bodyValue.trim();
  return "";
}

async function findValidTreeEditGrant(accountId, rawKey) {
  await ensureMemberTreeEditKeysTable();
  const submittedKey = String(rawKey || "").trim();
  if (!submittedKey) return null;

  const [rows] = await db.query(
    `
      SELECT
        id,
        member_account_id,
        member_person_id,
        clan_id,
        expires_at,
        created_by_account_id,
        created_at,
        TIMESTAMPDIFF(MICROSECOND, NOW(6), expires_at) / 1000 AS expires_remaining_ms,
        TIMESTAMPDIFF(MICROSECOND, NOW(6), DATE_ADD(created_at, INTERVAL 1 HOUR)) / 1000 AS created_remaining_ms
      FROM member_tree_edit_keys
      WHERE member_account_id = ?
        AND key_hash = ?
        AND expires_at > NOW()
        AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
      LIMIT 1
    `,
    [accountId, hashTreeEditKey(submittedKey)],
  );

  return rows[0] || null;
}

async function loadClanRelationRows(clanId) {
  const [familyRows] = await db.query(
    "SELECT id, father_id, mother_id FROM families WHERE clan_id = ? ORDER BY id ASC",
    [clanId],
  );
  const [childRows] = await db.query(
    `
      SELECT c.family_id, c.person_id, c.sort_order
      FROM families f
      STRAIGHT_JOIN children c ON c.family_id = f.id
      WHERE f.clan_id = ?
      ORDER BY c.family_id, c.sort_order, c.id
    `,
    [clanId],
  );

  return {
    families: familyRows,
    children: childRows,
  };
}

function getDirectParentIds(personId, families, childRows) {
  const child = asArray(childRows).find((row) => Number(row.person_id) === Number(personId));
  if (!child) return [];
  const family = asArray(families).find((row) => Number(row.id) === Number(child.family_id));
  if (!family) return [];
  return uniqueNumericIds([family.father_id, family.mother_id]);
}

function getDirectChildIds(personId, families, childRows) {
  const ownedFamilyIds = asArray(families)
    .filter(
      (family) =>
        Number(family.father_id) === Number(personId) || Number(family.mother_id) === Number(personId),
    )
    .map((family) => Number(family.id));

  return uniqueNumericIds(
    asArray(childRows)
      .filter((row) => ownedFamilyIds.includes(Number(row.family_id)))
      .map((row) => row.person_id),
  );
}

function buildAllowedNodeIds(memberPersonId, families, childRows) {
  return uniqueNumericIds([
    memberPersonId,
    ...getDirectParentIds(memberPersonId, families, childRows),
    ...getDirectChildIds(memberPersonId, families, childRows),
  ]);
}

async function buildGenerationEditScope(memberPersonId, clanId) {
  const [memberRows] = await db.query(
    "SELECT id, generation FROM people WHERE id = ? AND clan_id = ? LIMIT 1",
    [memberPersonId, clanId],
  );
  const member = memberRows[0] || null;
  const memberGeneration = Number(member?.generation);

  if (!member || !Number.isInteger(memberGeneration) || memberGeneration <= 0) {
    return {
      allowedNodeIds: uniqueNumericIds([memberPersonId]),
      memberGeneration: null,
      allowedGenerations: [],
    };
  }

  const allowedGenerations = [memberGeneration - 1, memberGeneration, memberGeneration + 1].filter(
    (value) => Number.isInteger(value) && value > 0,
  );
  const placeholders = allowedGenerations.map(() => "?").join(",");
  const [peopleRows] = await db.query(
    `SELECT id FROM people WHERE clan_id = ? AND generation IN (${placeholders})`,
    [clanId, ...allowedGenerations],
  );

  return {
    allowedNodeIds: uniqueNumericIds(peopleRows.map((row) => row.id)),
    memberGeneration,
    allowedGenerations,
  };
}

async function buildTreeEditSession(grant) {
  const scope = await buildGenerationEditScope(grant.member_person_id, grant.clan_id);
  const expiresAtTime = new Date(grant.expires_at).getTime();
  const createdExpiryTime = new Date(grant.created_at).getTime() + TEMP_EDIT_TTL_MS;
  const dbRemainingCandidates = [grant.expires_remaining_ms, grant.created_remaining_ms]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const expiresInMs = dbRemainingCandidates.length
    ? Math.max(0, Math.min(...dbRemainingCandidates))
    : Number.isFinite(expiresAtTime) && Number.isFinite(createdExpiryTime)
      ? Math.max(0, Math.min(expiresAtTime, createdExpiryTime) - Date.now())
      : 0;
  const effectiveExpiresAt = new Date(Date.now() + expiresInMs);

  return {
    grant,
    allowedNodeIds: scope.allowedNodeIds,
    expiresAt: effectiveExpiresAt,
    expiresInMs,
    memberGeneration: scope.memberGeneration,
    allowedGenerations: scope.allowedGenerations,
  };
}

async function getTreeEditSessionForAccount(accountId, rawKey) {
  const grant = await findValidTreeEditGrant(accountId, rawKey);
  if (!grant) return null;
  return buildTreeEditSession(grant);
}

async function activateTreeEditSessionForAccount(accountId, rawKey) {
  const grant = await findValidTreeEditGrant(accountId, rawKey);
  if (!grant) return null;
  return buildTreeEditSession(grant);
}

async function assertTreeMutationPermission(req, { action, affectedPersonIds = [] }) {
  const roleName = String(req?.user?.role_name || "");
  const roleId = Number(req?.user?.role_id);

  if (roleName === "admin" || roleName === "manager" || roleId === 1 || roleId === 2) {
    return { ok: true, scope: "all", allowedNodeIds: null, expiresAt: null };
  }

  if (roleName !== "member" && roleId !== 3) {
    return { ok: false, status: 403, message: "Ban khong co quyen chinh sua cay gia pha." };
  }

  const disallowedLimitedActions = new Set([
    "create_person",
    "delete_person",
    "link_relations",
    "create_family",
    "add_family_child",
  ]);

  const rawKey = readTreeEditKeyFromRequest(req);
  if (!rawKey) {
    return { ok: false, status: 403, message: "Can temporary edit key hop le de chinh sua cay gia pha." };
  }

  const session = await getTreeEditSessionForAccount(req.user.id, rawKey);
  if (!session) {
    return { ok: false, status: 403, message: "Temporary edit key khong hop le hoac da het han." };
  }

  if (disallowedLimitedActions.has(action)) {
    return {
      ok: false,
      status: 403,
      message: "Temporary edit key chi cho phep sua thong tin va vi tri cac node thuoc doi hien tai, tren 1 doi va duoi 1 doi.",
    };
  }

  const targetIds = uniqueNumericIds(affectedPersonIds);
  if (targetIds.some((personId) => !session.allowedNodeIds.includes(personId))) {
    return {
      ok: false,
      status: 403,
      message: "Ban chi duoc chinh sua cac node thuoc doi hien tai, tren 1 doi va duoi 1 doi.",
    };
  }

  return {
    ok: true,
    scope: "limited",
    allowedNodeIds: session.allowedNodeIds,
    expiresAt: session.expiresAt,
    expiresInMs: session.expiresInMs,
    memberPersonId: session.grant.member_person_id,
    memberGeneration: session.memberGeneration,
    allowedGenerations: session.allowedGenerations,
    clanId: session.grant.clan_id,
  };
}

module.exports = {
  TREE_EDIT_KEY_HEADER,
  TEMP_EDIT_TTL_MS,
  ensureMemberTreeEditKeysTable,
  createTemporaryTreeEditKey,
  readTreeEditKeyFromRequest,
  getTreeEditSessionForAccount,
  activateTreeEditSessionForAccount,
  assertTreeMutationPermission,
  buildGenerationEditScope,
  buildAllowedNodeIds,
  getDirectParentIds,
  getDirectChildIds,
};
