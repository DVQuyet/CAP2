const { db } = require('./common.service');

const ensureFamilyMemoriesSchemaForManager = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS family_memories (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            clan_id BIGINT UNSIGNED NOT NULL,
            author_account_id BIGINT UNSIGNED NULL,
            author_person_id BIGINT UNSIGNED NULL,
            title VARCHAR(255) NOT NULL,
            content TEXT NULL,
            media_id BIGINT UNSIGNED NULL,
            media_url TEXT NULL,
            media_type VARCHAR(30) NOT NULL DEFAULT 'text',
            mime_type VARCHAR(120) NULL,
            original_filename VARCHAR(255) NULL,
            visibility ENUM('clan','selected','private') NOT NULL DEFAULT 'clan',
            scheduled_publish_at DATETIME NULL,
            status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
            rejection_reason TEXT NULL,
            approved_by_account_id BIGINT UNSIGNED NULL,
            approved_at TIMESTAMP NULL DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_family_memories_clan_status (clan_id, status),
            KEY idx_family_memories_visibility (clan_id, visibility),
            KEY idx_family_memories_scheduled (clan_id, scheduled_publish_at),
            KEY idx_family_memories_author (author_account_id),
            KEY idx_family_memories_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [columns] = await db.query("SHOW COLUMNS FROM family_memories");
    const columnNames = new Set(columns.map((column) => column.Field));

    if (!columnNames.has("visibility")) {
        await db.query("ALTER TABLE family_memories ADD COLUMN visibility ENUM('clan','selected','private') NOT NULL DEFAULT 'clan' AFTER original_filename");
    }

    if (!columnNames.has("scheduled_publish_at")) {
        await db.query("ALTER TABLE family_memories ADD COLUMN scheduled_publish_at DATETIME NULL AFTER visibility");
    }

    await db.query(`
        CREATE TABLE IF NOT EXISTS family_memory_readers (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            memory_id BIGINT UNSIGNED NOT NULL,
            clan_id BIGINT UNSIGNED NOT NULL,
            reader_account_id BIGINT UNSIGNED NULL,
            reader_person_id BIGINT UNSIGNED NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_family_memory_reader_account (memory_id, reader_account_id),
            UNIQUE KEY uk_family_memory_reader_person (memory_id, reader_person_id),
            KEY idx_family_memory_readers_account (reader_account_id),
            KEY idx_family_memory_readers_person (reader_person_id),
            CONSTRAINT fk_family_memory_readers_memory FOREIGN KEY (memory_id) REFERENCES family_memories(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
};

const mapManagerMemoryRow = (row) => ({
    ...row,
    media_id: row.media_id || null,
    media_url: row.media_id ? `/api/media/${row.media_id}` : row.media_url || null,
    author_name: row.author_name || row.author_email || 'Thành viên dòng họ',
    visibility: row.visibility || 'clan',
    scheduled_publish_at: row.scheduled_publish_at || null,
    reader_count: Number(row.reader_count || 0),
});

module.exports = {
    ensureFamilyMemoriesSchemaForManager,
    mapManagerMemoryRow,
};
