# Frontend - Gia Phả Việt

Frontend là ứng dụng React chạy bằng Vite. Ứng dụng cung cấp giao diện public, admin, manager và member cho hệ thống Gia Phả Việt.

## Công Nghệ

- React 18
- Vite
- React Router
- i18next/react-i18next
- Socket.IO client
- Recharts
- react-zoom-pan-pinch cho canvas cây gia phả
- html-to-image cho xuất ảnh cây

## Cấu Trúc

```text
Frontend/
- package.json
- .env.example
- index.html
- src/
  - app/
  - api/
  - assets/
  - features/
  - i18n/
  - layouts/
  - services/
  - shared/
  - index.css
```

## File Map Tổng Quát

- `src/app/main.jsx`: bootstrap React app.
- `src/app/App.jsx`: shell cấp cao của ứng dụng.
- `src/app/routes.jsx`: cấu hình route chính cho public/admin/manager/member.
- `src/services/api.js`: wrapper `fetch`, gắn base URL, token, JSON parsing và lỗi chung.
- `src/services/socket.js`: kết nối Socket.IO, lấy token/account từ storage, helper listen/emit.
- `src/services/treeEditSession.js`: lưu/đọc tree edit key tạm thời và tạo header gửi backend.
- `src/i18n/LanguageContext.jsx`: context đổi ngôn ngữ.
- `src/i18n/locales/vi.json`, `en.json`: toàn bộ text giao diện.
- `src/shared/components/*`: component dùng lại như `ProtectedRoute`, `ImageUpload`, `DateInput`.
- `src/shared/utils/*`: helper chung như auth, date format, lunar calendar, media.

## API Clients

Các request nên đi qua `src/services/api.js` và service theo domain:

- `src/api/authService.js`: login/register/auth.
- `src/api/adminService.js`: API admin.
- `src/api/managerService.js`: API manager, bao gồm hầu hết API cây gia phả.
- `src/api/memberService.js`: API member.
- `src/api/aiServerService.js`: gọi backend `/api/ai/*`.
- `src/api/voiceService.js`: upload/poll voice recording.
- `src/api/billingService.js`, `paymentService.js`: billing/payment.

## Feature Folders

- `src/features/admin/`: dashboard admin, quản lý member/post/genealogy.
- `src/features/auth/`: login, register, forgot password, waiting.
- `src/features/billing-payment/`: billing/payment UI.
- `src/features/calendar/`: lịch Việt Nam và sự kiện lịch.
- `src/features/clan/`: đăng ký dòng họ.
- `src/features/events-tasks/`: sự kiện, task, AI tạo event/task.
- `src/features/fund/`: quỹ dòng họ.
- `src/features/genealogy/`: cây gia phả, editor, hook, tree utils.
- `src/features/manager/`: dashboard manager, account, pending approvals.
- `src/features/member/`: dashboard/profile/submissions.
- `src/features/posts/`: bài viết chung.
- `src/features/public/`: landing và trang public.
- `src/features/time-capsule/`: kỷ niệm dòng họ.
- `src/features/voice/`: VoiceRecorder dùng local STT.

## Genealogy Frontend Chi Tiết

```text
src/features/genealogy/
- pages/
- components/
- components/FamilyTreeEditorParts/
- hooks/
- utils/
- utils/tree-editor/
```

### Pages

#### `pages/ManagerGenealogy.jsx`

Trang quản lý cây cho admin/manager.

Vai trò:

- Load cây qua `getManagerTree`.
- Hiển thị panel thông tin dòng họ.
- Quản lý form cập nhật clan info.
- Quản lý danh sách member và cấp temporary tree edit key.
- Render `FamilyTreeEditor` ở mode có quyền chỉnh sửa.

Liên quan backend:

- `GET /api/manager/tree`
- `GET /api/manager/clan-info`
- `PUT /api/manager/clan-info`
- `GET /api/manager/tree-edit-keys`
- `POST /api/manager/tree-edit-keys`

#### `pages/UserFamilyTree.jsx`

Trang cây gia phả cho member.

Vai trò:

