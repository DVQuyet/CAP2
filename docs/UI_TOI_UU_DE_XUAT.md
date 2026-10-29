# Đề xuất tối ưu giao diện — cần QA trình duyệt trước khi làm

Quét mã ở commit `cd146de` (đã có `Frontend/src/styles/tokens.css`). Chỉ đọc mã/CSS và đếm bằng script; **chưa mở trình duyệt**, nên mọi mục dưới đây đều cần xem bằng mắt ở 390px và 1280px trước khi gộp.
Ký hiệu: công sức **S** < 2 giờ · **M** nửa–1 ngày · **L** nhiều ngày. Ưu tiên **P1** làm trước, **P3** để sau.

## 0. Số liệu nhanh

| Chỉ số | Giá trị |
|---|---|
| Tổng CSS / JSX | ~33.000 dòng CSS (App.css 4877, manager.css 4156, FamilyTreeEditor.css 4087) / ~29.600 dòng JSX |
| Mã màu hex khác nhau trong CSS (sau khi có token) | **915** (trước token: 900); 1.771 lần dùng hex còn lại, 2.680 lần `var(--…)` |
| `rgba()/rgb()` khác nhau | **852** |
| Hex trong JSX (inline) | 76 mã khác nhau / 182 lần |
| Cụm hex (đủ 7 ký tự): cam-nâu-vàng / đỏ / xanh dương / xanh lá / xám trung tính | 465 / 234 / 106 / 64 / 14 mã khác nhau |
| Tên class nút (`*btn*`, `*button*`) | **122** class, 24 file CSS; ~84 luật nút nền có padding/chiều cao |
| Chiều cao nút khác nhau | 13 giá trị (30–50px; hay gặp 40/38/42/44/36/34) |
| `border-radius` khác nhau | 57 (đã có 11 token, còn 22px, 13px, 9px, 26px, 28px…) |
| `font-size` khác nhau | 176 (token mới mới phủ ~12 giá trị) |
| `line-height` khác nhau | 34 |
| `padding` khác nhau | 340 · `gap` 68 · `box-shadow` 268 · `z-index` 38 |
| Class kiểu modal/dialog | 95 tên; 21 màu nền lớp phủ khác nhau; 19 giá trị bo góc modal |
| Inline `style={{` | 169 (TaskManagementPage 61, MemberFundPage 34, ClanFundPage 27) |
| Breakpoint `max-width` khác nhau | 22 (480…1280) |
| Nghi vấn mobile 390px | xem mục 4: ~140 điểm (xem bảng tổng) |

## 1. Màu

Token hiện có (`tokens.css`) mới là bước "đặt tên", **cố ý chưa gộp** các cụm gần nhau. Việc còn lại là gộp thật và đặt tên theo ngữ nghĩa.

