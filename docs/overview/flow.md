# Báo cáo phân tích kỹ thuật dự án Gia Phả Việt

Ngày rà soát: 2026-05-06  
Nguồn đối chiếu: source code trong `Frontend/`, `Backend/`, `AI-server/`, `voice/`, `docker/init.sql`, `defaultdb.sql`, `dump-defaultdb-202605022138.sql`, `migrations/`, `voice/schema.sql`, README và các file `.env.example`.

## 1. Tổng Quan Dự Án

Gia Phả Việt là hệ thống web quản lý dòng họ/gia phả. Mục tiêu chính là số hóa dữ liệu thành viên, quan hệ cha mẹ con, cây phả hệ, bài viết cộng đồng, sự kiện, phân công công việc, thông báo, quỹ dòng họ, billing/thanh toán, AI hỏi đáp dữ liệu gia phả và voice/time capsule.

Vai trò người dùng chính:

| Vai trò | Mục đích trong hệ thống | Bằng chứng source |
|---|---|---|
| Admin | Quản trị toàn hệ thống: dòng họ, tài khoản, thành viên, cây gia phả, sự kiện, gallery, settings, thống kê, task theo clan | `Backend/src/routes/adminRoutes.js`, `Frontend/src/pages/admin/*` |
| Manager | Quản lý một dòng họ: duyệt member, duyệt post/profile, quản lý thành viên/cây, task/event, quỹ dòng họ | `Backend/src/routes/managerRoutes.js`, `Frontend/src/pages/Manager/*`, `Frontend/src/pages/Tasks/TaskManagementPage.jsx` |
| Member | Xem dashboard/cây, cập nhật hồ sơ, tạo bài viết, comment/like, nhận task/notification, chat AI, reminder, quỹ, voice | `Backend/src/routes/memberRoutes.js`, `Frontend/src/pages/Member/*`, `Frontend/src/pages/TimeCapsule/*` |

Module lớn trong source:

| Module | File/thư mục chính | Ghi chú |
|---|---|---|
| Frontend SPA | `Frontend/src`, `Frontend/vite.config.js` | React 18 + Vite, route theo role |
| Backend API | `Backend/server.js`, `Backend/src/routes/*`, `Backend/src/controllers/*` | Express 5, REST API, Socket.IO |
| Database | `docker/init.sql`, `defaultdb.sql`, `dump-defaultdb-202605022138.sql`, `migrations/*`, `voice/schema.sql` | MySQL/Aiven; schema hiện bị phân mảnh |
| AI-server | `AI-server/app.py` | Flask + Groq, hiện chỉ expose `/health` và `/event-form/generate` |
| Voice/time capsule | `voice/backendRoutes.js`, `voice/worker.py`, `Frontend/src/voice/*` | Upload audio, local faster-whisper worker, schedule gửi voice |
| Upload/media | `Backend/server.js`, `Backend/src/utils/media.js`, `Backend/src/routes/mediaRoutes.js` | Ảnh mới lưu MySQL `media_files` qua LONGBLOB |
| Billing/payment/quỹ | `billingController.js`, `paymentController.js`, `fundController.js` | Có code nhưng đang tồn tại 2 hướng schema/cách lưu khác nhau, cần thống nhất trước khi vận hành ổn định |

## 2. Công Nghệ Sử Dụng

| Nhóm | Công nghệ thực tế | Bằng chứng | Nhận xét production |
|---|---|---|---|
| Frontend | React 18, Vite 7, React Router, Recharts, html-to-image, react-zoom-pan-pinch | `Frontend/package.json` | `npm run build` chạy thành công; bundle JS ~965 kB, có cảnh báo chunk lớn |
| Backend | Node.js, Express 5, mysql2 promise pool, Socket.IO, Multer, bcryptjs, jsonwebtoken, nodemailer, xlsx | `Backend/package.json`, `Backend/server.js` | Thiếu helmet, rate limit, centralized error handler, migration runner |
| Database | MySQL | `Backend/src/config/db.js`, SQL dumps | Hỗ trợ SSL/public DNS cho cloud DB; schema chưa đồng bộ |
| AI | Flask, Groq SDK | `AI-server/requirements.txt`, `AI-server/app.py` | Luồng AI đang dùng thực tế là `/event-form/generate`; luồng AI hỏi DB cũ là luồng cũ đã loại bỏ/không sử dụng theo xác nhận dự án |
| Voice/STT | Python, faster-whisper, ffmpeg, mysql-connector-python | `voice/worker.py`, `voice/requirements.txt` | Cần worker riêng ngoài backend; cần ffmpeg và venv riêng |
| Realtime | Socket.IO | `Backend/server.js`, `NotificationBell.jsx` | Lưu online user theo in-memory map, không scale đa instance |
| Upload | Multer memory storage cho ảnh; disk storage cho audio | `Backend/server.js`, `voice/backendRoutes.js` | Ảnh có auth/MIME/size; audio có auth/MIME/size nhưng MIME filter còn rộng với `audio/*` |
| Email | Nodemailer SMTP | `authController.js`, `utils/email.js` | Dùng cho reset password và task assignment; không có queue/retry |
| Docker | docker compose | `docker/docker-compose.yml` | Compose hiện chỉ phục vụ local/phpMyAdmin; production triển khai qua cloud nên không xem đây là blocker |

Công nghệ/khai báo lệch:

| Vấn đề | Chi tiết |
|---|---|
| Docker local | `docker/docker-compose.yml` chỉ chạy `phpmyadmin`; phù hợp nếu DB/cloud được cấu hình ngoài, nhưng README/onboarding cần nói rõ Docker không phải bộ production stack |
| AI hỏi DB legacy | Backend/README còn dấu vết luồng AI hỏi DB cũ; theo xác nhận dự án luồng này đã loại bỏ/không sử dụng, nên cần dọn tài liệu/code cũ để tránh hiểu nhầm |
| Billing/quỹ/payment có 2 hướng schema/cách lưu | Code dùng `plans`, `subscriptions`, `payments`, `fund_campaigns` và các cột quỹ mở rộng, trong khi dump/schema chính còn theo cấu trúc cũ; cần chọn một schema chuẩn |
| Upload DB dùng `media_files` | Có migration tạo `media_files`, nhưng `docker/init.sql`, `defaultdb.sql`, `dump-defaultdb-202605022138.sql` chưa có bảng này |

