# Việc chưa làm — CAP2 (Gia Phả Việt)

Cập nhật 23/10/2026, quét lại mã ở commit `03e5681`. Lộ trình dài hạn: `KE_HOACH_TONG_THE.md` (Giai đoạn 0 và 1 xong phần mã, đang dở Giai đoạn 2, xem Đợt 14). Đây là **danh sách duy nhất** các việc còn mở; gộp từ
`nhat-ky/CAI_THIEN_HE_THONG.md` (mục "Chưa làm"), `nhat-ky/TOI_UU_AI_VA_GIA_PHA.md` (mục 2–6) và `nhat-ky/TIEP_TUC_AI_TRA_LOI.md` (mục "Chờ nhóm quyết định").
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

Đợt 15 (12/11) — phần còn lại của trang chủ do admin quản lý (việc của đợt 11, không thuộc giai đoạn nào trong `KE_HOACH_TONG_THE.md`) (backend `89acfe8`, frontend đợt này):
- **Đã xong:** khối demo ở `/tinh-nang`, trang `/loi-ich` (benefits, benefits_why), sidebar `/tin-tuc` (tin mới, danh mục, đăng ký), trang chi tiết bài `/tin-tuc/:id` (`NewsArticlePage.jsx`, `fetchPublicNewsItem`), video và FAQ ở `/huong-dan` (nhúng chỉ qua `buildVideoEmbed`, không dùng link admin nhập làm `src`), chân trang (`SiteFooter.jsx` + `.css`: thương hiệu, liên hệ, cột link, mạng xã hội). Mọi khối ẩn được; chưa có dữ liệu DB thì giao diện như cũ.
- Trang admin `/dashboard/landing`: 5 tab theo nhóm trang, đủ 18 mục, ô "Nội dung chi tiết" cho bài tin, chọn biểu tượng liên hệ/mạng xã hội, kiểm link/ảnh/video trước khi lưu. Tách thành `landingAdminConfig.js`, `LandingFields.jsx`, `LandingEditors.jsx` (file gốc 439 → 300 dòng).
- **Sửa lỗi i18n:** khối `admin.landing` nằm nhầm ở `eventsTasks.admin.landing` trong vi/en nên trang admin trang chủ hiện khóa thô; đã chuyển về đúng chỗ (không đổi chuỗi nào), thêm 60 key mới.
- `buildDefaultSection("demo")` lấy đủ 3 điểm nổi bật (trước chỉ 2, "Lấy nội dung hiện tại" sẽ làm mất điểm thứ 3).
- Test: `tests/landingContent12.test.js` (+16). Sau khi gộp lên `origin/main` (Giai đoạn 0–2 của Fable): Frontend 110 test, ESLint 0 lỗi / 110 cảnh báo, `vite build` OK; đã mở lại trên trình duyệt với router 7. Đổi chỉ ở Frontend nên không chạy lại test Backend.
- **Deploy cần:** sao lưu DB rồi `npm run migrate` (file `database/migrations/2026_10_30_site_content_more.sql`: cột `content_vi`/`content_en`).
- **Cần QA trình duyệt (chưa chạy):** 4 trang công khai và chân trang khi chưa seed (phải giống cũ); seed rồi sửa từng mục mới; video YouTube/Vimeo/.mp4 và link sai bị chặn; bài tin có nội dung mở `/tin-tuc/:id`, id sai hiện "Không tìm thấy"; 390px; nút demo giờ là `<button>` gọi `navigate`/`window.open` (giữ CSS cũ).
- Còn mở: khối "custom" chưa làm; phân trang ở `/tin-tuc` vẫn là nút giả; ô đăng ký nhận tin chưa gửi đi đâu; `App.css` có hai khối `.site-footer` chồng nhau.

