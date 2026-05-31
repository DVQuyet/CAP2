CREATE TABLE IF NOT EXISTS user_auth_providers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  provider VARCHAR(32) NOT NULL,
  provider_id VARCHAR(191) NOT NULL,
  provider_email VARCHAR(255) NULL,
  avatar_url TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_auth_provider_identity (provider, provider_id),
  KEY idx_user_auth_provider_user (user_id),
  KEY idx_user_auth_provider_email (provider_email),
  CONSTRAINT fk_user_auth_provider_account
    FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