## 3. Danh Sách Chức Năng Theo Nhóm

### 3.1 Auth / Đăng Ký / Đăng Nhập

| Mục | Chi tiết |
|---|---|
| API | `POST /api/auth/register`, `/login`, `/forgot-password`, `/reset-password`, `/register-clan`, `/register-clan-manager` |
| Source chính | `authRoutes.js`, `authController.js`, `clanController.js`, `authService.js`, `Login.jsx`, `Register.jsx`, `ClanRegister.jsx` |
| Bảng DB | `accounts`, `people`, `roles`, `clans`, `account_clans`, `archived_members`, `password_reset_tokens` |
| Flow chính | Register kiểm tra `clan_id`, transaction insert `people` rồi `accounts(role_id=3,status=pending)`. Login query account/person, kiểm tra archive/status, bcrypt compare, sign JWT 24h. Reset password tạo OTP 6 số, hash bằng bcrypt, gửi email SMTP, lưu memory và cố lưu DB token nếu bảng tồn tại. |
| Rủi ro | JWT secret có fallback hardcode; token lưu `localStorage`; reset token table chưa thấy trong schema; login không reload role/status từ DB sau khi token đã phát hành; reset password không rate limit. |

### 3.2 Admin

| Mục | Chi tiết |
|---|---|
| API | `/api/admin/clans`, `/clans/:id/tree`, `/clans/:id/tasks`, `/accounts`, `/managers`, `/members`, `/settings`, `/events`, `/gallery`, `/dashboard-stats`, `/posts/clan/:clanId` |
| Source chính | `adminRoutes.js`, `adminController.js`, `Frontend/src/pages/admin/*`, `adminService.js` |
| Bảng DB | `clans`, `accounts`, `people`, `account_clans`, `events`, `posts`, `system_settings`, `manager_tasks`, `manager_task_assignments` |
| Flow chính | Admin CRUD clan/account/member/event/settings, xem cây từng clan, xem task theo clan, dashboard stats. |
| Rủi ro | Xóa clan tự xóa `manager_tasks` rồi xóa clan, các bảng có cascade sẽ xóa dữ liệu lớn; `system_settings` có trong dump mới nhưng không có trong `docker/init.sql/defaultdb.sql`; admin tạo account/manager có transaction nhưng billing limit chưa được kiểm tra ở toàn bộ đường tạo. |

### 3.3 Manager

| Mục | Chi tiết |
|---|---|
| API | `/api/manager/stats`, `/tree`, `/clan-info`, `/members`, `/pending`, `/approve/:id`, `/reject/:id`, `/pending-posts`, `/approve-post/:id`, `/reject-post/:id`, `/pending-profiles`, `/media`, `/events`, `/assign-task`, `/tasks/bulk-assign`, `/fund/*`, `/tree-edit-keys` |
| Source chính | `managerRoutes.js`, `managerController.js`, `fundController.js`, `ManagerDashboard.jsx`, `PendingApprovals.jsx`, `ClanFundPage.jsx`, `TaskManagementPage.jsx` |
| Bảng DB | `accounts`, `people`, `clans`, `families`, `children`, `posts`, `events`, `manager_tasks`, `manager_task_assignments`, `notifications`, `archived_members`, `member_tree_edit_keys`, `fund_campaigns`, `event_contributions`, `event_costs` |
| Flow chính | Manager lấy clan của mình qua account/person, chỉ thao tác trong clan đó, duyệt member/post/profile, tạo member, archive/restore, tạo event/task, gửi notification/email, tạo temporary tree edit key cho member. |
| Rủi ro | Một số hàm task gọi `createNotification({ accountId: ... })` sai tên tham số so với util `createNotification({ receiverAccountId })`, có khả năng không ghi notification cho task assign; module quỹ/billing/payment đang có 2 hướng schema/cách lưu nên dễ lỗi runtime nếu deploy sai schema; một số bảng được auto-create/alter khi request chạy, không phù hợp production migration. |

### 3.4 Member

| Mục | Chi tiết |
|---|---|
| API | `/api/member/dashboard`, `/notifications`, `/profile`, `/password`, `/tree-edit-session`, `/chat`, `/reminders`, `/tasks`, `/content/profile`, `/content/post`, `/posts/general`, `/posts/:id/comments`, `/posts/:id/like`, `/submissions`, `/fund/*` |
| Source chính | `memberRoutes.js`, `memberController.js`, `MemberDashboard.jsx`, `MemberProfile.jsx`, `GeneralPosts.jsx`, `MemberFundPage.jsx`, `NotificationBell.jsx` |
| Bảng DB | `people`, `accounts`, `clans`, `families`, `children`, `events`, `posts`, `post_comments`, `post_likes`, `conversations`, `messages`, `notifications`, `manager_task_assignments` |
| Flow chính | Member xem dashboard/cây, cập nhật thông tin cơ bản, đổi mật khẩu, gửi profile/post pending, xem post approved, comment/like, nhận task và cập nhật trạng thái, tạo reminder, chat AI. |
| Rủi ro | Member route `/fund/income` và `/fund/expense` cho phép member gọi `addIncome/addExpense`, đây là quyền nguy hiểm nếu không chủ đích; cần xác nhận lại quyền ghi dữ liệu quỹ của Member; localStorage token dễ bị XSS lấy. |

### 3.5 Gia Phả / Cây Phả Hệ

