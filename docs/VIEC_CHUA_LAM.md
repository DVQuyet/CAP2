# Việc chưa làm — CAP2 (Gia Phả Việt)

Cập nhật 23/10/2026, quét lại mã ở commit `03e5681`. Đây là **danh sách duy nhất** các việc còn mở; gộp từ
`CAI_THIEN_HE_THONG.md` (mục "Chưa làm"), `TOI_UU_AI_VA_GIA_PHA.md` (mục 2–6) và `TIEP_TUC_AI_TRA_LOI.md` (mục "Chờ nhóm quyết định").
Các file đó giữ làm nhật ký; việc mới thêm vào đây.

Ký hiệu công sức: **S** < 2 giờ · **M** nửa ngày–1 ngày · **L** nhiều ngày. Cột "Ai làm" gợi ý chia việc khi chạy nhiều agent.

## Đã xong, gỡ khỏi các danh sách cũ

| Mục trong docs cũ | Bằng chứng trong mã |
|---|---|
| Đưa bộ đo chatbot vào CI có ngưỡng | `.github/workflows/ci.yml`: `chatbot-e2e-check.js --min 82 --min-conversation 7` |
| Hỏi "con trưởng / con thứ N / con út" | `intentParserService.js:203`, `chatbotController.js:698` |
| Giỗ theo người (`death_anniversary_lunar`) | `calendar.controller.js:534-630`, `chatbotController.js:1048` |
| "Tải thêm" cho bảng tin bài viết | `GeneralPosts.jsx` + `getGeneralPosts({ beforeId })` |

---

## Xong trong đợt 22/10/2026 (commit `3c4c6c8`..`ffba8f8`)

- 2.1 i18n: ~330 chuỗi trong 21 file + test so khớp key vi/en (`Frontend/tests/localeParity.test.js`). Tiêu đề cột bảng sự kiện ở `TaskManagementPage.jsx` đã dùng `t()` (kiểm lại ở đợt 6).
- 2.2 "Xem trên cây" từ chat (`?focus=&highlight=`), 2.3 "Tải thêm" thông báo/kỷ niệm/sự kiện quản lý, 2.4 log câu chưa hiểu + `scripts/chatbot-unknown-report.js`, 2.5 👍/👎.
- Chat: giao diện mới, màn chào, mobile toàn màn hình, báo máy chủ khởi động, xóa lịch sử (ẩn mềm), chuẩn hóa cách gõ (không dấu, viết tắt) an toàn với tên người. E2E 107/107.
- Test backend không thể chạm DB thật (`tests/setup.env.js`).

**Deploy backend lần này cần:** sao lưu DB, rồi `npm run migrate` (bảng `chatbot_feedback`, cột `chatbot_messages.hidden_at`). Chưa migrate thì chat vẫn chạy, chỉ 👍/👎 và xóa lịch sử báo lỗi.

Đợt 2 cùng ngày (`d7cec89`..`a3e019a`):
- Chatbot hiểu 30 câu phương ngữ/teencode/lỗi l-n/câu kể dài (e2e 137/137, test tên người `tests/chatbot.dialectTeencode.test.js`).
- 2.6/2.7: `ConfirmDialog` + `useConfirm()` thay toàn bộ 17 `window.confirm`; modal có form hỏi "bỏ thay đổi?" khi Esc/bấm nền (`useDismissable`).
- `LoadingState`/`EmptyState`/`ErrorState` dùng chung, lỗi thân thiện (`friendlyError.js`), banner "máy chủ đang khởi động" toàn app (`services/pendingRequests.js`).

Đợt 3 (23/10) — commit `c8ac2dc`..`0b6e191` đã lên main:
- Lỗi hành động hiện thông báo thân thiện (giữ message nghiệp vụ 4xx), `Loading/Error` state dùng chung cho trang admin.
- Chatbot hiểu thứ bậc sinh ("anh hai", "chú út", "bác cả", "cô ba", "thím năm", "dượng ba"), e2e 166/166.
- Sự kiện được giao của member: phân trang keyset + "Tải thêm".
- Gợi ý chủ động giỗ/sinh nhật trong 14 ngày tới (đi qua luồng bản nháp nhắc lịch).
- Thay đổi này: chip gợi ý hiển thị `hint` ("còn 5 ngày") và biểu tượng lịch cho `create_event_draft`; `.gitignore` bỏ qua `.claude/worktrees/`.

