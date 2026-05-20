# Báo cáo kiểm tra mức độ realtime của hệ thống

Ngày kiểm tra: 2026-05-13

## Tóm tắt nhanh

Hệ thống **có nền tảng realtime ở Backend** thông qua Socket.IO, nhưng **Frontend hiện chưa kết nối Socket.IO** vì không có `socket.io-client` trong `Frontend/package.json` và không thấy đoạn code khởi tạo client socket. Vì vậy phần lớn trải nghiệm realtime của người dùng hiện đang là:

- **Polling định kỳ**: thông báo 15 giây/lần, dashboard member 30 giây/lần, voice transcript 2.5 giây/lần.
- **Cập nhật tức thời sau thao tác của chính người dùng**: gọi API xong thì reload state.
- **Backend phát realtime nhưng client chưa nhận**: một số luồng emit `new_notification`/`notification`, nhưng không có listener ở frontend.

Đánh giá tổng thể: **4/10 cho realtime end-to-end**.

Nếu chỉ tính backend capability: **6/10** vì đã có Socket.IO và một số điểm emit notification.
Nếu tính trải nghiệm người dùng hiện tại: **3/10 đến 4/10** vì frontend chủ yếu vẫn poll/fetch.

## Bảng đánh giá theo module

| Module / Luồng | Cơ chế hiện tại | Mức realtime | Nhận xét |
|---|---|---:|---|
| Notification Bell | Polling `/api/member/notifications` mỗi 15 giây | Trung bình thấp | Có độ trễ tối đa khoảng 15 giây, không dùng socket ở frontend. |
| Member Dashboard | Polling `loadDashboard(true)` mỗi 30 giây | Thấp | Dashboard có thể trễ tới 30 giây nếu dữ liệu thay đổi từ người khác. |
| Giao việc / hoàn thành việc | Backend có emit socket notification | Chưa hoàn chỉnh | Backend phát event, frontend chưa có socket listener nên người dùng không nhận realtime thật. |
| Sự kiện dòng họ | Backend tạo notification/email nền, có emit `notification` | Chưa hoàn chỉnh | Event name không đồng nhất: có nơi emit `notification`, nơi emit `new_notification`; frontend chưa lắng nghe cả hai. |
| Quỹ / chiến dịch thu | Backend emit `new_notification` khi tạo campaign | Chưa hoàn chỉnh | Luồng tạo campaign có emit, nhưng báo cáo thanh toán cho manager chỉ insert DB notification, không emit. |
| Voice recording transcript | Frontend poll recording mỗi 2.5 giây; worker poll DB mỗi 3 giây | Gần realtime | Đây là polling khá nhanh, phù hợp cho job xử lý nền. Không phải realtime push. |
| Voice scheduled delivery | Backend job kiểm tra mỗi 60 giây mặc định, emit nếu đến hạn | Trung bình | Có thể trễ khoảng 60 giây. Nhưng emit vẫn không tới UI nếu frontend không kết nối socket. |
| AI Chat | Request/response HTTP | Không realtime streaming | Không có streaming token, WebSocket, SSE. |
| Gia phả / Family Tree | API fetch/update thủ công, sessionStorage cho quyền sửa | Không realtime | Nếu nhiều người cùng sửa, không có đồng bộ live hoặc conflict broadcast. |
| Bài viết / like / comment | API fetch/update thủ công | Không realtime | Người dùng khác không thấy like/comment mới nếu không reload/refetch. |
| Admin / Manager dashboards | Chủ yếu fetch khi mở/truy cập | Không realtime | Không thấy polling/socket cho dashboard admin/manager. |
| Calendar reminders | Scheduler backend + DB notification/email | Bán realtime | Có tác vụ nền nhưng UI phụ thuộc polling hoặc reload. |

## Bằng chứng chính trong code

### Backend có Socket.IO

File `Backend/server.js`:

- Import `Server` từ `socket.io`.
- Tạo HTTP server và Socket.IO server.
- Lưu `app.locals.io` và `app.locals.onlineUsers`.
- Lắng nghe `register_user`.
- Emit `new_notification` trong luồng `send_task`.

Điều này cho thấy backend đã được chuẩn bị để phát thông báo realtime.

### Frontend chưa có socket client

File `Frontend/package.json` không có dependency `socket.io-client`.

Trong `Frontend/src` không thấy code:

- `import io from "socket.io-client"`
- `new WebSocket(...)`
- `EventSource(...)`
- listener cho `new_notification` hoặc `notification`

Vì vậy các emit từ backend hiện không tạo thay đổi tức thời trên UI.

### NotificationBell đang polling

File `Frontend/src/components/layouts/NotificationBell.jsx`:

- Gọi `apiRequest("/api/member/notifications")`.
- Dùng `window.setInterval(loadNotifications, 15000)`.

