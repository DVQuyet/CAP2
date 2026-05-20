const db = require("../../config/db");

let schemaReady = false;

const hasColumn = (columns, name) => columns.some((column) => column.Field === name);

const getNotificationColumns = async () => {
  const [columns] = await db.query("SHOW COLUMNS FROM notifications");
  return columns;
};

const makeReceiverPersonNullable = async () => {
  try {
    await db.query("ALTER TABLE notifications MODIFY receiver_person_id INT NULL");
    return;
  } catch (error) {
    if (!["ER_FK_COLUMN_CANNOT_CHANGE", "ER_FK_COLUMN_CANNOT_CHANGE_CHILD"].includes(error?.code)) {
      throw error;
    }
  }

  const [constraints] = await db.query(
    `
      SELECT CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'notifications'
        AND COLUMN_NAME = 'receiver_person_id'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `
  );

  for (const row of constraints) {
    await db.query(`ALTER TABLE notifications DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``);
  }

  await db.query("ALTER TABLE notifications MODIFY receiver_person_id INT NULL");

  if (constraints.length > 0) {
    await db.query(
      "ALTER TABLE notifications ADD CONSTRAINT FK_Notify_Receiver FOREIGN KEY (receiver_person_id) REFERENCES people(id) ON DELETE CASCADE"
    );
  }
};

const ensureNotificationSchema = async () => {
  if (schemaReady) return;

  let columns = await getNotificationColumns();
  const receiverPerson = columns.find((column) => column.Field === "receiver_person_id");
  if (receiverPerson && receiverPerson.Null === "NO") {
    await makeReceiverPersonNullable();
    columns = await getNotificationColumns();
  }

  if (!hasColumn(columns, "receiver_account_id")) {
    await db.query("ALTER TABLE notifications ADD COLUMN receiver_account_id INT NULL AFTER receiver_person_id");
    await db.query("CREATE INDEX idx_notify_account_unread ON notifications (receiver_account_id, is_read)");
  }

  await db.query(
    `
      UPDATE notifications n
      INNER JOIN accounts a ON a.person_id = n.receiver_person_id
      SET n.receiver_account_id = a.id
      WHERE n.receiver_account_id IS NULL
    `
  );

  schemaReady = true;
};

const createNotification = async (payload) => {
  await ensureNotificationSchema();

  const {
    receiverAccountId,
    accountId,
    receiverPersonId,
    personId,
    type,
    title,
    message,
    linkUrl,
    link_url,
    data
  } = payload;

  const targetAccountId = receiverAccountId || accountId || null;
  const targetPersonId = receiverPersonId || personId || null;
  const targetLinkUrl = linkUrl || link_url || data?.link_url || null;

  if (targetAccountId == null && targetPersonId == null) {
    return null;
  }

  const [result] = await db.query(
    `
      INSERT INTO notifications (receiver_account_id, receiver_person_id, type, title, message, link_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [targetAccountId, targetPersonId, type, title, message, targetLinkUrl]
  );


  return result.insertId;
};

module.exports = {
  createNotification,
  ensureNotificationSchema,
};
