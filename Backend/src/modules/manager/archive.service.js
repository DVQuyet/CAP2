const { db } = require('./common.service');

let hasEnsuredArchivedMembersTable = false;

const ensureArchivedMembersTable = async() => {
    if (hasEnsuredArchivedMembersTable) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS archived_members (
            id INT PRIMARY KEY AUTO_INCREMENT,
            account_id INT NOT NULL,
            archived_by_account_id INT NOT NULL,
            clan_id INT NULL,
            archived_reason TEXT NULL,
            account_json JSON NOT NULL,
            person_json JSON NULL,
            archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_archived_account (account_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    hasEnsuredArchivedMembersTable = true;
};

module.exports = {
    hasEnsuredArchivedMembersTable,
    ensureArchivedMembersTable,
};
