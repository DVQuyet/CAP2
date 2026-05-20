# Danh sách API trong dự án

Tài liệu này được tổng hợp từ các file route trong dự án tại thời điểm quét:

- `Backend/server.js`
- `Backend/src/modules/**/*.routes.js`
- `voice/backend/backendRoutes.js`
- `AI-server/app.py`
- Đối chiếu thêm với `Frontend/src/api/*` và `Frontend/src/services/*`

Base URL backend chính: `http://localhost:3000`

Base URL AI-server độc lập: `http://localhost:8001`

## Ghi chú xác thực

- Các API có ghi `Public` không cần token.
- Các API có ghi role yêu cầu header `Authorization: Bearer <token>`.
- Role dùng trong route: `admin`, `manager`, `member`.
- `GET /uploads/*` là static file route, không phải JSON API.

## Backend chung

| Method | Endpoint | Quyền | Mô tả ngắn |
|---|---|---|---|
| GET | `/api/health` | Public | Kiểm tra backend đang chạy |
| POST | `/api/upload` | Đăng nhập | Upload ảnh/media bài viết vào database |
| POST | `/api/upload-memory-media` | Đăng nhập | Upload media kỷ niệm gia đình: ảnh, video, audio |
| GET | `/uploads/*` | Public | Phục vụ file tĩnh trong `Backend/uploads` |

## Auth

Prefix: `/api/auth`

| Method | Endpoint | Quyền | Mô tả ngắn |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Đăng ký tài khoản member |
| POST | `/api/auth/login` | Public | Đăng nhập |
| POST | `/api/auth/forgot-password` | Public | Gửi mã đặt lại mật khẩu |
| POST | `/api/auth/reset-password` | Public | Đặt lại mật khẩu bằng mã |
| POST | `/api/auth/register-clan` | Public | Đăng ký dòng họ |
| POST | `/api/auth/register-clan-manager` | Public | Đăng ký dòng họ kèm tài khoản manager |

## Media

Prefix: `/api/media`

| Method | Endpoint | Quyền | Mô tả ngắn |
|---|---|---|---|
| GET | `/api/media/:id` | Public | Lấy file media từ bảng `media_files` |

## Calendar

Prefix: `/api/calendar`

| Method | Endpoint | Quyền | Mô tả ngắn |
|---|---|---|---|
| GET | `/api/calendar/events` | admin, manager, member | Danh sách sự kiện lịch |
| POST | `/api/calendar/events` | admin, manager, member | Tạo sự kiện lịch |
| PUT | `/api/calendar/events/:id` | admin, manager, member | Cập nhật sự kiện lịch |
| DELETE | `/api/calendar/events/:id` | admin, manager, member | Xóa sự kiện lịch |
| POST | `/api/calendar/reminders/run` | admin, manager | Chạy xử lý reminder đến hạn |

## Billing

Prefix: `/api/billing`

| Method | Endpoint | Quyền | Mô tả ngắn |
|---|---|---|---|
| GET | `/api/billing/plans` | Đăng nhập | Lấy danh sách gói |
| GET | `/api/billing/clans/:clanId` | admin, manager | Lấy thông tin billing của dòng họ |
| GET | `/api/billing/clans/:clanId/payments` | admin, manager | Lịch sử thanh toán của dòng họ |
| PATCH | `/api/billing/admin/clans/:clanId/manual-upgrade` | admin | Nâng cấp gói thủ công |

## Payments

Prefix: `/api/payments`

| Method | Endpoint | Quyền | Mô tả ngắn |
|---|---|---|---|
| POST | `/api/payments/sepay/create` | manager, admin | Tạo thanh toán SePay |
| POST | `/api/payments/sepay/webhook` | Public/webhook | Nhận webhook SePay |
| GET | `/api/payments/status/:orderCode` | manager, admin | Kiểm tra trạng thái thanh toán |
| PATCH | `/api/payments/:paymentId/cancel` | manager, admin | Hủy giao dịch đang chờ |

## AI qua Backend

Prefix: `/api/ai`

| Method | Endpoint | Quyền | Mô tả ngắn |
|---|---|---|---|
| POST | `/api/ai/event-form/generate` | admin, manager | Gọi AI-server để sinh form sự kiện và danh sách task |

