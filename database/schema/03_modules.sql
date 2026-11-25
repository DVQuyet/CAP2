-- Schema các module (2/2): công việc, media, khóa sửa cây, giọng nói, đăng nhập mạng xã hội.
-- Sinh từ cấu trúc DB đang chạy (TiDB) ngày 25/11/2026; chạy được trên TiDB và MySQL 8.
-- Idempotent: CREATE TABLE IF NOT EXISTS. Chạy bằng `npm run migrate` (Backend), theo thứ tự tên file.
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `landing_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `section_id` int NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_visible` tinyint(1) NOT NULL DEFAULT '1',
  `title_vi` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title_en` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `body_vi` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `body_en` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meta_vi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meta_en` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `link_label_vi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `link_label_en` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content_vi` mediumtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content_en` mediumtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_url` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `link_url` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `icon` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_landing_items_section` (`section_id`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `landing_sections` (
  `id` int NOT NULL AUTO_INCREMENT,
  `section_key` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_visible` tinyint(1) NOT NULL DEFAULT '1',
  `items_custom` tinyint(1) NOT NULL DEFAULT '0',
  `tag_vi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tag_en` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title_vi` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title_en` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `body_vi` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `body_en` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quote_vi` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quote_en` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_url` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_landing_section_key` (`section_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `manager_task_assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_id` int NOT NULL,
  `member_account_id` int NOT NULL,
  `member_person_id` int NOT NULL,
  `status` enum('assigned','in_progress','completed') DEFAULT 'assigned',
  `assigned_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_task_member` (`task_id`,`member_account_id`),
  KEY `idx_task_assignments_member` (`member_account_id`),
  KEY `idx_task_assignments_person` (`member_person_id`),
  CONSTRAINT `fk_task_assignments_task` FOREIGN KEY (`task_id`) REFERENCES `manager_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_task_assignments_account` FOREIGN KEY (`member_account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_task_assignments_person` FOREIGN KEY (`member_person_id`) REFERENCES `people` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `manager_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `manager_account_id` int NOT NULL,
  `clan_id` int DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `event_id` int DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_manager_tasks_manager` (`manager_account_id`),
  KEY `idx_manager_tasks_clan` (`clan_id`),
  KEY `idx_manager_tasks_event` (`event_id`),
  CONSTRAINT `fk_manager_tasks_account` FOREIGN KEY (`manager_account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_manager_tasks_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `media_files` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `owner_account_id` int DEFAULT NULL,
  `owner_person_id` int DEFAULT NULL,
  `clan_id` int DEFAULT NULL,
  `usage_type` enum('avatar','pending_avatar','post_image','photo_restore_original','photo_restore_result','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `original_filename` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size_bytes` bigint unsigned NOT NULL,
  `image_data` longblob NOT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `access_key` char(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_media_owner_account` (`owner_account_id`),
  KEY `idx_media_owner_person` (`owner_person_id`),
  KEY `idx_media_clan` (`clan_id`),
  KEY `idx_media_usage_type` (`usage_type`),
  KEY `idx_media_created_at` (`created_at`),
  CONSTRAINT `fk_media_owner_account` FOREIGN KEY (`owner_account_id`) REFERENCES `accounts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_media_owner_person` FOREIGN KEY (`owner_person_id`) REFERENCES `people` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_media_clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `member_tree_edit_keys` (
  `id` int NOT NULL AUTO_INCREMENT,
  `member_account_id` int NOT NULL,
  `member_person_id` int NOT NULL,
  `clan_id` int NOT NULL,
  `raw_key` varchar(80) DEFAULT NULL,
  `key_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_by_account_id` int NOT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_member_tree_edit_key_member` (`member_account_id`),
  KEY `idx_member_tree_edit_key_person` (`member_person_id`),
  KEY `idx_member_tree_edit_key_expires` (`expires_at`),
  CONSTRAINT `fk_member_tree_edit_key_account` FOREIGN KEY (`member_account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_member_tree_edit_key_person` FOREIGN KEY (`member_person_id`) REFERENCES `people` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `person_aliases` (
  `id` int NOT NULL AUTO_INCREMENT,
  `person_id` int NOT NULL,
  `clan_id` int NOT NULL,
  `alias` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `normalized_alias` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `alias_type` enum('nickname','ordinal','spoken_name','maiden_name','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `created_by_account_id` int DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_person_aliases_person_normalized` (`person_id`,`normalized_alias`),
  KEY `idx_person_aliases_clan_normalized` (`clan_id`,`normalized_alias`),
  KEY `idx_person_aliases_person` (`person_id`),
  CONSTRAINT `fk_person_aliases_person` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_person_aliases_clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `recordings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `account_id` int NOT NULL,
  `person_id` int DEFAULT NULL,
  `clan_id` int DEFAULT NULL,
  `original_filename` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `stored_filename` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `storage_path` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `duration_seconds` int unsigned DEFAULT NULL,
  `file_size_bytes` bigint unsigned NOT NULL,
  `status` enum('uploaded','transcribing','completed','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'uploaded',
  `processing_started_at` timestamp NULL DEFAULT NULL,
  `transcript` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transcript_edited` tinyint(1) NOT NULL DEFAULT '0',
  `transcript_edited_at` timestamp NULL DEFAULT NULL,
  `transcribed_at` timestamp NULL DEFAULT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_recordings_account` (`account_id`),
  KEY `idx_recordings_clan` (`clan_id`),
  KEY `idx_recordings_status_created` (`status`,`created_at`),
  FULLTEXT INDEX `ft_recordings_transcript`(`transcript`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `relationship_cache` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `clan_id` int NOT NULL,
  `source_person_id` int NOT NULL,
  `target_person_id` int NOT NULL,
  `relationship_key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `relationship_label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `relationship_path` json NOT NULL,
  `path_depth` int NOT NULL,
  `confidence` decimal(5,4) NOT NULL DEFAULT '0.9000',
  `graph_version` bigint NOT NULL DEFAULT '1',
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_relationship_cache_pair` (`clan_id`,`source_person_id`,`target_person_id`,`graph_version`),
  KEY `idx_relationship_cache_expires` (`expires_at`),
  KEY `fk_relationship_cache_source` (`source_person_id`),
  KEY `fk_relationship_cache_target` (`target_person_id`),
  CONSTRAINT `fk_relationship_cache_clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_relationship_cache_source` FOREIGN KEY (`source_person_id`) REFERENCES `people` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_relationship_cache_target` FOREIGN KEY (`target_person_id`) REFERENCES `people` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tree_layout_settings` (
  `clan_id` int NOT NULL,
  `line_routes` json DEFAULT NULL,
  `card_sizes` json DEFAULT NULL,
  `updated_by_account_id` int DEFAULT NULL,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`clan_id`),
  CONSTRAINT `fk_tree_layout_settings_clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `user_auth_providers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `provider` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avatar_url` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_auth_provider_identity` (`provider`,`provider_id`),
  KEY `idx_user_auth_provider_user` (`user_id`),
  KEY `idx_user_auth_provider_email` (`provider_email`),
  CONSTRAINT `fk_user_auth_provider_account` FOREIGN KEY (`user_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `voice_recording_recipients` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `recording_id` bigint unsigned NOT NULL,
  `sender_account_id` int NOT NULL,
  `sender_person_id` int DEFAULT NULL,
  `clan_id` int DEFAULT NULL,
  `receiver_account_id` int DEFAULT NULL,
  `receiver_person_id` int DEFAULT NULL,
  `transcript_snapshot` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `audio_storage_path` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `send_status` enum('pending','sent','failed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `scheduled_at` datetime DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vrr_recording` (`recording_id`),
  KEY `idx_vrr_sender_account` (`sender_account_id`),
  KEY `idx_vrr_receiver_account` (`receiver_account_id`),
  KEY `idx_vrr_receiver_person` (`receiver_person_id`),
  KEY `idx_vrr_clan_status_scheduled` (`clan_id`,`send_status`,`scheduled_at`),
  KEY `fk_vrr_sender_person` (`sender_person_id`),
  CONSTRAINT `fk_vrr_recording` FOREIGN KEY (`recording_id`) REFERENCES `recordings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_vrr_sender_account` FOREIGN KEY (`sender_account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_vrr_sender_person` FOREIGN KEY (`sender_person_id`) REFERENCES `people` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_vrr_receiver_account` FOREIGN KEY (`receiver_account_id`) REFERENCES `accounts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_vrr_receiver_person` FOREIGN KEY (`receiver_person_id`) REFERENCES `people` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