Còn mở từ đợt này:
- ~~Rà 4 ca e2e tự đặt; lọc thứ bậc "chú út/bác cả/thím ba"/"anh hai/chú út"; "ong co" không dấu~~ Xong (e2e 166/166): thứ bậc giữ qua chuẩn hóa (`kinshipBirthOrder.js`), "hai/ba/năm…" mơ hồ Nam/Bắc thì hỏi lại khi hai cách hiểu cho hai người khác nhau.
- ~~Lỗi hành động hiện `err.message` thô; trang admin chưa có state chung~~ Xong (đợt 3). Còn: `ErrorState` ở trang admin chưa có nút "Thử lại".
- ~~Danh sách sự kiện của member chưa phân trang~~ Xong (đợt 3, keyset + "Tải thêm").
- "ba co toi" không dấu nay hiểu là cụ (mơ hồ với "bà cô"); "chu ba/thim ba" không dấu chưa nhận thứ bậc.
- Chưa ai mở giao diện mới trên trình duyệt thật (390px/1280px).

Đợt 4 (23/10) — commit `fb6587f`..`03e5681` (chưa push):
- Hết phiên đăng nhập thì chuyển về `/login?redirect=...`, đăng nhập xong quay lại trang cũ.
- Validate đầu vào (`Backend/src/shared/validation/`) cho route ghi: auth, tree, fund, post, invitation, đổi role, task, kỷ niệm, hồ sơ, thông tin/đăng ký dòng họ, tài khoản admin, lưu trữ. Lỗi trả 400 dạng `{success:false,message,errors:[{field,message}]}`.
- Cây gia phả thu gọn/mở rộng nhánh: mặc định 3 đời quanh người đang xem, nhớ theo từng người dùng + dòng họ, có "mở hết/đặt lại" và badge +N.
- Trang "Sổ gia phả" in/lưu PDF (`/user|/manager/genealogy-book`): gom theo đời, lọc nhanh, chỉ người còn sống; có link từ trang cây.
- Xuất cây bằng SVG vector: PNG 1–4x rasterize từ SVG, nhúng font, thẻ tham chiếu; giữ các tùy chọn cũ (chế độ, nền, tiêu đề, khung, giao diện).
- Chatbot: giỗ/sinh nhật gắn `person_id`, lặp hằng năm (tự điền ngày từ hồ sơ); sửa/xóa lịch qua chat có thẻ xác nhận, chỉ lịch của chính mình. Từ thứ bậc sinh không dấu ("chu ba", "thim nam"...).
- CSS mobile: panel thông báo, modal/bảng quỹ-thành viên-bài viết, cỡ input/nút chạm, xuống dòng chữ dài. Admin có nút "Thử lại" ở `ErrorState`.

**Deploy backend đợt này cần:** sao lưu DB, rồi `npm run migrate` (bảng `chatbot_feedback`; cột `chatbot_messages.hidden_at`, `calendar_events.person_id`, `calendar_events.repeat_yearly`).

Còn mở từ đợt 4:
- Chưa QA trên trình duyệt thật: agent Chrome không gõ mật khẩu production, người dùng phải tự đăng nhập.
- Ảnh đại diện khi xuất cây vẫn là chữ cái đầu, chưa nhúng ảnh thật.
- Validate chưa phủ route calendar/events.
- "ba co toi" vẫn mơ hồ (cụ vs bà cô).

