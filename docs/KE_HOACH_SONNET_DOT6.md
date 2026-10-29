# Kế hoạch đợt 6 cho Sonnet: test trên DB thật, bảo mật, AI, tính năng mới, giao diện (~7 giờ)

Opus lập ngày 29/10/2026, sau đợt 5 (commit `f0214e7`, đã push). Kế hoạch này làm nhiều gấp khoảng 5 lần
`KE_HOACH_SONNET_1H.md`. Nguồn việc là các mục "Còn mở" và "Không làm trong buổi này" ở `VIEC_CHUA_LAM.md` và `KE_HOACH_SONNET_1H.md`.

Khác với đợt trước: **người dùng đã xác nhận DB Aiven trong `Backend/.env` chỉ là dữ liệu test** và cho phép chạy trên đó.
Vì vậy đợt này viết được test tích hợp trên MySQL thật, và QA được trên trình duyệt bằng tài khoản tạm.

---

## 0. Luật chung (đọc kỹ trước khi làm)

### Được phép
- Chạy backend local (`Backend/`, `node server.js`) và frontend dev (`Frontend/`, `npm run dev`) trỏ vào DB test.
- Tạo dữ liệu **tạm** trên DB, nhưng chỉ khi có dấu nhận biết: email `itest_<...>@example.test`, tên dòng họ bắt đầu bằng `ITEST_`,
  `display_name` bắt đầu bằng `ITEST_`. Dữ liệu tạm phải bị xóa ở cuối mỗi test (`finally`/`after`).
- Chạy `npm run migrate` khi task cần thêm cột hoặc bảng. Các bước migrate phải idempotent, viết theo mẫu `ensure*Schema`
  và có file SQL trong `database/migrations/`.
- Dùng Chrome (`mcp__claude-in-chrome__*`) trên `http://localhost:5173` để QA.

### Không được phép
- Sửa hoặc xóa dữ liệu **không** mang dấu `itest_`/`ITEST_`. Không `UPDATE`/`DELETE` thiếu `WHERE` theo id tạm.
  Không `DROP`, không `TRUNCATE`.
- Đăng nhập trình duyệt bằng tài khoản thật của người dùng, hay gõ mật khẩu thật. Chỉ dùng tài khoản tạm do test tạo.
- Sửa `.env`, đổi biến môi trường trên Render/Vercel, **push**. Cuối buổi báo cáo, người dùng sẽ tự quyết việc push.
- Đổi hình dạng API đang có (tên trường, mã lỗi) ngoài những chỗ task ghi rõ.
- Đổi cấu hình ESLint để giấu cảnh báo.

### Quy trình cho mỗi task
1. Đọc phần "Hiện trạng" và mở đúng các file được nêu. **Số dòng có thể đã lệch**, nên tìm theo tên hàm.
2. Làm theo phần "Cách làm". Thấy cách làm sai so với code thật thì chọn cách đúng và ghi lý do vào commit message.
3. Viết test theo phần "Test". Chạy **toàn bộ** kiểm tra:
   ```
   cd Backend  && npm test
   cd Frontend && npm test && npx eslint src && npx vite build
   cd Backend  && npm run test:integration     # khi đã có bộ tích hợp (task 1.1)
   ```
   Kết quả bắt buộc: 0 test fail, 0 lỗi ESLint, số cảnh báo ESLint **không tăng** so với lúc bắt đầu task (đầu đợt là 139), build thành công.
4. Kiểm tra từng ý ở phần "Đạt khi". Thiếu ý nào thì task chưa xong.
5. Mỗi task một commit. Message tiếng Việt có dấu, theo style repo (`Phạm vi: việc đã làm`), kết thúc bằng dòng
   attribution mà hệ thống yêu cầu.

### Khi nào dừng lại và hỏi người dùng
- Một task cần đổi hành vi mà người dùng thấy được, ngoài những gì task mô tả (ví dụ: bắt đăng xuất hàng loạt, đổi luồng đăng nhập Google).
- Phát hiện lỗ hổng mới nghiêm trọng (đọc/ghi được dữ liệu của dòng họ khác). Ghi lại, viết test tái hiện, **dừng và báo** trước khi sửa,
  trừ khi cách sửa nhỏ và hiển nhiên.
- Công cụ Chrome lỗi 2–3 lần liên tiếp. Khi đó bỏ phần QA trình duyệt của task, ghi "chưa QA" và làm tiếp.

### Thứ tự và thời gian
Làm theo thứ tự giai đoạn. Task đánh dấu **(tùy chọn)** chỉ làm khi đã xong mọi task bắt buộc. Hết thời gian thì làm trọn task đang dở,
bỏ các task sau, rồi làm Giai đoạn 5 (tổng kết).
Thiếu thời gian thì giữ thứ tự ưu tiên sau, bỏ từ cuối danh sách lên:
**1.1–1.3 → 2.1–2.3 → A.1 → F.1–F.3 → 2.4–2.5 → A.3 → 3.1 → A.2 → 1.4 → 3.2–3.4 → 4**.

| Giai đoạn | Nội dung | Thời gian |
|---|---|---|
| 0 | Chuẩn bị, đo mốc | 10' |
| 1 | Bộ test tích hợp trên DB test | 70' |
| 2 | Bảo mật | 120' |
| A | Trợ lý AI: chặn bịa, đo bằng LLM thật, sửa câu chưa hiểu | 60' |
| F | Tính năng mới: AI soạn tiểu sử / lời tưởng niệm | 75' |
| 3 | Giao diện + QA trình duyệt | 80' |
| 4 | Báo cáo chất lượng dữ liệu | 15' |
| 5 | Tổng kết, cập nhật docs | 15' |

---

## Giai đoạn 0: Chuẩn bị (10')

1. `git status` phải sạch, trừ 3 file chưa theo dõi có sẵn: `ONBOARDING.md`, `scratch_patch.py`, `docs/report/QA_2026-10-23.md`.
   **Không** commit 3 file đó. `git log -1` phải là `f0214e7` hoặc mới hơn.
2. Chạy bộ kiểm tra đầy đủ và ghi mốc vào ghi chú cá nhân. Mốc lúc lập kế hoạch: backend 167 pass, frontend 53 pass, ESLint 0 lỗi / 139 cảnh báo.
3. Thử khởi động backend: `cd Backend && PORT=3000 node server.js` (chạy nền), rồi `curl localhost:3000/api/health`.
   Thử `cd Frontend && npm run dev`. Ở chế độ dev, frontend tự gọi `http://localhost:3000` (`services/api.js`).
   Thử xong thì tắt cả hai.

---

## Giai đoạn 1: Bộ test tích hợp trên DB test (70')

Mục tiêu: có lệnh `npm run test:integration` kiểm chứng các luồng quan trọng trên MySQL thật. Lệnh này xử lý luôn
P0.4 và P3.5 trong `VIEC_CHUA_LAM.md`. Đây là nền cho mọi task sau, nên phải làm trước.

### 1.1 Khung test tích hợp (25')

**Hiện trạng:** `server.js` gọi `server.listen` ngay khi được nạp và không export `app`. Test đơn vị chặn DB thật qua `tests/setup.env.js`.
Ở đợt 5, phép thử tay dùng một script tạm: INSERT tài khoản có `status='active'`, gọi API qua `fetch`, xóa trong `finally`. Đã chạy được.