| Mục | Chi tiết |
|---|---|
| API | `/api/manager/tree`, `/api/clans/:clanId/family-tree`, `/api/people`, `/api/people/:id`, `/api/people/:id/position`, `/api/people/layout`, `/api/people/link`, `/api/families`, `/api/families/:familyId/children` |
| Source chính | `managerController.js`, `treeEditPermissions.js`, `treeLayoutSettings.js`, `FamilyTreeEditor.jsx`, `FamilyTreePage.jsx` |
| Bảng DB | `people`, `families`, `children`, `tree_layout_settings`, `member_tree_edit_keys` |
| Flow chính | Backend query people/families/children theo clan, build tree roots, frontend render node/line. Manager/admin chỉnh toàn bộ. Member chỉ được chỉnh thông tin/vị trí một số node nếu có temporary edit key. Layout node lưu ở `people.tree_x/tree_y/display_order`, route/card size lưu JSON ở `tree_layout_settings`. |
| Rủi ro | Chưa thấy kiểm tra cycle gia phả tổng quát; `families.father_id/mother_id` không có FK tới `people`; update quan hệ có đoạn xóa children cũ rồi insert mới, nếu request lỗi giữa chừng không phải lúc nào cũng transaction; nhiều cột/bảng tree layout được tạo runtime. |

### 3.6 Bài Viết Cộng Đồng

| Mục | Chi tiết |
|---|---|
| API | Member: `/api/member/content/post`, `/posts/general`, `/posts/:id/comments`, `/posts/:id/like`; Manager: `/api/manager/pending-posts`, `/approve-post/:id`, `/reject-post/:id`; Admin: `/api/admin/posts/clan/:clanId` |
| Source chính | `memberController.js`, `managerController.js`, `GeneralPosts.jsx`, `PostsPage.jsx` |
| Bảng DB | `posts`, `post_comments`, `post_likes`, `media_files` nếu dùng ảnh mới |
| Flow chính | Member tạo post `pending`; admin/manager tạo post được `approved`; manager duyệt/từ chối; post approved mới hiện ở feed; comment/like giới hạn trong cùng clan. |
| Rủi ro | `posts.author_id` chưa có FK tới `accounts` trong schema; `image_media_id` chỉ có migration, chưa có trong dump chính; không thấy sanitize HTML nếu frontend render content dạng HTML về sau. |

### 3.7 Task / Notification

| Mục | Chi tiết |
|---|---|
| API | Manager: `/events`, `/events/:eventId/tasks`, `/assign-task`, `/tasks/bulk-assign`, `/tasks`, `/tasks/:id/complete`; Member: `/tasks`, `/tasks/:id/status`, `/notifications`, `/notifications/:id/read`, `/notifications/read-all` |
| Source chính | `managerController.js`, `memberController.js`, `utils/notifications.js`, `NotificationBell.jsx`, `TaskManagementPage.jsx` |
| Bảng DB | `manager_tasks`, `manager_task_assignments`, `events`, `notifications` |
| Flow chính | Manager tạo event/task, insert assignments, gửi notification realtime qua Socket.IO và email nếu SMTP có cấu hình. Member cập nhật `in_progress/completed`; khi completed, backend tạo notification cho manager. |
| Rủi ro | Socket.IO lưu online users trong memory, không dùng Redis adapter; code có 2 kiểu emit khác nhau (`new_notification`, `notification`) và room `account_x` không thấy join; `createNotification` bị gọi sai tham số ở một số flow task. |

### 3.8 AI / Chat / Event Form

| Mục | Chi tiết |
|---|---|
| API Backend | `/api/member/chat`, `/api/ai/event-form/generate` |
| API AI-server | Thực tế source hiện có `/health`, `/event-form/generate`; luồng AI hỏi DB cũ là luồng cũ đã loại bỏ/không sử dụng theo xác nhận dự án |
| Source chính | `memberController.js`, `aiController.js`, `AI-server/app.py`, `AIChatGateway.jsx`, `TaskManagementPage.jsx` |
| Bảng DB | `conversations`, `messages` |
| Flow chính | Event AI -> Backend `/api/ai/event-form/generate` -> AI-server `/event-form/generate` -> trả JSON event/task. Nếu UI chat còn được bật, backend lưu hội thoại vào `conversations/messages` và cần xác định rõ nguồn trả lời hiện hành. |
| Rủi ro | Không xem luồng AI hỏi DB cũ là blocker vì dự án đã loại bỏ/không sử dụng; rủi ro còn lại là dấu vết code/tài liệu legacy có thể gây hiểu nhầm khi maintain hoặc review bảo mật. |

### 3.9 Upload File / Hình Ảnh

| Mục | Chi tiết |
|---|---|
| API | `/api/upload`, `/api/media/:id`, `/api/voice/recordings`, `/api/voice/recordings/:id/audio` |
| Source chính | `Backend/server.js`, `utils/media.js`, `mediaRoutes.js`, `voice/backendRoutes.js`, `ImageUpload.jsx`, `VoiceRecorder.jsx` |
| Bảng DB | `media_files`, `people.avatar_media_id`, `posts.image_media_id`, `recordings` |
| Flow chính | Ảnh: JWT bắt buộc, Multer memory, limit `MAX_IMAGE_UPLOAD_BYTES` mặc định 5MB, MIME JPG/PNG/WEBP/GIF, lưu LONGBLOB. Audio: JWT bắt buộc, disk `Backend/storage/recordings`, limit mặc định 25MB/180s, worker chuyển wav bằng ffmpeg rồi transcribe. |
| Rủi ro | `media_files` chưa có trong dump chính; lưu ảnh LONGBLOB tăng tải MySQL/backup; `/api/media/:id` public không kiểm tra auth/clan; audio cho phép token trên query string để stream, dễ lộ trong log/browser history. |

### 3.10 Sự Kiện / Reminder