Đợt 8 (30/10) — AI soạn bài đăng, tô sáng đường quan hệ, người trùng lặp:
- **AI soạn bài/thông báo**: `POST /api/ai/post-draft/generate` (`postDraft.service.js`, zod `generatePostDraft`, quyền admin/manager/member như đăng bài, `aiRateLimit`, 503 `AI_UNAVAILABLE`). Nhận `idea` và/hoặc `event_id` (id lịch số, `birthday-/death-<người>-<năm>`, `manager-event-<id>-<ngày>`); server tự đọc sự kiện trong dòng họ, 404 nếu không được xem; trả `unverified[]` (ngày/giờ AI tự thêm). FE: `PostAIAssist.jsx` trong form tạo bài (chọn sự kiện sắp 30 ngày, loại, giọng). Test `ai.postDraft.test.js`, `postAiHelpers.test.js`. Không cần migration.
- **2.2 ✅ Tô sáng đường quan hệ**: nút "Xem đường quan hệ trên cây" gửi `path` (id người theo thứ tự) qua `?path=`/sự kiện; `treePathHighlight.js` (hàm thuần) tính node + cạnh; cây tô cam, làm mờ phần còn lại, hiện tạm người trong nhánh đang thu gọn (`revealIds` trong `useTreeViewMode`, không lưu), thu phóng vừa, nút "Bỏ tô sáng". Test `treePathHighlight.test.js`.
- **Người trùng lặp**: `GET /api/manager/tree/duplicates` (admin/manager, `limit`/`offset`), `POST /api/manager/tree/duplicates/dismiss`. `duplicates.service.js` chấm điểm (tên bỏ dấu, lệch 1 ký tự, năm sinh theo precision, giới tính, cha mẹ, đời), gom xô theo tên gọi, loại cặp cha-con/vợ-chồng. Trang `/manager/duplicates` so sánh cạnh nhau, "Mở hồ sơ" (tới cây), "Không trùng" (có xác nhận). Test `genealogy.duplicates.test.js`.
- **Deploy cần**: sao lưu DB rồi `npm run migrate` (bảng `genealogy_duplicate_dismissals`, file `database/migrations/2026_10_30_genealogy_duplicate_dismissals.sql`). Chưa migrate thì danh sách vẫn chạy, chỉ "Không trùng" tự tạo bảng khi lưu lần đầu (nếu DDL runtime bị tắt thì báo lỗi).
- **Cần QA trình duyệt** (chưa ai mở): form đăng bài + AI trên 390px; "Xem đường quan hệ trên cây" với đường đi qua nhánh thu gọn (desktop/mobile, cả `.fte2`); trang `/manager/duplicates`.
- Còn mở: KHÔNG có gộp tự động (rủi ro cao: phải dời cha mẹ/con/vợ chồng/tài khoản/media); hoàn tác "Không trùng" chưa có UI; gợi ý trùng chưa xét tên vợ/chồng/quê quán; "Soạn thông báo cho sự kiện" mới ở form đăng bài (chưa có nút trên trang lịch); đường quan hệ bị lọc quyền riêng tư có thể thiếu cạnh (vẫn tô node).

Đợt 7 (30/10) — AI gợi ý tiểu sử:
- `POST /api/ai/person-biography/generate` (`ai.controller.js`, `personBiography.service.js`, zod `generatePersonBiography`): server tự đọc dữ kiện theo `person_id` (ngày theo `*_date_precision`, quê quán, cha mẹ, vợ/chồng, con; bỏ qua quan hệ `visibility=managers` với người không phải admin/manager), kiểm quyền như sửa hồ sơ (`assertTreeMutationPermission` + `assertCanManagePersonId`), prompt không có SĐT/địa chỉ, ghi chú người dùng coi là dữ liệu không đáng tin. Chỉ trả bản nháp.
- Frontend: `BiographyAIButton.jsx` trong `PersonInspector` điền ô tiểu sử, hỏi xác nhận khi ô đã có chữ; i18n vi/en.
- Test: `tests/ai.personBiography.test.js` (8 test, DB và Groq giả). Không cần migration.
- Còn mở: QA trên trình duyệt (desktop + điện thoại), chưa dùng family_memories vì bảng không gắn với người cụ thể; hỏi nhóm có cho đưa nơi sinh/địa chỉ vào bản nháp không.

Đợt 6 (30/10, Sonnet) — rà lại B3, 2.4, 2.5 theo `KE_HOACH_SONNET_1H.md`; **không cần code mới**:
- B3: tiêu đề cột bảng sự kiện ở `TaskManagementPage.jsx` đã dùng `t()` từ trước.
- 2.4 (log câu chưa hiểu + `scripts/chatbot-unknown-report.js`) và 2.5 (👍/👎: bảng `chatbot_feedback`, `POST /api/chatbot/messages/:id/feedback`, nút trong chat, i18n vi/en, test `chatbot.feedback.test.js`) đã có từ đợt 22/10; bảng P2 giờ đánh dấu ✅.
- Baseline kiểm tra: Backend 167 test pass; Frontend 53 test pass, ESLint 0 lỗi / 139 cảnh báo (không đổi), `vite build` OK.
- Migration cần khi deploy: không có thêm; vẫn là các file của đợt 5 và 22/10 (`password_changed_at`, `chatbot_feedback`, `chatbot_messages.hidden_at`).
- Còn mở: như danh sách "Còn mở từ đợt này" của đợt 5 (QA trình duyệt, `<style>` ở `ClanFundPage`/`FundAnalytics`, cảnh báo ESLint cần người xác nhận).

