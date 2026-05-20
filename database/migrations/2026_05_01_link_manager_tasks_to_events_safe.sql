-- Migration an toàn: liên kết công việc manager_tasks với sự kiện events
SET @db_name = DATABASE();

SET @has_event_id = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'manager_tasks' AND COLUMN_NAME = 'event_id'
);
SET @sql_add_col = IF(
  @has_event_id = 0,
  'ALTER TABLE manager_tasks ADD COLUMN event_id INT NULL AFTER due_date',
  'SELECT "event_id already exists" AS message'
);
PREPARE stmt FROM @sql_add_col; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_index = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'manager_tasks' AND INDEX_NAME = 'idx_manager_tasks_event'
);
SET @sql_add_index = IF(
  @has_index = 0,
  'ALTER TABLE manager_tasks ADD INDEX idx_manager_tasks_event (event_id)',
  'SELECT "idx_manager_tasks_event already exists" AS message'
);
PREPARE stmt FROM @sql_add_index; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'manager_tasks'
    AND CONSTRAINT_NAME = 'fk_manager_tasks_event' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql_add_fk = IF(
  @has_fk = 0,
  'ALTER TABLE manager_tasks ADD CONSTRAINT fk_manager_tasks_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL',
  'SELECT "fk_manager_tasks_event already exists" AS message'
);
PREPARE stmt FROM @sql_add_fk; EXECUTE stmt; DEALLOCATE PREPARE stmt;