| Mục | Chi tiết |
|---|---|
| API | Admin `/api/admin/events`; Manager `/api/manager/events`; Member `/api/member/reminders`; AI `/api/ai/event-form/generate` |
| Source chính | `adminController.js`, `managerController.js`, `memberController.js`, `aiController.js`, `AI-server/app.py`, `TaskManagementPage.jsx` |
| Bảng DB | `events`, `manager_tasks`, `manager_task_assignments`, `event_contributions`, `event_costs` |
| Flow chính | Admin/manager tạo event theo clan. Member reminder cũng insert vào `events` của clan. Manager có thể tạo task gắn `event_id`. AI event form sinh JSON event/task để frontend điền form. |
| Rủi ro | Không có reminder scheduler riêng; event/member reminder chỉ là record trong DB. Delete event set `manager_tasks.event_id=NULL` rồi xóa event, giữ task mồ côi với event. |

### 3.11 Quỹ Dòng Họ / Billing / Payment / Voice

| Nhóm | API | Source | Bảng/cột cần có | Rủi ro |
|---|---|---|---|---|
| Quỹ dòng họ | `/api/manager/fund/*`, `/api/member/fund/*` | `fundController.js`, `ClanFundPage.jsx`, `MemberFundPage.jsx` | `fund_campaigns`, `event_contributions.campaign_id/status/clan_id/evidence_media_id/manager_note`, `event_costs.clan_id/campaign_id/category` | Đang có 2 hướng schema/cách lưu với cấu trúc sự kiện-thu/chi cũ; cần thống nhất schema chuẩn trước deploy |
| Billing | `/api/billing/plans`, `/api/billing/clans/:id`, `/api/billing/admin/clans/:id/manual-upgrade` | `billingController.js`, `billingService.js`, `BillingPage.jsx` | `plans`, `subscriptions`, `payments` | Cần đối chiếu và thống nhất với schema cloud đang dùng, tránh chạy lệch giữa dump local và DB production |
| Payment | `/api/payments/sepay/create`, `/api/payments/sepay/webhook`, `/api/payments/status/:orderCode` | `paymentController.js`, `paymentService.js` | `plans`, `subscriptions`, `payments` | Webhook cho phép bỏ qua secret nếu `SEPAY_WEBHOOK_SECRET` không cấu hình |
| Voice/time capsule | `/api/voice/recordings*` | `voice/backendRoutes.js`, `voice/worker.py`, `TimeCapsulePage.jsx` | `recordings`, `voice_recording_recipients`, `notifications` | `voice_recording_recipients` chỉ có migration/voice schema, chưa có trong dump chính |

## 4. Database Design

### 4.1 Bảng Chính Và Mục Đích

| Bảng | Mục đích | Tình trạng schema |
|---|---|---|
| `roles` | Danh mục role | Có trong SQL chính |
| `accounts` | Tài khoản, password hash, role, status | Có trong SQL chính |
| `people` | Hồ sơ thành viên, tọa độ cây, moderation profile | Có trong SQL chính; thiếu cột media mới trong dump |
| `clans` | Dòng họ | Có |
| `account_clans` | Liên kết account với clan/person | Có |
| `families` | Cặp cha/mẹ trong clan | Có, nhưng father/mother không có FK |
| `children` | Con thuộc một family | Có |
| `posts`, `post_comments`, `post_likes` | Cộng đồng, comment, like | Có |
| `events`, `event_contributions`, `event_costs` | Sự kiện, thu/chi | Có bản cũ; thiếu cột cho quỹ mới |
| `conversations`, `messages` | Lịch sử chat AI | Có |
| `notifications` | Thông báo | Có; code runtime thêm `receiver_account_id` |
| `manager_tasks`, `manager_task_assignments` | Task manager giao member | Có trong `defaultdb.sql/dump`, không có trong `docker/init.sql` |
| `archived_members` | Archive member | Có, cũng được auto-create |
| `system_settings` | Admin settings | Có trong dump 20260502, không có trong `docker/init.sql/defaultdb.sql` |
| `member_tree_edit_keys` | Temporary key cho member chỉnh cây | Có trong dump 20260502 và auto-create |
| `tree_layout_settings` | JSON line routes/card sizes của cây | Có trong dump 20260502 và auto-create |
| `recordings` | Voice recording/transcript | Có trong dump 20260502 và `voice/schema.sql` |
| `voice_recording_recipients` | Lịch gửi voice cho người nhận | Có trong `voice/schema.sql` và migration, chưa thấy trong dump chính |
| `media_files` | Lưu ảnh LONGBLOB | Có migration, chưa thấy trong dump chính |
| `photo_restorations` | Phục hồi ảnh cũ | Có trong dump 20260502 nhưng chưa thấy route hiện tại |

### 4.2 Quan Hệ Quan Trọng

```text
roles 1--n accounts
accounts 0/1--1 people
accounts n--n clans qua account_clans
clans 1--n people
clans 1--n families
families 1--n children
children n--1 people
clans 1--n posts/events/tasks
posts 1--n post_comments
posts 1--n post_likes
accounts 1--n conversations
conversations 1--n messages
manager_tasks 1--n manager_task_assignments
accounts/people 1--n notifications
recordings 1--n voice_recording_recipients
```

### 4.3 Bảng/Cột Code Dùng Nhưng Schema Chưa Đồng Bộ