- Load cây của member.
- Kết nối realtime tree updates.
- Đọc/hiển thị tree edit session nếu member được cấp key.
- Render `FamilyTreeEditor` với quyền hạn theo session/member.
- Hiển thị modal thông tin dòng họ.

### Components

#### `components/FamilyTreeEditor.jsx`

Component trung tâm của cây gia phả.

Vai trò chính:

- Nhận `people`, `families`, `children`, `clan`, `permission`, `editPermission`.
- Normalize dữ liệu cây trước khi render.
- Tính auto layout và merge với manual layout.
- Render canvas zoom/pan qua `react-zoom-pan-pinch`.
- Render node người bằng `TreeNodeCard`.
- Render đường nối bằng `buildTreeLines`.
- Quản lý selection, drag node, drag line route, resize card.
- Lưu layout đơn/batch qua `saveTreeLayoutAPI`, `saveTreeLayoutBatchAPI`.
- Tạo/cập nhật/xóa person qua `createPersonAPI`, `updatePersonAPI`, `deletePersonAPI`.
- Liên kết quan hệ qua `linkRelationsAPI`.
- Mở modal tạo người, inspector, chọn quan hệ, quick create relation.
- Validate cây bằng `validateTreeData`.
- Kết nối AI genealogy extraction qua `extractGenealogyAI`.
- Hỗ trợ voice-to-text trong AI gia phả bằng cả:
  - Browser Speech API.
  - `VoiceRecorder` local STT/voice worker.

Các nhóm logic trong file:

- AI helper: normalize AI members/relationships, map gender, map generation, resolve duplicate người đã có.
- Layout helper: pending layout queue, flush batch, snap position, route line.
- Relation helper: mở dialog theo relation, build payload cho parent/child/spouse.
- Save helper: xử lý lỗi relation warning, xác nhận force save nếu backend trả `requiresConfirmation`.
- Export helper: render ảnh PNG của cây.

Đây là file có blast radius lớn nhất trong genealogy frontend. Khi sửa nên kiểm tra cả tạo người, sửa người, kéo thả, lưu layout, liên kết quan hệ và AI extract.

#### `components/FamilyTreeEditor.css`

Style của editor:

- Canvas/tree shell.
- Toolbar, zoom controls, node states.
- Modal và panel AI genealogy.
- Drag/resize affordance.
- Style cho voice browser button và `VoiceRecorder` trong AI genealogy.

#### `components/TreeNodeCard.jsx`

Card hiển thị một person trên canvas.

Vai trò:

- Hiển thị tên, generation, ngày sinh/mất, avatar/badge.
- Nhận trạng thái highlight/editing/selected.
- Hiển thị action buttons cho edit/add relation/delete tùy quyền.
- Chặn propagation cho các action để không làm ảnh hưởng drag canvas.

#### `components/TreeSearchPanel.jsx`

Panel tìm kiếm person.

Vai trò:

- Nhận query/result từ `useTreeSearch`.
- Hiển thị kết quả match.
- Gọi callback focus person khi chọn kết quả.

#### `components/TreeViewModeSelector.jsx`

Điều khiển chế độ xem cây.

Vai trò:

- Chọn full tree hoặc root/subtree view.
- Hiển thị root hiện tại.
- Gọi hook `useTreeViewMode` để thay đổi visible ids.

### FamilyTreeEditorParts

#### `FamilyTreeEditorParts/CreatePersonDialog.jsx`

Modal tạo person mới.

Vai trò:

- Form họ/tên/gender/generation/birth/death/contact/account.
- Dùng cho tạo người độc lập hoặc tạo nhanh theo relation đang chọn.
- Gửi data về `FamilyTreeEditor` qua `onSubmit`.

#### `FamilyTreeEditorParts/PersonInspector.jsx`

Panel xem/sửa person đã chọn.

Vai trò:

- Chỉnh thông tin cơ bản, ngày sinh/mất, generation, contact, note/bio.
- Cho phép thay avatar/media nếu có quyền.
- Gọi `updatePersonAPI` thông qua parent.

#### `FamilyTreeEditorParts/RelationSelectDialog.jsx`

Modal chọn người đã có để liên kết quan hệ.

Vai trò:

- Hiển thị candidate theo relation.
- Loại các người đã liên kết hoặc không hợp lệ theo dữ liệu frontend.
- Trả người được chọn về `FamilyTreeEditor`.