## AI-server độc lập

Base URL mặc định: `http://localhost:8001`

| Method | Endpoint | Quyền | Mô tả ngắn |
|---|---|---|---|
| GET | `/health` | Public | Kiểm tra AI-server và cấu hình Groq |
| POST | `/event-form/generate` | Gọi nội bộ từ backend | Sinh dữ liệu form sự kiện/task bằng AI hoặc fallback |

## Admin

Prefix: `/api/admin`

| Method | Endpoint | Quyền | Mô tả ngắn |
|---|---|---|---|
| GET | `/api/admin/clans` | admin | Danh sách dòng họ |
| POST | `/api/admin/clans` | admin | Tạo dòng họ |
| PUT | `/api/admin/clans/:clanId` | admin | Cập nhật dòng họ |
| DELETE | `/api/admin/clans/:clanId` | admin | Xóa dòng họ |
| GET | `/api/admin/clans/:clanId/tree` | admin | Lấy cây gia phả của dòng họ |
| GET | `/api/admin/clans/:clanId/tasks` | admin | Lấy task theo dòng họ |
| GET | `/api/admin/accounts` | admin | Danh sách tài khoản |
| POST | `/api/admin/accounts` | admin | Tạo tài khoản |
| PUT | `/api/admin/accounts/:id` | admin | Cập nhật quyền/trạng thái tài khoản |
| DELETE | `/api/admin/accounts/:id` | admin | Xóa tài khoản |
| POST | `/api/admin/managers` | admin | Tạo tài khoản manager |
| GET | `/api/admin/members` | admin | Danh sách thành viên |
| PUT | `/api/admin/members/:id` | admin | Cập nhật thành viên |
| DELETE | `/api/admin/members/:id` | admin | Xóa thành viên |
| GET | `/api/admin/settings` | admin | Lấy cấu hình hệ thống |
| POST | `/api/admin/settings` | admin | Cập nhật cấu hình hệ thống |
| GET | `/api/admin/events` | admin | Danh sách sự kiện |
| POST | `/api/admin/events` | admin | Tạo sự kiện |
| PUT | `/api/admin/events/:id` | admin | Cập nhật sự kiện |
| DELETE | `/api/admin/events/:id` | admin | Xóa sự kiện |
| GET | `/api/admin/gallery` | admin | Danh sách thư viện |
| DELETE | `/api/admin/gallery/:id` | admin | Xóa item thư viện |
| GET | `/api/admin/dashboard-stats` | admin | Thống kê dashboard admin |
| GET | `/api/admin/posts/clan/:clanId` | admin | Lấy bài viết theo dòng họ |
| PATCH | `/api/admin/posts/:postId/status` | admin | Cập nhật trạng thái bài viết |
| DELETE | `/api/admin/posts/:postId` | admin | Xóa bài viết |

## Manager

Prefix: `/api/manager`