| Code dùng | Tình trạng trong schema | Ảnh hưởng |
|---|---|---|
| `plans`, `subscriptions`, `payments` | Chưa đồng bộ giữa schema/dump local và hướng schema cloud/code hiện hành | Billing/payment dễ lỗi nếu môi trường chạy sai schema |
| `fund_campaigns` | Thuộc hướng schema quỹ mới; cần thống nhất với cấu trúc `event_contributions/event_costs` cũ | Quỹ dòng họ dễ ghi dữ liệu lệch mô hình |
| `event_contributions.clan_id`, `campaign_id`, `status`, `evidence_media_id`, `manager_note` | Một hướng schema dùng cột mở rộng, hướng cũ chỉ có `event_id/person_id/amount/...` | Fund transactions/report payment cần migration rõ ràng |
| `event_costs.clan_id`, `campaign_id`, `category` | Một hướng schema dùng cột mở rộng, hướng cũ thiếu | Fund expense/stats/export cần thống nhất schema |
| `password_reset_tokens` | Chưa thấy trong SQL/migration | Reset password chỉ còn memory fallback, mất token khi restart |
| `media_files`, `people.avatar_media_id`, `people.pending_avatar_media_id`, `posts.image_media_id` | Có migration, chưa thấy trong dump chính | Upload ảnh DB/profile/post image có thể lỗi nếu migration chưa chạy |
| `voice_recording_recipients` | Có `voice/schema.sql` và migration, chưa thấy trong dump chính | Gửi/schedule voice có thể lỗi nếu schema chưa được tạo |
| `notifications.receiver_account_id` | Code auto-alter; dump mới có, `docker/init.sql/defaultdb.sql` chưa có | Notification theo account phụ thuộc runtime ALTER |
| `manager_tasks.event_id` | Migration có, `defaultdb.sql` cũ chưa có; runtime auto-alter | Task gắn event phụ thuộc runtime ALTER |

### 4.4 Rủi Ro FK/Cascade/Transaction

| Rủi ro | Chi tiết |
|---|---|
| FK thiếu | `families.father_id/mother_id` không FK tới `people`; `posts.author_id` không FK tới `accounts`; `recordings.account_id/person_id/clan_id` không có FK trong `voice/schema.sql` |
| Cascade lớn | `clans -> people/events/posts/families` cascade có thể xóa dữ liệu lớn nếu admin xóa nhầm clan |
| Dữ liệu mồ côi | Event delete set `manager_tasks.event_id=NULL`; families có parent id không còn tồn tại nếu xóa person không đi qua util chuẩn |
| Runtime migration | Nhiều `CREATE/ALTER TABLE` nằm trong request handler/util, rủi ro thiếu quyền DB, lock bảng khi production có traffic |
| Transaction chưa đồng đều | Register đã có transaction; nhiều update relation/task/fund vẫn có đoạn nhiều query không phải lúc nào cũng trong transaction |
| Constraint business thiếu | Chưa thấy constraint chống cycle gia phả, cha/mẹ sai gender, con thuộc clan khác, ngày sinh con trước cha mẹ |

## 5. Kiến Trúc Hệ Thống

```text
Browser
  |
  | React/Vite SPA
  v
Frontend routes/components
  |
  | fetch REST API, Authorization: Bearer JWT
  | Socket.IO register_user(account_id)
  v
Node.js Express Backend
  |
  | mysql2 pool
  v
MySQL Database

Backend /api/member/chat
  |
  | lưu conversations/messages nếu UI chat còn bật
  | luồng AI hỏi DB cũ là luồng cũ đã loại bỏ/không sử dụng
  v
Local/service response hiện hành

Backend /api/ai/event-form/generate
  |
  v
AI-server /event-form/generate
  |
  | Groq nếu có key, fallback deterministic nếu lỗi/thiếu key
  v
JSON event + manager_tasks

Browser voice recorder
  |
  v
Backend /api/voice/recordings -> disk Backend/storage/recordings + MySQL recordings
  |
  v
voice/worker.py -> ffmpeg -> faster-whisper -> update transcript
```

Cách frontend gọi backend:

- Có 2 kiểu base URL: `apiRequest()` dùng `VITE_API_BASE_URL || http://localhost:3000`; nhiều service khác dùng path tương đối `/api/...` dựa vào Vite proxy.
- Token lấy từ `localStorage` keys `auth_token` hoặc `token`.
- Vite dev proxy `/api -> http://localhost:3000`; production cần reverse proxy hoặc `VITE_API_BASE_URL` nhất quán.

Cách backend gọi AI-server:

- Event AI dùng `aiController.generateEventFormAI()` gọi `${AI_SERVER_URL}/event-form/generate`.
- luồng AI hỏi DB cũ còn là dấu vết legacy trong code/tài liệu, nhưng theo xác nhận dự án đã loại bỏ/không sử dụng nên không tính là blocker production; nên dọn để tránh hiểu nhầm.
- `AI_SERVER_URL` fallback `http://localhost:8001`.

Cách backend kết nối DB:

- `Backend/src/config/db.js` dùng `mysql2.createPool().promise()`.
- Env: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`, `DB_USE_PUBLIC_DNS`.
- Pool limit 10, chưa thấy retry/backoff/health DB riêng.

Realtime notification:

- `server.js` lưu `app.locals.onlineUsers[accountId] = socket.id` khi client emit `register_user`.
- Các controller emit `new_notification` nếu tìm thấy socket id.
- Không có persistent queue riêng; nếu user offline thì dựa vào bảng `notifications`.
- Không scale đa process/container vì map nằm trong memory.

Docker compose:

- Không xem Docker compose là yêu cầu production vì hệ thống triển khai qua cloud.
- `docker/docker-compose.yml` hiện chỉ có phpMyAdmin, phù hợp vai trò hỗ trợ local/dev hoặc truy cập DB ngoài qua env.
- Rủi ro còn lại là tài liệu vận hành cloud cần mô tả rõ env, migration, backup, rollback, healthcheck và nơi lưu media.

## 6. Luồng Xử Lý Chính

### 6.1 Đăng Ký Tài Khoản

```text
Register.jsx -> authService.registerAPI()
  -> POST /api/auth/register
  -> validate email/password/clan_id
  -> BEGIN
  -> SELECT clans
  -> bcrypt.hash(password)
  -> INSERT people
  -> INSERT accounts(role_id=3,status default pending)
  -> COMMIT
  -> user chờ manager/admin duyệt
```

### 6.2 Đăng Nhập

```text
Login.jsx -> POST /api/auth/login
  -> SELECT accounts LEFT JOIN people by email
  -> check archived_members
  -> bcrypt.compare
  -> reject nếu status pending/rejected
  -> jwt.sign({id, account_id, person_id, role_id, role_name}, 24h)
  -> frontend lưu localStorage token/user
  -> redirect theo role