**Cách làm:**
- Tạo thư mục `Backend/tests-integration/`. Thư mục này **không** nằm trong glob `tests/*.test.js`, nên `npm test` và CI không chạy nó.
- Thêm script `"test:integration": "node --test --test-concurrency=1 \"tests-integration/*.test.js\""` vào `Backend/package.json`.
- `tests-integration/helpers/server.js`: chạy `node server.js` thành tiến trình con với `PORT` ngẫu nhiên (31000–39000). Chờ tới khi
  `/api/health` trả 200 (tối đa 30 giây). Export `baseUrl` và `stop()`. Không dùng `require('../../server')`, vì cách đó listen cổng cố định
  và chạy cả bộ nhắc lịch.
- `tests-integration/helpers/fixtures.js` (dùng `src/config/db` trực tiếp):
  - `createTempClan()`: tạo `clans` với `clan_name = 'ITEST_<timestamp>'`.
  - `createTempAccount({ role: 'member'|'manager'|'admin', clanId, status = 'active', password })`: tạo `people` (`display_name = 'ITEST_...'`,
    thuộc `clanId`), `accounts` (`email = itest_<rand>@example.test`, bcrypt), và `account_clans` khi có `clanId`.
    Trả về `{ id, personId, email, password }`.
    Trước khi viết, đọc `auth.controller.js` (đăng ký, đăng nhập) để biết đăng nhập cần những gì. Ví dụ `profile_completed`, hoặc gói dịch vụ
    của dòng họ: xem `billing.service` nếu route manager chặn khi dòng họ chưa có gói.
  - `login(baseUrl, email, password)` trả token. `api(baseUrl, method, path, { token, body })` trả `{ status, data }`.
  - `cleanupAll()`: xóa mọi dữ liệu có dấu tạm, theo thứ tự phụ thuộc khóa ngoại. Lấy id tạm trước bằng `SELECT id FROM accounts
    WHERE email LIKE 'itest\\_%@example.test'` và `SELECT id FROM clans WHERE clan_name LIKE 'ITEST\\_%'`. Sau đó xóa các bảng con
    **chỉ theo các id đó** (`account_clans`, `notifications`, `posts`, `calendar_events`, `media_files`, `people`...). Bảng nào có khóa ngoại
    thì tra `database/schema/defaultdb.sql`.
- `Backend/scripts/itest-cleanup.js`: gọi `cleanupAll()` và in số dòng đã xóa ở từng bảng. Dùng để dọn khi test chết giữa chừng.
- Bảo vệ: helper tự kiểm tra `process.env.RUN_DB_TESTS === '1'` và thoát kèm thông báo nếu thiếu. Script npm đặt sẵn biến này bằng
  `cross-env`, hoặc nếu muốn tránh thêm dependency thì viết `tests-integration/run.js` tự đặt biến rồi gọi `node --test`.

**Test:** `tests-integration/smoke.test.js` khởi động server, tạo member tạm, đăng nhập, gọi `GET /api/member/notifications` (200), rồi dọn dẹp.

**Đạt khi:**
- `npm run test:integration` pass. Sau khi chạy, `SELECT COUNT(*) FROM accounts WHERE email LIKE 'itest\_%'` trả 0.
- Thiếu `RUN_DB_TESTS` thì không chạm DB.
- `npm test` vẫn chạy đúng số test cũ và không khởi động server.

### 1.2 Test tích hợp luồng xác thực (15')

File `tests-integration/auth.test.js`. Chép lại và mở rộng phép thử tay của đợt 5:
1. Đăng nhập 200 và có token. Sai mật khẩu thì 401.
2. Đổi mật khẩu khi nhập sai mật khẩu hiện tại thì **400**. Đổi đúng thì 200 và có `token` mới.
3. Sau khi đổi: token cũ bị 401 `TOKEN_INVALID`, token mới 200. Mật khẩu cũ đăng nhập bị 401, mật khẩu mới 200.
   Chú ý: chờ ≥ 1,1 giây giữa lúc đăng nhập và lúc đổi, vì `iat` tính bằng giây.
4. Đặt lại mật khẩu bằng mã: INSERT trực tiếp vào `password_reset_tokens` với `code_hash = bcrypt('123456')`, `expires_at` = 10 phút sau,
  rồi gọi `POST /api/auth/reset-password`. Kết quả: token cũ bị thu hồi, mật khẩu mới đăng nhập được. Xem `ensurePasswordResetTokensTable`
  để biết đủ cột.
5. Tài khoản bị khóa (`status='rejected'`): `verifyToken` trả 403 `ACCOUNT_DISABLED`. Cache có TTL 30 giây, nên có 2 cách: chạy server con với
  `AUTH_ACCOUNT_CACHE_TTL_MS=0`, hoặc khóa tài khoản trước lần gọi API đầu tiên.

**Đạt khi:** cả 5 kịch bản pass trên DB thật.

### 1.3 Test cô lập giữa các dòng họ (IDOR) (20')

**Mục tiêu:** chứng minh người của dòng họ A không đọc hay ghi được dữ liệu của dòng họ B. Đây là rủi ro bảo mật lớn nhất của một app nhiều dòng họ.

**Cách làm:** tạo `clanA` và `clanB`, mỗi bên một manager và một member. Tạo dữ liệu ở B: một người trên cây, một bài viết, một lịch,
một khoản quỹ, một media (gọi `POST /api/upload` bằng token manager B với một PNG 1x1). Dùng token của A để thử:

| Hành động bằng token của A | Kỳ vọng |
|---|---|
| Sửa/xóa người của B trên cây (route trong `genealogy`/`tree`, tìm trong `*.routes.js`) | 403 hoặc 404, dữ liệu B không đổi (kiểm bằng SELECT) |
| Sửa/xóa lịch của B (`PUT/DELETE /api/calendar/events/:id`) | 404 |
| Duyệt/sửa khoản quỹ của B | 403/404 |
| Bình luận/sửa bài viết của B | 403/404 |
| Tải media của B qua `/api/media/:id` **không có** `?k=` | 404 |
| Mời/đổi vai trò tài khoản của B | 403/404 |

Mỗi dòng là một `test()` riêng và luôn kiểm cả trạng thái DB sau đó, không chỉ mã HTTP.

**Nếu một dòng FAIL** thì đó là lỗ hổng thật. Giữ test (đánh dấu `test.todo` kèm mô tả), ghi vào báo cáo cuối buổi, **dừng và báo người dùng**.
Ngoại lệ: cách sửa chỉ là thêm điều kiện `clan_id = ?` vào một câu truy vấn. Khi đó sửa luôn trong commit riêng có tiền tố `Bảo mật:`.

**Đạt khi:** mọi dòng trong bảng có test, và mọi test pass (hoặc là `todo` đã báo).

### 1.4 Truy vấn chỉ chạy được trên MySQL thật (10')

