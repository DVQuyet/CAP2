CREATE TABLE IF NOT EXISTS media_files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_account_id INT DEFAULT NULL,
  owner_person_id INT DEFAULT NULL,
  clan_id INT DEFAULT NULL,
  usage_type ENUM(
    'avatar',
    'pending_avatar',
    'post_image',
    'photo_restore_original',
    'photo_restore_result',
    'other'
  ) NOT NULL DEFAULT 'other',
  original_filename VARCHAR(255) DEFAULT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes BIGINT UNSIGNED NOT NULL,
  image_data LONGBLOB NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_media_owner_account (owner_account_id),
  KEY idx_media_owner_person (owner_person_id),
  KEY idx_media_clan (clan_id),
  KEY idx_media_usage_type (usage_type),
  KEY idx_media_created_at (created_at),
  CONSTRAINT fk_media_owner_account FOREIGN KEY (owner_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  CONSTRAINT fk_media_owner_person FOREIGN KEY (owner_person_id) REFERENCES people(id) ON DELETE SET NULL,
  CONSTRAINT fk_media_clan FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE SET NULL
);