Đợt 14 (10/11) — Giai đoạn 2 (A2: tương tác mượt), **đang làm dở, làm tiếp từ đây**:
- **Đã xong, đã push** (`0de1aa4`): A2.1 công cụ đo `Frontend/dev/tree-perf.mjs` + trang xem thử nhận `?n=500|2000`, `?expand=1`, `?profile=1`; A2.2 `hooks/useNodeDrag.js` thay 4 handler kéo (trong lúc kéo chỉ đổi transform, thả mới ghi state; đường nối mờ đi vì chưa đi theo); A2.3 thẻ đặt vị trí bằng `transform: translate()`.
- **Số đo** (Vite dev, React bản dev, Chrome headless không GPU; chỉ để so trước/sau), kéo một thẻ 60 bước: 500 người 62 commit × 65 ms, 23 fps → 5 commit, 49 fps. 2.000 người trước khi sửa: 63 commit × 227 ms, 3,8 fps; DOM 26.484 phần tử.
- **Đang dở, CHƯA xong, nằm ở nhánh local `wip/a2-memo-culling`** (commit `4ea0091`, chưa push, không gộp vào main khi chưa sửa lỗi): A2.4 thẻ bọc `React.memo` với props nguyên thủy (`TreeCanvasNodes.jsx`, `TreeCanvasLines.jsx`, `useStableHandlers.js`) và A2.5 chỉ vẽ phần cây đang nhìn (`utils/tree-editor/treeViewport.js`, state `viewRect`, hàm `syncView`/`moveView` trong `FamilyTreeEditor.jsx`).
  - **Lỗi phải sửa trước**: cây từ 150 thẻ trở lên, kéo nền đi xa thì màn hình trống thẻ. Đo 2.000 người sau 3 lần kéo nền 900px: 0 React commit, 0 thẻ trong vùng nhìn, tức `viewRect` không được cập nhật khi kéo nền. Nghi `onTransformed` của react-zoom-pan-pinch 4.0.3 không gọi khi kéo nền (chưa xác nhận). Hướng thử: thêm `onPanning`/`onPanningStop` gọi `syncView`, rồi chạy lại `node dev/tree-perf.mjs 2000` và xem dòng "sau các thao tác" có `cardsInView` > 0.
  - Số đo của nhánh dở (chưa tin được cho tới khi sửa lỗi trên): 500 người kéo thẻ 4 commit, 59 fps, DOM 6.633 → 1.738 phần tử; 2.000 người kéo thẻ 59 fps, DOM 26.484 → 1.842.
  - Chưa làm ở nhánh dở: test cho `treeViewport.js`; kiểm tra lại bộ ảnh `dev/tree-shots.sh` (đặc biệt chọn người, tô đường quan hệ, thẻ tham chiếu); thử kéo thẻ vợ chồng, kéo nhiều thẻ, đổi cỡ thẻ; lúc mới mở cây lớn vẫn vẽ hết một lần trước khi biết vùng nhìn.
- **Chưa bắt đầu**: A2.6 mức chi tiết theo zoom (state chỉ đổi khi vượt ngưỡng; hiện mỗi nấc lăn chuột vẫn render lại editor), A2.7 bỏ `backdrop-filter` trong vùng cây, A2.8 chuyển động 120–180 ms, tách tiếp `FamilyTreeEditor.jsx` (còn 3.905 dòng trên main; đích E7.2 là dưới 300).
- **Chưa thử tay**: mọi thứ của A1 và A2 mới kiểm bằng Chrome headless; cần kéo thả, rê chuột, điện thoại thật.

Đợt 13 (10/11) — Giai đoạn 1 (A1: thẻ trên cây), xem `docs/anh/cay-A1/README.md`:
- **Đã xong**: A1.1 bộ ảnh trước/sau (15 ảnh mỗi bên, script `Frontend/dev/tree-shots.sh`); A1.2 biến `--tc-*`, `--tl-*` và màu trạng thái trong `tokens.css`; A1.3 kiểu thẻ gom về `styles/TreeCard.css` + `TreeCardExtras.css` (571 dòng), gỡ 238 rule thẻ/đường nối khỏi hai file cũ (5.750 → 4.049 dòng), `.fte-cardName` còn một khai báo gốc; A1.4 thứ bậc thông tin; A1.5 `TreeCardToolbar.jsx`, thẻ thường còn 5 phần tử DOM; A1.6 `styles/TreeLines.css`.
- **Sửa kèm**: nhãn % zoom và chế độ "thu nhỏ xa" bị cũ sau khi nhảy tới một người hoặc tô đường quan hệ (`focusPerson`, `fitToPersonIds` không cập nhật `currentScale`).
- **Khác kế hoạch**: mã chỉ có 2 chế độ hiển thị và 3 chủ đề; không dùng `vector-effect: non-scaling-stroke` cho đường nối vì Chrome vẽ mờ/mất nét dọc khi zoom nhỏ, thay bằng biến `--fte-inv-scale`.
- **Chưa kiểm tra**: mới chụp bằng Chrome headless. Cần thử tay: rê chuột hiện thanh thao tác, kéo thẻ, đổi cỡ thẻ, điện thoại thật (chạm để chọn rồi mới thấy nút), thẻ tham chiếu, vợ lẽ/ly hôn (viền nét đứt), tộc trưởng/thủy tổ (huy hiệu góc), người đang sửa/lỗi dữ liệu.
- **Còn mở**: thẻ vợ chồng chưa có huy hiệu thủy tổ (thẻ không biết ai là thủy tổ); vạch màu của nửa phải nằm sát nút thắt; trên điện thoại cây tràn mép phải khi "vừa khít" (để A3.3).

