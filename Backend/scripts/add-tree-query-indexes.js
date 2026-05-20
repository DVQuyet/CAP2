require('dotenv').config();

const db = require('../src/config/db');

const indexes = [
  {
    table: 'children',
    name: 'idx_children_family_sort_id',
    columns: ['family_id', 'sort_order', 'id'],
    sql: 'CREATE INDEX idx_children_family_sort_id ON children (family_id, sort_order, id)',
  },
  {
    table: 'families',
    name: 'idx_families_clan_id_id',
    columns: ['clan_id', 'id'],
    sql: 'CREATE INDEX idx_families_clan_id_id ON families (clan_id, id)',
  },
  {
    table: 'people',
    name: 'idx_people_tree_order',
    columns: ['clan_id', 'generation', 'display_order', 'surname', 'middle_name', 'first_name', 'id'],
    sql: 'CREATE INDEX idx_people_tree_order ON people (clan_id, generation, display_order, surname, middle_name, first_name, id)',
  },
];

async function indexExists(tableName, indexName) {
  const [rows] = await db.query(
    `
    SELECT 1
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND INDEX_NAME = ?
    LIMIT 1
    `,
    [tableName, indexName],
  );
  return rows.length > 0;
}

async function main() {
  for (const index of indexes) {
    if (await indexExists(index.table, index.name)) {
      console.log(`exists ${index.table}.${index.name}`);
      continue;
    }

    await db.query(index.sql);
    console.log(`created ${index.table}.${index.name} (${index.columns.join(', ')})`);
  }
}

main()
  .then(async () => {
    await db.end();
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    db.end()
      .catch(() => {})
      .finally(() => process.exit(1));
  });
