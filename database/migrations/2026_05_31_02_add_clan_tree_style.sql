SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS add_clan_tree_style_column_if_missing;
DELIMITER $$
CREATE PROCEDURE add_clan_tree_style_column_if_missing()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'clans'
      AND COLUMN_NAME = 'tree_style'
  ) THEN
    ALTER TABLE clans
      ADD COLUMN tree_style JSON NULL
      AFTER hall_address;
  END IF;
END$$
DELIMITER ;

CALL add_clan_tree_style_column_if_missing();
DROP PROCEDURE IF EXISTS add_clan_tree_style_column_if_missing;