Đợt 12 (10/11) — Giai đoạn 0 của `KE_HOACH_TONG_THE.md` (sửa gấp và dọn dẹp), commit `73bb25a`..:
- **Đã xong trong mã**: ẩn SĐT/email/địa chỉ với thành viên thường (H2.3, `genealogy/contactPrivacy.js`); CORS theo `FRONTEND_URL` + `CORS_ORIGINS` (H3.3); không trả `error.message` thô (H3.2); bỏ `console.log` (H4.6); `npm audit` về 0 ở cả hai phía: `xlsx` → `exceljs`, `react-router-dom` 6 → 7 (H3.4); dọn gốc dự án, `CLAUDE.md`, ảnh nền WebP 6,2 MB → 175 KB (E7.1); MySQL local trong `docker/docker-compose.yml` (H2.5); workflow sao lưu `.github/workflows/backup.yml` + `docs/SAO_LUU.md` (H2.1). G0 (model Groq) và H3.1 (token trên URL ảnh) đã xong từ đợt 6.
- **Kiểm tra đã chạy**: Backend 291 test, e2e chatbot 199/199, Frontend 89 test, ESLint 0 lỗi/114 cảnh báo, build. Chưa mở trình duyệt.
- **Phải làm tay trước khi coi Giai đoạn 0 là xong**:
  1. Sao lưu: đặt 6 secret `BACKUP_*` trên GitHub, chạy tay workflow một lần, thử khôi phục theo `docs/SAO_LUU.md`. Workflow chưa chạy lần nào.
  2. MySQL local: bật Docker Desktop rồi `docker compose -f docker/docker-compose.yml up -d` + `npm run migrate`. File compose mới chỉ kiểm cú pháp, chưa chạy thật (Docker trên máy đang tắt).
  3. Render: nếu frontend chạy ở tên miền khác hai tên miền mặc định trong `config/cors.js` thì đặt `CORS_ORIGINS`. Xem `GROQ_MODEL` có còn trỏ model đã ngừng không (G-1) và xem hạn mức thật trong trang quản trị Groq để điền bảng G2/E2.
  4. Trình duyệt: đi nhanh đăng nhập → cây → quay lại/đổi trang (router 7), ảnh nền mới ở trang chủ/đăng nhập/layout, logo ở thanh bên, xuất và nhập Excel quỹ (chỉ còn nhận `.xlsx`), thành viên thường mở hồ sơ người khác trên cây không còn thấy SĐT/email/địa chỉ; thành viên nhập khóa sửa tạm thì các ô liên hệ của người được sửa hiện lại và lưu không bị xóa trắng.
  5. `database/schema/defaultdb.sql` (đã gỡ ở `14710e5`) chứa email và mã băm mật khẩu tài khoản thật và vẫn nằm trong lịch sử git từ commit đầu. Nếu repo công khai: đổi mật khẩu các tài khoản đó; muốn xóa hẳn khỏi lịch sử thì phải viết lại lịch sử (git filter-repo) và force-push.
- **Còn mở của E7.1**: gộp hai `vercel.json` (cần biết Root Directory của project trên Vercel); `public/sodogiapha.png` 4 MB không thấy mã nào dùng, giữ lại vì nội dung trang chủ trong DB có thể trỏ tới; `init.sql` chỉ có 18 bảng, phần còn lại do `npm run migrate` tạo (sinh lại `init.sql` đầy đủ thuộc E7.9).