```

### 6.3 Manager Duyệt Member

```text
Manager PendingApprovals -> GET /api/manager/pending
  -> managerController lọc account pending cùng clan
  -> POST /api/manager/approve/:id
  -> UPDATE accounts SET role_id=3,status='active'

Reject:
  -> POST /api/manager/reject/:id
  -> UPDATE accounts SET status='rejected'
```

### 6.4 Thêm Người Vào Gia Phả

```text
FamilyTreeEditor -> createPersonAPI()
  -> POST /api/manager/people hoặc /api/people
  -> assert role hoặc temporary tree edit permission
  -> check billing ensureCanAddPerson()
  -> INSERT people
  -> nếu có relation thì tạo/cập nhật families + children
  -> frontend refresh tree
```

### 6.5 Tạo Quan Hệ Cha/Mẹ/Con/Vợ/Chồng

```text
Frontend chọn person + father_id/mother_id/spouse_id/children_ids
  -> PATCH /api/manager/people/link hoặc update relation/member relation
  -> backend validate person cùng clan
  -> tìm/tạo families(father_id,mother_id)
  -> DELETE children cũ của person hoặc family
  -> INSERT children(family_id, person_id)
```

Rủi ro chính: chưa thấy kiểm tra cycle nhiều đời; một số thao tác xóa rồi insert không được bọc transaction đầy đủ.

### 6.6 Hiển Thị Cây Gia Phả

```text
Frontend -> GET /api/member/dashboard hoặc /api/manager/tree
  -> query people/families/children/tree_layout_settings
  -> buildFamilyTree()
  -> response gồm treeMembers, families, children, layoutSettings, familyTree
  -> FamilyTreeEditor render node/edge, zoom/pan, lưu vị trí/layout
```

### 6.7 Tạo Bài Viết Cộng Đồng

```text
Member -> upload ảnh nếu có -> /api/upload -> media_files
Member -> POST /api/member/content/post
  -> INSERT posts(status='pending')
Manager -> GET /api/manager/pending-posts
Manager -> approve/reject
  -> UPDATE posts.status
Member khác -> GET /api/member/posts/general
  -> chỉ thấy status='approved' cùng clan
```

### 6.8 Duyệt Bài Viết

```text
Manager/Admin -> pending-posts
  -> approve: UPDATE posts SET status='approved'
  -> reject: UPDATE posts SET status='rejected', rejection_reason=...
```

### 6.9 Giao Task Và Gửi Notification

```text
Manager/Admin -> TaskManagementPage -> assignTaskAPI/bulkAssignTasksAPI
  -> INSERT manager_tasks
  -> INSERT manager_task_assignments
  -> INSERT notifications
  -> emit Socket.IO new_notification nếu online
  -> gửi email nếu SMTP configured
Member -> GET /api/member/tasks
Member -> PATCH /api/member/tasks/:id/status
  -> nếu completed, notify manager
```

Lưu ý: cần sửa các call `createNotification({ accountId: ... })` thành `receiverAccountId` hoặc mở rộng util, nếu không một số notification assign task không được ghi.

### 6.10 AI / Chat / Sinh Form Sự Kiện

```text
Member -> POST /api/member/chat
  -> INSERT messages(sender_type='user')
  -> nếu UI chat còn bật: backend trả lời bằng local/service response hiện hành
  -> INSERT messages(sender_type='ai')

TaskManagementPage -> POST /api/ai/event-form/generate
  -> Backend gọi AI_SERVER_URL + /event-form/generate
  -> AI-server trả JSON event + tasks
  -> frontend dùng JSON để điền form tạo sự kiện/task
