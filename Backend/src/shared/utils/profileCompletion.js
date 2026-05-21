const db = require("../../config/db");

let ensuredProfileCompletedColumn = false;

async function ensureProfileCompletedColumn() {
  if (ensuredProfileCompletedColumn) return;

  const [columns] = await db.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'accounts'
      AND COLUMN_NAME = 'profile_completed'
  `);

  if (!columns.length) {
    await db.query(`
      ALTER TABLE accounts
      ADD COLUMN profile_completed TINYINT(1) NOT NULL DEFAULT 1 AFTER status
    `);
  }

  ensuredProfileCompletedColumn = true;
}

function isProfileCompleted(value) {
  return value === true || value === 1 || value === "1";
}

module.exports = {
  ensureProfileCompletedColumn,
  isProfileCompleted,
};