Đợt 11 (30/10) — trang chủ do admin quản lý, commit `90586db` (backend), `3d8aaa9` (frontend):
- **Đã xong:** admin thêm/sửa/xóa/sắp xếp/ẩn-hiện nội dung trang chủ không cần sửa mã. Mô hình 2 bảng `landing_sections` (mỗi mục 1 dòng: hero, about, features, stats, news, guide; chữ vi/en, ảnh, thứ tự, hiển thị) và `landing_items` (mục con: tiêu đề/nội dung/giá trị-ngày/nhãn liên kết vi-en, ảnh, link, icon). Chọn 2 bảng thay vì JSON mỗi mục để sửa/xóa/sắp xếp từng mục con bằng một câu SQL, không phải đọc-sửa-ghi cả khối.
- API: `GET /api/public/landing?lang=` (không đăng nhập, cache 60s, `content: null` khi chưa có dữ liệu/chưa migrate nên trang giữ nguyên i18n) và `/api/admin/landing/*` (chỉ admin; sửa mục, CRUD + sắp xếp mục con, khôi phục mặc định, seed). Chi tiết trong `docs/API_LIST.md`. Chỉ lưu văn bản thuần (bỏ thẻ HTML), link/ảnh chỉ `http(s)` hoặc `/...`; validate bằng bộ `validate` sẵn có của repo (không dùng zod).
- Frontend: `useLandingContent()` + hàm ghép `features/public/landing/landingContent.js`; Hero, Giới thiệu, Tính năng, Số liệu và trang Tính năng/Tin tức/Hướng dẫn dùng chung dữ liệu; trang admin `/dashboard/landing` ("Trang chủ" trong menu admin). Test: backend +10 (226 tổng), frontend +10 (78 tổng); ESLint 138 cảnh báo (không tăng).
- **Deploy cần:** sao lưu DB, rồi `npm run migrate` (hoặc chạy `database/migrations/2026_10_30_site_content.sql`) tạo `landing_sections`, `landing_items`. Chưa migrate thì trang chủ vẫn chạy như cũ; trang admin báo "chưa tạo bảng". Sau khi deploy: vào `/dashboard/landing` bấm "Lấy nội dung hiện tại" để sao chép chữ vi/en đang dùng vào DB rồi mới sửa.
- **Cần QA trình duyệt (chưa chạy được vì không chạy server/DB thật):** (1) chưa seed: trang chủ giống hệt cũ; (2) seed rồi sửa tiêu đề hero/ảnh nền/nút, kiểm tra xuống dòng và ảnh nền; (3) ẩn từng khối rồi đổi thứ tự khối trên trang chủ; (4) thêm/sửa/xóa/đổi thứ tự thẻ Tính năng, Số liệu, Tin tức, Hướng dẫn rồi xem /tinh-nang, /tin-tuc, /huong-dan; (5) tải ảnh lên (≤ 5MB) và dán URL; nhập `javascript:` vào link phải bị chặn; (6) đổi ngôn ngữ vi/en; (7) "Khôi phục mặc định" có hộp xác nhận; (8) điện thoại 390px; (9) thành viên/quản lý vào `/dashboard/landing` bị chặn (403).
- **Việc còn mở:** khối "demo" của Tính năng (tiêu đề + 2 nút + cây mẫu), khối Lợi ích (`/loi-ich`), sidebar Tin tức (tin mới, danh mục, đăng ký), video và FAQ của Hướng dẫn, chân trang vẫn là i18n cứng; `News` chưa có trang chi tiết từng bài (nút "Đọc thêm" trỏ `link_url` nếu admin nhập). Mục "custom" (khối tự thêm) chưa làm. Bản tiếng Anh để trống thì mục con dùng chữ tiếng Việt, còn chữ cấp mục dùng i18n mặc định. Cache công khai là bộ nhớ từng tiến trình (nhiều instance sẽ chậm tối đa 60s mới đồng bộ). Ảnh upload lưu trong `media_files` (LONGBLOB) nên ảnh lớn làm DB phình; cân nhắc CDN.

Đợt 10 (30/10) — tối ưu UI (không đổi giao diện), commit `016e263`, `cd146de`, `0e8660c`, `95befcf`:
- **Bundle vào trang** (`016e263`): bản dịch tải theo ngôn ngữ đang dùng (`i18n.js` + `i18nReady` trong `main.jsx`), `AdminLayout`/`ManagerLayout`/`MemberLayout` lazy (kéo theo socket.io-client), biểu đồ `ManagerDashboard` tách chunk. `index.js` 120,6 → 23,6 KB gzip; JS ban đầu ~196 → ~134 KB (kể cả bản dịch vi); `index.css` 30,9 → 22,2 KB.
- **Design tokens** (`cd146de`): `Frontend/src/styles/tokens.css` (67 biến: 30 màu, bo góc, cỡ chữ, z-index, bóng, khoảng cách), thay 1.945 giá trị CSS trùng khớp tuyệt đối bằng `var(--…)` trong 39 file; đã so CSS build trước/sau (chỉ khác cách minifier viết lại). Chưa gộp màu gần giống, chưa có dark mode.
- **A11y** (`95befcf`): `aria-label` cho 59 nút chỉ có icon và 29 ô nhập thiếu nhãn, alt i18n cho ảnh, `role="button"` + Enter/Space cho 9 thẻ/dòng bấm được (`shared/utils/a11yClick.js`), `styles/a11y.css` giảm chuyển động theo `prefers-reduced-motion`; 17 key `a11y.*`. ESLint 139 → 138.
- **Đề xuất cần QA trình duyệt**: `docs/UI_TOI_UU_DE_XUAT.md` (915 màu hex khác nhau, 122 kiểu nút, `.btn-primary` định nghĩa 2 lần trong `App.css`, ~140 chỗ nghi lỗi mobile, ảnh nền `backgroundbanner.png` 6,2 MB / `sodogiapha.png` 4,1 MB nên đổi WebP).
- **Deploy cần**: không có migration.
- **Cần QA trình duyệt**: lần tải đầu chờ bản dịch, đổi ngôn ngữ (import động), fallback khi tải layout theo vai trò, dashboard quản lý hiện `LoadingState` trước biểu đồ; Tab/Enter/Space trên thẻ thư mục dòng họ và dòng quỹ (nút bên trong vẫn bấm riêng được); viền focus mới trên các thẻ đó.
- Còn mở: các mục trong `UI_TOI_UU_DE_XUAT.md`; `html-to-image` không dùng (gỡ được); Login/Register vừa import tĩnh vừa lazy nên lazy không có tác dụng; `DashboardHome` còn import recharts trực tiếp; logo trùng trong `public/`.