Đợt 5 (29/10, Sonnet theo `KE_HOACH_SONNET_1H.md`) — 6 commit `c8b8ef5`..`fcab1ab`, chưa push:
- Dependency: `npm audit fix` + nodemailer 10 (API `createTransport/sendMail` đã thử). Backend chỉ còn `xlsx` (không có bản vá; chỉ dùng để ghi file nên giữ lại). Frontend còn 2 lỗi moderate của `react-router` (cần nhảy lên v7, breaking) — để sau.
- Đổi/đặt lại mật khẩu thu hồi token cũ: cột `accounts.password_changed_at`, `verifyToken`/socket/media từ chối token có `iat` sớm hơn mốc; `PUT /api/member/password` trả token mới (frontend tự lưu). Thiếu cột thì chạy như cũ. `isTokenRevoked` dùng chung.
- Xuất Excel quỹ chống formula injection (`shared/utils/spreadsheet.js`); header `Content-Disposition` của media an toàn với tên file tiếng Việt (`shared/utils/contentDisposition.js`).
- Validate route calendar (tạo/sửa/xóa lịch).
- FE: `<Trans>` thay `dangerouslySetInnerHTML` cho chuỗi i18n; viền focus bàn phím chung (`index.css`); dọn import không dùng (cảnh báo ESLint 148 -> 139).
- Phát hiện thêm: `installSessionGuard` được import ở `App.jsx` nhưng **chưa từng được gọi**, và `Login.jsx` không đọc `?redirect=` — hai nửa của "hết phiên thì về /login?redirect=" ở đợt 4 chưa chạy. Đã nối cả hai; đổi 401 "sai mật khẩu hiện tại" thành 400 để guard không đăng xuất nhầm.

**Deploy backend đợt này cần:** sao lưu DB, rồi `npm run migrate` (cột `accounts.password_changed_at`; hoặc chạy `database/migrations/2026_10_29_accounts_password_changed_at.sql`). Chưa migrate thì đăng nhập/đổi mật khẩu vẫn chạy, chỉ chưa thu hồi token cũ.

Còn mở từ đợt này:
- Khối `<style dangerouslySetInnerHTML>` ở `ClanFundPage.jsx` (~1190 dòng) và `FundAnalytics.jsx` **không chuyển ra `.css`**: chúng đang ghi đè `FundDesign.css` nhờ nằm trong DOM, chuyển file sẽ đổi thứ tự cascade — cần QA bằng mắt trên trình duyệt thật.
- Chưa QA bằng trình duyệt: guard phiên (hết hạn token, đổi mật khẩu rồi dùng tab khác), redirect sau đăng nhập, viền focus.
- Cảnh báo ESLint còn 139: `set-state-in-effect` 51, `exhaustive-deps` 42, `no-unused-vars` 24 (hàm/state chết ở `ManagerLayout.jsx`, `TaskManagementPage.jsx`, `TimeCapsulePage.jsx`… cần người xác nhận là code chết hay dang dở).
- Việc lớn đã ghi ở `KE_HOACH_SONNET_1H.md` (token trong URL, JWT trong localStorage, CSP, gom hệ màu).

## P0 — Chặn hoặc rủi ro trên môi trường thật (làm trước khi demo/nộp)

Không làm được từ máy local vì `Backend/.env` trỏ vào DB thật; cần người có quyền Render/Aiven.

