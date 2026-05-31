const db = require('../../config/db');

let hasEnsuredTreeLayoutSettingsTable = false;
let hasEnsuredClanTreeStyleColumn = false;

const ensureTreeLayoutSettingsTable = async () => {
  if (hasEnsuredTreeLayoutSettingsTable) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS tree_layout_settings (
      clan_id INT PRIMARY KEY,
      line_routes JSON NULL,
      card_sizes JSON NULL,
      updated_by_account_id INT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_tree_layout_settings_clan
        FOREIGN KEY (clan_id) REFERENCES clans(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  hasEnsuredTreeLayoutSettingsTable = true;
};

const ensureClanTreeStyleColumn = async () => {
  if (hasEnsuredClanTreeStyleColumn) return;
  const [rows] = await db.query(
    `
    SELECT COUNT(*) AS total
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'clans'
      AND COLUMN_NAME = 'tree_style'
    `
  );
  if (!Number(rows[0]?.total || 0)) {
    await db.query('ALTER TABLE clans ADD COLUMN tree_style JSON NULL AFTER hall_address');
  }
  hasEnsuredClanTreeStyleColumn = true;
};

const safeJsonParse = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const getTreeLayoutSettings = async (clanId) => {
  const id = Number(clanId);
  if (!Number.isFinite(id) || id <= 0) return { line_routes: {}, card_sizes: {}, tree_style: {} };
  await ensureTreeLayoutSettingsTable();
  await ensureClanTreeStyleColumn();
  const [rows] = await db.query(
    'SELECT line_routes, card_sizes, updated_at FROM tree_layout_settings WHERE clan_id = ? LIMIT 1',
    [id]
  );
  const [clanRows] = await db.query(
    'SELECT tree_style FROM clans WHERE id = ? LIMIT 1',
    [id]
  );
  const row = rows[0] || {};
  return {
    line_routes: safeJsonParse(row.line_routes, {}),
    card_sizes: safeJsonParse(row.card_sizes, {}),
    tree_style: safeJsonParse(clanRows[0]?.tree_style, {}),
    updated_at: row.updated_at || null,
  };
};

const saveTreeLayoutSettings = async (clanId, settings = {}, accountId = null) => {
  const id = Number(clanId);
  if (!Number.isFinite(id) || id <= 0) return { saved: false };
  await ensureTreeLayoutSettingsTable();
  await ensureClanTreeStyleColumn();

  const hasLineRoutes = Object.prototype.hasOwnProperty.call(settings, 'line_routes');
  const hasCardSizes = Object.prototype.hasOwnProperty.call(settings, 'card_sizes');
  const hasTreeStyle = Object.prototype.hasOwnProperty.call(settings, 'tree_style');
  if (!hasLineRoutes && !hasCardSizes && !hasTreeStyle) return { saved: false };

  const current = await getTreeLayoutSettings(id);
  const nextLineRoutes = hasLineRoutes ? (settings.line_routes || {}) : current.line_routes;
  const nextCardSizes = hasCardSizes ? (settings.card_sizes || {}) : current.card_sizes;

  if (hasLineRoutes || hasCardSizes) {
    await db.query(
      `
      INSERT INTO tree_layout_settings (clan_id, line_routes, card_sizes, updated_by_account_id)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        line_routes = VALUES(line_routes),
        card_sizes = VALUES(card_sizes),
        updated_by_account_id = VALUES(updated_by_account_id),
        updated_at = CURRENT_TIMESTAMP
      `,
      [
        id,
        JSON.stringify(nextLineRoutes || {}),
        JSON.stringify(nextCardSizes || {}),
        accountId || null,
      ]
    );
  }

  if (hasTreeStyle) {
    await db.query(
      'UPDATE clans SET tree_style = ? WHERE id = ?',
      [JSON.stringify(settings.tree_style || {}), id]
    );
  }

  return { saved: true };
};

module.exports = {
  ensureClanTreeStyleColumn,
  ensureTreeLayoutSettingsTable,
  getTreeLayoutSettings,
  saveTreeLayoutSettings,
};