| Method | Endpoint | Quyền | Mô tả ngắn |
|---|---|---|---|
| GET | `/api/manager/stats` | admin, manager | Thống kê manager |
| GET | `/api/manager/tree` | admin, manager | Lấy cây gia phả |
| GET | `/api/manager/clan-info` | admin, manager | Lấy thông tin dòng họ |
| PUT | `/api/manager/clan-info` | admin, manager | Cập nhật thông tin dòng họ |
| GET | `/api/manager/members` | admin, manager | Danh sách thành viên |
| POST | `/api/manager/members` | admin, manager | Tạo thành viên |
| GET | `/api/manager/members/:id/relations` | admin, manager | Lấy quan hệ của thành viên |
| PUT | `/api/manager/members/:id/relations` | admin, manager | Cập nhật quan hệ của thành viên |
| GET | `/api/manager/members/:id` | admin, manager | Chi tiết thành viên |
| PUT | `/api/manager/members/:id` | admin, manager | Cập nhật thành viên |
| POST | `/api/manager/members/:id/archive` | admin, manager | Lưu trữ thành viên |
| GET | `/api/manager/members-archive` | admin, manager | Danh sách thành viên đã lưu trữ |
| POST | `/api/manager/members-archive/:id/restore` | admin, manager | Khôi phục thành viên đã lưu trữ |
| DELETE | `/api/manager/members-archive/:id` | admin, manager | Xóa vĩnh viễn bản lưu trữ |
| GET | `/api/manager/tree-edit-keys` | admin, manager | Danh sách temporary edit key |
| POST | `/api/manager/tree-edit-keys` | admin, manager | Tạo temporary edit key |
| GET | `/api/manager/pending` | admin, manager | Danh sách user chờ duyệt |
| POST | `/api/manager/approve/:id` | admin, manager | Duyệt user |
| POST | `/api/manager/reject/:id` | admin, manager | Từ chối user |
| GET | `/api/manager/pending-posts` | admin, manager | Bài viết chờ duyệt |
| POST | `/api/manager/approve-post/:id` | admin, manager | Duyệt bài viết |
| POST | `/api/manager/reject-post/:id` | admin, manager | Từ chối bài viết |
| GET | `/api/manager/pending-profiles` | admin, manager | Hồ sơ chờ duyệt |
| POST | `/api/manager/approve-profile/:id` | admin, manager | Duyệt cập nhật hồ sơ |
| POST | `/api/manager/reject-profile/:id` | admin, manager | Từ chối cập nhật hồ sơ |
| GET | `/api/manager/pending-memories` | admin, manager | Kỷ niệm chờ duyệt |
| POST | `/api/manager/approve-memory/:id` | admin, manager | Duyệt kỷ niệm |
| POST | `/api/manager/reject-memory/:id` | admin, manager | Từ chối kỷ niệm |
| GET | `/api/manager/media` | admin, manager | Quản lý thư viện/media |
| GET | `/api/manager/events` | admin, manager | Danh sách sự kiện manager |
| POST | `/api/manager/events` | admin, manager | Tạo sự kiện manager |
| PUT | `/api/manager/events/:id` | admin, manager | Cập nhật sự kiện manager |
| DELETE | `/api/manager/events/:id` | admin, manager | Xóa sự kiện manager |
| POST | `/api/manager/events/:eventId/tasks` | admin, manager | Tạo task cho sự kiện |
| POST | `/api/manager/assign-task` | admin, manager | Giao task |
| POST | `/api/manager/tasks/bulk-assign` | admin, manager | Giao nhiều task |
| GET | `/api/manager/tasks` | admin, manager | Danh sách task đã giao |
| PATCH | `/api/manager/tasks/:id/complete` | admin, manager | Đánh dấu task hoàn thành |
| GET | `/api/manager/clans/:clanId/family-tree` | admin, manager | Lấy cây gia phả theo dòng họ |
| PATCH | `/api/manager/clans/:clanId/family-tree/layout` | admin, manager | Lưu layout cây gia phả theo dòng họ |
| POST | `/api/manager/people` | admin, manager, member | Tạo người trong gia phả |
| POST | `/api/manager/people/create` | admin, manager, member | Alias tạo người trong gia phả |
| PATCH | `/api/manager/people/link` | admin, manager, member | Liên kết quan hệ |
| PATCH | `/api/manager/people/layout` | admin, manager, member | Lưu layout cây gia phả |
| PATCH | `/api/manager/people/:id/position` | admin, manager, member | Cập nhật vị trí node |
| PATCH | `/api/manager/people/:id` | admin, manager, member | Cập nhật người trong gia phả |
| DELETE | `/api/manager/people/:id` | admin, manager, member | Xóa người trong gia phả |
| POST | `/api/manager/families` | admin, manager, member | Tạo family |
| PATCH | `/api/manager/families/:familyId` | admin, manager, member | Cập nhật family |
| POST | `/api/manager/families/:familyId/children` | admin, manager, member | Thêm con vào family |
| GET | `/api/manager/fund/overview` | admin, manager | Tổng quan quỹ |
| GET | `/api/manager/fund/campaigns` | admin, manager | Danh sách chiến dịch quỹ |
| POST | `/api/manager/fund/campaigns` | admin, manager | Tạo chiến dịch quỹ |
| GET | `/api/manager/fund/campaigns/:id` | admin, manager | Chi tiết chiến dịch quỹ |
| PATCH | `/api/manager/fund/campaigns/:id` | admin, manager | Cập nhật chiến dịch quỹ |
| GET | `/api/manager/fund/transactions` | admin, manager | Lịch sử giao dịch quỹ |
| GET | `/api/manager/fund/export` | admin, manager | Export Excel quỹ |
| POST | `/api/manager/fund/import` | admin, manager | Import Excel quỹ |
| POST | `/api/manager/fund/approve` | admin, manager | Duyệt thanh toán/đóng góp quỹ |
| GET | `/api/manager/fund/stats` | admin, manager | Thống kê quỹ |
| POST | `/api/manager/fund/income` | admin, manager | Thêm khoản thu |
| POST | `/api/manager/fund/expense` | admin, manager | Thêm khoản chi |