Đợt 9 (30/10) — nút soạn thông báo từ lịch, xuất GEDCOM, AI tóm tắt quỹ:
- **Nút "Soạn thông báo cho sự kiện này"** (trang lịch `/user|/manager/calendar`): sự kiện chưa qua, không phải lịch hệ thống/sinh nhật → chuyển tới `/user|/manager/posts?compose=1&event=<id>`; form đăng bài mở sẵn panel AI với sự kiện đã chọn (dùng lại `POST /api/ai/post-draft/generate`). Trang lịch của admin (`/dashboard/calendar`) chưa có nút vì không dùng form đăng bài này. Chỉ frontend, test `postAiHelpers.test.js`.
- **2.3 "Tải thêm"** ✅: kiểm lại thì đã làm từ đợt 22/10 (thông báo, kỷ niệm, sự kiện member/manager đều có `before_id` + `has_more`/`next_before_id` + nút FE + test) → chỉ cập nhật tài liệu, không đổi code.
- **4.5 Xuất GEDCOM (một phần)**: `GET /api/manager/tree/export.gedcom` (admin/manager; admin thêm `clan_id`) → file `.ged` GEDCOM 5.5.1 UTF-8, CRLF: INDI (NAME `Tên /Họ/`, SEX, BIRT/DEAT theo `*_date_precision`, PLAC = quê quán, NOTE = tiểu sử), FAM (HUSB/WIFE/CHIL, MARR), có cả quan hệ `visibility=managers`; không có SĐT/email/địa chỉ; tên file qua `buildContentDisposition`. `gedcom.service.js` (hàm thuần) + `gedcom.controller.js`; nút "Xuất GEDCOM" ở trang cây quản lý. Test `genealogy.gedcom.test.js`.
- **AI tóm tắt quỹ**: `POST /api/ai/fund-summary/generate` (admin/manager/member như xem thống kê quỹ, `aiRateLimit`, zod `generateFundSummary`, 503 `AI_UNAVAILABLE`). Server tự tính số liệu khoản đã duyệt theo kỳ tháng/quý/năm hoặc khoảng ngày (`fundSummary.service.js`), prompt chỉ có số liệu (không tên người), trả `summary` + `numbers` + `unverified[]` (số trong lời tóm tắt không có trong số liệu); kỳ không có giao dịch thì không gọi AI. FE: `FundAISummary.jsx` trong `FundAnalytics`. Test `ai.fundSummary.test.js` (DB và Groq giả).
- **Deploy cần**: không có migration mới. Backend chỉ thêm endpoint; cần `GROQ_API_KEY` thì AI tóm tắt mới chạy (không có thì 503, UI báo thân thiện).
- **Cần QA trình duyệt** (chưa ai mở): nút soạn thông báo trên lịch → form đăng bài (390px/1280px, id `death-…`/`manager-event-…`); nút "Xuất GEDCOM" tải file và mở thử bằng phần mềm gia phả (Gramps/Ancestry); khung "AI tóm tắt" ở trang quỹ của quản lý (mobile, kỳ tùy chọn, key Groq thật).
- Còn mở: **nhập GEDCOM** chưa làm (cần map id, xử lý tên/ngày không chuẩn, đối chiếu trùng với `duplicates.service`); GEDCOM chưa xuất DIV (ly hôn), OBJE (ảnh), nơi sinh riêng (PLAC đang là quê quán); AI tóm tắt chưa có nút ở trang quỹ của member và chưa so sánh với kỳ trước; ngưỡng "giao dịch lớn" (≥ 10% tổng kỳ, tối thiểu 1 triệu) là giả định cần nhóm xác nhận.

