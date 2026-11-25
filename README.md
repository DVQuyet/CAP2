# CAP2 - Gia Phả Việt

CAP2 là hệ thống quản lý gia phả và hoạt động dòng họ. Repo gồm ứng dụng React/Vite, API Node.js/Express, module voice local, database/migration và tài liệu hỗ trợ.

## Thành Phần Chính

```text
cap2/
├── Frontend/   # Giao diện React/Vite
├── Backend/    # Express API, Socket.IO, MySQL, Groq AI integration
├── voice/      # Local speech-to-text bằng faster-whisper
├── database/   # schema/init.sql và migrations/ (nguồn schema duy nhất)
├── docs/       # Kế hoạch (KE_HOACH_TONG_THE.md), việc còn mở, API; nhật ký cũ ở docs/nhat-ky/
├── scripts/    # Script vận hành local
└── README.md
```

## Luồng Chạy Tổng Quan

```text
Frontend -> Backend API -> MySQL
Frontend -> Backend /api/ai -> Groq API
Frontend -> Backend /api/chatbot -> rule engine + Groq language layer
Frontend -> Backend /api/voice -> MySQL queue -> voice worker -> transcript
Backend <-> Frontend qua Socket.IO cho một số luồng realtime
```

AI không tự ghi database. Các tính năng AI chỉ sinh dữ liệu nháp, plan JSON, diễn giải hoặc gợi ý để người dùng/backend kiểm tra trước khi lưu. Riêng quan hệ gia phả trong chatbot luôn do `relationshipEngine` của Backend xác minh.

## Yêu Cầu Môi Trường

- Node.js phù hợp với Vite/Express hiện tại.
- MySQL 8 hoặc TiDB có database của dự án (dựng bằng `npm run migrate`, xem mục Database thử).
- `GROQ_API_KEY` trong `Backend/.env` nếu muốn dùng AI thật.
- Python 64-bit riêng cho `.venv-whisper` nếu dùng local speech-to-text.
- FFmpeg trong `PATH` nếu dùng voice worker.

## Thiết Lập Nhanh

### 1. Backend

```powershell
cd Backend
npm install
copy .env.example .env
npm run dev
```

Backend mặc định chạy tại:

```text
http://localhost:3000
```

Các biến quan trọng trong `Backend/.env`: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `FRONTEND_URL`, `GROQ_API_KEY`, `GROQ_MODEL`.

#### Database thử (không chạy thử trên DB thật)

`Backend/.env.local` (gitignore, nạp trước `.env` nên thắng) trỏ backend vào một DB riêng. Chép từ `Backend/.env.local.example` rồi chọn một trong hai:

- **TiDB Cloud, database `cap2_test`** (máy không có Docker): tạo database `cap2_test` trên cùng cụm TiDB, điền host của cụm,
  `DB_NAME=cap2_test`, `DB_PORT=4000`, `DB_SSL=true`, `DB_SSL_REJECT_UNAUTHORIZED=true` (kiểm chứng chỉ máy chủ; mặc định là không kiểm).
  Không bao giờ đặt `DB_NAME=defaultdb` (DB thật) trong `.env.local`.
  Dùng tài khoản DB **riêng, chỉ có quyền trên `cap2_test`**, không dùng `<prefix>.root` của cụm (root đọc/xoá được cả DB thật).
  Người quản trị cụm tạo một lần trong SQL Editor của TiDB Cloud, mật khẩu giữ ngoài repo:

  ```sql
  CREATE USER '<prefix>.cap2_test'@'%' IDENTIFIED BY '<mật khẩu mạnh riêng>';
  GRANT ALL PRIVILEGES ON cap2_test.* TO '<prefix>.cap2_test'@'%';
  ```

  Rồi đặt `DB_USER=<prefix>.cap2_test` trong `.env.local`. Lỡ trỏ `DB_NAME=defaultdb` thì TiDB từ chối thay vì sửa DB thật.
- **MySQL trong Docker**: `docker compose -f docker/docker-compose.yml up -d`, giữ nguyên giá trị Docker trong file mẫu (cổng 3307, `cap2_dev`).

Dựng schema (chạy lại nhiều lần không lỗi):

