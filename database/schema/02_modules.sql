-- Schema các module (1/2): trợ lý, lịch, kỷ niệm, gia phả phụ, lời mời, trang chủ.
-- Sinh từ cấu trúc DB đang chạy (TiDB) ngày 25/11/2026; chạy được trên TiDB và MySQL 8.
-- Idempotent: CREATE TABLE IF NOT EXISTS. Chạy bằng `npm run migrate` (Backend), theo thứ tự tên file.
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `account_people` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `account_id` int NOT NULL,
  `person_id` int NOT NULL,
  `clan_id` int NOT NULL,
  `role` enum('self','manager','viewer','editor') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'self',
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_account_people_account_person` (`account_id`,`person_id`),
  KEY `idx_account_people_account_default` (`account_id`,`is_default`),
  KEY `idx_account_people_clan_person` (`clan_id`,`person_id`),
  KEY `fk_account_people_person` (`person_id`),
  CONSTRAINT `fk_account_people_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_account_people_person` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_account_people_clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ai_audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `account_id` int DEFAULT NULL,
  `person_id` int DEFAULT NULL,
  `clan_id` int DEFAULT NULL,
  `role` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `prompt` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `intent` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `confidence` decimal(5,4) DEFAULT NULL,
  `row_count` int NOT NULL DEFAULT '0',
  `duration_ms` int NOT NULL DEFAULT '0',
  `error` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ai_audit_account` (`account_id`),
  KEY `idx_ai_audit_clan` (`clan_id`),
  KEY `idx_ai_audit_created` (`created_at`),
  KEY `fk_ai_audit_person` (`person_id`),
  CONSTRAINT `fk_ai_audit_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_audit_person` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_audit_clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `calendar_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `clan_id` int DEFAULT NULL,
  `creator_account_id` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `event_date` date NOT NULL,
  `event_time` varchar(10) DEFAULT NULL,
  `type` varchar(30) NOT NULL DEFAULT 'personal',
  `note` text DEFAULT NULL,
  `person_id` int DEFAULT NULL,
  `repeat_yearly` tinyint(1) NOT NULL DEFAULT '0',
  `visibility` enum('personal','global') NOT NULL DEFAULT 'global',
  `reminder_days` int NOT NULL DEFAULT '0',
  `reminder_sent_at` datetime DEFAULT NULL,
  `email_sent_at` datetime DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_calendar_events_clan_date` (`clan_id`,`event_date`),
  KEY `idx_calendar_events_visibility` (`clan_id`,`visibility`,`event_date`),
  KEY `idx_calendar_events_reminder` (`reminder_sent_at`,`event_date`),
  KEY `idx_calendar_events_creator` (`creator_account_id`),
  CONSTRAINT `fk_calendar_events_creator` FOREIGN KEY (`creator_account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `chatbot_ai_audit_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `account_id` int DEFAULT NULL,
  `clan_id` int DEFAULT NULL,
  `purpose` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `request_json` json DEFAULT NULL,
  `response_json` json DEFAULT NULL,
  `accepted` tinyint(1) NOT NULL DEFAULT '0',
  `rejection_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `chatbot_feedback` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `message_id` bigint NOT NULL,
  `account_id` int NOT NULL,
  `clan_id` int DEFAULT NULL,
  `rating` tinyint NOT NULL,
  `comment` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_chatbot_feedback_message_account` (`message_id`,`account_id`),
  KEY `idx_chatbot_feedback_clan_rating` (`clan_id`,`rating`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `chatbot_memory` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `session_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_id` int DEFAULT NULL,
  `clan_id` int NOT NULL,
  `memory_json` json NOT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_chatbot_memory_session` (`session_id`),
  KEY `idx_chatbot_memory_account_clan` (`account_id`,`clan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `chatbot_messages` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `conversation_id` int DEFAULT NULL,
  `clan_id` int NOT NULL,
  `account_id` int DEFAULT NULL,
  `current_member_id` int DEFAULT NULL,
  `role` enum('user','assistant','system') COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `intent` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `confidence` decimal(5,4) DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `hidden_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_chatbot_messages_conversation_created` (`conversation_id`,`created_at`),
  KEY `idx_chatbot_messages_clan_created` (`clan_id`,`created_at`),
  KEY `idx_chatbot_messages_account_created` (`account_id`,`created_at`),
  KEY `fk_chatbot_messages_current_member` (`current_member_id`),
  CONSTRAINT `fk_chatbot_messages_clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chatbot_messages_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_chatbot_messages_current_member` FOREIGN KEY (`current_member_id`) REFERENCES `people` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `family_graph_versions` (
  `clan_id` int NOT NULL,
  `graph_version` bigint NOT NULL DEFAULT '1',
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`clan_id`),
  CONSTRAINT `fk_family_graph_versions_clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `family_memories` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `clan_id` bigint unsigned NOT NULL,
  `author_account_id` bigint unsigned DEFAULT NULL,
  `author_person_id` bigint unsigned DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `media_id` bigint unsigned DEFAULT NULL,
  `media_url` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `media_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'text',
  `mime_type` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `original_filename` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `visibility` enum('clan','selected','private') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'clan',
  `scheduled_publish_at` datetime DEFAULT NULL,
  `status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approved_by_account_id` bigint unsigned DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_family_memories_clan_status` (`clan_id`,`status`),
  KEY `idx_family_memories_visibility` (`clan_id`,`visibility`),
  KEY `idx_family_memories_scheduled` (`clan_id`,`scheduled_publish_at`),
  KEY `idx_family_memories_author` (`author_account_id`),
  KEY `idx_family_memories_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `family_memory_readers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `memory_id` bigint unsigned NOT NULL,
  `clan_id` bigint unsigned NOT NULL,
  `reader_account_id` bigint unsigned DEFAULT NULL,
  `reader_person_id` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_family_memory_reader_account` (`memory_id`,`reader_account_id`),
  UNIQUE KEY `uk_family_memory_reader_person` (`memory_id`,`reader_person_id`),
  KEY `idx_family_memory_readers_account` (`reader_account_id`),
  KEY `idx_family_memory_readers_person` (`reader_person_id`),
  CONSTRAINT `fk_family_memory_readers_memory` FOREIGN KEY (`memory_id`) REFERENCES `family_memories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `genealogy_duplicate_dismissals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `clan_id` int NOT NULL,
  `person_a_id` int NOT NULL,
  `person_b_id` int NOT NULL,
  `account_id` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_gdd_pair` (`clan_id`,`person_a_id`,`person_b_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `genealogy_relation_overrides` (
  `id` int NOT NULL AUTO_INCREMENT,
  `clan_id` int NOT NULL,
  `account_id` int DEFAULT NULL,
  `action` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `issue_code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `issue_key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `severity` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `person_ids` json DEFAULT NULL,
  `family_id` int DEFAULT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_type` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_note` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_gro_clan` (`clan_id`,`created_at`),
  KEY `idx_gro_issue` (`clan_id`,`issue_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `invitations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `invited_by_account_id` bigint unsigned DEFAULT NULL,
  `clan_id` bigint unsigned DEFAULT NULL,
  `role` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'member',
  `generation` int DEFAULT NULL,
  `status` enum('pending','accepted','expired','revoked') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `expires_at` datetime NOT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invitations_token_hash` (`token_hash`),
  KEY `idx_invitations_email_status` (`email`,`status`),
  KEY `idx_invitations_clan` (`clan_id`),
  KEY `idx_invitations_invited_by` (`invited_by_account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
