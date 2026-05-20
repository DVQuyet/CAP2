# CAP2 - Gia Phả Việt

CAP2 là hệ thống quản lý gia phả và hoạt động dòng họ. Repo này gồm ứng dụng React/Vite, API Node.js/Express, dịch vụ AI Flask, module speech-to-text local và các tài nguyên database/tài liệu hỗ trợ.

## Thành phần chính

```text
cap2/
├── Frontend/      # Giao diện React/Vite
├── Backend/       # Express API, Socket.IO, MySQL
├── AI-server/     # Flask service cho các tính năng AI
├── voice/         # Local speech-to-text bằng faster-whisper
├── database/      # Schema, seed, dump, migration SQL
├── migrations/    # Migration bổ sung
├── docs/          # Tài liệu nghiệp vụ/báo cáo
├── scripts/       # Script vận hành local
└── README.md
```

## Luồng chạy tổng quan

```text
Frontend -> Backend API -> MySQL
Frontend -> Backend /api/ai -> AI-server
Frontend -> Backend /api/voice -> MySQL queue -> voice worker -> transcript
Backend <-> Frontend qua Socket.IO cho một số luồng realtime
```

AI-server chỉ sinh dữ liệu nháp để frontend/backend hiển thị cho người dùng kiểm tra. Service này không tự ghi database. Voice worker xử lý audio local, cập nhật transcript vào database, sau đó frontend poll kết quả qua `/api/voice`.

## Yêu cầu môi trường

- Node.js phù hợp với Vite/Express hiện tại.
- MySQL đang chạy và có database/schema của dự án.
- Python 64-bit cho `AI-server`.
- Python 64-bit riêng cho `.venv-whisper` nếu dùng local speech-to-text.
- FFmpeg trong `PATH` nếu dùng voice worker.

## Thiết lập nhanh

### 1. Backend

```powershell
cd D:\cap2\Backend
npm install
copy .env.example .env
npm run dev
```

Backend mặc định chạy tại:

```text
http://localhost:3000
```

Các biến quan trọng nằm trong `Backend/.env`: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `FRONTEND_URL`, `AI_SERVER_URL`.

### 2. AI-server

```powershell
cd D:\cap2\AI-server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python app.py
```

AI-server mặc định chạy tại:

```text
http://localhost:8001
```

Nếu chưa có `GROQ_API_KEY`, một số endpoint vẫn có fallback rule-based cho prompt hợp lệ.

### 3. Frontend

```powershell
cd D:\cap2\Frontend
npm install
copy .env.example .env
npm run dev
```

Frontend mặc định chạy tại:

```text
http://localhost:5173
```

### 4. Voice worker

Chỉ cần chạy nếu dùng nút ghi âm local/Whisper.

```powershell
cd D:\cap2
py -3.12 -m venv .venv-whisper
.\.venv-whisper\Scripts\python.exe -m pip install --upgrade pip
.\.venv-whisper\Scripts\python.exe -m pip install -r .\voice\requirements.txt
.\scripts\run_voice_worker.ps1
```

Voice worker đọc cấu hình DB từ `Backend/.env`.

## Kiểm tra

Frontend:

```powershell
cd D:\cap2\Frontend
npm run build
```

Backend syntax check:

```powershell
cd D:\cap2\Backend
node --check server.js
```

AI-server tests:

```powershell
cd D:\cap2\AI-server
python -m unittest discover tests
```

Python compile check:

```powershell
cd D:\cap2
python -m py_compile AI-server\app.py voice\worker\worker.py
```

## Tài liệu theo module

- `Frontend/README.md`: cấu trúc UI, env Vite, quy ước frontend.
- `Backend/README.md`: route, module backend, env và tích hợp.
- `AI-server/README.md`: endpoint AI, fallback, cấu hình Groq.
- `voice/README.md`: luồng upload audio, schema, worker Whisper.

## Ghi chú phát triển

- Khi thêm API mới, ưu tiên đặt theo domain trong `Backend/src/modules/*` và client tương ứng trong `Frontend/src/api/*Service.js`.
- Khi thêm tính năng frontend, ưu tiên đặt trong `Frontend/src/features/<domain>`.
- Không commit file `.env`, file build `dist/`, audio upload hoặc artifact local.
- Web Speech API của trình duyệt cần Chrome/Edge, localhost hoặc HTTPS, và có kết nối mạng. Voice worker là lựa chọn local/offline hơn nhưng cần FFmpeg và model Whisper.
