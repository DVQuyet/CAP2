require("dotenv").config();
const db = require("./src/config/db");

const migrations = [
  {
    label: "posts.status",
    sql: "ALTER TABLE posts ADD COLUMN status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending'",
  },
  {
    label: "posts.description",
    sql: "ALTER TABLE posts ADD COLUMN description varchar(255) DEFAULT NULL AFTER author_id",
  },
];

async function runMigration() {
  try {
    console.log("Starting posts table migration...");
    for (const migration of migrations) {
      try {
        await db.query(migration.sql);
        console.log(`Added ${migration.label}`);
      } catch (error) {
        if (error.code === "ER_DUP_FIELDNAME") {
          console.log(`${migration.label} already exists, skipping.`);
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    console.error("Posts migration failed:", error);
  } finally {
    await db.end?.();
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Posts migration failed:", error);
    db.end?.()
      .catch(() => {})
      .finally(() => process.exit(1));
  });