Kết luận: thông báo ở chuông notification là polling 15 giây/lần.

### MemberDashboard đang polling

File `Frontend/src/pages/Member/MemberDashboard.jsx`:

- Gọi `loadDashboard()`.
- Dùng `window.setInterval(() => loadDashboard(true), 30000)`.

Kết luận: dashboard member được làm mới mỗi 30 giây.

### Voice transcript là polling nhanh

File `Frontend/src/voice/VoiceRecorder.jsx`:

- Sau khi upload recording, frontend gọi `getVoiceRecording(recordingId)` lặp tối đa 60 lần.
- Mỗi lần cách nhau `2500ms`.

File `voice/worker.py`:

- Worker poll DB theo `VOICE_WORKER_POLL_SECONDS`, mặc định `3`.
- Claim recording có status `uploaded`, xử lý transcript, update DB sang `completed`.

Kết luận: voice transcript là mô hình job queue + polling, gần realtime nhưng không phải push realtime.

### Backend phát notification ở nhiều nơi

Các điểm có emit:

- `Backend/src/services/manager/taskService.js`: emit `new_notification` khi giao việc.
- `Backend/src/controllers/memberController.js`: emit `new_notification` khi member hoàn thành việc để báo manager.
- `Backend/src/controllers/fundController.js`: emit `new_notification` khi tạo campaign.
- `voice/backendRoutes.js`: emit `new_notification` khi gửi voice recording.
- `Backend/src/services/manager/eventService.js` và `Backend/src/controllers/managerController/eventTaskController.js`: emit `notification`.

Rủi ro: event name đang không đồng nhất giữa `new_notification` và `notification`.

## Các vấn đề làm realtime chưa hoạt động trọn vẹn

### 1. Thiếu kết nối socket ở frontend

Đây là vấn đề lớn nhất. Backend có phát event nhưng frontend không đăng ký user qua socket, nên `onlineUsers` gần như không có dữ liệu từ browser thật.

Tác động:

- Notification realtime không hiện ngay.
- Người dùng vẫn phải chờ polling hoặc reload.
- Các luồng emit trong backend bị giảm giá trị.

### 2. Cách map user online chưa thống nhất

`Backend/server.js` lưu:

```js
app.locals.onlineUsers[userId] = socket.id;
```

Một số nơi emit theo `onlineUsers[receiverAccountId]`.
Một số nơi lại emit room:

```js
io.to(`account_${member.account_id}`).emit(...)
```

Nhưng trong `server.js` chưa thấy socket `join("account_<id>")`.

Tác động:

- Các emit theo `onlineUsers[id]` có thể hoạt động nếu frontend register đúng account id.
- Các emit theo room `account_<id>` hiện có nguy cơ không tới đâu vì socket chưa join room.

### 3. Event name không đồng nhất

Backend dùng cả:

- `new_notification`
- `notification`

Nếu frontend sau này chỉ lắng nghe một event, một số luồng vẫn bị bỏ sót.

### 4. Polling đang rải rác ở nhiều component

Hiện có polling ở notification, dashboard, voice recorder. Polling dễ triển khai nhưng:

- Tốn request định kỳ.
- Có độ trễ.
- Mỗi component tự quản lý refresh nên khó đồng bộ.

### 5. Không có realtime cho dữ liệu cộng tác

Family tree, task board, comments/likes/posts, fund dashboard chưa có broadcast cập nhật dữ liệu. Khi người A sửa, người B chỉ thấy sau reload hoặc polling.

## Đánh giá chi tiết theo loại realtime

### Realtime push

Hiện trạng: **có ở backend, chưa hoàn chỉnh ở frontend**.

Các luồng phù hợp để push:

- Notification mới.
- Task assigned.
- Task completed.
- Event created.
- Campaign created.
- Voice recording sent.
- Payment report submitted.

Mức đạt: **2/10 end-to-end**, **6/10 backend-only**.

### Near realtime bằng polling

Hiện trạng: **đang dùng thật trên UI**.

Các chu kỳ đã thấy:

- Notification bell: 15 giây.
- Member dashboard: 30 giây.
- Voice transcript: 2.5 giây.
- Voice worker: 3 giây.
- Voice scheduled delivery: 60 giây mặc định.

Mức đạt: **6/10** cho những luồng có polling.

### Streaming realtime

Hiện trạng: **chưa có**.

Không thấy:

- SSE.
- WebSocket stream cho AI.
- Token streaming cho chat.
- Live progress stream cho voice transcription.

Mức đạt: **0/10**.

### Realtime collaboration

Hiện trạng: **chưa có**.

Không thấy:

- Presence.
- Lock live giữa nhiều người sửa.
- Broadcast thay đổi node gia phả.
- Conflict detection realtime.

Mức đạt: **1/10**.

## Khuyến nghị nâng cấp

