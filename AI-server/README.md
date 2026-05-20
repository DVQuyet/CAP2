# AI-server

AI-server là Flask service phục vụ các tính năng AI của Gia Phả Việt. Service này nhận prompt từ Backend, sinh JSON theo schema cố định và trả về dữ liệu nháp để người dùng kiểm tra.

AI-server không truy vấn dữ liệu riêng, không tự tạo sự kiện/công việc/thành viên thật và không ghi database.

## Công nghệ

- Flask
- Groq SDK
- python-dotenv
- Rule-based fallback cho một số luồng quan trọng

## Cấu trúc

```text
AI-server/
├── app.py              # Flask app, prompt, normalize, fallback
├── requirements.txt
├── .env.example
├── tests/              # Unit tests cho event/genealogy logic
└── README.md
```

## Biến môi trường

Tạo `.env` từ `.env.example`:

```powershell
cd D:\cap2\AI-server
copy .env.example .env
```

Các biến chính:

```text
HOST=0.0.0.0
PORT=8001
DEBUG=false

GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_TIMEOUT_SECONDS=8
AI_DISABLE_GROQ=false
```

Nếu `GROQ_API_KEY` không có hoặc `AI_DISABLE_GROQ=true`, service vẫn chạy. Một số request hợp lệ sẽ được xử lý bằng fallback rule-based.

## Cài đặt

```powershell
cd D:\cap2\AI-server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Mặc định service chạy tại:

```text
http://localhost:8001
```

Backend cần trỏ tới service này bằng:

```text
AI_SERVER_URL=http://localhost:8001
```

## Endpoint

### `GET /health`

Kiểm tra service và trạng thái cấu hình Groq.

Response:

```json
{
  "success": true,
  "service": "ai-server",
  "groq_configured": true
}
```

### `POST /event-form/generate`

Sinh dữ liệu nháp cho form tạo sự kiện hoặc gợi ý công việc cho một sự kiện đã có.

Request tạo sự kiện:

```json
{
  "mode": "event_create",
  "prompt": "Tạo sự kiện giỗ tổ tháng 8 tại nhà thờ họ, khoảng 50 người tham dự",
  "today": "2026-05-19",
  "clan_id": 1,
  "requested_task_count": 6
}
```

Request tạo thêm công việc:

```json
{
  "mode": "task_create",
  "prompt": "Gợi ý thêm việc hậu cần",
  "today": "2026-05-19",
  "requested_task_count": 5,
  "current_event": {
    "id": 10,
    "title": "Giỗ tổ",
    "event_date": "2026-08-01",
    "description": "Giỗ tổ tại nhà thờ họ",
    "clan_id": 1
  },
  "existing_tasks": []
}
```

Response chuẩn:

```json
{
  "success": true,
  "status": "success",
  "mode": "event_create",
  "event": {
    "title": "Giỗ tổ",
    "event_date": "2026-08-01",
    "description": "Tạo sự kiện giỗ tổ tháng 8 tại nhà thờ họ, khoảng 50 người tham dự",
    "clan_id": 1
  },
  "manager_tasks": [
    {
      "event_id": null,
      "member_id": null,
      "title": "Lập danh sách con cháu tham dự",
      "description": "Tổng hợp số lượng thành viên tham dự để chuẩn bị lễ và tiếp đón.",
      "due_date": "2026-07-25",
      "status": "assigned"
    }
  ]
}
```

Nếu prompt không thuộc phạm vi sự kiện/dòng họ:

```json
{
  "success": true,
  "status": "unsupported",
  "mode": "event_create",
  "event": {
    "title": "",
    "event_date": null,
    "description": "",
    "clan_id": null
  },
  "manager_tasks": []
}
```

### `POST /genealogy/extract`

Trích xuất dữ liệu gia phả từ mô tả văn bản hoặc transcript giọng nói.

Request:

```json
{
  "input_source": "text",
  "prompt": "Ông Nguyễn Văn A có vợ là bà Trần Thị B, hai người có con là Nguyễn Văn C"
}
```

Request từ transcript:

```json
{
  "input_source": "voice_transcript",
  "prompt": "Transcript đã chuyển từ giọng nói..."
}
```

Response:

```json
{
  "members": [
    {
      "temporary_id": "p1",
      "full_name": "Nguyễn Văn A",
      "gender": "male",
      "birth_year": null,
      "death_year": null,
      "birth_date": null,
      "death_date": null,
      "phone": null,
      "address": null,
      "notes": null,
      "confidence": 0.92
    }
  ],
  "relationships": [],
  "uncertain_items": [],
  "warnings": [],
  "summary": {
    "total_members_detected": 1,
    "total_relationships_detected": 0,
    "needs_human_review": true
  }
}
```

## Fallback và normalize

`app.py` có hai lớp bảo vệ:

- Rule-based fallback cho event/genealogy khi Groq không có hoặc kết quả AI rỗng/sai.
- Normalize output để giữ schema ổn định, giới hạn field, chuẩn hóa ngày, loại bỏ quan hệ/task không hợp lệ.

Với genealogy, service còn xử lý một số pattern nhiều quan hệ trong cùng prompt, tách nhiều người con, cảnh báo mismatch số lượng và đánh dấu dữ liệu từ transcript cần kiểm tra.

## Kiểm tra

```powershell
cd D:\cap2\AI-server
.\.venv\Scripts\Activate.ps1
python -m unittest discover tests
```

Compile check:

```powershell
cd D:\cap2
python -m py_compile AI-server\app.py
```

## Ghi chú phát triển

- Endpoint phải trả JSON hợp lệ, không markdown.
- Không thêm field ngoài schema nếu frontend/backend không dùng.
- Không ghi database trong AI-server.
- Khi sửa prompt/schema, cập nhật test trong `AI-server/tests`.
- Nếu thêm endpoint AI mới, backend nên proxy qua `Backend/src/modules/ai`.