| Việc | Ở đâu | Vì sao | Công sức | Ưu tiên |
|---|---|---|---|---|
| Gộp cụm nâu đỏ `--color-brick-1..4` (#8b1e13, #8b1e17, #9e2f24, #9f2f23) thành 2 màu (đậm/nhạt) | `styles/tokens.css:15-18`; ~120 chỗ dùng | Chênh 1–2 đơn vị RGB, mắt thường không thấy | S | P2 |
| Gộp `--color-cream-1..4` (#fff7e8, #fff8df, #fffaf0, #fffaf1) → `cream-50/100` | `tokens.css:24-27` | Cùng một "nền giấy", 4 biến chỉ khác 1–2 bước | S | P2 |
| Gộp `--color-ink-brown-1/2` (#4a160f, #4a1d12) | `tokens.css:19-20` | như trên | S | P3 |
| Thay các hex "đuôi dài" gần token bằng token gần nhất (script: tìm hex cách token < ΔE 3) | toàn bộ CSS, 915 mã; ~600 mã chỉ dùng 1–3 lần | Giảm 915 → ~120 mã; là phần lớn công của đợt này | L | P2 |
| Màu Tailwind-lẫn-vào (#4f46e5 tím, #e53e3e, #38a169, #b7791f) lệch hẳn tông nâu đỏ–vàng của thương hiệu | `app/App.css:3321`, `3144-3148`, `4147` | Nút "tím" và nút "xanh lá" kiểu Chakra nằm cạnh nút nâu đỏ | M | P2 |
| 21 màu nền lớp phủ modal → 2 biến `--overlay` (nhẹ/đậm) | `App.css`, `login.css`, `FundDesign.css`, `AdminLayout.css`... | `rgba(20,8,5,.55..7)`, `rgba(15,23,42,…)`, `rgba(0,0,0,…)` đang trộn nhau | S | P2 |
| 76 hex trong JSX inline → biến CSS hoặc class | `TaskManagementPage.jsx`, `MemberFundPage.jsx`, `ClanFundPage.jsx`, biểu đồ | Inline không theo được dark mode | M | P3 |
| Màu trạng thái: chốt 4 màu (thành công/cảnh báo/lỗi/thông tin) × (nền, viền, chữ) | xanh lá 64 mã, đỏ 234 mã | Hiện mỗi trang tự pha "đỏ lỗi" riêng (#b91c1c, #dc2626, #991b1b, #7f1d1d, #e53e3e…) | M | P1 |

Đề xuất bảng màu rút gọn (giữ tông hiện tại): `maroon` (đậm/thường/nhạt), `gold` (đậm/thường/nhạt), `cream` (50/100/200), `ink` (nâu mực, 2 mức), `gray` 50–900 (đang gồm slate + gray lẫn nhau, chọn một họ), 4 màu trạng thái, 2 lớp phủ. Khoảng 40 biến là đủ.

**Cần QA trình duyệt:** so ảnh chụp trước/sau của login, dashboard 3 vai trò, cây gia phả, quỹ, thông báo ở 1280 và 390; kiểm tra tương phản chữ vàng trên nền nâu (WCAG AA 4.5:1); in/xuất PDF sổ gia phả không đổi màu.

## 2. Thành phần không đồng nhất

Chỉ có `ConfirmDialog`, `LoadingState/EmptyState/ErrorState`, `HelpDialog` là dùng chung; còn lại mỗi trang tự định nghĩa.

| Thành phần | Hiện trạng (số liệu) | Ví dụ file:dòng | Đề xuất dùng chung | Công sức | Ưu tiên |
|---|---|---|---|---|---|
| Nút chính | ≥ 13 class "primary": `.btn-primary` (**định nghĩa 2 lần trong App.css, nâu-vàng ở :2824 và tím #4f46e5 ở :3321, cái sau thắng khi cùng độ đặc hiệu**), `.btn-login`, `.btn-premium`, `.admin-primary-btn`, `.mgr-btnPrimary`, `.usr-btnPrimary`, `.task-btn-primary`, `.post-primary-btn`, `.gb-btn-primary`, `.member-btn-primary`, `.billing-primary-btn`, `.btn-premium-confirm`, `.confirm-btn` | `App.css:2824`, `App.css:3321`, `login.css:106` (52px, radius-lg), `FundDesign.css:80` (50px, radius-2xl), `manager.css:396` (9px 12px), `GeneralPosts.css:305` (42px, 0 16px) | Lớp `.ui-btn` + biến thể `--primary/--secondary/--ghost/--danger` + kích cỡ `--sm(36)/--md(42)/--lg(48)`; trước hết đổi tên `.btn-primary` thứ hai để hết xung đột | M (tạo) + L (chuyển dần) | **P1** |
| Nút icon / nút hành động hàng | 60 luật nút/icon cao < 40px (24–38px) | `App.css:799` (24px), `:2277` (28), `:3132` (32), `GenealogyManagement.css:349` (28), `MembersPage.css:325` (32) | `.ui-icon-btn` tối thiểu 40×40 (vùng chạm), icon vẫn 20px | S | P1 |
| Ô nhập / select | 215 `<input>`, 72 `<select>` trong JSX; style riêng theo từng form: `.form-group input` (App.css:2800), `.auth-modal-card input`, `.register-container input`, `.mgr-field`, `.gb-field`, `.fte2-fieldLabel`, `.task-…` | `App.css:2800`, `login.css:445`, `register.css:110`, `manager.css:338` | `.ui-field`, `.ui-input`, `.ui-select` (cao 42, radius-lg, viền + focus ring chung) | M | P2 |
| Modal / dialog | 95 tên class, 26 luật lớp phủ `position:fixed`, 21 nền khác nhau, bo góc 12–28px (19 giá trị) | `App.css:4179` (.modal-close-btn 38px), `MembersPage.css:447`, `TaskManagementPage.css:672`, `FamilyTreeEditor.css:483`, `FundDesign.css:431`, `login.css:323` | Một `Modal` (portal, Esc, bấm nền, khóa cuộn, `max-height: 100dvh`) bọc quanh nội dung; `ConfirmDialog` đã là mầm | L | P2 |
| Card | ~116 selector chứa `card` | `App.css`, `MemberDashboard.css`, `DashboardHome.css` | `.ui-card` (nền, viền, radius-2xl, shadow-soft) | M | P3 |
| Bảng | 7 `<table>` (MembersPage, PostsPage, TaskManagementPage, ClanFundPage, MemberSubmissions…), 21 selector `table` | `index.css:~78` đặt `table{display:block}` ở ≤760px | `.ui-table-wrap{overflow-x:auto}` + hàng thẻ trên mobile | M | P2 |
| Badge / chip / tag | ~47 selector | `PostsPage.css`, `PendingApprovals.css`, `TaskManagementPage.css` | `.ui-badge--success/warn/danger/info` dùng 4 màu trạng thái ở mục 1 | S | P2 |
| Toast / alert / banner | ~38 selector | `ColdStartBanner`, `StateComponents.css`, từng trang | Một `Toast` + một `Alert` | M | P3 |

**Cần QA trình duyệt:** mỗi lần đổi một họ nút, mở lần lượt: đăng nhập, quỹ, bài viết, admin thành viên, sự kiện; xem hover/disabled/focus bàn phím; nút trong modal ở 390px; nút `.btn-primary` hiện đang xuất hiện ở trang nào (tìm bằng grep `className="btn-primary"`) vì đổi tên sẽ đổi màu thực tế.

## 3. Chữ và khoảng cách

| Việc | Ở đâu | Vì sao | Công sức | Ưu tiên |
|---|---|---|---|---|
| Chốt thang chữ 11 mức: 12 / 13 / 14 / 15 / 16 / 18 / 20 / 24 / 28 / 32 / 40px (dạng rem) và ánh xạ 176 giá trị về gần nhất | `tokens.css:55-66` mới có 12 token sát nhau (0.75, 0.78, 0.8, 0.82, 0.85, 0.86, 0.9, 0.92, 0.95) | Tên kiểu `--fs-base-minus-plus` cho thấy thang đang quá dày; 0.78 vs 0.8 vs 0.82 không phân biệt được | M | P2 |
| Line-height còn 4 mức: 1 / 1.25 / 1.5 / 1.65 (34 giá trị hiện tại: 1.12, 1.35, 1.4, 1.45, 1.55, 1.6…) | toàn CSS | Chữ tiếng Việt có dấu cần ≥ 1.4 cho đoạn văn; tiêu đề 1.25 | S | P3 |
| Dùng `--space-*` (đã có, thang 4px) cho `padding/gap`; hiện padding 340 giá trị, gap 68 | `tokens.css:80+`; hay lặp: 10px, 12px, 14px, 18px, 0.9rem | Chỉ áp cho code mới thì không giảm; cần quét từng file | L | P3 |
| Bo góc: gộp 22px/13px/9px/26px/28px/17px về token gần nhất | `TaskManagementPage.css`, `login.css`, modal | 57 → ~11 giá trị | S | P2 |
| Thang bóng đổ 4 mức thay cho 268 giá trị | toàn CSS | `--shadow-soft/pop/modal` mới dùng ít | M | P3 |
| z-index: chỉ dùng token `--z-*` thay cho 38 giá trị (80, 70, 25, 35…) | `tokens.css:69-72`; số đơn lẻ trong App.css, FamilyTreeEditor.css | Lớp phủ/menu chồng nhau trên mobile | S | P2 |
| Gom 22 breakpoint về 5: 480 / 640 / 768 / 1024 / 1280 | 480…1280 (760 x18, 640 x12, 1180 x10, 1100 x9…) | Hiện 520/560/620/680/720/760/780/820/900/920/960/980 là các điểm gần nhau, dễ chồng luật | M | P2 |

**Cần QA trình duyệt:** đổi cỡ chữ làm tràn dòng/ngắt dòng khác nhau → xem lại thanh bên, nút, thẻ cây gia phả, bảng quỹ ở 390/768/1280; xem dấu tiếng Việt không bị cắt (line-height thấp + `overflow:hidden`).

## 4. Nghi vấn mobile 390px

Lưu ý: `index.css:60-80` đã có luật chung ở ≤ 760px (input 16px, nút `min-height:42px`), nhưng **selector class cụ thể thắng selector phần tử**, nên các luật dưới đây vẫn đè.

| Nghi vấn | Số lượng | Ở đâu (file:dòng) | Vì sao | Công sức | Ưu tiên |
|---|---|---|---|---|---|
| Ô nhập có `font-size` < 16px đè luật chung → iOS tự phóng to khi focus | 8 luật còn literal (ngoài ra các dòng dùng `--fs-*` < 1rem chưa tính; trước token: 25) | `login.css:445` (15.5px), `register.css:110` (15px), `clanRegister.css:80` (15px), `FamilyTreeEditor.css:2337`, `:3943` (.98/.96rem), `AIChat.css` (.95rem), `manager.css:171`, `TimeCapsulePage.css:1433` | Phóng to + cuộn ngang khi gõ | S | **P1** |
| Vùng chạm < 40px (nút/icon) | 60 luật | `App.css:799` (24px), `:2277` (28), `:3132` (32), `GenealogyManagement.css:349`, `MembersPage.css:325`, `PostsPage.css:373,438` (36) | Khó bấm bằng ngón tay | S–M | **P1** |
| Chiều rộng cố định > 360px | 5 | `App.css:3982` (420, có max-width:100%), `PostsPage.css:634` (420, max 90%), `MemberDashboard.css:490` (**bảng min-width 620**, có `overflow-x:auto` ở :484), `FamilyTreeEditor.css:1420` (**popup width 600px**, `position:absolute; left:0`), `:3490` (420) | `FamilyTreeEditor.css:1420` có thể tràn khỏi màn hình 390 | S | P1 |
| `position:fixed` có thể che nội dung | 56 chỗ, 22 file | `AIChat.css:20` (nút chat nổi), `NotificationBell.css:170`, `MemberLayout.css:372`, `FamilyTreeEditor.css:1828,1857 (!important),2075`, `v2.css:754,763`, `TaskManagementPage.css:672,2174,2226` | Nút chat nổi + thanh dưới + bàn phím ảo có thể chồng lên nút Lưu | M | P1 |
| `100vh` thay vì `100dvh` | 41 chỗ `100vh` vs 24 `100dvh` | `FamilyTreeEditor.css:1832` (`height:100vh`), `:1877`, `login.css:340,564,611,873`, `register.css:58,385,417`, `AIChat.css:77`, `manager.css:1681`, `MemberDashboard.css:791`, `GenealogyManagement.css:3` | Thanh địa chỉ iOS/Android làm đáy modal/cây bị cắt | S | P1 |
| Bảng không có vùng cuộn ngang riêng | 7 bảng; chỉ 3 file có `overflow-x:auto` (PostsPage:743, MemberFundPage:116, MemberDashboard:484) | `MembersPage.jsx`, `TaskManagementPage.jsx` (cột sự kiện), `ClanFundPage.jsx`, `MemberSubmissions.jsx` | `index.css` đặt `table{display:block}`; cột dài vẫn tràn nếu cha không cuộn | M | P2 |
| Nền ảnh `fixed` + ảnh 6 MB trên mobile | 3 layout + 6 trang | `AdminLayout.css:4`, `ManagerLayout.css:4`, `MemberLayout.css:4` (`background … fixed`) | `background-attachment:fixed` bị iOS bỏ qua/giật; kết hợp ảnh lớn gây giật cuộn | S | P2 |
| 22 breakpoint khác nhau | xem mục 3 | — | Khó đoán layout ở 390 | M | P2 |

**Cần QA trình duyệt (390 × 844, cả iOS Safari nếu có):** gõ vào từng form (không được phóng to); bấm thử mọi icon nhỏ; bật chat nổi + mở modal; xoay ngang; kéo thanh địa chỉ; cuộn bảng quỹ/thành viên/sự kiện; menu popup của cây gia phả không vượt mép.

## 5. File lớn / điểm nóng UX

| Việc | Ở đâu | Vì sao | Công sức | Ưu tiên |
|---|---|---|---|---|
| Tách `FamilyTreeEditor.jsx` (4061 dòng) + `FamilyTreeEditor.css` (4087) + `.v2.css` (1596): toolbar, modal, panel tìm kiếm, xuất ảnh | `features/genealogy/components/` | Hai CSS song song `fte-` và `fte2-` chồng luật (`position: fixed !important` ở :1857); sửa 1 chỗ dễ vỡ chỗ khác | L | P2 |
| `TaskManagementPage.jsx` (2098 dòng, **61 inline style**) + `.css` 2427 dòng | `features/events-tasks/pages/` | Inline style không nhìn thấy trong CSS, không đổi được theo token/dark mode | M | P2 |
| `MemberFundPage.jsx` (34 inline style) | `features/fund/pages/` | như trên | S | P3 |
| **`ClanFundPage.jsx` khối `<style dangerouslySetInnerHTML>` (~1190 dòng, `:1573`) và `FundAnalytics.jsx:112`: KHÔNG chuyển ra `.css` khi chưa QA** | `ClanFundPage.jsx:1573`, `FundAnalytics.jsx:112` | Chúng đè `FundDesign.css` nhờ nằm sau trong DOM; chuyển file đổi thứ tự cascade. Cách an toàn: tách thành `ClanFund.override.css` nạp **sau** `FundDesign.css` và so ảnh | M | P3 (chỉ sau khi có QA) |
| Ảnh nền quá nặng: `public/backgroundbanner.png` **6,2 MB**, `public/sodogiapha.png` **4,1 MB** | `backgroundbanner.png` dùng ở `App.css:210`, `login.css:17`, `register.css:17`, `clanRegister.css:17`, `MemberDashboard.css:53`, `TimeCapsulePage.css:507`, 3 layout (`AdminLayout.css:4`, `ManagerLayout.css:4`, `MemberLayout.css:4`) | Nặng nhất của tải trang đầu trên 4G; đề xuất WebP ~1920px (≈ 200–400 KB) + `image-set()` | S (làm) + QA | **P1** |
| Logo trùng nội dung trong `public/` | `favicon.png`, `gia-pha-g-logo.png`, `gia-pha-tab-logo.png`, `logo.png` (cùng 86.491 byte); `gia-pha-full-logo.png`, `logo giaphaviet.png` (có dấu cách), `logo-giaphaviet.png` (cùng 108.656 byte) | Dùng ở `Header.jsx:38`, 3 layout, `GeneralPosts.jsx:90,144,293`; gộp còn 2 file, đổi tham chiếu | S | P3 |
| Dependency `html-to-image` không còn được import trong `src/` | `Frontend/package.json:16` | Gỡ để nhẹ cài đặt (xuất cây đã dùng SVG) | S | P3 |
| Login/Register vừa `import` tĩnh vừa `lazy()` | `layouts/PublicLayout.jsx:6-7` và `app/routes.jsx:11-12` | `lazy` không có tác dụng vì module đã nằm trong chunk chính | S (+ QA đăng nhập/đăng ký/modal) | P2 |
| `DashboardHome.jsx` còn import `recharts` tĩnh | `features/admin/pages/DashboardHome.jsx:20` | Kéo cả thư viện biểu đồ vào chunk trang admin; lazy như ManagerDashboardCharts | S | P2 |

**Cần QA trình duyệt:** chỉ số kích thước ảnh sau khi nén (không vỡ hạt ở màn 2K, nền không lệch `center/cover`), đăng nhập → đăng ký → quay lại không nháy trắng, Lighthouse trước/sau; riêng quỹ: chụp ảnh trước/sau cả 6 tab, hover/focus nút, modal.

## 6. Kế hoạch dark mode

Phụ thuộc mục 1 (gộp màu) và token. Đừng làm trước khi 600 hex đuôi dài còn nằm trong CSS.

| Bước | Việc | Công sức | Ghi chú |
|---|---|---|---|
| 1 | Gộp cụm màu + thay hex còn lại bằng biến (mục 1) | L | Điều kiện tiên quyết |
| 2 | Thêm lớp ngữ nghĩa trong `tokens.css`: `--surface`, `--surface-2`, `--text`, `--text-muted`, `--border`, `--accent`, `--danger`, `--overlay` trỏ vào token thô | M | Nói trong chú thích đầu `tokens.css` |
| 3 | Chuyển CSS dùng lớp ngữ nghĩa thay cho `--color-*` (bắt đầu `index.css`, layout, StateComponents, ConfirmDialog) | L | Làm theo từng trang |
| 4 | `:root[data-theme="dark"]` ghi đè lớp ngữ nghĩa; mặc định theo `prefers-color-scheme`, nút bật/tắt trong header, nhớ ở `localStorage` | M | Cần `color-scheme: dark light` cho thanh cuộn/ô nhập |
| 5 | Xử lý ngoại lệ: ảnh nền 6 MB (cần bản tối/lớp phủ), 76 hex trong JSX, biểu đồ recharts, SVG xuất cây (giữ nền sáng), in PDF sổ gia phả (ép sáng) | M | |
| 6 | QA tương phản AA toàn bộ trang | M | |

**Cần QA trình duyệt:** từng trang ở sáng/tối; chữ vàng trên nâu; ảnh nền; biểu đồ; xuất ảnh/PDF luôn nền sáng.

## 7. Loading / trống / lỗi

Có sẵn `LoadingState` (14 file dùng), `EmptyState` (6 file), `ErrorState`; chỉ có **1** file nhắc skeleton. Quét 22 trang có gọi API:

| Trang | Thiếu | File | Công sức | Ưu tiên |
|---|---|---|---|---|
| Thiếu cả loading + empty + error | `BillingPage` (1260 dòng), `AccountPage` (1263), `PendingApprovals` (784), `MemberProfile`, `MemberSubmissions`, `VietnamCalendarPage`, `InvitationPage`, `AuthCallback`, `CompleteProfile` | `features/billing-payment/`, `features/manager/pages/`, `features/member/pages/`, `features/calendar/`, `features/invitations/` | M | P2 |
| Có loading, thiếu empty | `DashboardHome`, `GenealogyManagement`, `TaskManagementPage`, `ClanFundPage`, `MemberFundPage`, `UserFamilyTree`, `ManagerDashboard`, `MemberDashboard` | `features/admin/`, `events-tasks/`, `fund/`, `genealogy/pages/` | M | P2 |
| Có error, thiếu loading + empty | `MembersPage`, `PostsPage`, `ManagerGenealogy` | `features/admin/pages/`, `genealogy/pages/` | S | P2 |
| Chỉ có spinner, chưa có skeleton cho danh sách dài (bài viết, thành viên, sự kiện, cây) | `GeneralPosts`, `MembersPage`, `TaskManagementPage` | — | M | P3 |
| Spinner tải route (`routes.jsx:70` `<style>` nội bộ) khác kiểu `LoadingState` | `app/routes.jsx:70` | Dùng chung một kiểu | S | P3 |

Danh sách tự quét theo từ khóa (`LoadingState|EmptyState|ErrorState|Skeleton`) nên có thể có trang tự vẽ trạng thái bằng class riêng; cần rà từng trang khi làm.

**Cần QA trình duyệt:** giả lập mạng chậm (Slow 3G), tắt mạng, tài khoản không có dữ liệu (dòng họ mới), xem nút "Thử lại"; bản dịch en/vi của từng thông báo.

## 8. Thứ tự đề xuất

| # | Nhóm | Việc | Công sức | Lý do thứ tự |
|---|---|---|---|---|
| 1 | Perf | Nén `backgroundbanner.png`/`sodogiapha.png` sang WebP | S | Lợi lớn nhất, ít rủi ro |
| 2 | Mobile | `100vh` → `100dvh`; input ≥ 16px; popup 600px trong `FamilyTreeEditor.css:1420` | S | Sửa nhỏ, lỗi thấy ngay trên điện thoại |
| 3 | Mobile | Vùng chạm ≥ 40px cho nút icon | S–M | như trên |
| 4 | Nút | Đổi tên `.btn-primary` trùng trong App.css, tạo `.ui-btn` | M | Chặn xung đột trước khi gộp thêm |
| 5 | Màu | Chốt 4 màu trạng thái + 2 lớp phủ | M | Tiền đề cho badge/toast/modal |
| 6 | Perf | Login/Register import tĩnh + lazy; recharts ở DashboardHome; gỡ `html-to-image` | S | Không đụng giao diện |
| 7 | Thành phần | `Modal` chung, `.ui-field`, bảng cuộn ngang | M–L | Sau khi có nút và màu |
| 8 | Trạng thái | Thêm loading/empty cho 9 trang thiếu cả ba | M | Dùng component sẵn có |
| 9 | Màu | Gộp brick/cream, thay hex đuôi dài, bo góc, cỡ chữ, breakpoint | L | Làm sau khi có thành phần chung |
| 10 | Dark mode | Lớp ngữ nghĩa → dark | L | Cuối cùng |
| — | Giữ nguyên | `ClanFundPage` `<style>` khối, tách `FamilyTreeEditor` | — | Chỉ làm khi đã có QA bằng mắt |

## 9. Quy trình QA gợi ý chung

1. Chụp trước (390×844 và 1280×800) cho: Login, Register, Dashboard 3 vai trò, Cây gia phả, Quỹ, Sự kiện, Bài viết, Thông báo, Chat.
2. Làm từng mục một commit; chụp sau; so bằng mắt hoặc công cụ so ảnh.
3. Đối chiếu `docs/KICH_BAN_TEST_FULL.md` mục 0.4 (console, chữ Anh lẫn Việt, tràn ngang, nút Esc/×/nền đóng modal).
4. Mục nào chạm `ClanFundPage.jsx` hoặc `FundDesign.css` phải chụp đủ các tab trước khi sửa.
