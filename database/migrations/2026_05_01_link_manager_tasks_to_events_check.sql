SELECT
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'manager_tasks' AND COLUMN_NAME = 'event_id') AS has_event_id_column,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'manager_tasks' AND INDEX_NAME = 'idx_manager_tasks_event') AS has_event_id_index,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'manager_tasks' AND CONSTRAINT_NAME = 'fk_manager_tasks_event') AS has_event_id_foreign_key;

SELECT mt.id AS task_id, mt.title AS task_title, mt.event_id, e.title AS event_title, mt.clan_id AS task_clan_id, e.clan_id AS event_clan_id
FROM manager_tasks mt
LEFT JOIN events e ON e.id = mt.event_id
ORDER BY mt.id DESC
LIMIT 20;