#### `FamilyTreeEditorParts/QuickCreateRelationDialog.jsx`

Menu nhanh khi bấm thêm quan hệ từ một node.

Vai trò:

- Chọn loại quan hệ cần thêm: cha, mẹ, vợ/chồng, con...
- Điều hướng sang tạo person mới hoặc chọn person có sẵn.

#### `FamilyTreeEditorParts/ArchivedMembersDialog.jsx`

Modal danh sách thành viên đã archive.

Vai trò:

- Hiển thị người đã lưu trữ.
- Gọi reload/restore/delete tùy luồng đã nối ở parent/page.

#### `FamilyTreeEditorParts/CenterNoticeDialog.jsx`

Dialog thông báo giữa màn hình.

Vai trò:

- Hiển thị lỗi/cảnh báo relation hoặc thông báo cần người dùng đọc kỹ.

#### `FamilyTreeEditorParts/LunarDateHint.jsx`

Hiển thị gợi ý âm lịch cho một ngày dương lịch.

#### `FamilyTreeEditorParts/index.js`

Barrel export cho các parts để `FamilyTreeEditor.jsx` import gọn hơn.

### Hooks

#### `hooks/useTreeSearch.js`

Quản lý tìm kiếm trong cây:

- Normalize text bỏ dấu.
- Match theo tên và năm sinh.
- Lưu query/results/current index.
- `submitSearch`, `clearSearch`, `markResult`.

#### `hooks/useTreeViewMode.js`

Quản lý chế độ xem:

- Full tree.
- Root/subtree theo một person.
- Tính visible ids dựa trên ancestors/descendants/related nodes.

#### `hooks/useTreeRealtime.js`

Quản lý realtime editing:

- Listen socket events của cây.
- Theo dõi người khác đang sửa person nào.
- Emit start/stop editing.
- Trả về map trạng thái editing để node hiển thị cảnh báo.

### Utils Gần Cây

#### `utils/treeValidation.js`

Validate dữ liệu cây ở frontend:

- Parent/child thiếu người.
- Vòng lặp parent-child.
- Ngày sinh con trước cha/mẹ bất hợp lý.
- Trả `Map` lỗi theo person id để UI highlight.

Backend vẫn là lớp validate cuối cùng. File này giúp cảnh báo sớm trên UI.

#### `utils/treeFilter.js`

Tính visible node khi xem theo root/collapse:

- Build family indexes.
- Lấy ancestors.
- Lấy descendants.
- Lấy related root view ids.
- Ẩn descendants khi collapse.
- Filter `people/families/childRows` theo visible ids.

#### `utils/treeHighlight.js`

Tạo trạng thái highlight/className cho node:

- selected.
- search match.
- validation error.
- being edited.
- self/current account.

### Utils `tree-editor/`

#### `utils/tree-editor/treeConstants.js`

Hằng số render/layout:

- kích thước card.
- khoảng cách generation/spouse/sibling.
- snap size.
- canvas padding.
- màu đường huyết thống.
- key localStorage cho line routes/card sizes.

#### `utils/tree-editor/treePersonUtils.js`

Helper person:

- parse int, clamp, snap position.
- đọc current account từ storage.
- format ngày.
- tạo full name.
- normalize person từ API.
- sort person/sibling.
- convert person sang form.
- lấy id person vừa tạo từ response.

#### `utils/tree-editor/treeStorage.js`

Local storage và normalize layout:

- `loadCardSizes`, `saveCardSizes`.
- `loadLineRoutes`, `saveLineRoutes`.
- normalize layout settings từ backend.
- normalize card size.

#### `utils/tree-editor/treeNormalize.js`

Chuẩn hóa dữ liệu từ API:

- Deduplicate people theo account/person.
- Remap family ids/person ids nếu dữ liệu có duplicate.
- Remap child rows theo people/family map.

#### `utils/tree-editor/treeLayout.js`

Auto layout:

- tìm founder/root.
- tính Y theo generation.
- layout generation đơn giản.
- layout spouse-aware để vợ/chồng đứng gần nhau.
- merge manual layout với auto layout.
- normalize spacing theo generation.