Đợt 8 (30/10) — AI soạn bài đăng, tô sáng đường quan hệ, người trùng lặp:
- **AI soạn bài/thông báo**: `POST /api/ai/post-draft/generate` (`postDraft.service.js`, zod `generatePostDraft`, quyền admin/manager/member như đăng bài, `aiRateLimit`, 503 `AI_UNAVAILABLE`). Nhận `idea` và/hoặc `event_id` (id lịch số, `birthday-/death-<người>-<năm>`, `manager-event-<id>-<ngày>`); server tự đọc sự kiện trong dòng họ, 404 nếu không được xem; trả `unverified[]` (ngày/giờ AI tự thêm). FE: `PostAIAssist.jsx` trong form tạo bài (chọn sự kiện sắp 30 ngày, loại, giọng). Test `ai.postDraft.test.js`, `postAiHelpers.test.js`. Không cần migration.
- **2.2 ✅ Tô sáng đường quan hệ**: nút "Xem đường quan hệ trên cây" gửi `path` (id người theo thứ tự) qua `?path=`/sự kiện; `treePathHighlight.js` (hàm thuần) tính node + cạnh; cây tô cam, làm mờ phần còn lại, hiện tạm người trong nhánh đang thu gọn (`revealIds` trong `useTreeViewMode`, không lưu), thu phóng vừa, nút "Bỏ tô sáng". Test `treePathHighlight.test.js`.
- **Người trùng lặp**: `GET /api/manager/tree/duplicates` (admin/manager, `limit`/`offset`), `POST /api/manager/tree/duplicates/dismiss`. `duplicates.service.js` chấm điểm (tên bỏ dấu, lệch 1 ký tự, năm sinh theo precision, giới tính, cha mẹ, đời), gom xô theo tên gọi, loại cặp cha-con/vợ-chồng. Trang `/manager/duplicates` so sánh cạnh nhau, "Mở hồ sơ" (tới cây), "Không trùng" (có xác nhận). Test `genealogy.duplicates.test.js`.
- **Deploy cần**: sao lưu DB rồi `npm run migrate` (bảng `genealogy_duplicate_dismissals`, file `database/migrations/2026_10_30_genealogy_duplicate_dismissals.sql`). Chưa migrate thì danh sách vẫn chạy, chỉ "Không trùng" tự tạo bảng khi lưu lần đầu (nếu DDL runtime bị tắt thì báo lỗi).
- **Cần QA trình duyệt** (chưa ai mở): form đăng bài + AI trên 390px; "Xem đường quan hệ trên cây" với đường đi qua nhánh thu gọn (desktop/mobile, cả `.fte2`); trang `/manager/duplicates`.
- Còn mở: KHÔNG có gộp tự động (rủi ro cao: phải dời cha mẹ/con/vợ chồng/tài khoản/media); hoàn tác "Không trùng" chưa có UI; gợi ý trùng chưa xét tên vợ/chồng/quê quán; "Soạn thông báo cho sự kiện" mới ở form đăng bài (chưa có nút trên trang lịch); đường quan hệ bị lọc quyền riêng tư có thể thiếu cạnh (vẫn tô node).

Đợt 7 (30/10) — AI gợi ý tiểu sử:
- **Đã gỡ (10/11, khi merge origin/main):** trùng chức năng với `POST /api/ai/person/:id/biography-draft` + `BiographyDraftDialog` (đợt 6 nhánh local). Đã xóa endpoint, `personBiography.service.js`, schema, `BiographyAIButton.jsx`, i18n `tree.inspector.bioAi`, CSS `.fte-bioAi*` và test. Các dòng dưới chỉ là lịch sử.
- `POST /api/ai/person-biography/generate` (`ai.controller.js`, `personBiography.service.js`, zod `generatePersonBiography`): server tự đọc dữ kiện theo `person_id` (ngày theo `*_date_precision`, quê quán, cha mẹ, vợ/chồng, con; bỏ qua quan hệ `visibility=managers` với người không phải admin/manager), kiểm quyền như sửa hồ sơ (`assertTreeMutationPermission` + `assertCanManagePersonId`), prompt không có SĐT/địa chỉ, ghi chú người dùng coi là dữ liệu không đáng tin. Chỉ trả bản nháp.
- Frontend: `BiographyAIButton.jsx` trong `PersonInspector` điền ô tiểu sử, hỏi xác nhận khi ô đã có chữ; i18n vi/en.
- Test: `tests/ai.personBiography.test.js` (8 test, DB và Groq giả). Không cần migration.
- Còn mở: QA trên trình duyệt (desktop + điện thoại), chưa dùng family_memories vì bảng không gắn với người cụ thể; hỏi nhóm có cho đưa nơi sinh/địa chỉ vào bản nháp không.

