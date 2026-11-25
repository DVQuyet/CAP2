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

- **TiDB Cloud, database `cap2_test`** (máy không có Docker): tạo database `cap2_test` trên cùng cụm TiDB, điền host/user/mật khẩu của cụm,
  `DB_NAME=cap2_test`, `DB_PORT=4000`, `DB_SSL=true`. Không bao giờ đặt `DB_NAME=defaultdb` (DB thật) trong `.env.local`.
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