| # | Việc | Ghi chú | Công sức |
|---|---|---|---|
| 0.1 | **Sao lưu DB Aiven** trước mọi lần deploy | Các hàm `ensure*Schema` tự `ALTER` ở request đầu | S |
| 0.2 | Đặt key Groq trên Render (AI trả 503) | Thiếu key thì chatbot chỉ trả theo luật | S |
| 0.3 | Chạy `npm run migrate` một lần, xem bước nào báo `✖`, rồi bật `DISABLE_RUNTIME_DDL=true` | Sau khi có bản sao lưu | S |
| 0.4 | Thử trên MySQL thật: giao dịch mua gói (`FOR UPDATE`, `DATE_ADD`), phân trang row-value `(created_at, id) < (...)`, tài khoản bị khóa chuyển về `/account-disabled` | Test hiện chỉ chạy trên DB giả | S |
| 0.5 | Đo p95 thật của `/api/chatbot/ask` trên Render | Free plan có cold start 30–60 giây; ghi số vào `TIEP_TUC_AI_TRA_LOI.md` | S |
| 0.6 | Dọn dữ liệu mẫu: tên hiển thị là email, tài khoản chưa liên kết với người trên cây, hồ sơ chỉ biết năm nhưng `*_date_precision = 'exact'` | Viết script chỉ đọc để liệt kê trước, sửa sau | M |

## P1 — Chờ nhóm quyết định (không code trước khi có câu trả lời)

1. Thêm trường "trưởng họ / trưởng chi" hay giữ câu trả lời "chưa ghi nhận"?
2. Trợ lý có được trả số điện thoại, địa chỉ không, theo quyền nào? Hiện mặc định không trả.
3. Có cấp key Groq riêng cho dev để chạy bộ kiểm tra có LLM không?
4. Bước chọn "bạn là ai" trong chat có gắn vĩnh viễn tài khoản với hồ sơ không? Hiện chỉ ghi vào `account_people`.

## P2 — Giá trị cao, rủi ro thấp (nên làm ngay)

| # | Việc | Hiện trạng đã kiểm | Ai làm | Công sức |
|---|---|---|---|---|
| 2.1 | **i18n**: đưa chuỗi tiếng Việt viết cứng vào `vi.json`/`en.json` | 36 file `.jsx` còn chuỗi có dấu; nhiều nhất là `ArchivedMembersDialog` (~23), `TimeCapsulePage` (~15), `GeneralPosts` (~8). Nhiều chỗ dạng `t(key) \|\| "fallback"` thì chỉ cần thêm key | Frontend | M |
| 2.2 ✅ | **Tô sáng đường quan hệ trên cây** khi AI trả lời câu quan hệ | `relationshipPath` mới chỉ vẽ trong chat (`FamilyPathVisualizer.jsx`, `RelationshipCard.jsx`); cây đã có `focusedPersonId` để nối vào | Frontend | M |
| 2.3 ✅ | "Tải thêm" cho thông báo, sự kiện, kỷ niệm | Đã có từ đợt 22/10 (kiểm lại ở đợt 9, không cần code mới): `GET /api/member/notifications`, `/api/member/memories`, `/api/member/events`, `/api/manager/events` đều nhận `limit`/`before_id` (keyset `(created_at, id) < (...)`) và trả thêm `has_more`/`next_before_id`; FE có nút "Tải thêm" ở `NotificationBell`, `TimeCapsulePage`, `TaskManagementPage`; test `pagination.lists.test.js`, `pagination.test.js`. Chỉ `getDashboard` còn `LIMIT 50` cố định (trang chủ chỉ hiện 5 mục nên không cần). Ghi chú cũ: `member.controller.js:798` lấy thông báo `LIMIT 50`, `:745` lấy sự kiện `LIMIT 50`, kỷ niệm có trần; dùng lại mẫu `beforeId` của bảng tin | Fullstack | M |
| 2.4 ✅ | Ghi log câu chatbot không hiểu (`intent = 'unknown'` hoặc phải nhờ LLM) + script lấy top 20 câu mỗi tuần | Xong ở đợt 22/10: `scripts/chatbot-unknown-report.js` (đọc `chatbot_messages`, gom nhóm), có test | Backend | S |
| 2.5 ✅ | Nút 👍/👎 cho câu trả lời của chatbot (lưu vào `chatbot_messages`) | Xong ở đợt 22/10: bảng `chatbot_feedback` + `POST /api/chatbot/messages/:id/feedback` + nút trong chat | Fullstack | S |
| 2.6 ✅ | Rà UI mobile 390px: tràn ngang, modal không đóng bằng Esc/click ra ngoài, nút bị che | Lấy danh sách từ lần chạy `KICH_BAN_TEST_FULL.md` | Design | M |
| 2.7 ✅ | Thay 17 chỗ `window.confirm` bằng dialog chung của app | Giữ lại có chủ đích vì handler phải chuyển sang async; nên làm cùng 2.6 | Design | M |

## P3 — Chất lượng mã (làm khi đã có test bảo vệ)