P0.4 trong `VIEC_CHUA_LAM.md`. Hai truy vấn dưới đây trước giờ chỉ được test trên DB giả.
1. **Phân trang row-value** `(created_at, id) < (...)`: tạo 5 bài viết hoặc thông báo tạm, gọi `?limit=2` rồi `before_id=<next_before_id>`
   cho tới hết. Kiểm tra: không trùng, không sót, và `has_more` đúng ở trang cuối. Xem `shared/utils/pagination.js` và các route có `before_id`.
2. **Thanh toán (tùy chọn):** `markPaymentAsPaid` (`payment.controller.js`) dùng `FOR UPDATE` và `DATE_ADD`. Gọi thẳng hàm (require trong
   tiến trình test) với một `payments` tạm của clan tạm, **gọi hai lần**. Kỳ vọng: lần hai bỏ qua, và hạn gói chỉ cộng một lần.
   Bảng `plans`/`subscriptions` phải có dữ liệu mẫu; thiếu dữ liệu thì bỏ phần này và ghi chú.

**Commit cho Giai đoạn 1:** 1.1+1.2 chung một commit, 1.3 một commit, 1.4 một commit.

---

## Giai đoạn 2: Bảo mật (120')

### 2.1 Không còn JWT trên URL khi đăng nhập Google/Facebook (30')

**Hiện trạng:** `socialAuth.service.js` → `buildOAuthRedirectUrl` đặt `?token=<JWT 24h>` lên `/auth/callback`. Token khi đó nằm trong
lịch sử trình duyệt, log của Vercel và header `Referer`. `AuthCallback.jsx` đọc `searchParams.get("token")`.

**Cách làm:**
- Backend: tạo `src/modules/auth/oauthCodeStore.js`, một Map trong bộ nhớ `code -> { token, expiresAt }`.
  Mã là `crypto.randomBytes(32).toString('base64url')`, sống 60 giây, dùng **một lần** (lấy ra là xóa), và dọn mã hết hạn mỗi khi tạo mã mới.
  Ghi chú trong file: chỉ đúng khi chạy một instance, hiện Render chạy một instance; muốn nhiều instance thì chuyển sang bảng DB.
- `buildOAuthRedirectUrl({ token })`: thay `token` bằng `code`. Các tham số `error`/`message`/`mode`/`social_token` giữ nguyên.
- Route mới `POST /api/auth/oauth/exchange` với body `{ code }`. Có rate limit (`createAuthRateLimit({ name: 'oauth-exchange', max: 30 })`)
  và schema validate (`code` là chuỗi, tối đa 100 ký tự). Mã đúng thì trả `{ success: true, token }`; sai hoặc hết hạn thì 400
  `{ success: false, message: 'Mã đăng nhập không hợp lệ hoặc đã hết hạn.' }`.
- Frontend `AuthCallback.jsx`: có `code` thì POST exchange rồi đi tiếp như luồng `token` cũ. **Vẫn nhận `token`** để không vỡ khi
  frontend và backend deploy lệch nhau; ghi comment "bỏ sau một đợt deploy". Thêm hàm `exchangeOAuthCodeAPI` vào `api/authService.js`.
- `social_token` (token đăng ký 15 phút) vẫn để trên URL; ghi vào mục còn mở.

**Test:**
- Unit (`tests/auth.oauthCode.test.js`): mã dùng được một lần; lần hai trả null; hết hạn trả null (giả `Date.now`); mã lạ trả null.
- Unit cho route exchange (gọi handler với `req`/`res` giả, theo mẫu `mockRes`): 200 khi đúng, 400 khi sai.
- Integration: tạo mã cho một tài khoản tạm (gọi hàm store, ký token như `socialAuth.service.js` làm), rồi gọi exchange qua HTTP. Lần đầu 200 và
  token dùng được; lần hai 400.
- Không test được Google thật. Ghi vào báo cáo: "người dùng cần thử đăng nhập Google sau deploy".

**Đạt khi:** `grep -n "searchParams.set(\"token\"" Backend/src` không còn kết quả, và các test trên pass.

### 2.2 Ảnh/ghi âm dùng "media token" thay cho token đăng nhập (35')

**Hiện trạng:** `Frontend/src/shared/utils/media.js` → `withMediaAccess` gắn `?token=<JWT đăng nhập>` vào mọi URL `/api/media/` không có
`?k=`. `api/voiceService.js` → `getVoiceRecordingAudioUrl` làm tương tự. Backend đọc token này ở `media.routes.js` (`readRequestToken`)
và `voice/backend/backendRoutes.js` (đoạn đọc `req.query?.token`). Hậu quả: token đăng nhập đầy đủ quyền nằm trong mọi thẻ `<img>`,
trong cache và log.

**Cách làm:**
- Backend: hàm `signMediaToken(accountId)` (đặt trong `src/config/jwt.js` hoặc file mới) ký `{ id, account_id, scope: 'media' }`, hết hạn bằng
  `JWT_EXPIRES_IN || '24h'`.
- `verifyToken` (`authMiddleware.js`): token có `scope === 'media'` thì trả **401 `TOKEN_INVALID`**. Media token không bao giờ được dùng cho API.
- `media.routes.js` và voice: token lấy từ **query** chỉ được chấp nhận khi `scope === 'media'`. Token lấy từ header `Authorization` giữ như cũ.
  Kiểm thêm `isTokenRevoked` cho media token (đợt 5 đã có). Hệ quả: đổi mật khẩu thì media token cũ cũng mất hiệu lực.
- Trả `media_token` cùng `token` ở mọi chỗ cấp token: đăng nhập (`auth.controller.js`), social (`socialAuth.service.js` và route exchange
  của 2.1), `me.controller.js` (chỗ ký token), đổi mật khẩu (`member.controller.js`). Tìm bằng `grep -rn "jwt.sign" Backend/src`.
- Frontend: `persistAuthSession` lưu `media_token` (key `auth_media_token`), `logout` xóa key này. `withMediaAccess` và voice dùng media token.
  **Nếu chưa có** media token (phiên đăng nhập từ trước khi deploy) thì tạm dùng token đăng nhập như cũ, và comment rõ đây là đường chuyển tiếp.
  Khi app khởi động mà có token nhưng thiếu media token thì gọi một lần endpoint trả `media_token`: dùng `/api/me` hoặc thêm
  `GET /api/auth/media-token` (cần `verifyToken`).
- Đổi mật khẩu (ProfileDrawer) phải lưu cả `media_token` mới.

**Test:**
- Unit: `verifyToken` từ chối token `scope: 'media'`; `canViewerAccessMedia` nhận media token qua query nhưng **không** nhận token đăng nhập qua
  query; đăng nhập trả `media_token`.
- Integration: upload ảnh bằng member tạm. Kết quả mong đợi: `GET /api/media/:id?token=<media_token>` (bỏ `k`) → 200;
  `?token=<login token>` → 404; dùng media token gọi `/api/member/notifications` → 401.
- Frontend test (`node:test`): `withMediaAccess` ưu tiên media token, và dùng token đăng nhập khi thiếu media token.
- Trình duyệt (gộp vào 3.1): đăng nhập tài khoản tạm, mở trang có ảnh (bảng tin, đăng một bài có ảnh). Kiểm bằng
  `read_network_requests`: ảnh 200, và URL ảnh **không chứa** chuỗi token đăng nhập (so với `localStorage.auth_token`).

**Đạt khi:** các test pass và ảnh vẫn hiển thị trên trình duyệt.