```

Trạng thái hiện tại: luồng AI hỏi DB cũ là luồng cũ đã loại bỏ/không sử dụng theo xác nhận dự án, nên không xếp là lỗi production. Cần dọn các dấu vết code/tài liệu còn nhắc luồng AI hỏi DB cũ để tránh reviewer hoặc developer mới hiểu nhầm rằng hệ thống vẫn có AI hỏi đáp trực tiếp database.

## 7. Phân Tích Bảo Mật

| Hạng mục | Hiện trạng | Rủi ro |
|---|---|---|
| JWT secret | `JWT_SECRET || 'GiaPhaViet_Secret_Key_2024_Backup'` | P0: fallback hardcode, nếu quên env thì token có secret đoán được từ source |
| Token storage | Frontend lưu token/user trong `localStorage` | P1/P0 nếu app có XSS; không có httpOnly cookie/CSRF model |
| RBAC | Middleware `verifyToken` + `checkRole` dựa vào payload JWT | Token cũ vẫn giữ role/status đến hết hạn; không check status active mỗi request |
| Upload ảnh | `/api/upload` đã có JWT, MIME whitelist, size limit | `/api/media/:id` public không check owner/clan; LONGBLOB tăng blast radius DB |
| Upload audio | Auth có, size/duration có, path traversal có kiểm soát khi stream | Audio MIME cho phép mọi `audio/*`; token query string cho audio có thể lộ |
| Rate limit | Chưa thấy `express-rate-limit` | Login, forgot password, upload, AI có thể bị brute force/abuse |
| SQL injection | Phần lớn backend dùng parameterized query; có dynamic `IN` placeholders | Cần audit các raw string từ AI và các query ghép; hiện chưa thấy user input trực tiếp vào SQL nguy hiểm trong backend chính |
| AI SQL | luồng AI hỏi DB cũ đã loại bỏ/không sử dụng; AI hiện dùng chính cho sinh JSON event/task | Nếu khôi phục LLM SQL/DB Q&A trong tương lai cần DB user read-only, SQL parser thật, audit log và giới hạn intent rõ ràng |
| Password reset | OTP hash, expire 15 phút, generic response | Bảng `password_reset_tokens` chưa có; memory fallback mất khi restart; không rate limit |
| Webhook payment | SePay webhook check secret nếu configured | Nếu `SEPAY_WEBHOOK_SECRET` trống, webhook không có xác thực thực tế |
| Hardcode localhost | Có trong `Backend/.env.example`, `Frontend/.env.example`, Vite proxy, backend fallback AI | Production cần env/reverse proxy chuẩn |
| Secret/data leak | Repo có `.env` thật trong `Backend/`, `AI-server/`, `docker/` nhưng nội dung chưa mở trong báo cáo | Cần đảm bảo không commit secret thật; `.gitignore` cần bao phủ `.env` |
| Encoding | Nhiều file/log bị mojibake tiếng Việt | Không trực tiếp là bảo mật nhưng gây lỗi UX/log/debug |

## 8. Production Readiness

Đánh giá: Chưa sẵn sàng production. Hệ thống có nhiều chức năng nhưng còn rủi ro P0 về secret, schema/migration, xác thực webhook thanh toán, thống nhất schema/cách lưu billing-quỹ-payment, và observability.

### P0 - Bắt Buộc Sửa Trước Deploy

| Vấn đề | Vì sao nguy hiểm | File/API/schema liên quan | Cách sửa cụ thể |
|---|---|---|---|
| JWT fallback hardcode | Ai đọc source có thể sign token nếu production quên env | `authMiddleware.js`, `authController.js` | Bỏ fallback; app fail-fast nếu thiếu `JWT_SECRET`; rotate secret hiện tại |
| Schema/migration không đồng bộ | Deploy DB mới sẽ lỗi runtime ở fund/billing/media/voice/reset/settings | SQL dumps, `migrations/*`, controllers | Tạo migration versioned đầy đủ cho mọi bảng/cột; chạy bằng migration tool trước app |
| Billing/payment/quỹ có 2 hướng schema/cách lưu chưa thống nhất | Deploy hoặc migrate nhầm hướng sẽ làm module thanh toán/quỹ lỗi runtime hoặc ghi dữ liệu lệch cấu trúc | `billingController.js`, `paymentController.js`, `fundController.js`, SQL dumps/migrations | Chọn một schema canonical, viết migration chuyển dữ liệu, cập nhật controller/service theo schema đó và thêm migration check trước deploy |
| SePay webhook có thể không auth nếu thiếu secret | Kẻ ngoài có thể giả webhook nếu route public và secret trống | `paymentController.js` | Bắt buộc `SEPAY_WEBHOOK_SECRET`, fail-fast nếu thiếu; verify signature/IP nếu provider hỗ trợ |
| `.env` thật nằm trong workspace | Nguy cơ commit/lộ secret | `Backend/.env`, `AI-server/.env`, `docker/.env` | Kiểm tra gitignore, rotate secret nếu từng commit, chỉ giữ `.env.example` |

### P1 - Nên Sửa Sớm

| Vấn đề | Vì sao nguy hiểm | File/API/schema liên quan | Cách sửa cụ thể |
|---|---|---|---|
| Token trong localStorage | XSS lấy token dễ dàng | Frontend auth utils/services | Chuyển sang httpOnly secure cookie hoặc tăng CSP/sanitize, rút TTL, refresh token an toàn |
| RBAC chỉ dựa vào JWT payload | Role/status thay đổi không có hiệu lực ngay | `authMiddleware.js` | Middleware load account status/role từ DB hoặc dùng token version/revocation |
| `/api/media/:id` public | Ai biết id đọc ảnh | `mediaRoutes.js` | Thêm auth + check owner/clan hoặc signed URL/CDN policy |
| Runtime `CREATE/ALTER TABLE` | Lock bảng, lỗi nếu DB user không có quyền DDL | `notifications.js`, `treeEditPermissions.js`, `treeLayoutSettings.js`, controllers | Dời toàn bộ DDL sang migration |
| Notification task assign có bug tham số | Task có thể không tạo notification | `managerController.js`, `utils/notifications.js` | Sửa call dùng `receiverAccountId`; thêm test |
| Socket.IO không scale | Multi-instance mất realtime hoặc sai user | `server.js` | Dùng Redis adapter và room `account:{id}` thống nhất |
| Không rate limit | Brute force login/reset/AI/upload | Backend middleware | Thêm rate limit theo IP/account/route |
| Thiếu CI/test | Regression khó phát hiện | toàn repo | GitHub Actions build frontend, lint, backend route smoke, migration check |
| Voice audio token query string | Token lộ qua URL/log | `voiceService.js`, `voice/backendRoutes.js` | Dùng short-lived signed URL hoặc stream qua Authorization header từ fetch blob |

### P2 - Cải Thiện Sau

| Vấn đề | Tác động | Gợi ý |
|---|---|---|
| Bundle frontend lớn | Load chậm | Code splitting theo role/page |
| Lưu ảnh trong MySQL | Backup/IO nặng | Chuyển S3/Cloudinary/object storage, DB chỉ lưu metadata |
| Encoding mojibake | UX/log kém | Chuẩn hóa file UTF-8, sửa text tiếng Việt |
| Thiếu monitoring/logging | Khó vận hành | Structured log, request id, metrics, alert |
| Tree lớn chưa cache | Chậm với clan lớn | Cache tree JSON theo clan + invalidation khi update |
| Email sync trong request | Request chậm/dễ fail | Queue job cho email/notification |

## 9. DevOps / Triển Khai

| Hạng mục | Hiện trạng | Đề xuất production |
|---|---|---|
| Docker compose | Chỉ có phpMyAdmin, dùng cho local/dev | Không bắt buộc production vì deploy qua cloud; cần tài liệu cloud env, migration, rollback, backup và healthcheck |
| Env config | `.env.example` có; có `.env` thật trong workspace | Không commit `.env`; validate env bắt buộc khi boot |
| Migration | SQL rời rạc, nhiều runtime DDL | Dùng migration runner (`knex`, `node-pg-migrate` tương đương MySQL, Flyway/Liquibase) |
| CI/CD | Chưa thấy workflow | Build frontend, npm audit, backend smoke test, migration dry-run |
| Logging | `console.log/error`, log file local | JSON log, request id, log aggregation |
| Monitoring | Chưa thấy | Healthcheck backend/AI/DB/worker, metrics, alert |
| Backup DB | Chưa thấy | Automated backup, restore drill, retention, encryption |
| Media storage | Ảnh DB LONGBLOB, audio disk local | Object storage/CDN; volume persistent cho voice nếu chưa chuyển |
| Scaling frontend | Vite build static | Nginx/CDN/Vercel; cache static assets |
| Scaling backend | Single process in-memory socket map | Stateless API + Redis session/socket adapter |
| Scaling AI-server | Flask dev server trong `app.py` nếu chạy trực tiếp | Gunicorn/Waitress, timeout và worker limit |
| Scaling voice | Worker polling DB | Queue/job table với locking tốt hơn, supervisor/systemd/container restart |
| Cost cloud | MySQL LONGBLOB và Whisper CPU tốn tài nguyên | Object storage cho media, autoscale AI/worker riêng, chọn Whisper model theo SLA |

## 10. So Sánh Với Bản Tóm Tắt Tuần Trước

`flow.md` cũ trong repo được dùng làm bản tuần trước.

| Nội dung tuần trước | Trạng thái hiện tại | Nhận xét |
|---|---|---|
| Dự án là Gia Phả Việt, React/Vite + Express + MySQL + AI Flask | Vẫn đúng | Kiến trúc lõi không đổi |
| `/api/upload` chưa có auth/MIME/size | Đã thay đổi | Hiện `/api/upload` có `verifyToken`, MIME whitelist và size limit |
| Notification API list/read/read-all thiếu | Đã thay đổi | `memberRoutes.js` có `/notifications`, `/notifications/read-all`, `/:id/read` |
| Frontend thiếu `reactflow`, `socket.io-client` dependency | Không còn đúng theo build hiện tại | `npm run build` thành công; source hiện không import các package đó trực tiếp |
| Manager tasks runtime, event link chưa chuẩn | Vẫn còn một phần | Có migration event link nhưng `docker/init.sql` vẫn thiếu tasks; runtime DDL vẫn tồn tại |
| `system_settings` code dùng nhưng schema thiếu | Một phần đã sửa | Dump 20260502 có `system_settings`, nhưng `docker/init.sql/defaultdb.sql` chưa có |
| AI DB legacy whitelist intent | Không còn áp dụng cho production | Theo xác nhận dự án, luồng AI hỏi DB cũ đã loại bỏ/không sử dụng; chỉ còn là dấu vết legacy cần dọn khỏi code/tài liệu |
| Docker compose production | Không còn là yêu cầu | Production triển khai qua cloud; compose chỉ còn vai trò local/dev/phpMyAdmin |
| Upload local disk | Đã thay đổi với ảnh | Ảnh mới vào MySQL `media_files`; voice vẫn lưu disk |

Module mới hoặc được mở rộng so với bản tuần trước:

| Module | Bằng chứng |
|---|---|
| Quỹ dòng họ | `fundController.js`, `ClanFundPage.jsx`, `MemberFundPage.jsx` |
| Billing/subscription | `billingController.js`, `billingService.js`, `BillingPage.jsx` |
| SePay payment | `paymentController.js`, `paymentService.js` |
| Voice/time capsule | `voice/backendRoutes.js`, `voice/worker.py`, `TimeCapsulePage.jsx` |
| Media DB LONGBLOB | `media_files` migration, `utils/media.js`, `/api/media/:id` |
| AI event/task form generator | `aiController.js`, `AI-server/app.py`, `TaskManagementPage.jsx` |

Rủi ro mới phát hiện:

| Rủi ro | Mức |
|---|---|
| Billing/quỹ/payment có 2 hướng schema/cách lưu chưa thống nhất | P0 |
| SePay webhook không bắt buộc secret nếu env trống | P0 |
| Một số notification task assign gọi sai tham số `createNotification` | P1 |
| `/api/media/:id` public đọc theo id | P1 |
| Member có route gọi `addIncome/addExpense` trong fund | P1 |

Rủi ro đã được sửa hoặc cải thiện:

| Rủi ro cũ | Trạng thái |
|---|---|
| Upload ảnh không auth/validate | Đã cải thiện: auth + MIME + size |
| NotificationBell gọi route chưa tồn tại | Đã có route backend |
| Register không transaction | Đã có transaction trong `authController.register` |
| Tree layout chỉ lưu local/frontend | Đã có `tree_layout_settings` và lưu DB |

## 11. Kết Luận Ngắn Gọn Cho Báo Cáo Word

Gia Phả Việt là hệ thống web số hóa quản lý dòng họ và cây gia phả, hỗ trợ Admin, Manager và Member. Kiến trúc chính gồm Frontend React/Vite, Backend Node.js/Express kết nối MySQL cloud, Socket.IO cho thông báo realtime, AI-server Flask/Groq cho tạo kế hoạch sự kiện/task, cùng voice worker dùng faster-whisper để chuyển giọng nói thành văn bản. Các chức năng chính gồm đăng ký/đăng nhập JWT, duyệt thành viên, quản lý cây phả hệ, bài viết cộng đồng, task/notification, sự kiện/reminder, upload ảnh, quỹ dòng họ, billing/thanh toán và time capsule bằng ghi âm.

Trạng thái hiện tại chưa sẵn sàng production. Các việc bắt buộc cần làm trước deploy gồm bỏ JWT secret fallback hardcode, chuẩn hóa migration cho toàn bộ bảng/cột đang được code sử dụng, thống nhất một schema/cách lưu cho billing-quỹ-payment, hoàn thiện schema media/voice/reset password, bắt buộc xác thực webhook thanh toán, bổ sung rate limit/logging/CI, thay runtime DDL bằng migration kiểm soát được và dọn dấu vết luồng AI hỏi DB cũ nếu không còn dùng.