Nếu sửa cách node tự xếp vị trí, sửa file này trước.

#### `utils/tree-editor/treeLines.js`

Tạo đường nối SVG giữa nodes:

- tính điểm center/bottom/right của card.
- parse route path.
- build line cho parent-child/spouse.
- áp dụng line route custom và card size.

Nếu sửa cách vẽ đường cha/mẹ/con/vợ/chồng, đây là file chính.

#### `utils/tree-editor/treeRelations.js`

Logic quan hệ ở frontend:

- tìm family cha/mẹ của child.
- tìm spouse/family đang active.
- lấy children của family.
- build payload thêm child vào family.
- lọc candidate khi chọn người liên kết.
- xác định linked ids theo relation.
- tạo form mặc định khi tạo person mới từ relation.

Backend vẫn validate cuối cùng, nhưng file này giúp UI không đưa ra lựa chọn quá sai.

#### `utils/tree-editor/treeExport.js`

Xuất cây thành PNG:

- tính bounding box export.
- chọn pixel ratio.
- vẽ card/line lên canvas.
- tải blob PNG.
- fallback khi SVG path không vẽ trực tiếp được.

## API Liên Quan Đến Genealogy

Trong `src/api/managerService.js`:

- `getManagerTree(clanId)`: lấy cây cho manager/admin.
- `createPersonAPI(data)`: tạo person.
- `linkRelationsAPI(data)`: liên kết quan hệ.
- `updatePersonAPI(personId, data)`: sửa person.
- `updatePersonPositionAPI(personId, data)`: lưu vị trí một person.
- `saveTreeLayoutAPI(people, clanId, options)`: lưu layout cũ/nhiều người.
- `saveTreeLayoutBatchAPI(data)`: lưu node positions, line routes, card sizes theo batch.
- `deletePersonAPI(personId)`: xóa person.
- `createFamilyAPI(data)`: tạo family.
- `updateFamilyAPI(familyId, data)`: sửa family.
- `addFamilyChildAPI(familyId, data)`: thêm child vào family.
- `getActiveTreeEditKeysAPI(clanId)`: lấy edit keys đang còn hạn.
- `createTreeEditKeyAPI(memberAccountIds)`: cấp key sửa cây tạm cho member.

Trong `src/api/aiServerService.js`:

- `extractGenealogyAI(payload)`: gọi `/api/ai/genealogy/extract` để lấy members/relationships nháp.

## Luồng AI Gia Phả

```text
FamilyTreeEditor
-> nhập text hoặc voice transcript
-> extractGenealogyAI
-> Backend /api/ai/genealogy/extract
-> AI-server /genealogy/extract
-> members/relationships nháp
-> người dùng chỉnh sửa
-> save vào cây qua createPersonAPI/linkRelationsAPI
```

Voice input trong AI gia phả có hai kiểu:

1. Browser Speech API: cần Chrome/Edge, localhost hoặc HTTPS, thường cần mạng.
2. `VoiceRecorder`: upload audio qua `/api/voice`, cần backend và voice worker.

## Biến Môi Trường

Tạo `.env`:

```powershell
cd D:\cap2\Frontend
copy .env.example .env
```

```text
VITE_API_BASE_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
```

## Chạy Local

```powershell
cd D:\cap2\Frontend
npm install
npm run dev
```

Build:

```powershell
cd D:\cap2\Frontend
npm run build
```

## Quy Ước Khi Sửa Genealogy Frontend

- Nếu sửa mutation cây, kiểm tra cả frontend payload và backend validation.
- Nếu thêm relation type, cập nhật `treeRelations.js`, modal UI và backend validation.
- Nếu thêm field person, cập nhật form create, inspector, normalize person, API payload và backend DB/controller.
- Nếu sửa layout, kiểm tra `treeLayout.js`, `treeLines.js`, `treeStorage.js` và save batch.
- Nếu sửa AI genealogy, kiểm tra `FamilyTreeEditor.jsx`, `aiServerService.js`, AI-server `/genealogy/extract` và flow save draft.
- Nếu thêm text UI, cập nhật cả `vi.json` và `en.json`.
- Không commit `dist/`, `.env` hoặc artifact build.
