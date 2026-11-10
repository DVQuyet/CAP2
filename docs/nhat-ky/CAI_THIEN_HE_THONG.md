# Nhật ký cải thiện hệ thống CAP2

Tổng hợp các thay đổi đã thực hiện theo kế hoạch cải thiện (Giai đoạn 1–4).
Ba commit: `3ebf823` (Giai đoạn 1), `24ec14f` (Giai đoạn 2), `6a476c9` (Giai đoạn 3–4).

## Giai đoạn 1 – Bảo mật và lỗi nghiệp vụ (`3ebf823`)

| Vấn đề | Cách xử lý | File chính |
|---|---|---|
| Token cũ vẫn dùng được tới 24h dù tài khoản bị khóa/đổi quyền | `verifyToken` đối chiếu tài khoản trong DB (cache 30 giây): xóa → 401, rejected/lưu trữ → 403 `ACCOUNT_DISABLED`, role lấy từ DB. Có `invalidateAccountCache` gọi khi đổi role/trạng thái/lưu trữ | `Backend/src/middleware/authMiddleware.js`, `manager/member.controller.js`, `admin/admin.controller.js`, `manager/moderation.controller.js` |
| Webhook thanh toán gửi trùng có thể ghi nhận hai lần; gia hạn làm mất thời gian còn lại | `markPaymentAsPaid` khóa dòng, bỏ qua nếu đã `paid`; mua tiếp cùng gói còn hạn thì cộng dồn từ hạn hiện tại | `payment/payment.controller.js` |
| Quỹ: member gửi `person_id`/`campaign_id`/`event_id` tùy ý, `approvePayment` nhận trạng thái bất kỳ | Member chỉ ghi khoản của chính mình (luôn `pending`); các id phải thuộc đúng dòng họ; `approvePayment` kiểm trạng thái và sự tồn tại | `fund/fund.controller.js` |
| Manager giao việc vào sự kiện của dòng họ khác | `assignTask` kiểm sự kiện thuộc dòng họ của manager (403) | `manager/eventTask.controller.js` |
| Socket `person_editing_start` có thể làm sập tiến trình | try/catch, thêm handler `unhandledRejection` | `Backend/server.js` |
| Thiếu error handler/header bảo mật, body 50mb | Error handler JSON toàn cục, header cơ bản, giới hạn body 2mb (`BODY_LIMIT`), bỏ `console.log` debug | `Backend/server.js`, `payment/payment.routes.js` |

Rà soát phạm vi dòng họ ở các module còn lại (duyệt nội dung, bài viết, bình luận, kỷ niệm, quản lý thành viên, `bulkAssignTasks`): đã đúng, không cần sửa.

Test mới (DB giả): `auth.middleware.test.js`, `payment.markPaid.test.js`, `fund.validation.test.js`, `helpers.mockDb.js`.

## Giai đoạn 2 – Hạ tầng dữ liệu và hiệu năng (`24ec14f`)

- **Migration tập trung:** `npm run migrate` (`Backend/scripts/migrate.js`) chạy mọi hàm `ensure*Schema` một lần, danh sách ở `Backend/src/shared/schema/registry.js`.
  - `DISABLE_RUNTIME_DDL=true`: `config/db.js` bỏ qua `ALTER/CREATE` phát sinh lúc request (ghi cảnh báo một lần mỗi câu).
  - `RUN_MIGRATIONS_ON_START=true`: tự migrate khi khởi động.
  - Mặc định cả hai tắt nên hành vi cũ không đổi.
- **Phân trang keyset** `?limit=&before_id=` cho `/api/member/posts/general`, `/memories`, `/notifications`; trả thêm `has_more`, `next_before_id`. Không truyền tham số thì tối đa 200 bản ghi (thông báo: 50). Helper: `shared/utils/pagination.js`.
- **Nhắc lịch không gửi trùng:** `processDueReminders` giành quyền bằng `UPDATE ... WHERE reminder_sent_at IS NULL`; gửi lỗi toàn bộ thì trả lại để thử lại.
- **Cây gia phả (chatbot):** cạnh anh chị em cùng cha khác mẹ ghép theo nhóm cha/mẹ thay vì mọi cặp O(n²).
- **Pool DB:** `connectionLimit` mặc định 5 → 10.
- Test mới: `schema.registry.test.js`, `pagination.test.js`.

## Giai đoạn 3–4 – Chất lượng và UX (`6a476c9`)

**Lỗi thật do eslint phát hiện**
- `BillingPage.jsx`: `normalizePlanCode` ném `ReferenceError` khi so khớp gói thanh toán → chuyển ra phạm vi module.
- `ManagerLayout.jsx`: `return` sớm trước hook → dời xuống sau các hook.