## Member

Prefix: `/api/member`

| Method | Endpoint | Quyền | Mô tả ngắn |
|---|---|---|---|
| GET | `/api/member/dashboard` | admin, manager, member | Dashboard member |
| GET | `/api/member/notifications` | admin, manager, member | Danh sách thông báo |
| PATCH | `/api/member/notifications/read-all` | admin, manager, member | Đánh dấu tất cả thông báo đã đọc |
| PATCH | `/api/member/notifications/:id/read` | admin, manager, member | Đánh dấu một thông báo đã đọc |
| PUT | `/api/member/profile` | admin, manager, member | Cập nhật hồ sơ cá nhân |
| PUT | `/api/member/password` | admin, manager, member | Đổi mật khẩu |
| POST | `/api/member/tree-edit-session` | admin, manager, member | Xác thực temporary tree edit key |
| GET | `/api/member/chat` | admin, manager, member | Lấy lịch sử chat |
| POST | `/api/member/chat` | admin, manager, member | Gửi tin chat |
| POST | `/api/member/reminders` | manager, member | Tạo nhắc việc |
| GET | `/api/member/tasks` | member | Danh sách task được giao |
| GET | `/api/member/events` | member | Danh sách sự kiện được giao/tham gia |
| PATCH | `/api/member/tasks/:id/status` | member | Cập nhật trạng thái task |
| POST | `/api/member/content/profile` | admin, manager, member | Đề xuất cập nhật hồ sơ |
| POST | `/api/member/content/post` | admin, manager, member | Gửi tư liệu/bài viết |
| GET | `/api/member/posts/general` | admin, manager, member | Danh sách bài viết chung |
| GET | `/api/member/posts/:id/comments` | admin, manager, member | Bình luận của bài viết |
| POST | `/api/member/posts/:id/comments` | admin, manager, member | Thêm bình luận |
| POST | `/api/member/posts/:id/like` | admin, manager, member | Like/unlike bài viết |
| GET | `/api/member/submissions` | admin, manager, member | Danh sách đóng góp của tôi |
| GET | `/api/member/memories` | admin, manager, member | Danh sách kỷ niệm gia đình |
| GET | `/api/member/memories/reader-options` | admin, manager, member | Danh sách người có thể đọc kỷ niệm |
| POST | `/api/member/memories` | admin, manager, member | Tạo kỷ niệm gia đình |
| GET | `/api/member/fund/campaigns` | admin, manager, member | Danh sách chiến dịch quỹ |
| GET | `/api/member/fund/transactions` | admin, manager, member | Lịch sử giao dịch quỹ |
| GET | `/api/member/fund/campaigns/:id` | admin, manager, member | Chi tiết chiến dịch quỹ |
| POST | `/api/member/fund/report-payment` | admin, manager, member | Báo đã thanh toán/đóng góp |
| GET | `/api/member/fund/stats` | admin, manager, member | Thống kê quỹ |
| POST | `/api/member/fund/income` | admin, manager, member | Thêm khoản thu |
| POST | `/api/member/fund/expense` | admin, manager, member | Thêm khoản chi |

## Genealogy API cấp root

Các route này được khai báo trực tiếp trong `Backend/server.js` ngoài prefix `/api/manager`. Một số endpoint có chức năng trùng với route trong `/api/manager`.

