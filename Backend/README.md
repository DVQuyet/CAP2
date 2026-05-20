# Backend - Gia Phả Việt API

Backend là Node.js/Express server của hệ thống Gia Phả Việt. Server xử lý xác thực, phân quyền, dữ liệu gia phả, sự kiện, công việc, quỹ, bài viết, media, billing/payment, notification và realtime Socket.IO.

## Công nghệ

- Express 5
- MySQL qua `mysql2`
- JWT authentication
- Socket.IO
- Multer cho upload file
- Nodemailer cho email/OTP/reminder
- XLSX cho import/export dữ liệu quỹ

## Cấu trúc

```text
Backend/
- server.js
- package.json
- .env.example
- src/
  - config/
  - middleware/
  - modules/
  - shared/
  - socket/
- scripts/
- storage/
- uploads/
```

## File Map Tổng Quát

- `server.js`: entrypoint Express + HTTP server + Socket.IO, cấu hình CORS, upload memory media, mount route `/api/*`, mount `/api/voice` từ `../voice/backend/backendRoutes.js`.
- `src/config/db.js`: tạo pool MySQL, đọc `DB_*`, hỗ trợ SSL và public DNS option.
- `src/config/roles.js`: hằng số vai trò.
- `src/middleware/authMiddleware.js`: xác thực JWT, gắn `req.user`, kiểm tra role bằng `checkRole`.
- `src/shared/utils/email.js`: gửi email dùng SMTP, dùng cho OTP/reminder.
- `src/shared/utils/media.js`: chuẩn hóa media URL, giới hạn kích thước upload.
- `src/shared/utils/notifications.js`: tạo/đảm bảo schema notification.
- `src/shared/utils/personDeletion.js`: xóa person và dữ liệu liên quan.
- `src/shared/utils/treeEditPermissions.js`: cấp/kiểm tra quyền chỉnh sửa cây tạm thời cho member.
- `src/shared/utils/treeLayoutSettings.js`: lưu/đọc layout settings của cây theo clan.
- `src/socket/treeRealtime.js`: emit event realtime khi cây gia phả thay đổi.

## Modules

- `src/modules/auth/`: đăng ký, đăng nhập, OTP, quên mật khẩu, route auth.
- `src/modules/admin/`: dashboard/quản trị hệ thống.
- `src/modules/manager/`: dashboard manager, clan info, member, moderation, event/task, archive, route chính của manager.
- `src/modules/member/`: dashboard/profile/submission của member.
- `src/modules/genealogy/`: controller và service chuyên về cây gia phả.
- `src/modules/ai/`: proxy tới AI-server.
- `src/modules/media/`: upload/phục vụ media.
- `src/modules/calendar/`: lịch và reminder.
- `src/modules/fund/`: quỹ dòng họ.
- `src/modules/billing/`: gói dịch vụ/billing.
- `src/modules/payment/`: payment/SePay.
- `src/modules/clan/`: đăng ký/thông tin dòng họ.

## Genealogy Backend Chi Tiết

Các route cây gia phả được khai báo trong `src/modules/manager/manager.routes.js`, nhưng phần xử lý chính nằm ở `src/modules/genealogy/*` và được export qua `manager.controller.js`.

### `src/modules/genealogy/tree.controller.js`

Controller chính cho mutation cây gia phả.

Các handler quan trọng:

- `createPerson(req, res)`: tạo person mới trong clan, kiểm tra quyền sửa cây, giới hạn billing, ngày sinh/mất, generation, gender, account cho người còn sống, media avatar, quan hệ cha/mẹ/vợ/chồng nếu gửi kèm.
- `linkRelations(req, res)`: liên kết person đang có với quan hệ cha/mẹ/con/vợ/chồng. Dùng validation để chặn quan hệ sai hoặc yêu cầu xác nhận với quan hệ lịch sử.
- `updateTreePerson(req, res)`: cập nhật thông tin person, kiểm tra ảnh hưởng đến ngày sinh, ngày mất, generation, gender và quan hệ hiện có.
- `updatePersonPosition(req, res)`: lưu vị trí node đơn lẻ trên canvas cây.
- `saveTreeLayout(req, res)`: lưu layout nhiều người hoặc layout patch cũ.
- `saveTreeLayoutBatch(req, res)`: lưu batch layout gồm node positions, line routes, card sizes; dùng để giảm số request khi kéo thả.
- `createFamily(req, res)`: tạo family row với father/mother/status/date/note.
- `updateFamily(req, res)`: cập nhật family row và validate lại cha/mẹ.
- `addFamilyChild(req, res)`: thêm child vào family, validate child với parents.
- `deleteTreePerson(req, res)`: xóa person khỏi cây sau khi kiểm tra quyền và ràng buộc.

Các helper trong file:

