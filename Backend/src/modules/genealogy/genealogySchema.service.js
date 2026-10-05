// Bổ sung cột/bảng cho mô hình quan hệ đầy đủ (chạy một lần mỗi tiến trình, chỉ thêm, không xóa dữ liệu).
// Tương ứng với database/migrations/2026_10_05_genealogy_relationship_model.sql.
const { db } = require('../manager/common.service');

const PRECISION_ENUM = "ENUM('exact','month','year','approximate','unknown') NOT NULL DEFAULT 'exact'";
const SOURCE_ENUM = "ENUM('direct','paper_genealogy','oral','document','unknown') NULL";
const RELATIONSHIP_STATUS_ENUM = "ENUM('active','divorced','widowed','separated','annulled','unknown') NOT NULL DEFAULT 'active'";
const CHILD_TYPE_ENUM = "ENUM('biological','adopted','heir','step','foster','unknown') NOT NULL DEFAULT 'biological'";

const COLUMN_SPECS = {
    people: [
        ['birth_date_precision', PRECISION_ENUM],
        ['birth_calendar', "ENUM('solar','lunar') NOT NULL DEFAULT 'solar'"],
        ['death_date_precision', PRECISION_ENUM],
        ['death_calendar', "ENUM('solar','lunar') NOT NULL DEFAULT 'solar'"],
        ['death_anniversary_lunar', 'VARCHAR(5) NULL'],
        ['source_type', SOURCE_ENUM],
        ['source_note', 'TEXT NULL'],
    ],
    families: [
        ['relationship_status', RELATIONSHIP_STATUS_ENUM],
        ['ended_at', 'DATE NULL'],
        ['relation_note', 'TEXT NULL'],
        ['union_type', "ENUM('marriage','concubine','cohabitation','unknown') NOT NULL DEFAULT 'marriage'"],
        ['wife_rank', 'TINYINT UNSIGNED NULL'],
        ['husband_rank', 'TINYINT UNSIGNED NULL'],
        ['marriage_date_precision', PRECISION_ENUM],
        ['ended_at_precision', PRECISION_ENUM],
        ['source_type', SOURCE_ENUM],
        ['source_note', 'TEXT NULL'],
        ['visibility', "ENUM('public','managers') NOT NULL DEFAULT 'public'"],
    ],
    children: [
        ['child_type', CHILD_TYPE_ENUM],
        ['is_primary_lineage', 'TINYINT(1) NOT NULL DEFAULT 1'],
        ['relationship_note', 'TEXT NULL'],
    ],
    clans: [
        ['genealogy_policy', 'JSON NULL'],
    ],
};

// Cột ENUM đã có nhưng thiếu giá trị mới thì mở rộng (chỉ thêm giá trị, không đổi giá trị cũ).
const ENUM_UPGRADES = {
    families: { relationship_status: { required: ['separated', 'annulled', 'unknown'], definition: RELATIONSHIP_STATUS_ENUM } },
    children: { child_type: { required: ['heir'], definition: CHILD_TYPE_ENUM } },
};

let ensured = false;
let ensuring = null;

const ensureColumns = async (connection, table, specs) => {
    const [columns] = await connection.query(
        `SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table]
    );
    const existing = new Map(columns.map((row) => [row.COLUMN_NAME, String(row.COLUMN_TYPE || '')]));
    for (const [name, definition] of specs) {
        if (!existing.has(name)) {
            await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${definition}`);
            continue;
        }
        const upgrade = ENUM_UPGRADES[table]?.[name];
        if (upgrade && upgrade.required.some((value) => !existing.get(name).includes(`'${value}'`))) {
            await connection.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${name}\` ${upgrade.definition}`);
        }
    }
};

const dropIndexIfExists = async (connection, table, indexName) => {
    const [rows] = await connection.query(
        `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
        [table, indexName]
    );
    if (rows.length) await connection.query(`ALTER TABLE \`${table}\` DROP INDEX \`${indexName}\``);
};

const ensureOverrideTable = async (connection) => {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS genealogy_relation_overrides (
            id INT NOT NULL AUTO_INCREMENT,
            clan_id INT NOT NULL,
            account_id INT NULL,
            action VARCHAR(64) NOT NULL,
            issue_code VARCHAR(64) NOT NULL,
            issue_key VARCHAR(255) NOT NULL,
            severity VARCHAR(16) NOT NULL,
            message TEXT NULL,
            person_ids JSON NULL,
            family_id INT NULL,
            reason TEXT NULL,
            source_type VARCHAR(32) NULL,
            source_note TEXT NULL,
            created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_gro_clan (clan_id, created_at),
            KEY idx_gro_issue (clan_id, issue_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
};

const ensureGenealogySchema = async (connection = db) => {
    if (ensured) return;
    if (ensuring) return ensuring;
    ensuring = (async () => {
        for (const [table, specs] of Object.entries(COLUMN_SPECS)) {
            await ensureColumns(connection, table, specs);
        }
        // Con nuôi / con thừa tự cần nhiều gia đình cha mẹ: bỏ ràng buộc "mỗi người một gia đình cha mẹ".
        // Mỗi người tối đa một cha mẹ ruột được kiểm tra trong lõi quan hệ.
        await dropIndexIfExists(connection, 'children', 'uk_children_single_parent_family');
        await ensureOverrideTable(connection);
        ensured = true;
    })();
    try {
        await ensuring;
    } finally {
        ensuring = null;
    }
};

module.exports = {
    ensureGenealogySchema,
};
