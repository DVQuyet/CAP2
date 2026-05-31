SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS account_people (
  id BIGINT NOT NULL AUTO_INCREMENT,
  account_id INT NOT NULL,
  person_id INT NOT NULL,
  clan_id INT NOT NULL,
  role ENUM('self','manager','viewer','editor') NOT NULL DEFAULT 'self',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_account_people_account_person (account_id, person_id),
  KEY idx_account_people_account_default (account_id, is_default),
  KEY idx_account_people_clan_person (clan_id, person_id),
  CONSTRAINT fk_account_people_account
    FOREIGN KEY (account_id) REFERENCES accounts(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_account_people_person
    FOREIGN KEY (person_id) REFERENCES people(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_account_people_clan
    FOREIGN KEY (clan_id) REFERENCES clans(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
