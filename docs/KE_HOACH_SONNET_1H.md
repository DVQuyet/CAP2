# Kế hoạch 1 giờ cho Sonnet — Bảo mật + Giao diện

Lập ngày 29/10/2026 (Opus), quét mã ở commit `2eee2d9`. Không trùng với `docs/VIEC_CHUA_LAM.md`
(các mục ở đó đã xong hoặc cần quyền Render/Aiven). Làm **theo thứ tự**, mỗi task một commit; hết giờ thì dừng ở task đang dở cho trọn.

## Luật chung (đọc trước khi làm)

- **Không chạm DB thật.** `Backend/.env` trỏ vào DB production. Không chạy `npm start`, `npm run migrate`, script trong `Backend/scripts/`. Chỉ chạy test (đã chặn DB thật qua `tests/setup.env.js`).
- **Không push**, không sửa `.env`, không đổi API (request/response giữ nguyên).
- Cần thêm cột DB → chỉ thêm vào hàm `ensure*Schema` + file migration trong `database/migrations/`, không tự chạy.
- Trước mỗi commit: `cd Backend && npm test` và `cd Frontend && npm test && npx eslint src && npx vite build` (0 lỗi; lint đang 148 warning — không được tăng).
- Viết comment/commit message giống style repo (tiếng Việt ngắn gọn, có dấu).
- Cuối buổi: thêm một mục "Đợt 5 (29/10)" vào `docs/VIEC_CHUA_LAM.md` ghi việc đã xong + việc còn dở.

---

## A. Bảo mật (≈35 phút) — làm trước

### A1. Vá dependency có lỗ hổng (S, ~10')
`npm audit --omit=dev` ở Backend: 11 lỗ hổng (1 critical `proxy-addr`, high: `body-parser`, `engine.io`, `multer`, `mysql2`, `nodemailer`, `socket.io-parser`, `ws`, `qs`). Frontend: 6.
- Chạy `npm audit fix` (KHÔNG `--force`) ở `Backend/` và `Frontend/`. Nếu `nodemailer` cần major mới thì cập nhật riêng và đọc changelog; API `createTransport/sendMail` dùng ở `Backend/src/shared/utils/` phải còn chạy.
- `xlsx` không có bản vá: chỉ dùng để **ghi** file ở `fund.controller.js:948` (lỗi nằm ở phần đọc file) → giữ nguyên, ghi chú lý do trong `VIEC_CHUA_LAM.md`.
- Xong khi: test + build pass, `npm audit` chỉ còn `xlsx`.

### A2. Đổi/đặt lại mật khẩu phải vô hiệu token cũ (M, ~15')
Hiện JWT sống 24h và `verifyToken` (`Backend/src/middleware/authMiddleware.js`, `loadAccountState`) không biết mật khẩu đã đổi → ai lấy được token vẫn dùng tiếp sau khi chủ tài khoản đổi mật khẩu.
- Thêm cột `accounts.password_changed_at DATETIME NULL` (hàm ensure schema phù hợp + file `database/migrations/2026_10_29_accounts_password_changed_at.sql`). Thiếu cột thì code phải chạy như cũ (bắt lỗi `ER_BAD_FIELD_ERROR`, giống cách repo làm với cột mới khác).
- `member.controller.js:1121 changePassword` và `auth.controller.js:365 resetPasswordWithCode`: cập nhật `password_changed_at = NOW()` cùng câu UPDATE mật khẩu, rồi gọi `invalidateAccountCache(accountId)`.
- `loadAccountState`: SELECT thêm cột; `verifyToken` từ chối token có `iat * 1000 < password_changed_at` với 401 `code: 'TOKEN_INVALID'` (frontend đã tự đăng xuất với mã này). `getAccountAccess` (socket) cũng áp dụng.
- `changePassword` trả về token mới để người đang đổi không bị đăng xuất (frontend lưu qua `shared/utils/auth.js`). Kiểm tra màn đổi mật khẩu ở frontend có nhận token mới.
- Test trong `tests/auth.middleware.test.js`: token cấp trước khi đổi mật khẩu → 401; token cấp sau → qua.

### A3. Excel export chống formula injection (S, ~5')
`fund.controller.js:~948` xuất tên người đóng/ghi chú do member nhập. Giá trị bắt đầu bằng `= + - @ \t \r` sẽ chạy như công thức khi mở bằng Excel.
- Viết `sanitizeSpreadsheetCell(value)` trong `Backend/src/shared/utils/` (chuỗi bắt đầu bằng các ký tự trên → thêm tiền tố `'`), áp dụng cho mọi cột chuỗi trước `json_to_sheet`. Số giữ nguyên kiểu số.
- Test đơn vị nhỏ cho hàm này.