Đợt 6 (30/10, Sonnet) — rà lại B3, 2.4, 2.5 theo kế hoạch 1 giờ; **không cần code mới**:
- B3: tiêu đề cột bảng sự kiện ở `TaskManagementPage.jsx` đã dùng `t()` từ trước.
- 2.4 (log câu chưa hiểu + `scripts/chatbot-unknown-report.js`) và 2.5 (👍/👎: bảng `chatbot_feedback`, `POST /api/chatbot/messages/:id/feedback`, nút trong chat, i18n vi/en, test `chatbot.feedback.test.js`) đã có từ đợt 22/10; bảng P2 giờ đánh dấu ✅.
- Baseline kiểm tra: Backend 167 test pass; Frontend 53 test pass, ESLint 0 lỗi / 139 cảnh báo (không đổi), `vite build` OK.
- Migration cần khi deploy: không có thêm; vẫn là các file của đợt 5 và 22/10 (`password_changed_at`, `chatbot_feedback`, `chatbot_messages.hidden_at`).
- Còn mở: như danh sách "Còn mở từ đợt này" của đợt 5 (QA trình duyệt, `<style>` ở `ClanFundPage`/`FundAnalytics`, cảnh báo ESLint cần người xác nhận).

Đợt 5 (29/10, Sonnet theo kế hoạch 1 giờ) — 6 commit `c8b8ef5`..`fcab1ab`, chưa push:
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
- Việc lớn còn lại từ kế hoạch 1 giờ (file kế hoạch đã xóa vì xong): JWT trong `localStorage` thay vì cookie httpOnly (**L**: CORS credentials, CSRF, socket); chuyển CSP từ Report-Only sang chặn sau khi xem báo vi phạm trên bản deploy; ảnh đại diện thật khi xuất cây. Token trong URL đã xong ở đợt 6.

Đợt 6 (30/10, Sonnet; file kế hoạch đợt 6 đã xóa vì xong) — 21 commit `49a5b40`..`90afb83`, chưa push:
- **Test tích hợp trên DB test:** `cd Backend && npm run test:integration` (49 test, tự tạo/dọn dữ liệu `ITEST_`/`itest_`; không chạy trong CI). Phủ đăng nhập/đổi/đặt lại mật khẩu, khóa tài khoản, **cô lập dòng họ A/B** (20 test kèm đối chứng, **không tìm thấy lỗ hổng**), token media, socket, rate limit, header bảo mật, tiểu sử AI, phân trang row-value và thanh toán `FOR UPDATE`/`DATE_ADD` (xong P0.4 và P3.5). Dọn tay: `node scripts/itest-cleanup.js`.
- **Bảo mật:** đăng nhập Google/Facebook dùng mã một lần thay JWT trên URL; ảnh/ghi âm dùng token media riêng (scope `media`, `GET /api/auth/media-token`); đổi/đặt lại/đặt hộ mật khẩu, khóa, lưu trữ, đổi vai trò đều ngắt socket (đường admin và manager đặt mật khẩu hộ trước đây **không thu hồi token**, đã sửa); rate limit đổi mật khẩu/upload/xác thực lời mời; HSTS + CSP cho API; CSP **Report-Only** cho frontend (cả hai `vercel.json`).
- **AI:**
  - **Groq đã gỡ model `llama-3.3-70b-versatile` (404)** nên mọi lời gọi LLM trước giờ lặng lẽ rơi về luật; `groqClient.js` giờ tự chuyển sang `qwen/qwen3.8-27b` / `gpt-oss`.
  - Lớp chặn bịa tên/năm/ngày cho câu LLM viết; bộ đo có LLM thật `scripts/chatbot-llm-eval.js` (production-like **25/26**, số liệu ở `TIEP_TUC_AI_TRA_LOI.md`).
  - Sửa 3 lỗi luật: "ap toi co…", "ba co toi" (hỏi lại bà cố/bà cô kèm tên), "thế hệ của tôi là đời nào". E2E 187 → 199.
  - **Tính năng mới "AI soạn tiểu sử / lời tưởng niệm"** (`POST /api/ai/person/:id/biography-draft` + hộp thoại trong hồ sơ người và hồ sơ cá nhân): chỉ ra bản nháp, không tự ghi.
- **Giao diện:** viền focus bàn phím; dọn code chết (ESLint **139 → 114**); i18n nốt cây gia phả; nút micro có `aria-label`.
- `scripts/data-quality-report.js` (chỉ đọc) — xong phần liệt kê của P0.6; xem số liệu bên dưới.

