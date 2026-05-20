# Voice / Local Speech-to-Text

`voice/` là module speech-to-text local của Gia Phả Việt. Module này dùng Backend để nhận file ghi âm, lưu metadata vào MySQL, sau đó Python worker poll database và dùng faster-whisper để chuyển audio thành transcript.

Module này độc lập với Web Speech API của trình duyệt. Web Speech API chạy trực tiếp trong browser; còn `voice/` là luồng local/offline hơn, cần Backend, database, FFmpeg và worker Python.

## Luồng xử lý

```text
Frontend VoiceRecorder
-> POST /api/voice/recordings
-> Backend lưu audio vào Backend/storage/recordings
-> Backend tạo row trong recordings với status=uploaded
-> voice/worker/worker.py poll row uploaded
-> FFmpeg convert audio sang wav
-> faster-whisper transcribe
-> worker cập nhật transcript/status vào MySQL
-> Frontend poll GET /api/voice/recordings/:id
```

## Cấu trúc

```text
voice/
├── backend/
│   └── backendRoutes.js       # Express router mount vào /api/voice
├── schema/
│   └── voice.schema.sql       # recordings, voice_recording_recipients
├── worker/
│   └── worker.py              # Poll DB, convert audio, transcribe
├── requirements.txt
└── README.md
```

File liên quan:

```text
Backend/server.js
Backend/storage/recordings/
Frontend/src/api/voiceService.js
Frontend/src/features/voice/components/VoiceRecorder.jsx
scripts/run_voice_worker.ps1
.venv-whisper/
```

## Yêu cầu

- Backend đang chạy và mount `/api/voice`.
- MySQL dùng cùng cấu hình với `Backend/.env`.
- Python 64-bit cho `.venv-whisper`.
- FFmpeg có trong `PATH`.
- Dependencies trong `voice/requirements.txt`.

Không dùng chung virtual environment với `AI-server/.venv`. Worker có kiểm tra để tránh chạy nhầm Python.

## Cấu hình

Worker đọc biến môi trường từ:

```text
Backend/.env
.env ở repo root nếu có
```

Biến bắt buộc cho DB:

```text
DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=
```

Biến tùy chọn:

```text
VOICE_STORAGE_ROOT=D:\cap2\Backend\storage
VOICE_WORKER_POLL_SECONDS=3
VOICE_WORKER_PYTHON=D:\cap2\.venv-whisper\Scripts\python.exe

VOICE_WHISPER_MODEL=small
VOICE_WHISPER_DEVICE=cpu
VOICE_WHISPER_COMPUTE_TYPE=int8
VOICE_WHISPER_LANGUAGE=vi

VOICE_DELETE_WAV_ON_SUCCESS=true
VOICE_DELETE_WAV_ON_FAILED=false
```

Backend route có thêm các biến:

```text
VOICE_STORAGE_ROOT=
VOICE_MAX_DURATION_SECONDS=180
VOICE_MAX_FILE_MB=25
VOICE_SCHEDULED_JOB_DISABLED=false
VOICE_SCHEDULED_JOB_SECONDS=60
```

## Cài đặt worker

```powershell
cd D:\cap2
py -3.12 -m venv .venv-whisper
.\.venv-whisper\Scripts\python.exe -m pip install --upgrade pip
.\.venv-whisper\Scripts\python.exe -m pip install -r .\voice\requirements.txt
```

Kiểm tra FFmpeg:

```powershell
ffmpeg -version
```

## Chạy worker

Khuyến nghị dùng script:

```powershell
cd D:\cap2
.\scripts\run_voice_worker.ps1
```

Chạy trực tiếp:

```powershell
D:\cap2\.venv-whisper\Scripts\python.exe D:\cap2\voice\worker\worker.py
```

Khi chạy đúng, terminal sẽ in:

```text
Voice worker started
Using Python executable: ...
Model name/device/compute type/language: ...
```

## Schema

`voice/backend/backendRoutes.js` và `voice/worker/worker.py` đều gọi schema:

```text
voice/schema/voice.schema.sql
```

Nếu DB user không có quyền `CREATE TABLE` hoặc `ALTER TABLE`, chạy SQL này thủ công trước.

## API chính

Các route được mount dưới `/api/voice`:

```text
POST   /recordings
GET    /recordings
GET    /recordings/:id
GET    /recordings/:id/audio
PATCH  /recordings/:id/transcript
POST   /recordings/:id/retry
POST   /recordings/:id/send
GET    /recordings/recipient-options
```

Frontend thường dùng:

```text
POST /api/voice/recordings
GET  /api/voice/recordings/:id
```

## Sử dụng ở frontend

Component:

```text
Frontend/src/features/voice/components/VoiceRecorder.jsx
```

Service:

```text
Frontend/src/api/voiceService.js
```

`VoiceRecorder` ghi âm bằng `MediaRecorder`, upload blob lên backend, sau đó poll transcript. Component này hiện được dùng ở các luồng cần chuyển giọng nói thành text, bao gồm AI cây gia phả.

## Khác với Browser Speech API

| Tiêu chí | Browser Speech API | Voice worker |
| --- | --- | --- |
| Nơi xử lý | Trình duyệt/dịch vụ browser | Máy local/server chạy worker |
| Cần HTTPS/localhost | Có | Không bắt buộc ở worker |
| Cần internet | Thường có | Có thể chạy local sau khi có model |
| Cần FFmpeg | Không | Có |
| Cần Backend/MySQL | Không trực tiếp | Có |
| Phù hợp | Nhập nhanh trên Chrome/Edge | Local STT ổn định hơn, lưu audio/transcript |

## Xử lý lỗi thường gặp

- `Voice worker phai chay bang .venv-whisper`: đang dùng nhầm Python, chạy lại bằng `D:\cap2\.venv-whisper\Scripts\python.exe`.
- `ffmpeg not found in PATH`: cài FFmpeg và mở lại terminal.
- `Thieu cau hinh database`: kiểm tra `Backend/.env`.
- Recording mãi `uploaded`: worker chưa chạy hoặc không kết nối được DB.
- Recording `failed`: xem terminal worker để biết lỗi convert/transcribe.

## Kiểm tra

Compile check:

```powershell
cd D:\cap2
python -m py_compile voice\worker\worker.py
```

Kiểm tra route backend:

```powershell
cd D:\cap2\Backend
node --check ..\voice\backend\backendRoutes.js
```