### A4. Header `Content-Disposition` không làm hỏng request (S, ~5')
`media.routes.js:83` đưa `original_filename` thẳng vào header. Tên file tiếng Việt có dấu → `setHeader` ném `ERR_INVALID_CHAR` → 500, ảnh không tải được.
- Dùng dạng `inline; filename="<ascii fallback>"; filename*=UTF-8''<encodeURIComponent(name)>`, bỏ ký tự điều khiển, `"`, `\`.
- Test: tên `"Ảnh giỗ cụ.jpg"` không ném lỗi.

### (Nếu còn thời gian) A5. Validate route calendar
`calendar.routes.js:7-9` (tạo/sửa/xóa sự kiện) chưa có schema, trong khi mọi route ghi khác đã có. Thêm schema vào `Backend/src/shared/validation/schemas.js` theo mẫu sẵn có (đọc `calendar.controller.js createEvent/updateEvent` để biết field, kể cả `person_id`, `repeat_yearly`). Chạy `tests/calendar.personEvents.test.js` + `tests/validation.test.js`.

---

## B. Giao diện (≈25 phút)

### B1. Bỏ `dangerouslySetInnerHTML` cho chuỗi i18n (S, ~8')
`i18n.js:20` đặt `escapeValue: false`, nên HTML trong bản dịch được chèn thẳng — rủi ro XSS nếu sau này nội suy dữ liệu người dùng.
- `features/manager/pages/AccountPage.jsx:1028`, `features/manager/pages/ManagerDashboard.jsx:196`: đổi sang `<Trans i18nKey=... values=... components={{ strong: <strong /> }} />` của `react-i18next`; sửa key tương ứng trong `vi.json`/`en.json` dùng `<strong>` → `<0>` hoặc tên component. `tests/localeParity.test.js` phải pass.
- `<style dangerouslySetInnerHTML>` ở `FundAnalytics.jsx:112`, `ClanFundPage.jsx:1574`: chuyển CSS sang file `.css` cạnh component (CSS tĩnh, chỉ là dọn dẹp).

### B2. Focus bàn phím rõ ràng (S, ~7')
Cả app chỉ có 6 chỗ `:focus-visible`. Thêm vào `Frontend/src/index.css` một quy tắc chung:
`:where(button, a, input, select, textarea, [tabindex]):focus-visible { outline: 2px solid <màu chủ đạo>; outline-offset: 2px; }`
và gỡ các `outline: none` không kèm thay thế (`grep -rn "outline: *none\|outline: *0" src`). Không đổi giao diện khi bấm chuột (chỉ `:focus-visible`).

### B3. Sót i18n ở bảng sự kiện (S, ~5')
`TaskManagementPage.jsx` ~dòng 1599: tiêu đề cột còn viết cứng tiếng Việt → đưa vào `vi.json`/`en.json`.

### B4. Giảm cảnh báo ESLint (S, phần thời gian còn lại)
148 warning. Chỉ sửa loại an toàn: biến/import không dùng, `catch (e)` không dùng `e`. **Không** sửa `react-hooks/exhaustive-deps` (dễ đổi hành vi). Ghi số warning mới vào `VIEC_CHUA_LAM.md`.

---

## Không làm trong buổi này (ghi lại để sau)

- **Token trong URL**: OAuth callback (`socialAuth.service.js:441` đặt `?token=` lên `/auth/callback`) và media `?token=` (`shared/utils/media.js:17`, `media.routes.js:12`) → token lọt vào lịch sử trình duyệt/log. Sửa đúng cần đổi sang mã trao đổi một lần (OAuth) và khóa `?k=` theo file (media) — chạm cả FE/BE + luồng đăng nhập, cần test trên trình duyệt thật. Mục **M**, nên để Opus lên kế hoạch riêng.
- **JWT trong `localStorage`** (`shared/utils/auth.js:30`) thay vì cookie httpOnly: thay đổi kiến trúc lớn (CORS credentials, CSRF, socket). **L**.
- **Content-Security-Policy**: frontend ở Vercel → thêm header trong `vercel.json`; cần thử trên bản deploy preview vì dễ chặn font/socket/ảnh. **S** nhưng phải QA thật.
- **Hệ màu**: CSS có ~900 mã màu hex khác nhau, chưa có dark mode. Gom về biến `:root` là việc **L**, làm theo từng trang sau.
- Ảnh đại diện thật khi xuất cây; QA trên trình duyệt thật 390/1280px (cần người đăng nhập).