- `relationHttpStatus`, `relationPayload`, `relationErrorFromResult`: chuẩn hóa lỗi relation thành HTTP response.
- `normalizeFamilyRelationshipStatus`: chỉ cho các status `active`, `divorced`, `widowed`.
- `nullableText`: chuẩn hóa text rỗng thành `null`.
- Các helper layout batch: parse JSON layout, merge patch, normalize node changes.

File này phụ thuộc nhiều vào:

- `manager/common.service.js`: DB, billing limit, media, delete person, layout save.
- `familyRelation.service.js`: áp dụng quan hệ huyết thống/hôn nhân.
- `familyValidation.service.js`: validate relation/generation/date/delete.
- `kinshipValidation.service.js`: chặn quan hệ cận huyết hoặc cảnh báo lịch sử.
- `managerClan.service.js`: resolve clan và kiểm tra quyền manager/admin/member.
- `treeRealtime.js`: emit `tree_updated` sau khi mutation thành công.

### `src/modules/genealogy/familyRelation.service.js`

Service tạo và đọc quan hệ gia đình.

Vai trò chính:

- Đảm bảo schema phụ trợ cho layout và relationship:
  - `ensurePeopleTreeLayoutColumns`
  - `ensureFamilyRelationshipColumns`
- Chuẩn hóa relationship status/date/text.
- Đọc family/person liên quan:
  - `getFamiliesForPerson`
  - `getActiveSpouseFamily`
  - `getOwnedFamilyRelations`
  - `getChildBloodline`
- Mapping DB rows thành cấu trúc tree:
  - `mapFamilyRelationRows`
  - `buildManagedFamilyTree`
- Áp dụng quan hệ:
  - `applyBloodlineForPerson`: set cha/mẹ cho một person thông qua family/children rows.
  - `applyMarriageRelationsForPerson`: tạo/cập nhật quan hệ vợ/chồng, status hôn nhân, xử lý spouse family.
- Validate trước khi tạo/cập nhật spouse:
  - `validateCanCreateOrUpdateSpouse`

Khi cần thay đổi cách hệ thống hiểu cha/mẹ/vợ/chồng, đây là file quan trọng nhất.

### `src/modules/genealogy/familyValidation.service.js`

Service validate dữ liệu cây trước khi ghi DB.

Các nhóm kiểm tra:

- `validateFamilyParents`: cha/mẹ trong một family phải hợp lệ, không trùng người, đúng clan, không tạo vòng lặp.
- `validateChildAgainstParents`: child phải hợp lệ với cha/mẹ, không tự làm con của chính mình, kiểm tra generation/date/gender.
- `validatePersonGenerationWithRelations`: khi đổi generation của person, kiểm tra với cha/mẹ/con hiện có.
- `validatePersonGenderWithFamilyRole`: gender phải tương thích với vai trò father/mother nếu có.
- `validatePersonBirthDateWithRelations`: birth date phải hợp lý với cha/mẹ/con.
- `validatePersonLifeDates`: ngày mất không được trước ngày sinh.
- `assertCanDeleteTreePerson`: chặn xóa person nếu còn ràng buộc không được phép xóa trực tiếp.

File này thiên về quy tắc dữ liệu nội bộ, không xử lý HTTP.

### `src/modules/genealogy/kinshipValidation.service.js`

Service kiểm tra xung đột họ hàng, đặc biệt cho quan hệ vợ/chồng và quan hệ lịch sử.

Các chức năng chính:

- `validateSpouseKinshipConflict`: kiểm tra trước khi tạo/cập nhật spouse.
- `validateParentChildSpouseConflict`: kiểm tra xung đột khi parent/child liên quan tới spouse.
- `normalizeForceFlag`: đọc flag ép lưu khi người dùng xác nhận cảnh báo lịch sử.
- Tìm quan hệ trong cây:
  - descendant/ancestor
  - parent-child trực tiếp
  - spouse hiện có
  - chung cha/mẹ
  - common ancestor trong một độ sâu nhất định
- Phân loại kết quả:
  - lỗi cứng: không cho lưu.
  - cảnh báo lịch sử: trả `requiresConfirmation=true`, frontend có thể hỏi xác nhận rồi gửi lại force flag.

Nếu frontend nhận HTTP `409` với `requiresConfirmation`, thường nguồn là file này.

## Genealogy Routes

Khai báo trong `src/modules/manager/manager.routes.js`:

```text
GET    /api/manager/tree
GET    /api/manager/clans/:clanId/family-tree
PATCH  /api/manager/clans/:clanId/family-tree/layout
POST   /api/manager/tree/layout/batch
POST   /api/manager/people
POST   /api/manager/people/create
PATCH  /api/manager/people/link
PATCH  /api/manager/people/layout
PATCH  /api/manager/people/:id/position
PATCH  /api/manager/people/:id
DELETE /api/manager/people/:id
POST   /api/manager/families
PATCH  /api/manager/families/:familyId
POST   /api/manager/families/:familyId/children
```

