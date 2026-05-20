-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Máy chủ: mysql-256249bb-quyetmarcus04-a881.i.aivencloud.com:16931
-- Thời gian đã tạo: Th4 21, 2026 lúc 05:36 PM
-- Phiên bản máy phục vụ: 8.0.45
-- Phiên bản PHP: 8.3.26

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Cơ sở dữ liệu: `defaultdb`
--

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `accounts`
--

CREATE TABLE `accounts` (
  `id` int NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `person_id` int DEFAULT NULL,
  `role_id` int DEFAULT '3',
  `status` enum('pending','active','rejected') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `accounts`
--

INSERT INTO `accounts` (`id`, `email`, `password`, `person_id`, `role_id`, `status`, `created_at`, `updated_at`) VALUES
(1, 'admin@gmail.com', '$2b$10$yb.S9/S3JnqR.f3ViIURyeWc2WZV5ybClQId.b7rGjFLsjyNxiJB6', NULL, 1, 'active', '2026-03-25 02:57:15', '2026-03-28 11:36:00'),
(2, 'manager@gmail.com', '$2b$10$yb.S9/S3JnqR.f3ViIURyeWc2WZV5ybClQId.b7rGjFLsjyNxiJB6', NULL, 2, 'active', '2026-03-25 02:57:15', '2026-03-25 02:57:15'),
(3, 'user@gmail.com', '$2b$10$yb.S9/S3JnqR.f3ViIURyeWc2WZV5ybClQId.b7rGjFLsjyNxiJB6', NULL, 2, 'active', '2026-03-25 02:57:15', '2026-03-26 09:24:04'),
(5, '1@gmail.com', '$2b$10$pzxWllT6pnuRs9/ddeHNP.PQjCMDMQyzrLzSQG60wV5mwbdptgkva', NULL, 3, 'active', '2026-03-26 14:34:57', '2026-03-26 15:35:19'),
(6, 'b@gmail.com', '$2b$10$pvrvpsjxtq8e9EglLaSf0e9kU1zCjXXUV12F.I7VsS56I.OMwhKma', NULL, 2, 'active', '2026-03-26 15:20:57', '2026-03-26 15:22:23'),
(7, 'c@gmail.com', '$2b$10$.g.tI/2b2uwmRLBD8m0Uv.F395RtJ8e12jHPQX78PQGW.N1ResKI.', NULL, 3, 'active', '2026-03-26 15:27:18', '2026-03-26 15:35:20'),
(8, 'd@gmail.com', '$2b$10$aD09dFjSR.gfw0M5WEeyLOZwJAsUJAqMzClfogAVusQk0WyGnX2SC', NULL, 3, 'active', '2026-03-26 15:30:05', '2026-03-26 15:35:21'),
(9, 'e@gmail.com', '$2b$10$FmgqCtBJCgU5015Gbr4EFuZyJHdlh2Nb8oIzQjU9IB0LG3vhRB7Ja', NULL, 3, 'active', '2026-03-26 15:34:44', '2026-03-26 15:35:22'),
(10, 'f@gmail.com', '$2b$10$oT/LV1PuwXImarf73k4Sm.xWWCjbiSGAsRVlpxsmRcGnR4fvIEMle', NULL, 2, 'active', '2026-03-26 15:40:12', '2026-03-26 15:40:51'),
(11, '16.Quangdai@gmail.com', '$2b$10$kkQ39ns/rYR.PzDUctUPfeG4paJsFFI9PXg0VRRou7MPB/vAkw6/W', NULL, 2, 'active', '2026-03-28 02:53:18', '2026-03-28 02:53:18'),
(12, 'q4@gmail.com', '$2b$10$onvmZ51M777reB95gGcPOu3cJ7u.thCJAwgRwX1Ktp/Hut97fnFGK', NULL, 2, 'active', '2026-03-28 02:54:35', '2026-03-28 02:54:35'),
(13, 'Tuanha@gmail.com', '$2b$10$/3jwwmiHTSaPfqoHkqGJxu5WFPEaAICjHeC3aCDSj1KE3qBNGskXK', 13, 2, 'active', '2026-03-28 03:02:00', '2026-04-03 14:21:43'),
(14, 'Hatam@gmail.com', '$2b$10$Ui22EPPoT4RCIGut0.otROg4xQKWLEnVp/G1DmazwmtzMCVbQoTn6', 14, 3, 'active', '2026-03-28 03:03:12', '2026-03-29 04:51:01'),
(15, 'aa@gmail.com', '$2b$10$JspfBoy6XOO4034c/S6a0umFWDMHO5oT0B2UboGLfbf8BU./OQ.V.', 15, 2, 'active', '2026-03-28 04:09:45', '2026-03-28 04:09:45'),
(18, 'mquan@gmail.com', '$2b$10$OXia.O9.m92/Z7fMQhVWOuV0AAhh5T0Z4s3gaGeBpFhnWSEIZWrLq', 16, 2, 'active', '2026-03-28 08:01:00', '2026-03-28 08:01:00'),
(19, 'Anhtuan@gmail.com', '$2b$10$tPF2wLJUWTkZPIa76YAJNe/O/BUprW/u1RFMPkP5pmGMDW3sE9ZZm', 17, 3, 'active', '2026-03-29 04:58:29', '2026-03-29 04:58:48'),
(20, 'quyet@gmail.com', '$2b$10$z6wN/jTHMlAYcW7cfZEO4uWqvL55IOFhGC5OYpuMeJwODlOoksy1m', 18, 3, 'active', '2026-03-31 07:28:42', '2026-04-07 11:04:50'),
(21, 'ly@gmail.com', '$2b$10$dNcD2rLhc/0y1dFunJ7creygs2zCf5FHSWjVBy0tahMlX2xXCEp9S', 19, 3, 'active', '2026-03-31 07:29:49', '2026-03-31 07:29:49'),
(22, 'dinhvietquyet984@gmail.com', '$2b$10$EMTjD/Ujg3qtCS1QzkBZzOaJ5mO29cBzmnNDrelO7SXJmbvfvaJaK', 20, 3, 'active', '2026-04-03 15:06:16', '2026-04-03 15:30:21'),
(23, '16.nguyenquan2004@gmail.com', '$2b$10$PeGiLI4C8KLxdnX3nZ9uvuNzjjYbuEthHeCTsPFIeMHFjRvuoM7AW', 21, 3, 'active', '2026-04-03 15:38:47', '2026-04-03 15:40:54'),
(25, 'quyen@gmail.com', '$2b$10$FcClRImCUCrFBIscKnyH2uh78TpZFNzl36ksuxuQycuFyk8sqo/Xm', 25, 3, 'active', '2026-04-07 11:43:08', '2026-04-07 11:43:08'),
(26, 'tien@gmail.com', '$2b$10$15hCP.tLKEl7bFXe4cnVV.RkIb6SRJhTd63h1grrkI1BpkAja1rte', 26, 3, 'active', '2026-04-15 14:35:13', '2026-04-15 14:35:13');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `account_clans`
--

CREATE TABLE `account_clans` (
  `id` int NOT NULL,
  `account_id` int NOT NULL,
  `clan_id` int NOT NULL,
  `person_id` int NOT NULL,
  `status` enum('pending','active','rejected') DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Đang đổ dữ liệu cho bảng `account_clans`
--

INSERT INTO `account_clans` (`id`, `account_id`, `clan_id`, `person_id`, `status`, `created_at`, `updated_at`) VALUES
(1, 20, 8, 23, 'active', '2026-04-07 11:04:16', '2026-04-07 11:05:36'),
(2, 20, 9, 24, 'active', '2026-04-07 11:04:16', '2026-04-07 11:04:50');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `archived_members`
--

CREATE TABLE `archived_members` (
  `id` int NOT NULL,
  `account_id` int DEFAULT NULL,
  `archived_by_account_id` int NOT NULL,
  `clan_id` int DEFAULT NULL,
  `archived_reason` text,
  `account_json` json NOT NULL,
  `person_json` json DEFAULT NULL,
  `archived_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `children`
--

CREATE TABLE `children` (
  `id` int NOT NULL,
  `family_id` int NOT NULL,
  `person_id` int NOT NULL,
  `sort_order` int DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `children`
--

INSERT INTO `children` (`id`, `family_id`, `person_id`, `sort_order`) VALUES
(7, 3, 18, 0),
(8, 3, 20, 0),
(11, 2, 14, 0),
(12, 3, 21, 0),
(15, 6, 26, 0);

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `clans`
--

CREATE TABLE `clans` (
  `id` int NOT NULL,
  `clan_name` varchar(200) NOT NULL,
  `history` text,
  `hall_address` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Đang đổ dữ liệu cho bảng `clans`
--

INSERT INTO `clans` (`id`, `clan_name`, `history`, `hall_address`, `created_at`) VALUES
(8, 'Hà Văn', NULL, NULL, '2026-03-28 03:02:00'),
(9, 'đinh', NULL, NULL, '2026-03-28 04:09:44'),
(10, 'Nguyễn', NULL, NULL, '2026-03-28 08:01:00');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `conversations`
--

CREATE TABLE `conversations` (
  `id` int NOT NULL,
  `account_id` int NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'Cuộc hội thoại mới',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `conversations`
--

INSERT INTO `conversations` (`id`, `account_id`, `title`, `created_at`) VALUES
(1, 9, 'Hội thoại gia phả', '2026-03-27 04:39:19'),
(2, 14, 'Hội thoại gia phả', '2026-03-28 04:07:48'),
(3, 19, 'Hội thoại gia phả', '2026-03-29 04:58:53'),
(4, 5, 'Hội thoại gia phả', '2026-03-29 05:36:56'),
(5, 20, 'Hội thoại gia phả', '2026-03-31 07:40:09'),
(6, 22, 'Hội thoại gia phả', '2026-04-03 15:08:13'),
(7, 13, 'Hội thoại gia phả', '2026-04-03 15:29:13'),
(8, 25, 'Hội thoại gia phả', '2026-04-07 11:43:19'),
(9, 21, 'Hội thoại gia phả', '2026-04-15 09:39:12'),
(10, 26, 'Hội thoại gia phả', '2026-04-15 14:35:30');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `events`
--

CREATE TABLE `events` (
  `id` int NOT NULL,
  `clan_id` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `event_date` date DEFAULT NULL,
  `description` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Đang đổ dữ liệu cho bảng `events`
--

INSERT INTO `events` (`id`, `clan_id`, `title`, `event_date`, `description`) VALUES
(1, 8, 'mua hoa thắp hương', '2026-11-11', ''),
(2, 8, 'mua hoa thắp hương', '2026-11-11', ''),
(3, 8, 'mua hoa thắp hương', '2026-11-11', '');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `event_contributions`
--

CREATE TABLE `event_contributions` (
  `id` int NOT NULL,
  `event_id` int NOT NULL,
  `person_id` int NOT NULL,
  `amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `contribution_date` date DEFAULT NULL,
  `method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Tiền mặt',
  `note` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `event_costs`
--

CREATE TABLE `event_costs` (
  `id` int NOT NULL,
  `event_id` int NOT NULL,
  `item_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `note` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `families`
--

CREATE TABLE `families` (
  `id` int NOT NULL,
  `clan_id` int NOT NULL,
  `father_id` int DEFAULT NULL,
  `mother_id` int DEFAULT NULL,
  `marriage_date` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Đang đổ dữ liệu cho bảng `families`
--

INSERT INTO `families` (`id`, `clan_id`, `father_id`, `mother_id`, `marriage_date`) VALUES
(2, 8, 13, 17, NULL),
(3, 8, 14, 19, NULL),
(4, 8, 19, NULL, NULL),
(5, 8, 23, NULL, NULL),
(6, 8, 21, NULL, NULL);

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `manager_announcements`
--

CREATE TABLE `manager_announcements` (
  `id` int NOT NULL,
  `manager_account_id` int NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `priority` enum('low','normal','high','urgent') COLLATE utf8mb4_unicode_ci DEFAULT 'normal',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `manager_tasks`
--

CREATE TABLE `manager_tasks` (
  `id` int NOT NULL,
  `manager_account_id` int NOT NULL,
  `clan_id` int DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `due_date` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Đang đổ dữ liệu cho bảng `manager_tasks`
--

INSERT INTO `manager_tasks` (`id`, `manager_account_id`, `clan_id`, `title`, `description`, `due_date`, `created_at`) VALUES
(1, 13, 8, '123', NULL, NULL, '2026-04-15 09:52:03'),
(2, 13, 8, 'MUA ĐỒ CÚNG', NULL, '2026-04-16', '2026-04-15 15:39:34');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `manager_task_assignments`
--

CREATE TABLE `manager_task_assignments` (
  `id` int NOT NULL,
  `task_id` int NOT NULL,
  `member_account_id` int NOT NULL,
  `member_person_id` int NOT NULL,
  `status` enum('assigned','in_progress','completed') DEFAULT 'assigned',
  `assigned_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Đang đổ dữ liệu cho bảng `manager_task_assignments`
--

INSERT INTO `manager_task_assignments` (`id`, `task_id`, `member_account_id`, `member_person_id`, `status`, `assigned_at`, `updated_at`, `completed_at`) VALUES
(1, 1, 20, 18, 'completed', '2026-04-15 09:52:03', '2026-04-15 09:52:52', '2026-04-15 09:52:52'),
(2, 1, 22, 20, 'assigned', '2026-04-15 09:52:04', '2026-04-15 09:52:04', NULL),
(3, 2, 22, 20, 'assigned', '2026-04-15 15:39:34', '2026-04-15 15:39:34', NULL),
(4, 2, 26, 26, 'completed', '2026-04-15 15:39:34', '2026-04-15 15:40:07', '2026-04-15 15:40:07');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `messages`
--

CREATE TABLE `messages` (
  `id` int NOT NULL,
  `conversation_id` int NOT NULL,
  `sender_type` enum('user','ai') COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `messages`
--

INSERT INTO `messages` (`id`, `conversation_id`, `sender_type`, `content`, `created_at`) VALUES
(1, 2, 'user', 'thông tin cả gia phả', '2026-03-28 05:59:19'),
(2, 2, 'ai', 'Mình đã ghi nhận. Bạn hãy mở mục Cây gia phả để xem sơ đồ trực quan các thế hệ.', '2026-03-28 05:59:20'),
(3, 2, 'user', 'hiện thị toàn bộ thành viên đời thứ 3', '2026-03-28 05:59:46'),
(4, 2, 'ai', 'Bạn có thể vào mục Khám phá di sản để lọc thành viên theo đời và quê quán.', '2026-03-28 05:59:46'),
(5, 4, 'user', 'hello', '2026-03-29 05:37:44'),
(6, 4, 'ai', 'Mình đã nhận câu hỏi. Bạn có thể hỏi theo tên thành viên, đời hoặc sự kiện gia đình.', '2026-03-29 05:37:44'),
(7, 4, 'user', 'tôi ten gi', '2026-03-29 05:37:58'),
(8, 4, 'ai', 'Mình đã nhận câu hỏi. Bạn có thể hỏi theo tên thành viên, đời hoặc sự kiện gia đình.', '2026-03-29 05:37:58'),
(9, 4, 'user', 'ong noi minh la ai', '2026-03-29 05:38:07'),
(10, 4, 'ai', 'Mình đã nhận câu hỏi. Bạn có thể hỏi theo tên thành viên, đời hoặc sự kiện gia đình.', '2026-03-29 05:38:07'),
(11, 4, 'user', 'hello', '2026-03-29 05:40:29'),
(12, 4, 'ai', 'Mình đã nhận câu hỏi. Bạn có thể hỏi theo tên thành viên, đời hoặc sự kiện gia đình.', '2026-03-29 05:40:29'),
(13, 5, 'user', 'hi', '2026-04-14 04:17:57'),
(14, 5, 'user', 'hi', '2026-04-14 04:17:59'),
(15, 5, 'user', 'hi', '2026-04-14 04:18:03'),
(16, 5, 'user', 'hi', '2026-04-14 04:18:04'),
(17, 5, 'ai', 'Chào bạn! Tôi là Trợ lý Gia phả Thông minh. Rất vui được hỗ trợ bạn.\n\nBạn có\n câu hỏi nào về các thành viên, dòng họ, sự kiện hay bài viết trong gia phả không? Hãy cho tôi biết nhé!', '2026-04-14 04:18:05'),
(18, 5, 'user', 'hi', '2026-04-14 04:18:05'),
(19, 5, 'ai', 'Chào bạn! Tôi là Trợ lý Gia phả Thông minh, rất vui được hỗ trợ bạn.\n\nBạn muốn tìm hiểu thông tin\n gì về các dòng họ trong gia phả của chúng ta? Bạn có thể hỏi về:\n*   **Thông tin thành viên:** Họ tên, đời thứ, quê quán, vai trò trong gia đình.\n*   **M\nối quan hệ:** Cha mẹ, con cái của một thành viên.\n*   **Sự kiện dòng họ:** Các sự kiện sắp tới.\n*   **Bài viết:** Các bài viết đã đăng.\n\nHãy cho tôi biết bạn muốn tìm\n gì nhé!', '2026-04-14 04:18:05'),
(20, 5, 'ai', 'Chào bạn! Mình là Trợ lý Gia phả Thông minh, rất vui được hỗ trợ bạn.\n\nBạn có thể hỏi mình về thông tin các thành viên trong dòng\n họ, các mối quan hệ gia đình, các sự kiện sắp tới, hoặc các bài viết của dòng họ.\n\nHãy cho mình biết bạn muốn tìm hiểu điều gì nhé!', '2026-04-14 04:18:07'),
(21, 5, 'ai', 'Chào bạn! Tôi là Trợ lý Gia phả Thông minh, rất vui được hỗ trợ bạn. Bạn muốn tìm hiểu thông tin gì về dòng họ của\n mình hôm nay ạ?', '2026-04-14 04:18:08'),
(22, 5, 'ai', 'Chào bạn! Tôi là Trợ lý Gia phả Thông minh, rất vui được hỗ trợ bạn\n. Bạn muốn tìm hiểu thông tin gì về dòng họ của mình hôm nay ạ? Bạn có thể hỏi về một thành viên cụ thể, các sự kiện sắp tới, hoặc thông tin về một dòng họ nào đó.', '2026-04-14 04:18:09'),
(23, 5, 'user', 'hãy cho tôi biết tôi là con của ai', '2026-04-14 04:18:26'),
(24, 5, 'user', 'hãy cho tôi biết tôi là con của ai', '2026-04-14 04:18:32'),
(25, 5, 'ai', 'Chào bạn,\n\nĐể có thể cho bạn biết bạn là con của ai, tôi cần bạn cung cấp thêm thông\n tin về danh tính của bạn trong gia phả. Bạn có thể cho tôi biết họ và tên đầy đủ của bạn không? Hoặc nếu bạn có mã thành viên, bạn có thể cung cấp để tôi tra cứu chính xác hơn.\n\nR\nất mong nhận được thông tin từ bạn để có thể hỗ trợ tốt nhất!', '2026-04-14 04:18:34'),
(26, 5, 'ai', 'Rất tiếc, tôi không thể biết bạn là ai dựa trên thông tin hiện có. Để tôi có thể giúp bạn tra cứu thông tin về mối quan hệ trong\n gia phả, bạn vui lòng cho tôi biết tên đầy đủ của bạn hoặc một thông tin nhận dạng khác có trong gia phả (ví dụ: tên của bạn là thành viên nào trong dòng họ Hà Văn, Đinh, Nguyễn...).', '2026-04-14 04:18:56'),
(27, 5, 'user', 'trong gia phả hà văn có bao nhiêu người trên 20 tuổi', '2026-04-14 04:19:21'),
(28, 5, 'user', 'trong gia phả hà văn có bao nhiêu người trên 20 tuổi', '2026-04-14 04:19:23'),
(29, 5, 'ai', 'Chào bạn,\n\nDựa trên thông tin gia phả dòng họ Hà Văn và tính đến ngày hiện\n tại (14/04/2026), có **6 thành viên** trên 20 tuổi.\n\nCác thành viên đó là:\n*   **Hà Văn Tuấn** (sinh năm 198\n8)\n*   **Hà Văn Tâm** (sinh năm 2000)\n*   **Hà Anh Tuấn** (sinh năm 2004)\n*   **Hà Văn Quyết** (\nID 18, sinh năm 2005)\n*   **Hà Văn Quyết** (ID 20, sinh năm 2004)\n*   **Hà Văn Quyết** (ID \n23, sinh năm 2005)\n\nNếu bạn muốn tìm hiểu thêm về bất kỳ thành viên nào, xin hãy cho tôi biết nhé.', '2026-04-14 04:19:31'),
(30, 5, 'ai', 'Chào bạn,\n\nĐể tra cứu thông tin này, tôi cần tính tuổi của từng thành viên trong dòng họ Hà Văn\n dựa trên ngày sinh của họ so với thời điểm hiện tại (ngày 14 tháng 4 năm 2026).\n\nDựa trên dữ liệu gia phả dòng họ Hà Văn, có các thành viên sau đây trên\n 20 tuổi:\n\n1.  **Hà Văn Tuấn** (ID 13): Sinh ngày 23/07/1988. Hiện tại 37 tuổi.\n2.  **Hà Văn\n Tâm** (ID 14): Sinh ngày 12/12/2000. Hiện tại 25 tuổi.\n3.  **Hà Anh Tuấn** (ID 17): Sinh ngày 1\n2/03/2004. Hiện tại 22 tuổi.\n4.  **Hà văn Quyết** (ID 20): Sinh ngày 01/05/2004.\n Hiện tại 21 tuổi.\n5.  **Hà văn Quyết** (ID 23): Sinh ngày 12/11/2005. Hiện tại 20 tuổi (chưa qua\n sinh nhật 21 tuổi trong năm 2026).\n\nVậy, có **4 thành viên** trong dòng họ Hà Văn hiện tại trên 20 tuổi.\n\n*Lưu ý: Thành viên Hà văn Quyết (ID\n 18) sinh ngày 12/11/2005 và Hà văn Quyết (ID 23) sinh ngày 12/11/2005 đều 20 tuổi tính đến ngày 1\n4/04/2026, nên không được tính là \"trên 20 tuổi\". Thành viên Nguyễn thị Ly (ID 19) sinh ngày 12/12/2006 hiện\n 19 tuổi. Thành viên Hà Văn Quân (ID 21) sinh ngày 09/12/2012 hiện 13 tuổi.*', '2026-04-14 04:19:33'),
(31, 5, 'user', 'ai là trưởng họ của tộc hà văn', '2026-04-14 11:40:03'),
(32, 5, 'ai', 'Rất tiếc, thông tin về trưởng họ của dòng họ Hà Văn hiện chưa được cập nhật trong gia phả của dòng họ.', '2026-04-14 11:40:08'),
(33, 5, 'user', 'nếu như trưởng họ là manager thì ai là trưởng họ của tộc hà văn', '2026-04-14 11:40:27'),
(34, 5, 'ai', 'Chào bạn,\n\nDựa trên thông tin trong gia phả, nếu trưởng họ được định nghĩa là một tài khoản quản lý (Manager) và được liên kết trực tiếp với một\n thành viên trong dòng họ, thì:\n\n**Ông Hà Văn Tuấn** là trưởng họ của dòng họ Hà Văn.\n*   **Họ tên:** Hà Văn Tuấn\n*   **Đời thứ:** 1\n*\n   **Quê quán:** Thanh Hóa\n*   **Vai trò:** Tài khoản của ông Hà Văn Tuấn (`Tuanha@gmail.com`) có vai trò Manager và được liên kết với thông tin cá nhân của ông trong gia ph\nả.', '2026-04-14 11:40:35'),
(35, 5, 'user', 'biết bố mày là ai không', '2026-04-15 04:49:27'),
(36, 5, 'ai', 'Mình đã nhận câu hỏi. Bạn có thể hỏi theo tên thành viên, đời hoặc sự kiện gia đình.', '2026-04-15 04:49:27'),
(37, 5, 'user', 'tộc hà văn có bao nhiêu người', '2026-04-15 04:50:27'),
(38, 5, 'ai', 'Mình đã nhận câu hỏi. Bạn có thể hỏi theo tên thành viên, đời hoặc sự kiện gia đình.', '2026-04-15 04:50:28'),
(39, 5, 'user', 'tộc hà văn có bao nhiêu người', '2026-04-15 04:51:48'),
(40, 5, 'ai', 'Tộc Hà Văn có 8 người.', '2026-04-15 04:51:55'),
(41, 5, 'user', 'biết bố m là ai không', '2026-04-15 04:52:06'),
(42, 5, 'ai', 'Không tìm thấy dữ liệu phù hợp. Có thể người dùng không có thông tin về bố mẹ hoặc không có dữ liệu trong cơ sở dữ liệu.', '2026-04-15 04:52:14'),
(43, 5, 'user', 'tôi là ai', '2026-04-15 08:02:36'),
(44, 5, 'ai', 'Không tìm thấy dữ liệu phù hợp. Bạn không có thông tin cá nhân nào được lưu trữ trong hệ thống.', '2026-04-15 08:02:44'),
(45, 5, 'user', 'tôi là ai', '2026-04-15 08:08:50'),
(46, 5, 'ai', 'Mình đã nhận câu hỏi. Bạn có thể hỏi theo tên thành viên, đời hoặc sự kiện gia đình.', '2026-04-15 08:08:50'),
(47, 5, 'user', 'liệt kê hết các thông tin về bản thân tôi đi', '2026-04-15 08:09:19'),
(48, 5, 'ai', 'Mình đã nhận câu hỏi. Bạn có thể hỏi theo tên thành viên, đời hoặc sự kiện gia đình.', '2026-04-15 08:09:19'),
(49, 5, 'user', 'liệt kê thông tin cả họ đinh', '2026-04-15 08:15:41'),
(50, 5, 'ai', 'Dựa trên kết quả SQL, thông tin về họ Đinh không được tìm thấy trong dữ liệu. Các thông tin về họ được liệt kê là Hà và Nguyễn, nhưng không có họ Đinh. \n\nVì vậy, kết quả trả lời là: Không tìm thấy dữ liệu phù hợp với họ Đinh.', '2026-04-15 08:15:49'),
(51, 5, 'user', 'liệt kê thông tin của họ nguyễn', '2026-04-15 08:16:07'),
(52, 5, 'ai', 'Dưới đây là thông tin của họ Nguyễn:\n\n1. Nguyễn Văn Quân:\n - Mã ID: 16\n - Tên hiển thị: Nguyễn Văn Quân\n - Giới tính: Nam\n - Thế hệ: 1\n - Ngày sinh: 12/04/2005\n - Quê quán: Thanh Hóa\n - Trạng thái: Còn sống\n\n2. Nguyễn Thị Ly:\n - Mã ID: 19\n - Tên hiển thị: Nguyễn Thị Ly\n - Giới tính: Nữ\n - Thế hệ: 2\n - Ngày sinh: 12/12/2006\n - Quê quán: Đà Nẵng\n - Trạng thái: Còn sống\n\nLưu ý: Các thông tin khác như số điện thoại, email, zalo, facebook, địa chỉ, ảnh đại diện, tiểu sử và ghi chú đều không có hoặc không được cung cấp.', '2026-04-15 08:16:14'),
(53, 5, 'user', 'liệt kê hết các thông tin về bản thân tôi đi', '2026-04-15 08:16:23'),
(54, 5, 'ai', 'Mình đã nhận câu hỏi. Bạn có thể hỏi theo tên thành viên, đời hoặc sự kiện gia đình.', '2026-04-15 08:16:29'),
(55, 5, 'user', 'Cho tôi gia phả của Hà văn', '2026-04-15 08:16:40'),
(56, 5, 'ai', 'Không tìm thấy dữ liệu phù hợp cho gia phả của Hà Văn. Kết quả SQL trả về là một mảng rỗng, nghĩa là không có bản ghi nào trong cơ sở dữ liệu đáp ứng điều kiện tìm kiếm.', '2026-04-15 08:16:47'),
(57, 5, 'user', 'Cho tôi gia phả của tộc hà', '2026-04-15 08:17:03'),
(58, 5, 'ai', 'Không tìm thấy dữ liệu phù hợp cho tộc Hà. Kết quả trả về là một mảng rỗng, nghĩa là không có thông tin về tộc Hà trong cơ sở dữ liệu.', '2026-04-15 08:17:10'),
(59, 5, 'user', 'tôi là ai', '2026-04-15 08:25:44'),
(60, 5, 'ai', 'Tôi là Hà Văn Quyết, sinh ngày 12/11/2005, hiện đang sống tại Đà Nẵng.', '2026-04-15 08:25:52'),
(61, 5, 'user', 'hãy cho tôi thông tin về các cây gia phả', '2026-04-15 08:26:08'),
(62, 5, 'ai', 'Mình đã ghi nhận. Bạn hãy mở mục Cây gia phả để xem sơ đồ trực quan các thế hệ.', '2026-04-15 08:26:16'),
(63, 5, 'user', 'tôi là đời thứ mấy', '2026-04-15 08:26:35'),
(64, 5, 'ai', 'Bạn là đời thứ 3.', '2026-04-15 08:26:44'),
(65, 5, 'user', 'hãy cho tôi biết bố , mẹ của tôi là ai', '2026-04-15 08:26:57'),
(66, 5, 'ai', 'Mình đã nhận câu hỏi. Bạn có thể hỏi theo tên thành viên, đời hoặc sự kiện gia đình.', '2026-04-15 08:27:04'),
(67, 5, 'user', 'hãy cho tôi biết bố mẹ của tôi là ai', '2026-04-15 08:27:20'),
(68, 5, 'ai', 'Mình đã nhận câu hỏi. Bạn có thể hỏi theo tên thành viên, đời hoặc sự kiện gia đình.', '2026-04-15 08:27:27'),
(69, 5, 'user', 'hãy cho tôi biết bố mẹ của tôi là ai', '2026-04-15 08:34:02'),
(70, 5, 'ai', 'Mình đã nhận câu hỏi. Bạn có thể hỏi theo tên thành viên, đời hoặc sự kiện gia đình.', '2026-04-15 08:34:11'),
(71, 5, 'user', 'tôi là ai', '2026-04-15 08:34:19'),
(72, 5, 'ai', 'Tôi là Hà Văn Quyết, sinh ngày 12/11/2005, là thế hệ thứ 3, quê quán ở Đà Nẵng.', '2026-04-15 08:34:27'),
(73, 5, 'user', 'bố tôi là ai', '2026-04-15 08:35:24'),
(74, 5, 'ai', 'Mình đã nhận câu hỏi. Bạn có thể hỏi theo tên thành viên, đời hoặc sự kiện gia đình.', '2026-04-15 08:35:32'),
(75, 5, 'user', 'hãy cho tôi biết bố mẹ của tôi là ai', '2026-04-15 08:41:23'),
(76, 5, 'ai', 'Mình đã nhận câu hỏi. Bạn có thể hỏi theo tên thành viên, đời hoặc sự kiện gia đình.', '2026-04-15 08:41:24'),
(77, 5, 'user', 'tôi là ai', '2026-04-15 08:43:27'),
(78, 5, 'ai', 'Mình đã nhận câu hỏi. Bạn có thể hỏi theo tên thành viên, đời hoặc sự kiện gia đình.', '2026-04-15 08:43:27'),
(79, 5, 'user', 'bố tôi là aoi', '2026-04-15 08:47:16'),
(80, 5, 'ai', 'Mình đã nhận câu hỏi. Bạn có thể hỏi theo tên thành viên, đời hoặc sự kiện gia đình.', '2026-04-15 08:47:32'),
(81, 5, 'user', 'bố tôi là ai', '2026-04-15 08:47:37'),
(82, 5, 'ai', 'Mình đã nhận câu hỏi. Bạn có thể hỏi theo tên thành viên, đời hoặc sự kiện gia đình.', '2026-04-15 08:47:43'),
(83, 5, 'user', 'tôi là ai', '2026-04-15 08:49:01'),
(84, 5, 'ai', 'Mình đã nhận câu hỏi. Bạn có thể hỏi theo tên thành viên, đời hoặc sự kiện gia đình.', '2026-04-15 08:49:22'),
(85, 5, 'user', 'tôi là ai', '2026-04-15 09:02:37'),
(86, 5, 'ai', 'Tôi là Hà Văn Quyết.', '2026-04-15 09:02:43'),
(87, 5, 'user', 'cho tôi biết bố tôi là ai', '2026-04-15 09:02:55'),
(88, 5, 'ai', 'Xin lỗi, nhưng tôi không thể cung cấp thông tin về bố của bạn dựa trên dữ liệu đã cho. Dữ liệu chỉ chứa một tên \"Hà Văn Tâm\" mà không có thông tin nào khác về mối quan hệ gia đình.', '2026-04-15 09:03:02'),
(89, 5, 'user', 'có bao nhiêu người trong gia phả của tôi', '2026-04-15 09:04:13'),
(90, 5, 'ai', 'Trong gia phả của bạn có 4 người.', '2026-04-15 09:04:20'),
(91, 5, 'user', 'hiện tên những người trong gia phả của tôi đi', '2026-04-15 09:04:38'),
(92, 5, 'ai', 'Tên người trong gia phả của bạn là Hà Văn Quyết.', '2026-04-15 09:04:44'),
(93, 5, 'user', 'liệt kê những thành viên trong gia phả hà văn', '2026-04-15 09:05:11'),
(94, 5, 'ai', 'Dưới đây là danh sách các thành viên trong gia phả Hà Văn:\n\n1. Hà Văn Tuấn\n2. Hà Anh Tuấn\n3. Hà Văn Tâm\n4. Hà Văn Quyết\n5. Hà Văn Quân\n\nLưu ý: Nguyễn Thị Ly không thuộc họ Hà Văn, nên không được liệt kê trong danh sách này.', '2026-04-15 09:05:17'),
(95, 5, 'user', 'tổng số thành viên của gia phả hà văn', '2026-04-15 09:06:08'),
(96, 5, 'ai', 'Tổng số thành viên của gia phả Hà Văn là 4 người.', '2026-04-15 09:06:14'),
(97, 5, 'user', 'v tại sao danh sách thành viên lại là 5 người', '2026-04-15 09:06:34'),
(98, 5, 'ai', 'Mình đã nhận câu hỏi. Bạn có thể hỏi theo tên thành viên, đời hoặc sự kiện gia đình.', '2026-04-15 09:06:41'),
(99, 5, 'user', 'mẹ của tôi là ai', '2026-04-15 09:08:51'),
(100, 5, 'ai', 'Khong tim thay du lieu phu hop trong gia pha cho cau hoi nay.', '2026-04-15 09:08:57'),
(101, 10, 'user', 'gia phả hà văn có bao nhiêu người', '2026-04-15 14:41:03'),
(102, 10, 'ai', 'Gia phả Hà Văn có 9 người.', '2026-04-15 14:41:06'),
(103, 5, 'user', 'TÔI LÀ AI', '2026-04-15 15:36:28'),
(104, 5, 'ai', 'Tôi là Hà Văn Quyết.', '2026-04-15 15:36:33');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `notifications`
--

CREATE TABLE `notifications` (
  `id` int NOT NULL,
  `receiver_person_id` int NOT NULL,
  `type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `link_url` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `notifications`
--

INSERT INTO `notifications` (`id`, `receiver_person_id`, `type`, `title`, `message`, `is_read`, `link_url`, `created_at`) VALUES
(1, 18, 'task_assigned', 'Cong viec moi: 123', 'Ban duoc giao cong viec \"123\".', 0, '/member/tasks/1', '2026-04-15 09:52:04'),
(2, 20, 'task_assigned', 'Cong viec moi: 123', 'Ban duoc giao cong viec \"123\".', 0, '/member/tasks/1', '2026-04-15 09:52:04'),
(3, 13, 'task_completed', 'Cong viec da hoan thanh: 123', 'hà văn Quyết da hoan thanh cong viec \"123\".', 0, '/manager/tasks/1', '2026-04-15 09:52:53'),
(4, 20, 'task_assigned', 'Cong viec moi: MUA ĐỒ CÚNG', 'Ban duoc giao cong viec \"MUA ĐỒ CÚNG\", han chot 2026-04-16.', 0, '/member/tasks/2', '2026-04-15 15:39:34'),
(5, 26, 'task_assigned', 'Cong viec moi: MUA ĐỒ CÚNG', 'Ban duoc giao cong viec \"MUA ĐỒ CÚNG\", han chot 2026-04-16.', 0, '/member/tasks/2', '2026-04-15 15:39:34'),
(6, 13, 'task_completed', 'Cong viec da hoan thanh: MUA ĐỒ CÚNG', 'Hà Văn Tiên da hoan thanh cong viec \"MUA ĐỒ CÚNG\".', 0, '/manager/tasks/2', '2026-04-15 15:40:08');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `people`
--

CREATE TABLE `people` (
  `id` int NOT NULL,
  `clan_id` int DEFAULT NULL,
  `display_name` varchar(255) NOT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `middle_name` varchar(100) DEFAULT NULL,
  `surname` varchar(100) DEFAULT NULL,
  `gender` tinyint DEFAULT NULL COMMENT '1: Nam, 2: Nữ',
  `generation` int NOT NULL DEFAULT '1',
  `branch` int DEFAULT NULL COMMENT 'Chi thứ mấy',
  `birth_date` date DEFAULT NULL,
  `death_date` date DEFAULT NULL,
  `is_living` tinyint(1) DEFAULT '1',
  `phone` varchar(20) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `zalo` varchar(50) DEFAULT NULL,
  `facebook` varchar(255) DEFAULT NULL,
  `address` text,
  `hometown` varchar(255) DEFAULT NULL,
  `avatar_url` text,
  `bio` text,
  `note` text,
  `tree_x` int DEFAULT '0',
  `tree_y` int DEFAULT '0',
  `display_order` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `pending_avatar_url` text,
  `pending_bio` text,
  `moderation_status` enum('none','pending','rejected') DEFAULT 'none',
  `moderation_reason` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Đang đổ dữ liệu cho bảng `people`
--

INSERT INTO `people` (`id`, `clan_id`, `display_name`, `first_name`, `middle_name`, `surname`, `gender`, `generation`, `branch`, `birth_date`, `death_date`, `is_living`, `phone`, `email`, `zalo`, `facebook`, `address`, `hometown`, `avatar_url`, `bio`, `note`, `created_at`, `pending_avatar_url`, `pending_bio`, `moderation_status`, `moderation_reason`) VALUES
(13, 8, 'Hà Văn Tuấn', 'Tuấn', 'Văn', 'Hà', 2, 1, NULL, '1988-07-23', NULL, 1, NULL, NULL, NULL, NULL, NULL, 'Thanh Hóa', NULL, 'hello', NULL, '2026-03-28 03:02:00', NULL, NULL, 'none', NULL),
(14, 8, 'Hà Văn Tâm_', 'Tâm', 'Văn ', 'Hà', 1, 2, NULL, '2000-12-12', NULL, 1, NULL, NULL, NULL, NULL, NULL, 'Thanh Hóa', NULL, NULL, NULL, '2026-03-28 03:03:12', NULL, NULL, 'none', NULL),
(15, 9, 'Đinh Viết Quyết', 'Quyết', 'Viết', 'Đinh', 1, 1, NULL, '1998-04-04', NULL, 1, NULL, NULL, NULL, NULL, NULL, 'Đà Nẵng', NULL, NULL, NULL, '2026-03-28 04:09:44', NULL, NULL, 'none', NULL),
(16, 10, 'Nguyễn Văn Quân', 'Quân', 'Văn', 'Nguyễn', 1, 1, NULL, '2005-04-12', NULL, 1, NULL, NULL, NULL, NULL, NULL, 'Thanh Hóa', NULL, NULL, NULL, '2026-03-28 08:01:00', NULL, NULL, 'none', NULL),
(17, 8, 'Hà Anh Tuấn', 'Tuấn', 'Anh', 'Hà', 1, 1, NULL, '2004-03-12', NULL, 1, NULL, NULL, NULL, NULL, NULL, 'Thanh Hóa', NULL, NULL, NULL, '2026-03-29 04:58:28', NULL, NULL, 'none', NULL),
(18, 8, 'hà văn Quyết', 'Quyết', 'văn', 'hà', 1, 3, NULL, '2005-11-12', NULL, 1, '', '', '', '', '', 'đà nẵng', '', '', '', '2026-03-31 07:28:41', NULL, NULL, 'none', NULL),
(19, 8, 'nguyễn thị Ly', 'Ly', 'thị', 'nguyễn', 2, 2, NULL, '2006-12-12', NULL, 1, NULL, NULL, NULL, NULL, NULL, 'đà nẵng', NULL, NULL, NULL, '2026-03-31 07:29:49', NULL, NULL, 'none', NULL),
(20, 8, 'Hà văn Quyết', 'Quyết', 'văn', 'Hà', 1, 3, NULL, '2004-05-01', NULL, 1, '', '', '', '', '', 'nghệ an', NULL, '', '', '2026-04-03 15:06:15', NULL, NULL, 'none', NULL),
(21, 8, 'Hà Văn Quân', 'Quân', 'Văn', 'Hà', 1, 3, NULL, '2012-12-09', NULL, 1, '', '', '', '', '', 'thanh hóa', 'https://i.pinimg.com/736x/89/28/af/8928aff26ab8cd00cda3992996104ab6.jpg', '', '', '2026-04-03 15:38:47', NULL, NULL, 'none', NULL),
(23, 8, 'hà văn Quyết', 'Quyết', 'văn', 'hà', 1, 3, NULL, '2005-11-12', NULL, 1, NULL, NULL, NULL, NULL, NULL, 'đà nẵng', NULL, NULL, NULL, '2026-04-07 11:04:16', NULL, NULL, 'none', NULL),
(24, 9, 'hà văn Quyết', 'Quyết', 'văn', 'hà', 1, 3, NULL, '2005-11-12', NULL, 1, NULL, NULL, NULL, NULL, NULL, 'đà nẵng', NULL, NULL, NULL, '2026-04-07 11:04:16', NULL, NULL, 'none', NULL),
(25, 9, 'đinh thị quyên', 'quyên', 'thị', 'đinh', 2, 2, NULL, '2005-02-20', NULL, 1, NULL, NULL, NULL, NULL, NULL, 'Nghệ An', NULL, NULL, NULL, '2026-04-07 11:43:08', NULL, NULL, 'none', NULL),
(26, 8, 'Hà Văn Tiên', 'Tiên', 'Văn', 'Hà', 1, 4, NULL, '2011-12-29', NULL, 1, '', '', '', '', '', 'vinh', NULL, '', '', '2026-04-15 14:35:12', NULL, NULL, 'none', NULL);

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `posts`
--

CREATE TABLE `posts` (
  `id` int NOT NULL,
  `clan_id` int NOT NULL,
  `author_id` int NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `content` text NOT NULL,
  `image_url` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `rejection_reason` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Đang đổ dữ liệu cho bảng `posts`
--

INSERT INTO `posts` (`id`, `clan_id`, `author_id`, `content`, `image_url`, `created_at`, `status`, `rejection_reason`) VALUES
(1, 8, 3, 'Hình ảnh thư viện đa phương tiện', 'http://localhost:5000/uploads/media-1774762161950-146398739.jpg', '2026-03-29 05:29:22', 'approved', NULL),
(2, 8, 3, 'Hình ảnh thư viện đa phương tiện', 'http://localhost:5000/uploads/media-1775033893989-776107283.jpg', '2026-04-01 08:58:15', 'approved', NULL),
(3, 8, 3, 'Hình ảnh thư viện đa phương tiện', 'http://localhost:5000/uploads/media-1775033989641-119395696.jpg', '2026-04-01 08:59:50', 'approved', NULL),
(4, 8, 20, 'hello', '', '2026-04-04 09:06:46', 'approved', NULL),
(5, 8, 13, 'hello', '', '2026-04-04 09:12:40', 'approved', NULL),
(6, 8, 13, 'hello', 'https://www.thefirsttimes.jp/admin/wp-content/uploads/5000/03/20220314-tr-09100042.jpg', '2026-04-04 09:24:17', 'approved', NULL),
(7, 8, 13, 'hello', 'https://uploaded.celebconfirmed.com/ZEROBASEONE_2023_FAN_CON_18_5d59683a4f.jpeg', '2026-04-04 09:26:40', 'approved', NULL),
(8, 8, 13, 'hello1', '', '2026-04-04 09:28:09', 'approved', NULL),
(9, 8, 13, 'hưello', NULL, '2026-04-04 09:37:38', 'approved', NULL),
(10, 8, 13, 'hello12', 'https://i.pinimg.com/736x/89/28/af/8928aff26ab8cd00cda3992996104ab6.jpg', '2026-04-04 09:38:29', 'approved', NULL),
(11, 8, 26, 'tien', 'https://www.google.com.vn/imgres?q=%E1%BA%A3nh&imgurl=https%3A%2F%2Fmedia-cdn-v2.laodong.vn%2Fstorage%2Fnewsportal%2F2023%2F8%2F26%2F1233821%2FGiai-Nhi-1--Nang-Tre.jpg%3Fw%3D800%26crop%3Dauto%26scale%3Dboth&imgrefurl=https%3A%2F%2Flaodong.vn%2Fdu-lich%2Fphoto%2Float-anh-xuat-sac-khac-hoa-viet-nam-dep-toa-sang-1233821.html&docid=pXYv2bxMwnv1mM&tbnid=81YvuU9k-E5qxM&vet=12ahUKEwjx1M3wi_CTAxUzLtAFHR9MIbMQnPAOegQIJxAB..i&w=800&h=508&hcb=2&ved=2ahUKEwjx1M3wi_CTAxUzLtAFHR9MIbMQnPAOegQIJxAB', '2026-04-15 14:44:02', 'approved', NULL),
(12, 8, 26, 'quyết', NULL, '2026-04-15 14:45:23', 'approved', NULL),
(13, 8, 13, '321', NULL, '2026-04-15 14:47:20', 'approved', NULL);

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `post_comments`
--

CREATE TABLE `post_comments` (
  `id` int NOT NULL,
  `post_id` int NOT NULL,
  `person_id` int NOT NULL,
  `parent_id` int DEFAULT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `post_likes`
--

CREATE TABLE `post_likes` (
  `id` int NOT NULL,
  `post_id` int NOT NULL,
  `person_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `roles`
--

CREATE TABLE `roles` (
  `id` int NOT NULL,
  `role_name` varchar(50) NOT NULL,
  `description` varchar(500) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Đang đổ dữ liệu cho bảng `roles`
--

INSERT INTO `roles` (`id`, `role_name`, `description`) VALUES
(1, 'Admin', 'Toàn quyền hệ thống'),
(2, 'Manager', 'Quản lý dòng họ'),
(3, 'User', 'Thành viên dòng họ');

--
-- Chỉ mục cho các bảng đã đổ
--

--
-- Chỉ mục cho bảng `accounts`
--
ALTER TABLE `accounts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD UNIQUE KEY `person_id` (`person_id`),
  ADD KEY `FK_Account_Role` (`role_id`);

--
-- Chỉ mục cho bảng `account_clans`
--
ALTER TABLE `account_clans`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_account_clan` (`account_id`,`clan_id`),
  ADD UNIQUE KEY `uk_person_once` (`person_id`),
  ADD KEY `fk_ac_clan` (`clan_id`);

--
-- Chỉ mục cho bảng `archived_members`
--
ALTER TABLE `archived_members`
  ADD PRIMARY KEY (`id`);

--
-- Chỉ mục cho bảng `children`
--
ALTER TABLE `children`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `UK_family_person` (`family_id`,`person_id`),
  ADD KEY `FK_Child_Person` (`person_id`);

--
-- Chỉ mục cho bảng `clans`
--
ALTER TABLE `clans`
  ADD PRIMARY KEY (`id`);

--
-- Chỉ mục cho bảng `conversations`
--
ALTER TABLE `conversations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_Chat_Account` (`account_id`);

--
-- Chỉ mục cho bảng `events`
--
ALTER TABLE `events`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_Event_Clan` (`clan_id`);

--
-- Chỉ mục cho bảng `event_contributions`
--
ALTER TABLE `event_contributions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_Contrib_Event` (`event_id`),
  ADD KEY `FK_Contrib_Person` (`person_id`);

--
-- Chỉ mục cho bảng `event_costs`
--
ALTER TABLE `event_costs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_Costs_Event` (`event_id`);

--
-- Chỉ mục cho bảng `families`
--
ALTER TABLE `families`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_Fam_Clan` (`clan_id`);

--
-- Chỉ mục cho bảng `manager_announcements`
--
ALTER TABLE `manager_announcements`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_Manager_Announce` (`manager_account_id`);

--
-- Chỉ mục cho bảng `manager_tasks`
--
ALTER TABLE `manager_tasks`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_manager_tasks_manager` (`manager_account_id`),
  ADD KEY `idx_manager_tasks_clan` (`clan_id`);

--
-- Chỉ mục cho bảng `manager_task_assignments`
--
ALTER TABLE `manager_task_assignments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_task_member` (`task_id`,`member_account_id`),
  ADD KEY `idx_task_assignments_member` (`member_account_id`),
  ADD KEY `idx_task_assignments_person` (`member_person_id`);

--
-- Chỉ mục cho bảng `messages`
--
ALTER TABLE `messages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_Message_Chat` (`conversation_id`);

--
-- Chỉ mục cho bảng `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_notify_unread` (`receiver_person_id`,`is_read`);

--
-- Chỉ mục cho bảng `people`
--
ALTER TABLE `people`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_People_Clan` (`clan_id`),
  ADD KEY `idx_people_phone` (`phone`),
  ADD KEY `idx_people_email` (`email`),
  ADD KEY `idx_display_name` (`display_name`);

--
-- Chỉ mục cho bảng `posts`
--
ALTER TABLE `posts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_Post_Clan` (`clan_id`);

--
-- Chỉ mục cho bảng `post_comments`
--
ALTER TABLE `post_comments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_comment_post` (`post_id`),
  ADD KEY `FK_Comments_Person` (`person_id`),
  ADD KEY `FK_Comments_Parent` (`parent_id`);

--
-- Chỉ mục cho bảng `post_likes`
--
ALTER TABLE `post_likes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `UK_post_person` (`post_id`,`person_id`),
  ADD KEY `FK_PostLikes_Person` (`person_id`);

--
-- Chỉ mục cho bảng `roles`
--
ALTER TABLE `roles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `role_name` (`role_name`);

--
-- AUTO_INCREMENT cho các bảng đã đổ
--

--
-- AUTO_INCREMENT cho bảng `accounts`
--
ALTER TABLE `accounts`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=27;

--
-- AUTO_INCREMENT cho bảng `account_clans`
--
ALTER TABLE `account_clans`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT cho bảng `archived_members`
--
ALTER TABLE `archived_members`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT cho bảng `children`
--
ALTER TABLE `children`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT cho bảng `clans`
--
ALTER TABLE `clans`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT cho bảng `conversations`
--
ALTER TABLE `conversations`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT cho bảng `events`
--
ALTER TABLE `events`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT cho bảng `event_contributions`
--
ALTER TABLE `event_contributions`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT cho bảng `event_costs`
--
ALTER TABLE `event_costs`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT cho bảng `families`
--
ALTER TABLE `families`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT cho bảng `manager_announcements`
--
ALTER TABLE `manager_announcements`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT cho bảng `manager_tasks`
--
ALTER TABLE `manager_tasks`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT cho bảng `manager_task_assignments`
--
ALTER TABLE `manager_task_assignments`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT cho bảng `messages`
--
ALTER TABLE `messages`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=105;

--
-- AUTO_INCREMENT cho bảng `notifications`
--
ALTER TABLE `notifications`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT cho bảng `people`
--
ALTER TABLE `people`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=27;

--
-- AUTO_INCREMENT cho bảng `posts`
--
ALTER TABLE `posts`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT cho bảng `post_comments`
--
ALTER TABLE `post_comments`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT cho bảng `post_likes`
--
ALTER TABLE `post_likes`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- Ràng buộc đối với các bảng kết xuất
--

--
-- Ràng buộc cho bảng `accounts`
--
ALTER TABLE `accounts`
  ADD CONSTRAINT `FK_Account_Person` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `FK_Account_Role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`);

--
-- Ràng buộc cho bảng `account_clans`
--
ALTER TABLE `account_clans`
  ADD CONSTRAINT `fk_ac_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_ac_clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_ac_person` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE CASCADE;

--
-- Ràng buộc cho bảng `children`
--
ALTER TABLE `children`
  ADD CONSTRAINT `FK_Child_Family` FOREIGN KEY (`family_id`) REFERENCES `families` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `FK_Child_Person` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE CASCADE;

--
-- Ràng buộc cho bảng `conversations`
--
ALTER TABLE `conversations`
  ADD CONSTRAINT `FK_Chat_Account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE;

--
-- Ràng buộc cho bảng `events`
--
ALTER TABLE `events`
  ADD CONSTRAINT `FK_Event_Clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE CASCADE;

--
-- Ràng buộc cho bảng `event_contributions`
--
ALTER TABLE `event_contributions`
  ADD CONSTRAINT `FK_Contrib_Event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `FK_Contrib_Person` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE CASCADE;

--
-- Ràng buộc cho bảng `event_costs`
--
ALTER TABLE `event_costs`
  ADD CONSTRAINT `FK_Costs_Event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE;

--
-- Ràng buộc cho bảng `families`
--
ALTER TABLE `families`
  ADD CONSTRAINT `FK_Fam_Clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE CASCADE;

--
-- Ràng buộc cho bảng `manager_announcements`
--
ALTER TABLE `manager_announcements`
  ADD CONSTRAINT `FK_Manager_Announce` FOREIGN KEY (`manager_account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE;

--
-- Ràng buộc cho bảng `manager_tasks`
--
ALTER TABLE `manager_tasks`
  ADD CONSTRAINT `fk_manager_tasks_account` FOREIGN KEY (`manager_account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE;

--
-- Ràng buộc cho bảng `manager_task_assignments`
--
ALTER TABLE `manager_task_assignments`
  ADD CONSTRAINT `fk_task_assignments_account` FOREIGN KEY (`member_account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_task_assignments_person` FOREIGN KEY (`member_person_id`) REFERENCES `people` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_task_assignments_task` FOREIGN KEY (`task_id`) REFERENCES `manager_tasks` (`id`) ON DELETE CASCADE;

--
-- Ràng buộc cho bảng `messages`
--
ALTER TABLE `messages`
  ADD CONSTRAINT `FK_Message_Chat` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE;

--
-- Ràng buộc cho bảng `notifications`
--
ALTER TABLE `notifications`
  ADD CONSTRAINT `FK_Notify_Receiver` FOREIGN KEY (`receiver_person_id`) REFERENCES `people` (`id`) ON DELETE CASCADE;

--
-- Ràng buộc cho bảng `people`
--
ALTER TABLE `people`
  ADD CONSTRAINT `FK_People_Clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE CASCADE;

--
-- Ràng buộc cho bảng `posts`
--
ALTER TABLE `posts`
  ADD CONSTRAINT `FK_Post_Clan` FOREIGN KEY (`clan_id`) REFERENCES `clans` (`id`) ON DELETE CASCADE;

--
-- Ràng buộc cho bảng `post_comments`
--
ALTER TABLE `post_comments`
  ADD CONSTRAINT `FK_Comments_Parent` FOREIGN KEY (`parent_id`) REFERENCES `post_comments` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `FK_Comments_Person` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `FK_Comments_Post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE;

--
-- Ràng buộc cho bảng `post_likes`
--
ALTER TABLE `post_likes`
  ADD CONSTRAINT `FK_PostLikes_Person` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `FK_PostLikes_Post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