| Method | Endpoint | Quyền | Mô tả ngắn |
|---|---|---|---|
| GET | `/api/clans/:clanId/family-tree` | admin, manager | Lấy cây gia phả theo dòng họ |
| PATCH | `/api/clans/:clanId/family-tree/layout` | admin, manager | Lưu layout cây gia phả theo dòng họ |
| POST | `/api/people` | admin, manager, member | Tạo người trong gia phả |
| PATCH | `/api/people/layout` | admin, manager, member | Lưu layout cây gia phả |
| PATCH | `/api/people/link` | admin, manager, member | Liên kết quan hệ |
| PATCH | `/api/people/:id/position` | admin, manager, member | Cập nhật vị trí người trong cây |
| PATCH | `/api/people/:id` | admin, manager, member | Cập nhật người trong cây |
| DELETE | `/api/people/:id` | admin, manager, member | Xóa người trong cây |
| POST | `/api/families` | admin, manager, member | Tạo family |
| POST | `/api/families/:familyId/children` | admin, manager, member | Thêm con vào family |

## Voice

Prefix: `/api/voice`

Tất cả route trong nhóm này yêu cầu đăng nhập với role `admin`, `manager` hoặc `member`. Riêng `GET /recordings/:id/audio` có thể truyền token qua query `?token=...` nếu không có header Authorization.

| Method | Endpoint | Quyền | Mô tả ngắn |
|---|---|---|---|
| POST | `/api/voice/recordings` | admin, manager, member | Upload bản ghi âm |
| GET | `/api/voice/recordings` | admin, manager, member | Danh sách bản ghi âm |
| GET | `/api/voice/recordings/recipient-options` | admin, manager, member | Danh sách người nhận có thể gửi voice |
| GET | `/api/voice/recordings/:id` | admin, manager, member | Chi tiết bản ghi âm |
| POST | `/api/voice/recordings/:id/send` | admin, manager, member | Gửi bản ghi âm/transcript cho người nhận |
| GET | `/api/voice/recordings/:id/audio` | admin, manager, member | Stream file audio |
| POST | `/api/voice/recording-recipients/process-due` | admin, manager | Xử lý lịch gửi voice đến hạn |
| PATCH | `/api/voice/recordings/:id/transcript` | admin, manager, member | Sửa transcript |
| POST | `/api/voice/recordings/:id/retry` | admin, manager, member | Đưa bản ghi âm về hàng đợi xử lý lại |

## Realtime Socket.IO

Socket server chạy cùng backend chính.

Yêu cầu JWT qua `socket.handshake.auth.token` hoặc header `Authorization: Bearer <token>`.

### Client gửi lên server

| Event | Mô tả ngắn |
|---|---|
| `register_user` | Join room theo account/clan hiện tại |
| `family_tree_join` | Join room realtime cây gia phả |
| `family_tree_leave` | Rời room realtime cây gia phả |
| `person_editing_start` | Báo bắt đầu sửa một người trong cây |
| `person_editing_stop` | Báo dừng sửa một người trong cây |
| `send_task` | Gửi thông báo task mới tới user nhận |

### Server phát xuống client

| Event | Mô tả ngắn |
|---|---|
| `new_notification` | Thông báo realtime |
| `notification` | Thông báo realtime dạng cũ ở một số service |
| `task_assigned` | Task mới được giao |
| `task_status_updated` | Trạng thái task thay đổi |
| `tree_updated` | Cây gia phả thay đổi |
| `family_tree_online_users` | Danh sách người online trong cây gia phả |
| `family_tree_editing_users` | Danh sách người đang sửa cây gia phả |
| `post_feed_updated` | Feed bài viết thay đổi |
| `calendar_updated` | Lịch/sự kiện thay đổi |

## Endpoint frontend đang gọi nhưng chưa thấy route backend tương ứng

Các endpoint dưới đây xuất hiện trong frontend service nhưng không thấy route tương ứng trong các file route backend đã quét. Cần kiểm tra lại trước khi dùng.

| Method | Endpoint | Nơi gọi |
|---|---|---|
| GET | `/api/member/fund/overview` | `Frontend/src/api/memberService.js` |
| POST | `/api/member/fund/contribute` | `Frontend/src/api/memberService.js` |