### 2.3 Ngắt socket khi đổi mật khẩu, khóa tài khoản hoặc đổi vai trò (20')

**Hiện trạng:** socket chỉ kiểm token lúc kết nối (`server.js`, `io.use`). Kết nối đang mở vẫn nhận sự kiện realtime của dòng họ sau khi
token bị thu hồi hoặc tài khoản bị khóa. Phía frontend, `Frontend/src/services/socket.js` tạo socket với `auth: { token }` **tĩnh**:
khi tự kết nối lại, nó vẫn gửi token cũ.

**Cách làm:**
- `server.js`: `app.locals.disconnectAccount = (accountId) => io.in(\`account_${accountId}\`).disconnectSockets(true)`.
- Gọi hàm này (qua `req.app.locals`, kiểm tồn tại trước khi gọi) ở mọi chỗ đang gọi `invalidateAccountCache(<id cụ thể>)`:
  đổi mật khẩu, đặt lại mật khẩu, đổi vai trò, khóa, lưu trữ, xóa tài khoản. Tìm bằng `grep -rn "invalidateAccountCache(" Backend/src`.
- Frontend `socket.js`: đổi thành `auth: (cb) => cb({ token: getAuthToken() })` để mỗi lần kết nối lại đều đọc token mới nhất.
  Kiểm tra xem file có so sánh token để tạo lại socket không, rồi giữ hành vi đó.

**Test:**
- Integration: thêm `socket.io-client` vào **devDependencies** của Backend (cùng major với `socket.io`). Kết nối bằng token member tạm, rồi đổi
  mật khẩu qua API. Kỳ vọng: socket nhận `disconnect` trong vòng 3 giây; kết nối lại bằng token cũ bị lỗi `Socket JWT revoked`;
  kết nối bằng token mới thành công. Thêm kịch bản manager tạm khóa member tạm → socket của member bị ngắt.
- Trình duyệt (gộp vào 3.1): sau khi đổi mật khẩu ở ProfileDrawer, realtime vẫn chạy ở tab đó. Cách kiểm: mở trang cây hoặc thông báo, xem
  console không có vòng lặp lỗi kết nối.

**Đạt khi:** test socket pass và frontend không lặp lỗi kết nối.

### 2.4 Rate limit cho các endpoint còn thiếu (10')

**Hiện trạng:** mới có rate limit cho auth (`authRateLimit.js`), AI và chatbot.

**Cách làm:** dùng `createAuthRateLimit` với `keyGenerator`:
- `PUT /api/member/password`: theo `req.user.id`, 10 lần / 15 phút. Mục đích là chặn dò mật khẩu hiện tại bằng một token bị lộ.
  Phải đặt **sau** `verifyToken`.
- `POST /api/upload`, `POST /api/upload-memory-media` (`server.js`), voice `POST /recordings`: theo `req.user.id`, 60 lần / 10 phút.
- `GET /api/invitations/verify`: theo IP, 30 lần / 15 phút.

**Test:** unit với `keyGenerator` theo tài khoản: hai tài khoản khác nhau không ăn chung hạn mức; quá hạn mức thì 429 kèm `Retry-After`.
Giá trị `max` trong test đặt nhỏ, bằng cách gọi `createAuthRateLimit` trực tiếp.

**Đạt khi:** test pass và các route trên đã gắn limiter (kiểm bằng grep).

### 2.5 Header bảo mật: backend + CSP Report-Only cho frontend (15')

**Cách làm:**
- Backend `server.js`, middleware header hiện có:
  - Thêm `Strict-Transport-Security: max-age=15552000; includeSubDomains`, **chỉ khi `req.secure`**. `trust proxy` đã bật nên trên Render
    `req.secure` đúng; ở local không gửi header này.
  - Thêm `Content-Security-Policy: default-src 'none'; frame-ancestors 'self'` cho response của API. Backend chỉ trả JSON và file media,
    nên header này không phá gì. Kiểm lại bằng cách mở một ảnh `/api/media/:id?k=...` trực tiếp trên trình duyệt.
- Frontend: thêm vào **cả hai** file `vercel.json` (root và `Frontend/`, nội dung đang giống nhau, chưa rõ Vercel dùng file nào) header
  `Content-Security-Policy-Report-Only` cho `source: "/(.*)"`. Chỉ **Report-Only**, tức là chỉ báo vi phạm, không chặn.
  Lập danh sách nguồn bằng `vite build` rồi `grep -rhoE "https?://[a-zA-Z0-9.-]+" dist | sort -u`, cộng với nguồn ảnh/socket của backend
  `https://cap2-backend.onrender.com` và `wss://cap2-backend.onrender.com`, font Google (`fonts.googleapis.com`, `fonts.gstatic.com`).
  Có thể bắt đầu từ:
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: https://cap2-backend.onrender.com; connect-src 'self' https://cap2-backend.onrender.com wss://cap2-backend.onrender.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  Mỗi nguồn ngoài tìm thấy trong `dist` phải có trong policy, hoặc được ghi lý do loại ra.

**Test:**
- Unit backend: request giả không `secure` thì không có HSTS; có `secure` thì có HSTS. Có `Content-Security-Policy`.
- Kiểm `vercel.json` là JSON hợp lệ: `node -e "JSON.parse(require('fs').readFileSync('vercel.json'))"` cho cả hai file.
- Ghi vào báo cáo: người dùng xem console trên bản Vercel sau deploy. Không có báo vi phạm sau vài ngày thì đổi sang `Content-Security-Policy`.

**Đạt khi:** test pass, hai file JSON hợp lệ, policy phủ đủ các nguồn tìm thấy.

### 2.6 (tùy chọn) Nâng `react-router-dom` lên v7 (20')