**Deploy đợt này cần:** không có migrate mới (cột `accounts.password_changed_at` của đợt 5 đã chạy). Lưu ý khi deploy:
- **Frontend và backend phải deploy cùng nhau.** Backend mới không còn nhận JWT đăng nhập qua `?token=` của ảnh/ghi âm: bản frontend cũ còn mở sẽ thấy ảnh cần token bị 404 cho tới khi tải lại (PWA tự cập nhật). Frontend mới vẫn nhận `?token=` ở `AuthCallback` để không vỡ đăng nhập Google/Facebook trong lúc chờ.
- Mã đăng nhập mạng xã hội lưu trong bộ nhớ: chỉ đúng khi Render chạy **một instance**.
- Biến `GROQ_MODEL` trên Render nếu còn là `llama-3.3-70b-versatile` thì vô hại (tự chuyển model), nhưng nên đổi sang `qwen/qwen3.8-27b`.
- Không bật `CHATBOT_LLM_REWRITE=all` (làm đúng giảm từ 96% xuống 81%).
- Sau deploy: xem console trình duyệt trên bản Vercel để thấy báo vi phạm CSP Report-Only; hết báo thì mới đổi header sang `Content-Security-Policy`.
- **Tự thử Google/Facebook login sau deploy** (không thể test OAuth thật ở local).

Số liệu `data-quality-report.js` (942 người thật, 725 tài khoản; đã loại 5000 người "Load Test" do script đo tải sinh ra, nên cân nhắc xóa chúng): 5 tài khoản có tên hiển thị là email; 0 tài khoản active chưa gắn người; 11 người có ngày `exact` rơi vào 01/01; 62 node mồ côi (chưa kiểm xem là dữ liệu thử hay thiếu quan hệ; mẫu có người ở `clan_id` 13, 9, 12 và cả `clan_id` NULL); 0 con sinh trước cha mẹ.

Còn mở từ đợt này:
- **QA bằng trình duyệt chưa làm được** (Chrome của công cụ không với tới `localhost`): bảng 12 kịch bản ở `docs/report/QA_2026-10-30.md`. Rủi ro lớn nhất cần xem bằng mắt: `App.jsx` chờ lấy token media lúc khởi động, hộp thoại "AI soạn tiểu sử", redirect sau khi hết phiên.
- `startAudioRecording` ở `TimeCapsulePage.jsx` còn nguyên nhưng **nút ghi âm đã bị gỡ khỏi JSX ở commit `69813f0`** — khôi phục hay xóa?
- `eventStats` ở `TaskManagementPage.jsx` (bộ đếm sự kiện toàn họ, commit `5466783`) đã tính nhưng chưa hiển thị — làm nốt giao diện hay bỏ?
- Khối `<style dangerouslySetInnerHTML>` (~1190 dòng) ở `ClanFundPage.jsx` và `FundAnalytics.jsx` vẫn chưa chuyển ra `.css` (cần QA mắt).
- Câu LLM "Kể về ông X" có thể thêm chi tiết mềm ("sinh ra và lớn lên ở…") mà grounding không bắt được (chỉ bắt tên/năm/ngày). Bản nháp tiểu sử luôn cần người đọc lại.
- `social_token` (token đăng ký 15 phút) vẫn nằm trên URL `/register?social_token=`; JWT vẫn lưu trong `localStorage` (chuyển cookie httpOnly là việc lớn).
- Nhận xét múi giờ: `markPaymentAsPaid` lấy gốc `DATE_ADD` từ `new Date()` của JS còn `NOW()` theo DB; lệch 7 giờ nếu máy chạy khác múi giờ DB (trên Render cả hai UTC nên vô hại).
- Nâng `react-router-dom` lên v7 (2 lỗi moderate của frontend) chưa làm; `xlsx` không có bản vá nhưng chỉ dùng để ghi file.
- Họ `Load Test` 5000 người trong DB test nên dọn (xem `scripts/load-test-family-tree.js`).

## P0 — Chặn hoặc rủi ro trên môi trường thật (làm trước khi demo/nộp)

Không làm được từ máy local vì `Backend/.env` trỏ vào DB thật; cần người có quyền Render/Aiven.

| # | Việc | Ghi chú | Công sức |
|---|---|---|---|
| 0.1 | **Sao lưu DB Aiven** trước mọi lần deploy | Các hàm `ensure*Schema` tự `ALTER` ở request đầu | S |
| 0.2 | Đặt key Groq trên Render (AI trả 503) | Thiếu key thì chatbot chỉ trả theo luật | S |
| 0.3 | Chạy `npm run migrate` một lần, xem bước nào báo `✖`, rồi bật `DISABLE_RUNTIME_DDL=true` | Sau khi có bản sao lưu | S |
| 0.4 ✅ | Thử trên MySQL thật: giao dịch mua gói (`FOR UPDATE`, `DATE_ADD`), phân trang row-value `(created_at, id) < (...)`, tài khoản bị khóa chuyển về `/account-disabled` | Test hiện chỉ chạy trên DB giả | S |
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
| 3.5 ✅ | Test tích hợp với MySQL thật (Docker) cho thanh toán và phân trang | Có thư mục `docker/`; xử lý luôn được 0.4 | M |

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