Admin/manager dùng đầy đủ. Member chỉ được mutation nếu có quyền qua tree edit key hoặc scope được cấp.

## File Liên Quan Đến Genealogy Nhưng Nằm Ngoài `genealogy/`

### `src/modules/manager/manager.controller.js`

Controller aggregate của module manager. File này import/export nhiều handler từ các controller/service nhỏ, trong đó có handler cây gia phả từ `tree.controller.js`.

### `src/modules/manager/manager.routes.js`

Nơi mount toàn bộ route manager, bao gồm route cây gia phả. Khi thêm endpoint mới cho cây, thường cần sửa file này.

### `src/modules/manager/managerClan.service.js`

Xác định clan mà user được quản lý hoặc được chỉnh sửa:

- `getManagerClanId`
- `resolveManagedClanId`
- `assertCanManagePersonId`
- `loadTreeEditKeyTargets`

### `src/modules/manager/common.service.js`

Tập hợp helper dùng chung cho manager/genealogy:

- `db`
- `assertTreeMutationPermission`
- `ensureCanAddPerson`, `ensureCanAddAccount`
- `buildDisplayNameFromPartsMgr`
- `fmtSqlDate`
- `saveTreeLayoutSettings`
- `deletePersonCompletely`

### `src/shared/utils/treeEditPermissions.js`

Quản lý quyền sửa cây tạm thời cho member:

- tạo edit key
- hash key
- đọc key từ request header
- xác định scope được sửa: self, cha/mẹ trực tiếp, con trực tiếp
- `assertTreeMutationPermission`

Frontend gửi key này thông qua header được tạo bởi `Frontend/src/services/treeEditSession.js`.

### `src/shared/utils/treeLayoutSettings.js`

Lưu `line_routes`, `card_sizes` và các layout settings khác theo clan.

### `src/socket/treeRealtime.js`

Emit realtime update:

```text
tree_updated
tree_member_editing
tree_member_editing_stop
```

Frontend lắng nghe để reload hoặc báo người khác đang sửa node.

## Biến Môi Trường

Tạo file `Backend/.env` từ `.env.example`:

```powershell
cd D:\cap2\Backend
copy .env.example .env
```

Biến quan trọng:

```text
PORT=3000
JWT_SECRET=your-secret

DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=cap2_user
DB_PASSWORD=cap2_password
DB_NAME=defaultdb
DB_CONNECTION_LIMIT=5
DB_SSL=false

FRONTEND_URL=http://localhost:5173
AI_SERVER_URL=http://localhost:8001
```

Tùy tính năng:

```text
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

SEPAY_BANK_BIN=
SEPAY_BANK_ACCOUNT=
SEPAY_ACCOUNT_NAME=
SEPAY_QR_TEMPLATE=compact2
SEPAY_WEBHOOK_SECRET=

MAX_IMAGE_UPLOAD_BYTES=
MAX_POST_MEDIA_UPLOAD_BYTES=
MAX_MEMORY_MEDIA_UPLOAD_BYTES=
```

## Chạy Local

```powershell
cd D:\cap2\Backend
npm install
npm run dev
```

Mặc định:

```text
http://localhost:3000
```

## Tích Hợp AI

Backend không gọi Groq trực tiếp. Các route trong `src/modules/ai` proxy sang AI-server:

```text
POST /api/ai/event-form/generate -> AI_SERVER_URL/event-form/generate
POST /api/ai/genealogy/extract   -> AI_SERVER_URL/genealogy/extract
```

## Tích Hợp Voice

```text
Frontend VoiceRecorder
-> POST /api/voice/recordings
-> Backend/storage/recordings
-> recordings.status=uploaded
-> voice worker
-> transcript
-> GET /api/voice/recordings/:id
```

Backend chỉ nhận upload và trả transcript đã có. Chuyển audio thành text nằm ở `voice/worker/worker.py`.

## Kiểm Tra

```powershell
cd D:\cap2\Backend
node --check server.js
node --check src\modules\genealogy\tree.controller.js
node --check src\modules\genealogy\familyRelation.service.js
node --check src\modules\genealogy\familyValidation.service.js
node --check src\modules\genealogy\kinshipValidation.service.js
```

## Quy Ước Khi Sửa Genealogy Backend

- Không ghi trực tiếp relation nếu chưa qua validation service.
- Mutation cây phải kiểm tra `assertTreeMutationPermission`.
- Sau khi ghi dữ liệu cây, emit realtime update nếu frontend cần đồng bộ.
- Nếu thêm field layout mới, cập nhật cả DB ensure/migration, backend normalize và frontend storage/render.
- Nếu thêm rule relation mới, kiểm tra cả backend validation và frontend dialog/force confirmation.
- Không commit `.env`, upload/audio hoặc dữ liệu local.