**Lý do:** 2 lỗ hổng mức moderate còn lại của frontend (`npm audit`). Lỗi open redirect qua dấu `\` đã được chặn ở `safeRedirectPath`, nên mức khẩn thấp.

**Cách làm:** `npm i react-router-dom@7`, rồi đọc hướng dẫn nâng cấp v6 → v7 (dùng WebFetch). Ở v7 cách import vẫn qua `react-router-dom`.
Sửa cảnh báo future flags nếu có. Không đổi cấu trúc route.

**Test:** frontend test, lint, build. Trên trình duyệt: đăng nhập, đi qua dashboard member, cây, quỹ, lịch, đăng xuất. Console không có lỗi router.
Hỏng chỗ nào mà không sửa được trong 20 phút thì **revert** và ghi lại.

---

## Giai đoạn A: Trợ lý AI (60')

**Bối cảnh:** chatbot trả lời bằng luật là chính (`intentParserService`, `dataIntentHandlers`, `relationshipEngine`...). LLM (Groq, model
`llama-3.3-70b-versatile`, key có trong `Backend/.env`) chỉ dùng cho 3 việc: lập kế hoạch truy vấn khi luật không hiểu (`chatbotAI.getPlan`),
diễn đạt lại lời giải thích (`chatbotAI.getExplanation`, gọi từ `dataIntentHandlers.js` và `relationshipExplanationAI.js`), và đặt tiêu đề hội thoại.
CI chấm 187 câu bằng `scripts/chatbot-e2e-check.js`, **không có LLM**, nên phần LLM chưa từng được đo.
`scripts/chatbot-unknown-report.js` trên DB test mới có 9 lượt "chưa hiểu" trong 60 ngày, chưa đủ dữ liệu để khai thác.

### A.1 Lớp chặn bịa cho câu trả lời do LLM viết (30')

**Hiện trạng:** `chatbotAI.getExplanation` trả thẳng văn bản của LLM (`return text || fallbackExplain(...)`). Prompt có dặn
"không bịa người" (`chatbotPrompts.js`), nhưng không có bước kiểm tra. LLM chèn thêm một cái tên hay năm sinh sai thì người dùng nhận được ngay,
và với gia phả đó là lỗi nặng.

**Cách làm:**
- Tạo `src/modules/chatbot/answerGroundingService.js` với `checkGrounding(text, facts)`, trả `{ ok, unknownNames, unknownNumbers }`.
  - `facts` là toàn bộ dữ liệu đã đưa vào prompt (`evidence`, `relation`, `userProfile`, `clanContext`, `relationshipPath`...). Gom mọi chuỗi trong đó
    thành tập "từ đã biết", chuẩn hóa bằng cách bỏ dấu, viết thường và gộp khoảng trắng. Dùng lại hàm chuẩn hóa sẵn có trong `typingNormalizer.js` hoặc
    `chatbotUtils.js` nếu có.
  - **Tên:** trong `text`, tìm cụm 2–4 từ liên tiếp viết hoa chữ đầu (tính cả chữ hoa có dấu tiếng Việt). Bỏ qua: cụm ở đầu câu mà chỉ có 1 từ; danh xưng
    và từ thường gặp (`Ông`, `Bà`, `Cụ`, `Bác`, `Chú`, `Cô`, `Dì`, `Anh`, `Chị`, `Em`, `Bạn`, `Theo`, `Gia phả`, `Dòng họ`, `Âm lịch`, `Dương lịch`...,
    danh sách đặt trong file). Một cụm là **lạ** khi không có từ nào của nó (sau chuẩn hóa, độ dài ≥ 2 ký tự) nằm trong tập đã biết.
  - **Số:** mọi số có 3–4 chữ số (năm), và mọi ngày dạng `dd/mm` hoặc `dd/mm/yyyy`, phải xuất hiện trong facts. Dữ liệu có thể ở dạng ISO, nên so sau khi
    đổi cả hai về cùng dạng.
- Trong `getExplanation`: nếu `checkGrounding` không ok thì dùng `fallbackExplain(...)`, ghi `console.warn` ngắn gồm intent và tên lạ,
  và trả thêm cờ để `chatbotResponseMeta` ghi `llm_rejected: 'ungrounded'` vào metadata. Xem `chatbotResponseMeta.js` để ghi đúng chỗ.
- **Không** áp cho `getPlan`, vì kế hoạch sẽ được `plannerValidatorService` kiểm riêng.

**Test** (`tests/chatbot.grounding.test.js`, giả lập `callGroq` bằng cách ghi đè export của `groqClient`, theo cách các test chatbot khác làm):
- LLM trả câu chỉ dùng tên trong facts → giữ nguyên văn bản LLM.
- LLM chèn một tên không có trong facts ("Nguyễn Văn Tèo") → trả `fallbackExplain`.
- LLM chèn năm 1932 khi facts chỉ có 1940 → fallback.
- Không có lỗi oan: câu "Ông Lâm là chú ruột của bạn." với facts có "Lâm" → ok; tên viết không dấu trong facts mà có dấu trong text → ok.
- `npm run test:chatbot` và `node scripts/chatbot-e2e-check.js --min 187 --min-conversation 7` vẫn pass.

**Đạt khi:** test pass, e2e không tụt.

### A.2 Bộ đo có LLM thật (20')

**Cách làm:** tạo `scripts/chatbot-llm-eval.js`, **không** đưa vào CI. Dùng lại dòng họ mẫu và DB giả của `chatbot-e2e-check.js`: đọc cách script đó dựng dữ liệu,
tách ra module dùng chung nếu cần, nhưng không đổi hành vi script cũ. Điểm khác là **giữ** `GROQ_API_KEY` từ `.env`.
- Bộ câu: khoảng 25 câu đi qua đường LLM: câu diễn đạt lạ mà luật không bắt được, hỏi kể về một người, hỏi lịch sử dòng họ, hỏi quan hệ
  vòng vèo ("con của em trai bố tôi là gì của tôi").
- Với mỗi câu ghi lại: thời gian, có gọi LLM không, `llm_rejected`, câu trả lời đúng hay sai theo đáp án kỳ vọng (cùng cách chấm của e2e).
- Giãn 2,5 giây giữa các câu để không vượt giới hạn gói miễn phí của Groq. Lỗi 429 thì chờ 20 giây rồi thử lại một lần.
- In bảng tổng hợp: đúng/tổng, số lần lớp chặn ở A.1 bác câu trả lời, p50/p95 thời gian. Ghi kết quả vào mục "Ghi chú phiên trước" của `docs/TIEP_TUC_AI_TRA_LOI.md`.

**Đạt khi:** script chạy hết, có số liệu ghi vào docs. Lớp chặn bác hơn 20% câu thì xem từng ca, phân loại "bắt đúng bịa" hay "bắt oan", sửa ca oan ở A.1,
rồi chạy lại.

### A.3 Sửa các câu chatbot chưa hiểu đã biết (10')

1. Câu thật trong log: "ap toi co su kien gi". Người dùng gõ "sắp tới" mất chữ "s". Thêm vào `typingNormalizer.js` **chỉ khi** "ap toi" đứng đầu câu và
   đi kèm "su kien/lich/gio". Lý do: chuẩn hóa ở đó phải an toàn với tên người, xem các test `chatbot.typingNormalizer`/`dialectTeencode`.
2. "ba co toi" không dấu đang mơ hồ giữa "bà cố tôi" (cụ) và "bà cô tôi" (chị/em gái của bố). Đổi sang **hỏi lại** khi hai cách hiểu chỉ ra hai người khác nhau,
   dùng cơ chế hỏi lại đã có cho thứ bậc sinh (`kinshipBirthOrder.js`, `clarificationService.js`).
3. Thêm 2 câu này (và một biến thể mỗi câu) vào `chatbot-e2e-check.js`, rồi nâng `--min` trong `.github/workflows/ci.yml` lên đúng số câu đúng mới.

**Đạt khi:** e2e có thêm ≥ 4 ca và pass hết; ngưỡng `--min` trong CI tăng tương ứng.

---

## Giai đoạn F: Tính năng mới, "AI soạn tiểu sử / lời tưởng niệm" (75')

**Giá trị:** trường `bio` của hầu hết người trên cây đang trống, và viết tay rất ngại. Tính năng này soạn **bản nháp** từ chính dữ liệu trên cây
(tên, năm sinh/mất, quê, đời, cha mẹ, vợ chồng, con, kỷ niệm đã duyệt). Người dùng sửa rồi tự bấm lưu. Với người đã mất có thêm kiểu
"lời tưởng niệm" để đọc trong ngày giỗ. **AI không bao giờ tự lưu.**

**Hiện trạng liên quan:**
- `people.bio` và `people.pending_bio`: thành viên sửa hồ sơ thì đi vào `pending_bio` và chờ duyệt (`moderation_status`). Luồng lưu nằm ở
  `genealogy/tree.controller.js` (tìm `bio`) và `manager/moderation.controller.js`.
- Quyền sửa một người: `assertCanManagePersonId` / `assertTreeMutationPermission` (`tree.controller.js`), quy tắc sửa hồ sơ của member
  (`treeEditPermissions`).
- Lọc quan hệ nhạy cảm cho member: `genealogy/treeVisibility.js` → `applyFamilyVisibility`.
- Route AI: `modules/ai/ai.routes.js` (đã có `aiRateLimit`), `ai.controller.js` (mẫu gọi Groq, cảnh báo `ai_model_unavailable` khi thiếu key).
  Bảng `ai_audit_logs` có sẵn từ migration `2026_05_02_create_ai_audit_logs.sql`; tìm chỗ đang ghi vào bảng này để ghi theo cùng cách.

### F.1 Backend (35')
- Route `POST /api/ai/person/:id/biography-draft`: `verifyToken`, `checkRole(['admin','manager','member'])`, `aiRateLimit`, và schema validate:
  `id` là `v.id`; body gồm `purpose`: `'biography'|'memorial'`, `tone`: `'formal'|'warm'`, `length`: `'short'|'medium'`, `language`: `'vi'|'en'`.
- **Quyền:** người gọi phải có quyền **sửa hồ sơ** người đó, dùng đúng hàm kiểm tra mà route cập nhật hồ sơ đang dùng. Người khác dòng họ nhận 404.
  `purpose = 'memorial'` mà người còn sống thì trả 400.
- `src/modules/ai/biographyFacts.js` → `buildBiographyFacts(personId, viewer)`, trả object facts gồm: họ tên, giới tính, ngày sinh/mất
  (dương và âm nếu có), quê quán, đời, chi, còn sống hay không, `bio`/`note` hiện có, tên cha mẹ, vợ chồng (đã qua `applyFamilyVisibility` theo vai trò
  người xem), tên và năm sinh các con, tối đa 5 kỷ niệm **đã duyệt** có gắn người này (xem bảng family memories), tối đa 5 sự kiện gắn người.
  **Không bao giờ** đưa vào: số điện thoại, email, địa chỉ, zalo, facebook.
- Prompt mới trong `src/modules/ai/biographyPrompt.js`: chỉ được dùng facts; thiếu thông tin thì bỏ qua, không đoán; không bịa thành tích, nghề nghiệp, tính cách;
  văn phong theo `tone`; độ dài khoảng 80 từ (`short`) hoặc 180 từ (`medium`); `memorial` thì giọng trang trọng, tưởng nhớ. Trả JSON
  `{ "draft": "...", "facts_used": ["..."] }`.
- Gọi Groq qua `groqClient` với timeout riêng 15 giây (đây không phải chat). Kiểm kết quả bằng `checkGrounding` của A.1:
  - không đạt thì gọi lại **một lần**, kèm câu nhắc liệt kê các tên hoặc số lạ đã bị bắt;
  - vẫn không đạt, hoặc không có key, hoặc Groq lỗi, thì dùng **bản mẫu tất định** `buildTemplateBiography(facts, options)`. Bản này ghép câu từ facts
    (ví dụ "Ông Nguyễn Văn A sinh năm 1940 tại ..., là con của ... Ông có 3 người con: ...") và có cả bản tiếng Anh.
- Trả `{ success: true, draft, facts_used, source: 'ai'|'template', warnings: [] }`. **Không ghi vào bảng `people`.**
  Ghi một dòng `ai_audit_logs` (ai gọi, person_id, source, có bị bác hay không), không lưu nội dung facts nhạy cảm.

### F.2 Frontend (25')
- Tìm ô nhập `bio` trong form sửa người (`grep -rn "bio" Frontend/src/features/genealogy`) và trong hồ sơ cá nhân nếu có.
  Thêm nút "✨ AI soạn tiểu sử" cạnh ô đó. Chỉ hiện khi người dùng đang ở chế độ sửa được ô `bio`.
- Bấm nút mở dialog (dùng `useDismissable`/mẫu modal sẵn có, có `aria-modal`, Esc để đóng). Dialog gồm: chọn mục đích (tiểu sử / lời tưởng niệm; chỉ hiện
  lời tưởng niệm khi người đã mất), giọng văn, độ dài; nút "Soạn"; vùng kết quả là textarea **sửa được**; danh sách "Dữ kiện đã dùng";
  dòng nhắc "AI chỉ dùng dữ liệu trên cây. Hãy đọc lại trước khi lưu."; và nhãn nhỏ "Bản mẫu (AI không khả dụng)" khi `source = 'template'`.
- Nút "Dùng bản này" điền nội dung vào ô `bio` của form rồi đóng dialog. Người dùng vẫn bấm **Lưu** của form như cũ, nên member vẫn đi qua `pending_bio` và kiểm duyệt.
  "Soạn lại" gọi lại API.
- Mọi chuỗi dùng i18n (vi + en). Trạng thái đang soạn dùng `LoadingState`; lỗi dùng `friendlyErrorMessage`.
- Thêm `generateBiographyDraftAPI(personId, options)` vào service AI sẵn có ở frontend.

### F.3 Test (15')
- Unit backend:
  - `buildBiographyFacts` không chứa phone/email/address/zalo/facebook dù DB giả có;
  - member không thấy vợ chồng có `visibility = 'managers'`;
  - `buildTemplateBiography` đủ ý với dữ liệu thiếu (không năm sinh, không con) và không in "undefined"/"null";
  - Groq trả bản có tên lạ hai lần thì dùng template; Groq lỗi thì dùng template;
  - `memorial` với người còn sống trả 400.
- Integration (thêm vào `tests-integration/`):
  - người khác dòng họ gọi → 404 (thêm một dòng vào bảng IDOR ở 1.3);
  - manager tạm gọi cho một người tạm có đủ dữ kiện, **gọi Groq thật một lần**: 200, `draft` chứa tên người đó, `checkGrounding(draft, facts).ok === true`;
  - sau khi gọi, `people.bio` của người đó **không đổi**.
- Trình duyệt (manager tạm và member tạm, ở 1280 và 390): mở người trên cây, sửa, bấm AI, soạn, sửa một chữ, "Dùng bản này", Lưu.
  Manager: `bio` lưu thẳng (kiểm bằng SELECT). Member: vào `pending_bio` và hiện trong trang duyệt của manager. Đổi ngôn ngữ EN rồi soạn bản tiếng Anh. Chụp màn hình dialog đưa vào báo cáo QA.

**Đạt khi:** test pass; luồng trình duyệt chạy được cho cả hai vai trò; không có đường nào ghi `bio` mà người dùng không bấm Lưu.

### F.4 (tùy chọn) Xuất GEDCOM (45')
P4.5 trong `VIEC_CHUA_LAM.md`. `GET /api/genealogy/export.ged` cho manager/admin của chính dòng họ: GEDCOM 5.5.1 UTF-8 với `INDI` (tên, giới tính,
ngày sinh/mất), `FAM` (`HUSB`/`WIFE`/`CHIL`), không xuất liên lạc. Nút "Xuất GEDCOM" trong `TreeExportDialog`.
Test: số `INDI`/`FAM` khớp DB của dòng họ tạm, mỗi `CHIL` trỏ tới `INDI` có thật, file mở được bằng một trình đọc GEDCOM trực tuyến (ghi tên công cụ đã thử).

---

## Giai đoạn 3: Giao diện + QA trên trình duyệt (80')

Chuẩn bị chung: backend chạy ở cổng 3000, frontend chạy `npm run dev` ở cổng 5173. Viết thêm `Backend/scripts/itest-account.js`
(dùng lại fixtures ở 1.1): `node scripts/itest-account.js member` tạo dòng họ tạm, manager và member tạm, in email/mật khẩu ra.
`node scripts/itest-cleanup.js` để dọn. Dọn xong cuối Giai đoạn 3.

Theo hướng dẫn Chrome: gọi `tabs_context_mcp` trước, làm trong tab mới, không bấm gì mở `alert`/`confirm` gốc
(app đã dùng `ConfirmDialog`, nên bấm được). Ghi GIF cho luồng 3.1.

### 3.1 QA luồng phiên đăng nhập (25'), cả 1280px và 390px (`resize_window`)

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 1 | Đăng nhập member tạm | Vào `/user/dashboard`, không lỗi console |
| 2 | Ở `/user/genealogy` (hoặc một trang con bất kỳ), đặt `localStorage.auth_token` thành chuỗi rác bằng `javascript_tool`, rồi bấm một hành động gọi API | Toast "phiên hết hạn", về `/login?redirect=%2Fuser%2F...` |
| 3 | Đăng nhập lại | Quay về đúng trang ở bước 2 |
| 4 | Mở 2 tab cùng tài khoản. Đổi mật khẩu ở tab A (ProfileDrawer) | Tab A hiện "Đã đổi mật khẩu", vẫn dùng tiếp được |
| 5 | Ở tab B, bấm một hành động gọi API | Tab B về `/login?redirect=...` |
| 6 | Nhập sai mật khẩu hiện tại ở ProfileDrawer | Thông báo "Mật khẩu hiện tại không đúng", **không** bị đăng xuất |
| 7 | Ảnh trên bảng tin/cây (sau 2.2) | Ảnh hiện; URL ảnh không chứa token đăng nhập |
| 8 | Nhấn Tab qua header, nút, link | Có viền vàng `#b77912` rõ ràng. Bấm chuột thì không có viền |
| 9 | Tài khoản bị manager khóa trong lúc đang dùng | Về `/account-disabled` |