```powershell
cd Backend
npm run migrate
```

`npm run migrate` chạy `database/schema/init.sql`, `02_modules.sql`, `03_modules.sql`, `04_seed.sql` (đủ 48 bảng, ba vai trò, gói `FREE`),
rồi các file `database/migrations/*.sql` mới hơn mốc 15/11/2026 (mỗi file một lần, ghi ở bảng `schema_migrations`), rồi các hàm `ensure*()`.
File `.sql` mới phải chạy được trên cả TiDB và MySQL 8: không trigger/procedure, không `ALTER ... MODIFY` để thêm `AUTO_INCREMENT`,
không thêm cột generated `STORED` bằng `ALTER`, tách `ALTER` khi mệnh đề sau dùng cột vừa thêm.
Migration mới đổi schema từng bước có kiểm `information_schema` (mẫu `SET @has := ...; SET @ddl := IF(...); PREPARE/EXECUTE`,
xem `2026_11_25_fund_tables_upgrade.sql`), nên lỗi giữa file thì sửa rồi chạy lại được. Hai lệnh `npm run migrate` cùng lúc
không giẫm nhau: lệnh sau chờ khóa `GET_LOCK('cap2_schema_migrations')` tối đa 120 giây.

### 2. Frontend

```powershell
cd Frontend
npm install
copy .env.example .env
npm run dev
```

Frontend mặc định chạy tại:

```text
http://localhost:5173
```

### 3. Voice Worker

Chỉ cần chạy nếu dùng nút ghi âm local/Whisper.

```powershell
# chạy từ thư mục gốc của repo
py -3.12 -m venv .venv-whisper
.\.venv-whisper\Scripts\python.exe -m pip install --upgrade pip
.\.venv-whisper\Scripts\python.exe -m pip install -r .\voice\requirements.txt
.\scripts\run_voice_worker.ps1
```

Voice worker đọc cấu hình DB từ `Backend/.env`.

## Kiểm Tra

Frontend:

```powershell
cd Frontend
npm run build
```

Backend:

```powershell
cd Backend
node --check server.js
npm run test:chatbot
```

Bộ thử trình duyệt (Playwright, thư mục `e2e/`): đăng nhập ba vai trò, mở cây, bật/tắt toàn màn hình, trang quản lý gia phả của admin,
AI điền form sự kiện với LLM giả (không gọi Groq). Cần `Backend/.env.local` trỏ vào DB thử đã `npm run migrate` (mục Database thử).
Lần đầu cài một lần, sau đó chạy bằng một lệnh ở gốc repo:

```powershell
cd e2e; npm install; npx playwright install chromium; cd ..
```

```powershell
npm run test:e2e
```

Lệnh này tự tạo lại dữ liệu thử (`Backend/scripts/e2e-seed.js`: tài khoản `e2e_*@example.test`, dòng họ "E2E Họ Thử"; dừng nếu `DB_NAME`
là `defaultdb`), bật LLM giả :4010, Backend :3100, Frontend :5180, rồi chạy trình duyệt. Báo cáo lỗi: `e2e/test-results/`.
CI chạy cùng bộ này trên MySQL trong container (job `e2e` trong `.github/workflows/ci.yml`).

Python voice worker:

```powershell
# chạy từ thư mục gốc của repo
python -m py_compile voice\worker\worker.py
```

## Tài Liệu Theo Module

- `Frontend/README.md`: cấu trúc UI, env Vite, quy ước frontend.
- `Backend/README.md`: route, module backend, env và tích hợp.
- `voice/README.md`: luồng upload audio, schema, worker Whisper.

## Ghi Chú Phát Triển

- Khi thêm API mới, ưu tiên đặt theo domain trong `Backend/src/modules/*` và client tương ứng trong `Frontend/src/api/*Service.js`.
- Khi thêm tính năng frontend, ưu tiên đặt trong `Frontend/src/features/<domain>`.
- Không commit file `.env`, file build `dist/`, audio upload hoặc artifact local.
- Web Speech API của trình duyệt cần Chrome/Edge, localhost hoặc HTTPS. Voice worker là lựa chọn local/offline hơn nhưng cần FFmpeg và model Whisper.