### Ưu tiên 1: Hoàn thiện socket notification end-to-end

Việc nên làm:

- Cài `socket.io-client` cho frontend.
- Tạo `Frontend/src/services/socket.js`.
- Sau khi login hoặc mount layout, connect socket với token/account id.
- Backend xác thực socket bằng JWT thay vì tin vào `register_user` client gửi tự do.
- Khi socket connect, join room `account_<accountId>`.
- Chuẩn hóa emit một event duy nhất, ví dụ `notification:new`.
- Khi nhận event, frontend update badge và list notification ngay, rồi có thể fallback polling thưa hơn.

Mức realtime sau khi làm: notification có thể lên **8/10**.

### Ưu tiên 2: Chuẩn hóa API emit notification

Hiện notification được insert/emit rải rác. Nên tạo một helper duy nhất, ví dụ:

```js
createAndEmitNotification(req, {
  receiverAccountId,
  receiverPersonId,
  type,
  title,
  message,
  linkUrl,
  payload,
});
```

Helper này sẽ:

- Insert DB.
- Emit `notification:new` vào room `account_<id>`.
- Trả về notification vừa tạo.

Lợi ích:

- Không còn lệch event name.
- Không quên emit ở các luồng như payment report.
- Frontend nhận cùng một payload.

### Ưu tiên 3: Giảm polling sau khi có socket

Sau khi socket hoạt động:

- NotificationBell có thể bỏ polling 15 giây hoặc tăng lên 60-120 giây làm fallback.
- MemberDashboard có thể chỉ refetch khi nhận event liên quan: task, notification, fund, event.
- Voice transcript vẫn có thể giữ polling 2.5 giây vì đây là job nền, hoặc nâng cấp sau.

### Ưu tiên 4: Thêm realtime cho các màn hình cần cộng tác

Các module nên cân nhắc:

- Family tree: broadcast `family-tree:updated` theo `clan_<id>`.
- Task management: broadcast `task:assigned`, `task:updated`, `task:completed`.
- Posts: broadcast `post:created`, `post:commented`, `post:liked`.
- Fund: broadcast `fund:transaction-created`, `fund:payment-reported`, `fund:campaign-updated`.

Không nhất thiết phải live-sync toàn bộ dữ liệu ngay. Có thể chỉ emit event “có thay đổi”, frontend refetch danh sách liên quan.

### Ưu tiên 5: AI chat streaming nếu cần cảm giác realtime

Nếu muốn AI chat phản hồi mượt hơn:

- Dùng SSE hoặc fetch streaming từ backend.
- Backend proxy stream từ AI-server.
- Frontend render token dần.

Mức ưu tiên thấp hơn notification/task vì hiện AI chat vẫn dùng được theo request/response.

## Đề xuất roadmap ngắn

### Giai đoạn 1: Notification realtime thật

Mục tiêu:

- Frontend connect socket thành công.
- Backend join room theo account id.
- Notification mới hiện ngay không cần đợi 15 giây.

Phạm vi:

- `Backend/server.js`
- `Backend/src/utils/notifications.js`
- Các nơi đang emit notification
- `Frontend/package.json`
- `Frontend/src/services/socket.js`
- `Frontend/src/components/layouts/NotificationBell.jsx`
- Layout member/manager/admin nếu cần khởi tạo socket global.

### Giai đoạn 2: Realtime refresh theo domain

Mục tiêu:

- Task/event/fund/post phát event domain.
- Frontend refetch đúng màn hình khi đang mở.

Ví dụ:

- `task:assigned`
- `task:completed`
- `event:created`
- `fund:campaign-created`
- `post:comment-created`

### Giai đoạn 3: Collaboration gia phả

Mục tiêu:

- Khi một người sửa cây gia phả, các client cùng clan nhận event.
- UI cảnh báo “dữ liệu đã thay đổi” hoặc tự refetch.
- Sau đó mới tính đến live cursor/presence/conflict merge nếu thật sự cần.

## Kết luận

Hệ thống hiện **chưa phải realtime end-to-end**. Backend đã có nền Socket.IO và một số luồng notification realtime, nhưng frontend chưa kết nối để nhận event nên trải nghiệm thực tế vẫn chủ yếu là polling.

Mức độ realtime hiện tại:

- **Notification**: gần realtime qua polling, chưa push realtime.
- **Voice transcript**: gần realtime qua polling nhanh.
- **Task/Event/Fund**: backend có nỗ lực push nhưng chưa hoàn chỉnh end-to-end.
- **AI/Post/Gia phả/Admin dashboards**: chưa realtime.

Việc có tác động lớn nhất là **hoàn thiện Socket.IO client + chuẩn hóa notification event**. Đây là nâng cấp nhỏ hơn nhiều so với live-collaboration đầy đủ nhưng sẽ làm hệ thống “có cảm giác realtime” rõ rệt ngay.