**Ghi kết quả** vào `docs/report/QA_2026-10-30.md` (đổi ngày nếu khác), theo bảng: Mức | Trang | Mô tả | Cách tái hiện | 1280/390.
Kịch bản nào FAIL thì sửa nếu nhỏ (≤ 15'), lớn thì ghi lại để làm sau.

**Đạt khi:** có file báo cáo, mọi kịch bản có kết quả (PASS, FAIL, hoặc "không làm được" kèm lý do).

### 3.2 Dọn code chết ở frontend (20')

**Hiện trạng** (từ ESLint): `layouts/ManagerLayout.jsx` có `accountLoading`, `accountSaving`, `passwordSaving`, `accountMessage`,
`updateAccountField`, `updatePasswordField`, `saveAccountInfo`, `submitProfileContent`, `savePassword` không được dùng.
Nhiều khả năng phần sửa tài khoản đã chuyển sang `ProfileDrawer`. Tương tự: `TaskManagementPage.jsx` (`eventStats`, `requestAiTasksForCreateForm`,
`submitSelectedAiTaskSuggestions`, `hasAssignedTasks`), `TimeCapsulePage.jsx` (`startAudioRecording`), `MemberFundPage.jsx`
(`currentBalance`, `pendingTransactions`), `UserFamilyTree.jsx` (`generationScopeText`), `CreatePersonDialog.jsx` (`titleMap`, `relationTextMap`),
`FamilyTreeEditor.jsx` (`dialogSourceSpouse`).

**Cách làm:** với **từng** symbol:
1. Chạy `git log -S"<tên>" --oneline -- <file>` để xem commit nào bỏ chỗ dùng nó.
2. Nếu commit đó cố ý thay bằng thứ khác (ví dụ "chuyển sang ProfileDrawer") thì xóa symbol và các state/import chỉ nó dùng.
3. Nếu có vẻ bị **mất do sơ suất** (ví dụ một nút AI biến mất khỏi JSX mà không ai nhắc) thì **không xóa**. Ghi vào báo cáo:
   "tính năng X có code nhưng không có nút; khôi phục hay xóa?".
4. `catch (e)` không dùng `e` thì đổi thành `catch {}`.

**Không** sửa các cảnh báo `react-hooks/*`.

**Test:** lint, test, build. Mở trang manager (ManagerLayout) và trang sự kiện trên trình duyệt: không lỗi console, các nút cũ còn đủ.

**Đạt khi:** cảnh báo ESLint ≤ 125, và mọi symbol giữ lại có lý do ghi trong báo cáo.

### 3.3 Chuỗi tiếng Việt viết cứng còn lại (20')

**Hiện trạng:** khoảng 96 dòng trong 11 file `.jsx` còn chữ có dấu. Nhiều nhất: `FamilyTreeEditor.jsx` (24), `ClanFundPage.jsx` (21),
`TaskManagementPage.jsx` (10), `ProfileDrawer.jsx` (7), `BillingPage.jsx` (6), `MemberFundPage.jsx` (5).

**Bỏ qua (cố ý giữ tiếng Việt):** `src/dev/TreePreview.jsx`; prompt gửi AI (ví dụ chuỗi "Hãy gợi ý đúng ... công việc"); từ khóa so khớp dữ liệu
(ví dụ `["mất", "đã mất"]`); comment.

**Cách làm:** chỉ chuyển chuỗi **hiện cho người dùng thấy** (JSX text, `placeholder`, `title`, `aria-label`, toast, lỗi) vào `vi.json`/`en.json`,
theo nhánh key sẵn có của trang đó. Bản tiếng Anh dịch tự nhiên, đúng ngữ cảnh gia phả.

**Test:** `Frontend/tests/localeParity.test.js` pass. Chuyển ngôn ngữ sang EN trên trình duyệt ở trang quỹ và trang cây: không còn chữ Việt ở các chỗ đã sửa.

**Đạt khi:** chạy lại script đếm (Python, quét chữ có dấu trong `.jsx`, bỏ comment) cho kết quả chỉ còn các trường hợp thuộc danh sách "bỏ qua".
Danh sách còn lại ghi vào báo cáo.

### 3.4 Nút chỉ có icon phải có `aria-label` (15')

**Cách làm:**
1. Viết script tạm (để trong scratchpad, không commit) đọc mọi `.jsx`. Tìm `<button ...>` mà nội dung giữa thẻ mở và thẻ đóng, có thể nhiều dòng,
   chỉ là một `<span className="material-symbols-outlined">...</span>`, hoặc một icon component, **và** thẻ mở không có `aria-label` hay `title`.
2. Thêm `aria-label={t("...")}` dùng key có sẵn nếu có (ví dụ `common.actions.close`), không có thì tạo key mới ở cả vi và en.
   Thêm `aria-hidden="true"` cho span icon nếu chưa có.

**Test:** chạy lại script, ra 0 kết quả. `localeParity` pass. Trên trình duyệt, dùng `read_page`/`find` kiểm 3 nút ngẫu nhiên có tên truy cập.

**Đạt khi:** script ra 0 kết quả, test pass.

### 3.5 (tùy chọn) Chuyển khối `<style>` của trang quỹ ra file `.css` (20')

**Hiện trạng:** `ClanFundPage.jsx` có khoảng 1190 dòng CSS tĩnh trong `<style dangerouslySetInnerHTML>`, `FundAnalytics.jsx` có 3 rule.
Khối này đang ghi đè `FundDesign.css` (cùng selector) vì nằm trong DOM sau mọi CSS ở `<head>`.

**Cách làm:**
1. **Trước khi sửa**, đăng nhập manager tạm, chụp trang quỹ (mọi tab) ở 1280 và 390.
2. Chuyển CSS sang `ClanFundPage.css` và `FundAnalytics.css`, import **sau** `FundDesign.css`. Thêm tiền tố là class gốc của trang
   (xem `className` của phần tử ngoài cùng trong `return`) vào **mọi** selector, để độ ưu tiên cao hơn `FundDesign.css` và các trang khác.
3. Chụp lại ở cùng các vị trí và so từng cặp ảnh. Khác nhau là FAIL.

**Đạt khi:** ảnh trước và sau giống nhau. Không giống mà không sửa được trong 20' thì **revert**.

### 3.6 (tùy chọn) Ảnh đại diện thật khi xuất cây (25')

**Hiện trạng:** `utils/tree-editor/treeExportSvg.js` vẽ chữ cái đầu (`initialOf`). Tùy chọn xuất nằm ở `TreeExportDialog.jsx`.

**Cách làm:** trước khi dựng SVG, tải ảnh của các node có ảnh (giới hạn 300 ảnh, chạy song song tối đa 6) bằng `fetch(withMediaAccess(url))`,
chuyển sang data URL (thu nhỏ còn 96px bằng canvas), rồi vẽ `<image>` cắt tròn bằng `clipPath`. Ảnh lỗi thì quay về chữ cái đầu.
Thêm checkbox "Kèm ảnh đại diện" (mặc định bật) vào dialog, có i18n.

**Test:** unit cho hàm chọn ảnh hay chữ cái (ảnh lỗi thì dùng chữ). Trên trình duyệt: tạo 2 người tạm có ảnh, xuất PNG 1x và SVG,
mở file thấy ảnh. Xuất mà tắt checkbox thì ra như cũ.

---

## Giai đoạn 4: Báo cáo chất lượng dữ liệu, chỉ đọc (15')

P0.6 trong `VIEC_CHUA_LAM.md`. Tạo `Backend/scripts/data-quality-report.js`, **chỉ dùng SELECT**, in ra:
1. Tài khoản có tên hiển thị là email (`people.display_name LIKE '%@%'`, nối qua `accounts.person_id`).
2. Tài khoản `active` không gắn với người trên cây (`person_id IS NULL` và không có `account_clans.person_id`).
3. Người có `*_date_precision = 'exact'` nhưng ngày rơi vào 01-01. Đây là dấu hiệu chỉ biết năm. Xem tên cột thật trong migration `genealogy`.
4. Người không thuộc gia đình nào và không có quan hệ nào (node mồ côi). Xem bảng quan hệ trong `genealogySchema.service`.
5. Gia đình có hơn 2 cha mẹ, hoặc con mà năm sinh trước năm sinh cha mẹ.

Mỗi mục in số lượng và tối đa 10 id mẫu. **Bỏ qua** dữ liệu `itest_`/`ITEST_`.

**Test:** chạy script trên DB test, đọc kết quả. `grep -nE "UPDATE|DELETE|INSERT|ALTER|DROP" scripts/data-quality-report.js` ra 0 dòng.
Dán kết quả tóm tắt vào báo cáo cuối buổi. **Không sửa dữ liệu.**

---

## Giai đoạn 5: Tổng kết (15')

1. Chạy `node scripts/itest-cleanup.js` và xác nhận DB không còn dữ liệu tạm. Tắt backend và frontend dev.
2. Chạy toàn bộ kiểm tra lần cuối (unit backend, unit frontend, lint, build, integration).
3. Thêm mục "Đợt 6" vào `docs/VIEC_CHUA_LAM.md`, theo mẫu đợt 5:
   - Danh sách việc đã xong, có hash commit.
   - **Deploy đợt này cần:** liệt kê migrate (nếu có) và cảnh báo về hành vi mới:
     - Đăng nhập Google/Facebook đổi sang dùng `code`. Frontend và backend phải deploy cùng nhau; frontend vẫn nhận `token` cũ để không vỡ trong lúc chờ.
     - Media token: phiên đăng nhập cũ tự lấy media token, không cần đăng xuất.
     - CSP mới chỉ ở chế độ Report-Only.
   - **Còn mở:** các FAIL trong QA, các symbol giữ lại ở 3.2, các test `todo` ở 1.3, `social_token` trên URL, việc chuyển CSP sang chế độ chặn.
   - Gạch các mục đã xong trong P0/P3 (P0.4, P0.6 phần liệt kê, P3.5).
4. Commit docs. **Không push.**
5. Báo cáo cho người dùng (tiếng Việt, ngắn): bảng task → trạng thái (xong / tùy chọn bỏ qua / FAIL) → commit; số test trước và sau;
   ESLint trước và sau; những việc người dùng cần làm (push, deploy, thử Google login, xem console CSP, đặt `DISABLE_RUNTIME_DDL=true` trên Render
   vì migrate đã chạy đủ 29/29 bước). Hướng dẫn người dùng tự thử nút "AI soạn tiểu sử", và nêu chi phí Groq ước tính (số lần gọi/ngày tối đa do `aiRateLimit` giới hạn).

---

## Tiêu chí "đạt" cho cả đợt

| Hạng mục | Mức đạt |
|---|---|
| Task bắt buộc (1.1–1.4, 2.1–2.5, A.1–A.3, F.1–F.3, 3.1–3.4, 4) | Xong, hoặc dừng có lý do ghi rõ (lỗ hổng cần hỏi, công cụ lỗi) |
| AI | e2e chatbot ≥ 187 + ca mới, có số liệu đo bằng LLM thật trong `TIEP_TUC_AI_TRA_LOI.md`, tính năng tiểu sử chạy được cho manager và member |
| Test | Backend unit ≥ 167 + test mới, frontend ≥ 53 + test mới, integration có ≥ 25 test, tất cả pass |
| ESLint | 0 lỗi, ≤ 125 cảnh báo |
| DB | Không còn dữ liệu `itest_`/`ITEST_`; không dòng dữ liệu thật nào bị sửa |
| Git | Mỗi task một commit, không push, `git status` chỉ còn 3 file có sẵn từ trước |
| Tài liệu | `VIEC_CHUA_LAM.md` có mục Đợt 6; có `docs/report/QA_2026-10-30.md` |
