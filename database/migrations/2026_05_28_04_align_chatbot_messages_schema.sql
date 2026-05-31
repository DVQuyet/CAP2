SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS align_chatbot_messages_schema;
DELIMITER $$
CREATE PROCEDURE align_chatbot_messages_schema()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'chatbot_messages'
      AND COLUMN_NAME = 'current_member_id'
  ) THEN
    ALTER TABLE chatbot_messages
      ADD COLUMN current_member_id INT NULL AFTER account_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'chatbot_messages'
      AND COLUMN_NAME = 'role'
  ) THEN
    ALTER TABLE chatbot_messages
      ADD COLUMN role ENUM('user','assistant','system') NULL AFTER current_member_id;
    UPDATE chatbot_messages
    SET role = CASE WHEN sender = 'bot' THEN 'assistant' ELSE 'user' END
    WHERE role IS NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'chatbot_messages'
      AND COLUMN_NAME = 'confidence'
  ) THEN
    ALTER TABLE chatbot_messages
      ADD COLUMN confidence DECIMAL(5,4) NULL AFTER intent;
  END IF;
END$$
DELIMITER ;

CALL align_chatbot_messages_schema();
DROP PROCEDURE IF EXISTS align_chatbot_messages_schema;