| # | Việc | Hiện trạng | Công sức |
|---|---|---|---|
| 3.1 ✅ | Validate đầu vào bằng zod cho các route ghi (auth, tree, fund, payment, calendar) | Chưa dùng thư viện nào | M |
| 3.2 | Tách `FamilyTreeEditor.jsx` | **4142 dòng**; trước khi tách cần test giao diện cho thêm, sửa, xóa người và lưu bố cục | L |
| 3.3 | Tách `ClanFundPage.jsx` (2756 dòng) và `modules/member/member.controller.js` (2374 dòng) | Tách theo nhóm route hoặc tab, không đổi API | M–L |
| 3.4 | Giảm cảnh báo ESLint ở frontend | Lần đo trước có 145 cảnh báo | S–M |
| 3.5 | Test tích hợp với MySQL thật (Docker) cho thanh toán và phân trang | Có thư mục `docker/`; xử lý luôn được 0.4 | M |

## P4 — Tính năng mới

| # | Việc | Ghi chú | Công sức |
|---|---|---|---|
| 4.1 ✅ | Sự kiện gắn với người, lặp hằng năm (giỗ, sinh nhật) | Lịch đã tự tính từ hồ sơ; còn thiếu bước gắn sự kiện do người dùng tạo với `person_id` | M |
| 4.2 ✅ | Sửa/xóa sự kiện qua chat, gợi ý chủ động ("sắp tới giỗ cụ X") | Luôn có bước xác nhận; chỉ trên sự kiện do chính người dùng tạo | M |
| 4.3 ✅ | Thu gọn/mở rộng nhánh, nhớ theo từng người dùng | Mặc định mở 3 đời quanh người đang xem | M |
| 4.4 một phần | Xuất báo cáo PDF gia phả | Đã có trang in "Sổ gia phả" (in/lưu PDF bằng trình duyệt); chưa tạo file PDF thật | M |
| 4.5 (một phần: xuất) | Nhập/xuất GEDCOM | Xuất xong ở đợt 9: `GET /api/manager/tree/export.gedcom` (`gedcom.service.js`, nút "Xuất GEDCOM" ở trang cây của quản lý). **Nhập chưa làm** (cần map id, phát hiện trùng với `duplicates.service`, xử lý tên/ngày không chuẩn) | L |
| 4.6 | Hoàn tác thay đổi cây | Cần bảng lịch sử trước/sau | L |
| 4.7 | Đối soát quỹ qua SePay, web push | | L |

## P5 — Quy mô lớn (chỉ làm khi đo thấy chậm)

Đo trước bằng `scripts/load-test-family-tree.js`.

| # | Việc | Khi nào |
|---|---|---|
| 5.1 | Chuyển media từ MySQL LONGBLOB sang object storage, bỏ `?token=` trong URL (`shared/utils/media.js`, `api/voiceService.js`) | Khi DB phình to hoặc chậm; cần chọn dịch vụ và có key |
| 5.2 | Tải cây theo nhánh/độ sâu | Dòng họ có hơn ~5.000 người |
| 5.3 | Ghép cạnh anh chị em theo kiểu lazy cho gia đình trên 300 con | TODO ở `relationshipEngine.js:355` |
| 5.4 | Bảng dựng sẵn `person_ancestors` | Mở cây hoặc hỏi quan hệ mất hơn 1 giây |
| 5.5 | Dùng chung `graph version` và cache tài khoản giữa các instance (Redis/bảng) | Khi chạy nhiều instance; hiện đổi role/khóa tài khoản trễ tối đa 30 giây (`AUTH_ACCOUNT_CACHE_TTL_MS`) |

---

## Thứ tự đề xuất

1. P0.1 → P0.2 → P0.4 (người có quyền Render/Aiven làm, khoảng 1 giờ).
2. Chạy `KICH_BAN_TEST_FULL.md` để có danh sách lỗi UI thật, đưa vào 2.6.
3. Làm song song 2.1 + 2.3 (frontend), 2.4 + 2.5 + 3.1 (backend), 2.6 + 2.7 (design), 2.2 (cây).
4. Sau đó P3, P4 theo thời gian còn lại. P5 chỉ làm khi có số đo.

Kiểm tra trước mỗi lần push: `cd Backend && npm test`, `cd Frontend && npm test && npx eslint src && npx vite build`.