**Chất lượng**
- Cài eslint, `npm run lint` (0 lỗi; 145 cảnh báo cũ giữ ở mức warn).
- `apiRequest` tự đăng xuất/chuyển trang khi gặp `TOKEN_INVALID`, `ACCOUNT_NOT_FOUND`, `ACCOUNT_DISABLED`; backend bổ sung các mã lỗi tương ứng (kèm `NO_TOKEN`).
- Test frontend (`npm test`, `node:test`): ngày tháng, lịch âm, duyệt tổ tiên/hậu duệ, kiểm tra cây.
- CI: `.github/workflows/ci.yml` (test backend; lint + test + build frontend).

**UX**
- Thay `window.alert` bằng toast không chặn giao diện (`shared/utils/toast.js`).
- Lazy-load Login/Register; fallback tải trang là spinner.
- Tách chunk `vendor-react`, `vendor-i18n`, `vendor-charts` (biểu đồ không còn tải ở trang đầu).

**Dọn dẹp:** bỏ dependencies và lockfile thừa ở root, xóa phần "AI-server" lỗi thời trong `docs/API_LIST.md`, sửa comment VNPAY → SePay, đường dẫn tương đối trong README.

## Rà soát lại sau Giai đoạn 4

Kiểm tra lại các thay đổi và phát hiện thêm:

| Vấn đề | Cách xử lý | File |
|---|---|---|
| Socket.IO tự xác thực token, không kiểm tài khoản bị khóa → tài khoản bị khóa vẫn nhận sự kiện realtime của dòng họ | Từ chối kết nối nếu tài khoản bị khóa/lưu trữ | `Backend/server.js` |
| Media cho admin xem mọi file dựa trên `role_id` trong token → admin đã bị hạ quyền vẫn xem được media mọi dòng họ | Lấy role và trạng thái từ DB | `Backend/src/modules/media/media.routes.js` |
| `handleSepayWebhook` còn ~60 dòng code cũ nằm sau `return` (không bao giờ chạy, dễ gây nhầm khi sửa) | Xóa | `Backend/src/modules/payment/payment.controller.js` |

Hai luồng đầu dùng helper mới `getAccountAccess` (export từ `authMiddleware.js`, dùng chung cache với `verifyToken`). Thêm test tương ứng trong `auth.middleware.test.js`.

## Làm tiếp sau rà soát

- `db.allowDdl(fn)` (AsyncLocalStorage): migrate chỉ mở DDL trong ngữ cảnh của nó. `RUN_MIGRATIONS_ON_START` và `npm run migrate` không còn đổi biến môi trường toàn tiến trình, nên request đến cùng lúc vẫn bị `DISABLE_RUNTIME_DDL` chặn. Có test.
- Webhook SePay không còn trả `error.message` thô cho bên gọi khi lỗi 500 (chỉ ghi log).
- Bảng tin bài viết có nút "Tải thêm" (`GeneralPosts.jsx`, `getGeneralPosts({ beforeId })`, khóa i18n `posts.messages.loadMore`). Khi có cập nhật realtime thì danh sách quay về trang đầu.
- Rà quyền ở `tree.controller.js` (tạo/xóa/di chuyển người, gia đình): đã đi qua `assertTreeMutationPermission` và `assertCanManagePersonId`, không cần sửa.
- `window.confirm` (17 chỗ) giữ nguyên có chủ đích: hộp thoại gốc hoạt động đúng và đổi sang dialog tùy biến cần chuyển nhiều handler sang async mà không có test giao diện.

## Kết quả kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| Backend `npm test` | 42/42 pass |
| Frontend `npm test` | 6/6 pass |
| Frontend `npm run lint` | 0 lỗi, 145 cảnh báo |
| Frontend `vite build` | thành công |

## Việc cần làm trên môi trường thật

1. Chạy `npm run migrate` ở DB dev, xem bước nào báo `✖`, sau đó mới bật `DISABLE_RUNTIME_DDL=true`.
2. Thử một giao dịch gói dịch vụ thật (test thanh toán dùng DB giả, chưa kiểm tra SQL `FOR UPDATE`/`DATE_ADD` trên MySQL).
3. Đăng nhập bằng tài khoản vừa bị khóa để xác nhận frontend chuyển về `/account-disabled`.
4. Câu truy vấn phân trang dùng so sánh row-value `(created_at, id) < (SELECT ...)` của MySQL 8; cần thử trên DB thật.

## Chưa làm

Đã chuyển sang `docs/VIEC_CHUA_LAM.md` (danh sách duy nhất, cập nhật 22/10/2026).
