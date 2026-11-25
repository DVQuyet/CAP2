-- Schema lõi CAP2: tài khoản, dòng họ, người, gia đình, sự kiện, bài đăng, gói cước, quỹ.
-- Sinh từ cấu trúc DB đang chạy (TiDB) ngày 25/11/2026; chạy được trên TiDB và MySQL 8.
-- Idempotent: CREATE TABLE IF NOT EXISTS. Chạy bằng `npm run migrate` (Backend), theo thứ tự tên file.
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `roles` (
  `id` int NOT NULL,
  `role_name` varchar(50) COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `role_name` (`role_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `clans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `clan_name` varchar(200) COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `history` text COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `hall_address` text COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `tree_style` json DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `genealogy_policy` json DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `people` (
  `id` int NOT NULL AUTO_INCREMENT,
  `clan_id` int DEFAULT NULL,
  `display_name` varchar(255) COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `first_name` varchar(100) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `middle_name` varchar(100) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `surname` varchar(100) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `gender` tinyint DEFAULT NULL COMMENT '1: Nam, 2: Nữ',
  `generation` int NOT NULL DEFAULT '1',
  `branch` int DEFAULT NULL COMMENT 'Chi thứ mấy',
  `birth_date` date DEFAULT NULL,
  `death_date` date DEFAULT NULL,
  `is_living` tinyint(1) DEFAULT '1',
  `phone` varchar(20) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `zalo` varchar(50) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `facebook` varchar(255) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `hometown` varchar(255) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `avatar_url` text COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `bio` text COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `note` text COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `tree_x` int DEFAULT '0',
  `tree_y` int DEFAULT '0',
  `display_order` int DEFAULT '0',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `pending_avatar_url` text COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `pending_bio` text COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `moderation_status` enum('none','pending','rejected') COLLATE utf8mb4_0900_ai_ci DEFAULT 'none',
  `moderation_reason` varchar(255) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `birth_date_precision` enum('exact','month','year','approximate','unknown') COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'exact',
  `birth_calendar` enum('solar','lunar') COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'solar',
  `death_date_precision` enum('exact','month','year','approximate','unknown') COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'exact',
  `death_calendar` enum('solar','lunar') COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'solar',
  `death_anniversary_lunar` varchar(5) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `source_type` enum('direct','paper_genealogy','oral','document','unknown') COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `source_note` text COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `avatar_media_id` bigint unsigned DEFAULT NULL,
  `pending_avatar_media_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FK_People_Clan` (`clan_id`),
  KEY `idx_people_phone` (`phone`),
  KEY `idx_people_email` (`email`),
  KEY `idx_display_name` (`display_name`),
  KEY `idx_people_avatar_media` (`avatar_media_id`),
  KEY `idx_people_pending_avatar_media` (`pending_avatar_media_id`),
  CONSTRAINT `FK_People_Clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_people_avatar_media` FOREIGN KEY (`avatar_media_id`) REFERENCES `media_files` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_people_pending_avatar_media` FOREIGN KEY (`pending_avatar_media_id`) REFERENCES `media_files` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `accounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `person_id` int DEFAULT NULL,
  `role_id` int DEFAULT '3',
  `status` enum('pending','active','rejected') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `profile_completed` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `password_changed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `person_id` (`person_id`),
  KEY `FK_Account_Role` (`role_id`),
  CONSTRAINT `FK_Account_Person` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE SET NULL,
  CONSTRAINT `FK_Account_Role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `account_clans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `account_id` int NOT NULL,
  `clan_id` int NOT NULL,
  `person_id` int NOT NULL,
  `status` enum('pending','active','rejected') COLLATE utf8mb4_0900_ai_ci DEFAULT 'pending',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_account_clan` (`account_id`,`clan_id`),
  UNIQUE KEY `uk_person_once` (`person_id`),
  KEY `fk_ac_clan` (`clan_id`),
  CONSTRAINT `fk_ac_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ac_clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ac_person` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `families` (
  `id` int NOT NULL AUTO_INCREMENT,
  `clan_id` int NOT NULL,
  `father_id` int DEFAULT NULL,
  `mother_id` int DEFAULT NULL,
  `marriage_date` date DEFAULT NULL,
  `relationship_status` enum('active','divorced','widowed','separated','annulled','unknown') COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'active',
  `ended_at` date DEFAULT NULL,
  `relation_note` text COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `union_type` enum('marriage','concubine','cohabitation','unknown') COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'marriage',
  `wife_rank` tinyint unsigned DEFAULT NULL,
  `husband_rank` tinyint unsigned DEFAULT NULL,
  `marriage_date_precision` enum('exact','month','year','approximate','unknown') COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'exact',
  `ended_at_precision` enum('exact','month','year','approximate','unknown') COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'exact',
  `source_type` enum('direct','paper_genealogy','oral','document','unknown') COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `source_note` text COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `visibility` enum('public','managers') COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'public',
  `spouse_a_id` int GENERATED ALWAYS AS (least(coalesce(`father_id`, 0), coalesce(`mother_id`, 0))) VIRTUAL,
  `spouse_b_id` int GENERATED ALWAYS AS (greatest(coalesce(`father_id`, 0), coalesce(`mother_id`, 0))) VIRTUAL,
  PRIMARY KEY (`id`),
  KEY `FK_Fam_Clan` (`clan_id`),
  UNIQUE KEY `uk_families_clan_spouse_pair` (`clan_id`,`spouse_a_id`,`spouse_b_id`),
  CONSTRAINT `FK_Fam_Clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `children` (
  `id` int NOT NULL AUTO_INCREMENT,
  `family_id` int NOT NULL,
  `person_id` int NOT NULL,
  `sort_order` int DEFAULT '0',
  `child_type` enum('biological','adopted','heir','step','foster','unknown') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'biological',
  `is_primary_lineage` tinyint(1) NOT NULL DEFAULT '1',
  `relationship_note` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_family_person` (`family_id`,`person_id`),
  KEY `FK_Child_Person` (`person_id`),
  UNIQUE KEY `uk_children_family_person` (`family_id`,`person_id`),
  CONSTRAINT `FK_Child_Family` FOREIGN KEY (`family_id`) REFERENCES `families` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_Child_Person` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `conversations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `account_id` int NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'Cuộc hội thoại mới',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `FK_Chat_Account` (`account_id`),
  CONSTRAINT `FK_Chat_Account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `conversation_id` int NOT NULL,
  `sender_type` enum('user','ai') COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `FK_Message_Chat` (`conversation_id`),
  CONSTRAINT `FK_Message_Chat` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `clan_id` int NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `status` enum('upcoming','ongoing','ended') COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'upcoming',
  `event_date` date DEFAULT NULL,
  `description` text COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FK_Event_Clan` (`clan_id`),
  KEY `idx_events_clan_range` (`clan_id`,`start_date`,`end_date`),
  CONSTRAINT `FK_Event_Clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `event_contributions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `clan_id` int NOT NULL,
  `event_id` int NOT NULL,
  `campaign_id` int DEFAULT NULL,
  `person_id` int NOT NULL,
  `amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `contribution_date` date DEFAULT NULL,
  `method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Tiền mặt',
  `note` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci DEFAULT 'approved',
  `evidence_media_id` int DEFAULT NULL,
  `manager_note` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FK_Contrib_Event` (`event_id`),
  KEY `FK_Contrib_Person` (`person_id`),
  KEY `fk_contrib_clan` (`clan_id`),
  KEY `fk_contrib_campaign` (`campaign_id`),
  CONSTRAINT `FK_Contrib_Event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_Contrib_Person` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `event_costs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `clan_id` int NOT NULL,
  `event_id` int NOT NULL,
  `campaign_id` int DEFAULT NULL,
  `recipient_person_id` int DEFAULT NULL,
  `item_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `note` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recipient_note` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paid_to_manager` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT 'Khác',
  `evidence_media_id` int DEFAULT NULL,
  `status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'approved',
  `method` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Tiền mặt',
  PRIMARY KEY (`id`),
  KEY `FK_Costs_Event` (`event_id`),
  KEY `fk_costs_clan` (`clan_id`),
  KEY `fk_costs_campaign` (`campaign_id`),
  CONSTRAINT `FK_Costs_Event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `manager_announcements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `manager_account_id` int NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `priority` enum('low','normal','high','urgent') COLLATE utf8mb4_unicode_ci DEFAULT 'normal',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `FK_Manager_Announce` (`manager_account_id`),
  CONSTRAINT `FK_Manager_Announce` FOREIGN KEY (`manager_account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `receiver_person_id` int DEFAULT NULL,
  `receiver_account_id` int DEFAULT NULL,
  `type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `link_url` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notify_unread` (`receiver_person_id`,`is_read`),
  KEY `idx_notify_account_unread` (`receiver_account_id`,`is_read`),
  CONSTRAINT `FK_Notify_Receiver` FOREIGN KEY (`receiver_person_id`) REFERENCES `people` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `posts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `clan_id` int NOT NULL,
  `author_id` int NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `content` text COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `image_url` text COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `status` enum('pending','approved','rejected') COLLATE utf8mb4_0900_ai_ci DEFAULT 'pending',
  `rejection_reason` varchar(255) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `image_media_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FK_Post_Clan` (`clan_id`),
  KEY `idx_posts_image_media` (`image_media_id`),
  CONSTRAINT `FK_Post_Clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_posts_image_media` FOREIGN KEY (`image_media_id`) REFERENCES `media_files` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `post_comments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `post_id` int NOT NULL,
  `person_id` int NOT NULL,
  `parent_id` int DEFAULT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_comment_post` (`post_id`),
  KEY `FK_Comments_Person` (`person_id`),
  KEY `FK_Comments_Parent` (`parent_id`),
  CONSTRAINT `FK_Comments_Parent` FOREIGN KEY (`parent_id`) REFERENCES `post_comments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_Comments_Person` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_Comments_Post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `post_likes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `post_id` int NOT NULL,
  `person_id` int NOT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_post_person` (`post_id`,`person_id`),
  KEY `FK_PostLikes_Person` (`person_id`),
  CONSTRAINT `FK_PostLikes_Person` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_PostLikes_Post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `archived_members` (
  `id` int NOT NULL AUTO_INCREMENT,
  `account_id` int DEFAULT NULL,
  `archived_by_account_id` int NOT NULL,
  `clan_id` int DEFAULT NULL,
  `archived_reason` text COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `account_json` json NOT NULL,
  `person_json` json DEFAULT NULL,
  `archived_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `plans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `price_vnd` int NOT NULL DEFAULT '0',
  `billing_cycle` enum('free','monthly','yearly','lifetime') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'monthly',
  `person_limit` int NOT NULL,
  `account_limit` int NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_plans_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `clan_id` int NOT NULL,
  `plan_id` int NOT NULL,
  `status` enum('free','pending','active','expired','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'free',
  `started_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_subscriptions_clan` (`clan_id`),
  KEY `idx_subscriptions_plan` (`plan_id`),
  KEY `idx_subscriptions_status_expires` (`status`,`expires_at`),
  CONSTRAINT `fk_subscriptions_clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_subscriptions_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `clan_id` int NOT NULL,
  `subscription_id` int DEFAULT NULL,
  `plan_id` int NOT NULL,
  `payer_account_id` int DEFAULT NULL,
  `provider` enum('vnpay','momo','stripe','manual','sepay') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'manual',
  `order_code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount_vnd` int NOT NULL,
  `unit_amount_vnd` int DEFAULT NULL,
  `period_quantity` int NOT NULL DEFAULT '1',
  `period_unit` enum('month','year','lifetime') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'month',
  `period_months` int DEFAULT NULL,
  `billing_cycle` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'VND',
  `status` enum('pending','paid','failed','cancelled','refunded') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `provider_transaction_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `period_started_at` datetime DEFAULT NULL,
  `period_expires_at` datetime DEFAULT NULL,
  `plan_snapshot_json` json DEFAULT NULL,
  `raw_response` json DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_payments_order_code` (`order_code`),
  KEY `idx_payments_clan` (`clan_id`),
  KEY `idx_payments_plan` (`plan_id`),
  KEY `idx_payments_payer` (`payer_account_id`),
  KEY `idx_payments_status_created` (`status`,`created_at`),
  CONSTRAINT `fk_payments_clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_payments_payer` FOREIGN KEY (`payer_account_id`) REFERENCES `accounts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_payments_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `fund_campaigns` (
  `id` int NOT NULL AUTO_INCREMENT,
  `clan_id` int NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_goal` decimal(15,2) DEFAULT '0',
  `year` int NOT NULL,
  `amount_per_member` decimal(15,2) DEFAULT '0.00',
  `deadline` date DEFAULT NULL,
  `status` enum('open','closed') COLLATE utf8mb4_unicode_ci DEFAULT 'open',
  `bank_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_account` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_owner` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qr_code_media_id` int DEFAULT NULL,
  `contribution_unit_definition` enum('males_only','adults_all','per_family') COLLATE utf8mb4_unicode_ci DEFAULT 'males_only',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_campaign_clan` (`clan_id`),
  CONSTRAINT `fk_campaign_clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `account_id` int NOT NULL,
  `code_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `failed_attempts` int NOT NULL DEFAULT '0',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_password_reset_account` (`account_id`),
  CONSTRAINT `fk_password_reset_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
