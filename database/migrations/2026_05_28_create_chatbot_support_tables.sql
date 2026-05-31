SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS person_aliases (
  id INT NOT NULL AUTO_INCREMENT,
  person_id INT NOT NULL,
  clan_id INT NOT NULL,
  alias VARCHAR(255) NOT NULL,
  normalized_alias VARCHAR(255) NOT NULL,
  alias_type ENUM('nickname','ordinal','spoken_name','maiden_name','other') NOT NULL DEFAULT 'other',
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_by_account_id INT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_person_aliases_person_normalized (person_id, normalized_alias),
  KEY idx_person_aliases_clan_normalized (clan_id, normalized_alias),
  KEY idx_person_aliases_person (person_id),
  CONSTRAINT fk_person_aliases_person
    FOREIGN KEY (person_id) REFERENCES people(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_person_aliases_clan
    FOREIGN KEY (clan_id) REFERENCES clans(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chatbot_messages (
  id BIGINT NOT NULL AUTO_INCREMENT,
  conversation_id INT NULL,
  clan_id INT NOT NULL,
  account_id INT NULL,
  current_member_id INT NULL,
  role ENUM('user','assistant','system') NOT NULL,
  message TEXT NOT NULL,
  intent VARCHAR(80) NULL,
  confidence DECIMAL(5,4) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_chatbot_messages_conversation_created (conversation_id, created_at),
  KEY idx_chatbot_messages_clan_created (clan_id, created_at),
  KEY idx_chatbot_messages_account_created (account_id, created_at),
  CONSTRAINT fk_chatbot_messages_clan
    FOREIGN KEY (clan_id) REFERENCES clans(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_chatbot_messages_account
    FOREIGN KEY (account_id) REFERENCES accounts(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_chatbot_messages_current_member
    FOREIGN KEY (current_member_id) REFERENCES people(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS relationship_cache (
  id BIGINT NOT NULL AUTO_INCREMENT,
  clan_id INT NOT NULL,
  source_person_id INT NOT NULL,
  target_person_id INT NOT NULL,
  relationship_key VARCHAR(255) NOT NULL,
  relationship_label VARCHAR(255) NOT NULL,
  relationship_path JSON NOT NULL,
  path_depth INT NOT NULL,
  confidence DECIMAL(5,4) NOT NULL DEFAULT 0.9000,
  graph_version BIGINT NOT NULL DEFAULT 1,
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_relationship_cache_pair (clan_id, source_person_id, target_person_id, graph_version),
  KEY idx_relationship_cache_expires (expires_at),
  CONSTRAINT fk_relationship_cache_clan
    FOREIGN KEY (clan_id) REFERENCES clans(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_relationship_cache_source
    FOREIGN KEY (source_person_id) REFERENCES people(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_relationship_cache_target
    FOREIGN KEY (target_person_id) REFERENCES people(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS family_graph_versions (
  clan_id INT NOT NULL,
  graph_version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (clan_id),
  CONSTRAINT fk_family_graph_versions_clan
    FOREIGN KEY (clan_id) REFERENCES clans(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS add_chatbot_child_columns;
DELIMITER $$
CREATE PROCEDURE add_chatbot_child_columns()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'children'
      AND COLUMN_NAME = 'child_type'
  ) THEN
    ALTER TABLE children
      ADD COLUMN child_type ENUM('biological','adopted','step','foster','unknown')
      NOT NULL DEFAULT 'biological'
      AFTER sort_order;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'children'
      AND COLUMN_NAME = 'relationship_note'
  ) THEN
    ALTER TABLE children
      ADD COLUMN relationship_note TEXT NULL
      AFTER child_type;
  END IF;
END$$
DELIMITER ;

CALL add_chatbot_child_columns();
DROP PROCEDURE IF EXISTS add_chatbot_child_columns;

DROP PROCEDURE IF EXISTS add_chatbot_index_if_missing;
DELIMITER $$
CREATE PROCEDURE add_chatbot_index_if_missing(
  IN target_table VARCHAR(64),
  IN target_index VARCHAR(64),
  IN create_statement TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = target_table
      AND INDEX_NAME = target_index
  ) THEN
    SET @sql = create_statement;
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL add_chatbot_index_if_missing(
  'children',
  'idx_children_family_sort',
  'CREATE INDEX idx_children_family_sort ON children (family_id, sort_order, id)'
);
CALL add_chatbot_index_if_missing(
  'children',
  'idx_children_person',
  'CREATE INDEX idx_children_person ON children (person_id)'
);
CALL add_chatbot_index_if_missing(
  'families',
  'idx_families_clan_father',
  'CREATE INDEX idx_families_clan_father ON families (clan_id, father_id)'
);
CALL add_chatbot_index_if_missing(
  'families',
  'idx_families_clan_mother',
  'CREATE INDEX idx_families_clan_mother ON families (clan_id, mother_id)'
);

DROP PROCEDURE IF EXISTS add_chatbot_index_if_missing;
