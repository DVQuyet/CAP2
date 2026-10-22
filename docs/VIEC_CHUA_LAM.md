# Việc chưa làm — CAP2 (Gia Phả Việt)

Cập nhật 22/10/2026, quét lại mã ở commit `f41159b`. Đây là **danh sách duy nhất** các việc còn mở; gộp từ
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

- 2.1 i18n: ~330 chuỗi trong 21 file + test so khớp key vi/en (`Frontend/tests/localeParity.test.js`). Còn sót: tiêu đề cột bảng sự kiện ở `TaskManagementPage.jsx` (~dòng 1599).
- 2.2 "Xem trên cây" từ chat (`?focus=&highlight=`), 2.3 "Tải thêm" thông báo/kỷ niệm/sự kiện quản lý, 2.4 log câu chưa hiểu + `scripts/chatbot-unknown-report.js`, 2.5 👍/👎.
- Chat: giao diện mới, màn chào, mobile toàn màn hình, báo máy chủ khởi động, xóa lịch sử (ẩn mềm), chuẩn hóa cách gõ (không dấu, viết tắt) an toàn với tên người. E2E 107/107.
- Test backend không thể chạm DB thật (`tests/setup.env.js`).

**Deploy backend lần này cần:** sao lưu DB, rồi `npm run migrate` (bảng `chatbot_feedback`, cột `chatbot_messages.hidden_at`). Chưa migrate thì chat vẫn chạy, chỉ 👍/👎 và xóa lịch sử báo lỗi.

Đợt 2 cùng ngày (`d7cec89`..`a3e019a`):
- Chatbot hiểu 30 câu phương ngữ/teencode/lỗi l-n/câu kể dài (e2e 137/137, test tên người `tests/chatbot.dialectTeencode.test.js`).
- 2.6/2.7: `ConfirmDialog` + `useConfirm()` thay toàn bộ 17 `window.confirm`; modal có form hỏi "bỏ thay đổi?" khi Esc/bấm nền (`useDismissable`).
- `LoadingState`/`EmptyState`/`ErrorState` dùng chung, lỗi thân thiện (`friendlyError.js`), banner "máy chủ đang khởi động" toàn app (`services/pendingRequests.js`).

Còn mở từ đợt này:
- Rà lại 4 ca e2e có kỳ vọng tự đặt: "thím ba có mấy người con", "ai qh gan nhat vs toi", "nhánh của ông bình…", "cụ làm quan…". "anh hai/chú út" mới bỏ thứ bậc, chưa lọc theo thứ tự con; "ong co" không dấu chưa bắt.
- Lỗi hành động (like, bình luận, tạo sự kiện, giao việc, quỹ) vẫn hiện `err.message` thô; trang admin chưa có state chung.
- Danh sách sự kiện của member chưa phân trang (ít khi dài).
- Chưa ai mở giao diện mới trên trình duyệt thật (390px/1280px).

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
| 2.2 | **Tô sáng đường quan hệ trên cây** khi AI trả lời câu quan hệ | `relationshipPath` mới chỉ vẽ trong chat (`FamilyPathVisualizer.jsx`, `RelationshipCard.jsx`); cây đã có `focusedPersonId` để nối vào | Frontend | M |
| 2.3 | "Tải thêm" cho thông báo, sự kiện, kỷ niệm | `member.controller.js:798` lấy thông báo `LIMIT 50`, `:745` lấy sự kiện `LIMIT 50`, kỷ niệm có trần; dùng lại mẫu `beforeId` của bảng tin | Fullstack | M |
| 2.4 | Ghi log câu chatbot không hiểu (`intent = 'unknown'` hoặc phải nhờ LLM) + script lấy top 20 câu mỗi tuần | Chưa có log hay script nào | Backend | S |
| 2.5 | Nút 👍/👎 cho câu trả lời của chatbot (lưu vào `chatbot_messages`) | Chưa có | Fullstack | S |
| 2.6 | Rà UI mobile 390px: tràn ngang, modal không đóng bằng Esc/click ra ngoài, nút bị che | Lấy danh sách từ lần chạy `KICH_BAN_TEST_FULL.md` | Design | M |
| 2.7 | Thay 17 chỗ `window.confirm` bằng dialog chung của app | Giữ lại có chủ đích vì handler phải chuyển sang async; nên làm cùng 2.6 | Design | M |

## P3 — Chất lượng mã (làm khi đã có test bảo vệ)

| # | Việc | Hiện trạng | Công sức |
|---|---|---|---|
| 3.1 | Validate đầu vào bằng zod cho các route ghi (auth, tree, fund, payment, calendar) | Chưa dùng thư viện nào | M |
| 3.2 | Tách `FamilyTreeEditor.jsx` | **4142 dòng**; trước khi tách cần test giao diện cho thêm, sửa, xóa người và lưu bố cục | L |
| 3.3 | Tách `ClanFundPage.jsx` (2756 dòng) và `modules/member/member.controller.js` (2374 dòng) | Tách theo nhóm route hoặc tab, không đổi API | M–L |
| 3.4 | Giảm cảnh báo ESLint ở frontend | Lần đo trước có 145 cảnh báo | S–M |
| 3.5 | Test tích hợp với MySQL thật (Docker) cho thanh toán và phân trang | Có thư mục `docker/`; xử lý luôn được 0.4 | M |

## P4 — Tính năng mới

| # | Việc | Ghi chú | Công sức |
|---|---|---|---|
| 4.1 | Sự kiện gắn với người, lặp hằng năm (giỗ, sinh nhật) | Lịch đã tự tính từ hồ sơ; còn thiếu bước gắn sự kiện do người dùng tạo với `person_id` | M |
| 4.2 | Sửa/xóa sự kiện qua chat, gợi ý chủ động ("sắp tới giỗ cụ X") | Luôn có bước xác nhận; chỉ trên sự kiện do chính người dùng tạo | M |
| 4.3 | Thu gọn/mở rộng nhánh, nhớ theo từng người dùng | Mặc định mở 3 đời quanh người đang xem | M |
| 4.4 | Xuất báo cáo PDF gia phả | | M |
| 4.5 | Nhập/xuất GEDCOM | | L |
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
