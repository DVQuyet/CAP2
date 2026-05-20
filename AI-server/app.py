import calendar
from difflib import SequenceMatcher
import json
import os
import re
import unicodedata
from datetime import date, datetime, timedelta
from typing import Any

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from groq import Groq

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

MODEL_NAME = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

EVENT_FORM_SYSTEM_PROMPT = """
Bạn là AI chuyên sinh JSON cho form tạo sự kiện và công việc chuẩn bị của Gia Phả Việt.

Bạn không trả lời hội thoại tự do.
chỉ xử lý dữ liệu do input hiện tại cung cấp.
Không tự lấy, suy đoán hoặc nhắc tới dữ liệu ngoài input.
Không giải thích.
Không markdown.
Không dùng ```json.
Chỉ trả JSON hợp lệ.
Không thêm field ngoài schema.

Schema output bắt buộc:
{
  "status": "success",
  "mode": "event_create",
  "event": {
    "title": "",
    "event_date": null,
    "description": "",
    "clan_id": null
  },
  "manager_tasks": [
    {
      "event_id": null,
      "member_id": null,
      "title": "",
      "description": "",
      "due_date": null,
      "status": "assigned"
    }
  ]
}

Quy tắc bắt buộc:
0. status chỉ được là "success" hoặc "unsupported"; mode chỉ được là "event_create" hoặc "task_create".
1. Chỉ hỗ trợ yêu cầu liên quan sự kiện, nghi lễ, sinh hoạt, họp mặt, cưới hỏi, mừng thọ, giỗ chạp, tảo mộ, khuyến học, gây quỹ, họp họ, tu sửa, hoạt động gia đình hoặc dòng họ.
2. Nếu không liên quan, trả status = "unsupported", event rỗng như schema và manager_tasks = [].
3. mode phải lấy theo input: event_create hoặc task_create.
4. mode = event_create: tạo dữ liệu nháp event mới, manager_tasks[*].event_id luôn null.
5. mode = task_create: dựa vào current_event và existing_tasks để tạo thêm công việc mới, manager_tasks[*].event_id = current_event.id.
5a. AI chỉ sinh dữ liệu nháp để Manager kiểm tra/chỉnh sửa trước khi lưu; không tự ghi database.
6. clan_id lấy từ input clan_id hoặc current_event.clan_id.
7. member_id luôn null.
8. task.status luôn là "assigned".
9. Không tạo task trùng hoặc gần giống existing_tasks.
10. Task phải cụ thể, giao được cho một người thực hiện, bám sát chủ đề người dùng nhập.
11. Không dùng một template chung cho mọi sự kiện.
12. event.title tối đa 80 ký tự.
13. task.title tối đa 120 ký tự.
14. task.description tối đa 500 ký tự.
15. event_date và due_date chỉ được là YYYY-MM-DD hoặc null.
16. Nếu không chắc ngày thì để null, không bịa ngày cụ thể.
17. Nếu prompt chỉ có tháng, ví dụ "tháng 8", chọn ngày 01 của tháng đó theo năm trong today.
18. Nếu prompt có "đầu tháng N", chọn ngày 01; "giữa tháng N", chọn ngày 15; "cuối tháng N", chọn ngày cuối tháng.
19. Nếu prompt nói "cuối năm" nhưng không có tháng cụ thể, chọn 31/12 theo năm trong today.
20. Nếu có cả "cuối năm" và tháng cụ thể, ưu tiên tháng cụ thể.
21. Nếu có event_date thì mỗi task nên có due_date trước hoặc đúng event_date.
22. Nếu input có requested_task_count thì sinh đúng requested_task_count task, không ít hơn và không nhiều hơn.
"""

GENEALOGY_DATA_SYSTEM_PROMPT = """
Bạn là một AI Genealogy Data Assistant cho hệ thống quản lý gia phả.

Nhiệm vụ của bạn là đọc mô tả gia đình/dòng họ do người dùng nhập bằng văn bản hoặc transcript được chuyển từ giọng nói sang văn bản, sau đó trích xuất thành dữ liệu có cấu trúc gồm:
1. Danh sách thành viên gia đình.
2. Quan hệ giữa các thành viên.
3. Thông tin chưa chắc chắn hoặc còn thiếu.
4. Cảnh báo dữ liệu có thể bất thường.

QUY TẮC QUAN TRỌNG:
- Chỉ trả về JSON hợp lệ.
- Không dùng markdown.
- Không giải thích ngoài JSON.
- Không tự bịa thông tin không có trong dữ liệu đầu vào.
- Nếu thiếu thông tin, để null hoặc đưa vào uncertain_items.
- Không tự động kết luận quan hệ nếu mô tả mơ hồ.
- Chỉ trích xuất quan hệ được nêu rõ hoặc có thể suy ra trực tiếp.
- Ưu tiên các quan hệ: parent_child, spouse.
- Luôn trả về quan hệ spouse trước quan hệ parent_child nếu cùng một người vừa có quan hệ vợ/chồng vừa có quan hệ con trong cùng input.
- Nếu có nhiều người trùng tên, phải tạo temporary_id khác nhau và thêm warning có khả năng trùng người.
- Nếu năm sinh, năm mất, giới tính, vai vế không rõ thì để null.
- Kết quả AI chỉ là dữ liệu nháp, cần người dùng hoặc manager kiểm tra trước khi lưu vào hệ thống.
- Nếu cùng một người xuất hiện nhiều lần trong cùng input và rõ ràng là cùng một người, chỉ tạo một member duy nhất và dùng lại temporary_id đó trong các quan hệ.
- Không được tạo trùng member cho cùng một người chỉ vì người đó xuất hiện ở nhiều câu.

QUY TẮC KHI DỮ LIỆU ĐẦU VÀO LÀ TRANSCRIPT TỪ GIỌNG NÓI:
- Transcript có thể bị sai tên người, sai năm, sai quan hệ hoặc thiếu dấu câu.
- Không tự sửa tên người theo suy đoán.
- Không tự chuẩn hóa tên nếu không chắc chắn.
- Nếu câu bị đứt đoạn, thiếu chủ ngữ hoặc thiếu đối tượng quan hệ, đưa vào uncertain_items.
- Nếu một cụm từ có thể là tên người hoặc vai vế, đánh dấu uncertain_items.
- Nếu số năm nghe có vẻ bất thường, vẫn ghi lại nếu rõ ràng nhưng thêm warning.
- Nếu transcript có nhiều cách hiểu, chọn cách an toàn nhất và đánh dấu needs_human_review = true.

ĐỊNH DẠNG JSON BẮT BUỘC:
{
  "members": [
    {
      "temporary_id": "p1",
      "full_name": null,
      "gender": null,
      "birth_year": null,
      "death_year": null,
      "birth_date": null,
      "death_date": null,
      "phone": null,
      "address": null,
      "notes": null,
      "confidence": 0.0
    }
  ],
  "relationships": [
    {
      "type": "parent_child",
      "parent": "p1",
      "child": "p2",
      "confidence": 0.0,
      "evidence": null
    },
    {
      "type": "spouse",
      "from": "p1",
      "to": "p2",
      "confidence": 0.0,
      "evidence": null
    }
  ],
  "uncertain_items": [
    {
      "item_type": "member_or_relationship",
      "reference_id": "p1",
      "field": null,
      "reason": null,
      "suggested_action": null
    }
  ],
  "warnings": [
    {
      "warning_type": null,
      "message": null,
      "related_ids": []
    }
  ],
  "summary": {
    "total_members_detected": 0,
    "total_relationships_detected": 0,
    "needs_human_review": true
  }
}

CÁCH XÁC ĐỊNH GIỚI TÍNH:
- Nếu có từ như ông, cha, bố, anh, chú, bác trai, cậu, chồng thì gender = "male".
- Nếu có từ như bà, mẹ, chị, cô, dì, vợ thì gender = "female".
- Nếu không rõ thì gender = null.
- Nếu chỉ dựa vào tên mà không có vai vế hoặc từ khóa giới tính thì gender = null.

CÁCH XỬ LÝ THÀNH VIÊN:
- Mỗi người được nhắc đến rõ ràng phải có một member riêng.
- temporary_id đặt theo thứ tự xuất hiện: p1, p2, p3...
- Nếu cùng tên nhưng không chắc là cùng một người, tạo temporary_id khác nhau.
- Nếu cùng tên và cùng ngữ cảnh rõ ràng là một người, dùng lại cùng temporary_id.
- Nếu tên không đầy đủ, vẫn ghi phần tên có trong dữ liệu và thêm uncertain_items.
- Nếu có năm sinh/năm mất rõ ràng thì ghi vào birth_year/death_year.
- Nếu có ngày sinh/ngày mất đầy đủ thì ghi vào birth_date/death_date theo định dạng YYYY-MM-DD nếu xác định được.
- Nếu ngày/tháng/năm không đủ hoặc không chắc, để null và đưa vào uncertain_items.
- Các từ nối như “gồm”, “bao gồm”, “lần lượt”, “tên là”, “có tên là”, “là”, “và”, “rồi”, “sau đó”, “đồng thời” không được đưa vào full_name.
- Số lượng như “một”, “hai”, “ba”, “2”, “3” không phải tên người, không được đưa vào full_name.

QUY TẮC TIỀN XỬ LÝ VÀ HIỂU INPUT:
- Luôn giữ nguyên tên người theo dữ liệu đầu vào.
- Không tự bỏ dấu tên người.
- Không tự sửa tên người.
- Không tự chuẩn hóa tên theo suy đoán.
- Có thể hiểu dấu chấm, dấu phẩy, dấu chấm phẩy, xuống dòng hoặc cụm từ “và”, “rồi”, “sau đó”, “đồng thời” là dấu hiệu tách nhiều ý trong cùng một prompt.
- Nếu input có nhiều câu hoặc nhiều hành động, phải xử lý tất cả các hành động.
- Không được chỉ xử lý hành động đầu tiên.
- Mỗi hành động như “thêm con”, “thêm vợ”, “thêm chồng”, “có con”, “có vợ”, “có chồng”, “là con của”, “là vợ của”, “là chồng của” phải được xem là một quan hệ riêng.
- Nếu cùng một người xuất hiện ở nhiều câu, phải dùng cùng một temporary_id cho người đó nếu rõ ràng là cùng người.

CÁCH XỬ LÝ QUAN HỆ:
- "A là cha/bố/mẹ của B" -> tạo parent_child.
- "A và B có con là C" -> tạo A parent_child C và B parent_child C.
- "A là vợ/chồng của B" -> tạo spouse.
- "A và B kết hôn" -> tạo spouse.
- "A, B, C là con của X và Y" -> tạo X/Y parent_child với A, B, C nếu X/Y được nêu rõ là cha mẹ.
- "A có các con B, C, D" -> tạo từng quan hệ parent_child riêng: A parent_child B, A parent_child C, A parent_child D.
- "A có hai người con là B và C" -> tạo A parent_child B và A parent_child C.
- "Thêm 2 người con cho A gồm B và C" -> tạo A parent_child B và A parent_child C.
- "Thêm hai người con cho A lần lượt tên là B và C" -> tạo A parent_child B và A parent_child C.
- "Hai người có ba con..." -> chỉ suy ra nếu hai người được nhắc gần nhất là một cặp vợ chồng hoặc cha mẹ rõ ràng.
- Không tạo quan hệ anh/chị/em ruột trực tiếp; nếu người dùng nói anh/chị/em ruột, đưa vào uncertain_items.
- Với các quan hệ chú, bác, cô, dì, cậu, mợ, thím, cháu: không tự suy ra parent_child nếu thiếu ngữ cảnh; đưa vào uncertain_items.
- Với quan hệ ông/bà/cháu: không tự tạo parent_child trực tiếp nếu thiếu cha/mẹ trung gian; đưa vào uncertain_items.

QUY TẮC XỬ LÝ NHIỀU NGƯỜI CON:
- Nếu câu có dạng “A có con là B” thì tạo A parent_child B.
- Nếu câu có dạng “Thêm con cho A tên là B” thì tạo A parent_child B.
- Nếu câu có dạng “A có hai người con là B và C” thì phải tạo:
  A parent_child B
  A parent_child C
- Nếu câu có dạng “Thêm 2 người con cho A, gồm B và C” thì phải tạo:
  A parent_child B
  A parent_child C
- Nếu câu có dạng “Thêm hai người con cho A, gồm B và C” thì phải tạo:
  A parent_child B
  A parent_child C
- Nếu câu có dạng “Thêm ba người con cho A, gồm B, C và D” thì phải tạo:
  A parent_child B
  A parent_child C
  A parent_child D
- Nếu sau các cụm “có con là”, “các con là”, “gồm”, “bao gồm”, “tên là”, “lần lượt là”, “lần lượt tên là” có nhiều tên được nối bằng dấu phẩy, dấu chấm phẩy hoặc từ “và”, phải tách mỗi tên thành một member riêng.
- Không được gộp “B và C” thành một full_name.
- Không được tạo một member có full_name dạng “B và C”.
- Nếu người dùng nhập số lượng, ví dụ “thêm 2 người con”, “thêm hai người con”, “thêm ba người con”, thì hiểu rằng cần tạo nhiều member con và nhiều relationship parent_child tương ứng với số người con được liệt kê.
- Nếu số lượng được nói ra không khớp với số tên được liệt kê, vẫn trích xuất các tên đã thấy, nhưng thêm warning để người dùng kiểm tra.
- Ví dụ: “Thêm 3 người con cho A gồm B và C” thì tạo 2 người con B, C và thêm warning rằng số lượng nói là 3 nhưng chỉ phát hiện 2 tên.
- Ví dụ: “Thêm 2 người con cho A gồm B, C và D” thì tạo 3 người con B, C, D và thêm warning rằng số lượng nói là 2 nhưng phát hiện 3 tên.
- Nếu không liệt kê đủ tên theo số lượng, không tự bịa tên còn thiếu; đưa phần thiếu vào uncertain_items.

QUY TẮC XỬ LÝ NHIỀU QUAN HỆ TRONG MỘT PROMPT:
- Nếu input là “Thêm con cho A tên là B. Thêm vợ cho A tên là C” thì phải tạo:
  p1 = A
  p2 = B
  p3 = C
  p1 parent_child p2
  p1 spouse p3
- Nếu input là “A có con là B và C. A có vợ là D” thì phải tạo:
  p1 = A
  p2 = B
  p3 = C
  p4 = D
  p1 parent_child p2
  p1 parent_child p3
  p1 spouse p4
- Không được bỏ qua quan hệ sau nếu prompt có nhiều câu.
- Không được chỉ trả về quan hệ đầu tiên nếu còn quan hệ khác trong input.
- Nếu một người vừa có quan hệ con, vừa có quan hệ vợ/chồng trong cùng input, phải gom vào cùng một member thay vì tạo trùng.

QUY TẮC XỬ LÝ SỐ LƯỢNG:
- Hiểu các số dạng chữ và dạng số:
  “một” = 1
  “hai” = 2
  “ba” = 3
  “bốn” = 4
  “năm” = 5
  “1” = 1
  “2” = 2
  “3” = 3
  “4” = 4
  “5” = 5
- Nếu người dùng nói “thêm hai người con”, “thêm 2 người con”, “có hai con”, “có 2 con”, thì đây là tín hiệu phải tạo nhiều member con và nhiều relationship parent_child.
- Số lượng không phải là tên người, không được đưa vào full_name.
- Nếu không liệt kê đủ tên theo số lượng, không tự bịa tên còn thiếu; đưa phần thiếu vào uncertain_items.

CÁCH XỬ LÝ CẢNH BÁO:
- Nếu con có năm sinh nhỏ hơn hoặc bằng năm sinh cha/mẹ dưới 15 năm, thêm warning.
- Nếu death_year nhỏ hơn birth_year, thêm warning.
- Nếu một người tự là cha/mẹ/vợ/chồng của chính mình, thêm warning.
- Nếu có khả năng trùng người do cùng tên hoặc cùng năm sinh, thêm warning.
- Nếu quan hệ có thể tạo vòng lặp gia phả, thêm warning.
- Nếu dữ liệu từ transcript giọng nói có dấu hiệu sai tên, sai năm hoặc thiếu ngữ cảnh, thêm warning.
- Nếu số lượng người được nói ra không khớp với số tên được phát hiện, thêm warning với warning_type = "count_mismatch".
- Nếu một full_name có chứa cụm “và” ở giữa hai tên người, thêm warning vì có thể AI đã gộp nhiều người thành một.

CÁCH ĐÁNH GIÁ CONFIDENCE:
- 0.9 - 1.0: thông tin được nói rõ trực tiếp.
- 0.7 - 0.89: thông tin có thể suy ra trực tiếp từ câu rõ ràng.
- 0.4 - 0.69: thông tin có dấu hiệu đúng nhưng còn thiếu ngữ cảnh.
- 0.0 - 0.39: thông tin mơ hồ, không đủ chắc chắn.

VÍ DỤ BẮT BUỘC:

Input:
"Thêm 2 người con cho Hà Văn Hòa, gồm Hà Văn Thái và Hà Văn Bảo."

Output đúng phải có:
- 3 members:
  p1 = Hà Văn Hòa
  p2 = Hà Văn Thái
  p3 = Hà Văn Bảo
- 2 relationships:
  p1 parent_child p2
  p1 parent_child p3

Input:
"Thêm hai người con cho Hà Văn Hòa lần lượt tên là Hà Văn Thái và Hà Văn Bảo."

Output đúng phải có:
- 3 members:
  p1 = Hà Văn Hòa
  p2 = Hà Văn Thái
  p3 = Hà Văn Bảo
- 2 relationships:
  p1 parent_child p2
  p1 parent_child p3

Input:
"Thêm con cho Hà Văn Hòa tên là Trần Thiên Ân. Thêm vợ cho Hà Văn Hòa tên là Trần Thiên Lý."

Output đúng phải có:
- 3 members:
  p1 = Hà Văn Hòa
  p2 = Trần Thiên Ân
  p3 = Trần Thiên Lý
- 2 relationships:
  p1 parent_child p2
  p1 spouse p3

Input:
"Hà Văn Hòa có ba người con là Trần Thiên Ân, Trần Thiên Bình và Trần Thiên Cường."

Output đúng phải có:
- 4 members:
  p1 = Hà Văn Hòa
  p2 = Trần Thiên Ân
  p3 = Trần Thiên Bình
  p4 = Trần Thiên Cường
- 3 relationships:
  p1 parent_child p2
  p1 parent_child p3
  p1 parent_child p4

EXTRA RULES FOR COMPOUND ACTIONS:
- If spouse and child relations appear in the same prompt, identify the spouse relation first, then create parent_child relations.
- "them vo/chong cho A ten la B va co con ten la C" means A and B are spouses, and C is child of both A and B.
- Never include action connectors such as "va co con" in full_name.
"""

VALID_MODES = {"event_create", "task_create"}
VALID_STATUSES = {"success", "unsupported"}
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
VALID_GENEALOGY_INPUT_SOURCES = {"text", "voice_transcript"}
VALID_RELATIONSHIP_TYPES = {"parent_child", "spouse"}
VALID_GENDERS = {"male", "female"}


def parse_int(value: Any) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def strip_accents(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text or "")
    without_marks = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    without_marks = without_marks.replace("đ", "d").replace("Đ", "D")
    return without_marks.replace("đ", "d").replace("Đ", "D")


def normalize_vietnamese(text: str) -> str:
    normalized = strip_accents(text).lower().strip()
    return re.sub(r"\s+", " ", normalized)


def prepare_genealogy_prompt(prompt: str) -> str:
    text = re.sub(r"\s+", " ", str(prompt or "").strip()).replace(";", ".")
    normalized, index_map = normalized_text_with_index_map(text)
    split_patterns = [
        r"(?:\s|,)+va\s+(?=(?:them|tao|bo sung)\b)",
        r"(?:\s|,)+roi\s+(?=them\b)",
        r"(?:\s|,)+sau\s+do\s+(?=them\b)",
        r"(?:\s|,)+dong\s+thoi\s+(?=them\b)",
        r"(?:\s|,)+va\s+(?=co\s+con\b)",
    ]
    spans: list[tuple[int, int]] = []
    for pattern in split_patterns:
        for match in re.finditer(pattern, normalized):
            if not index_map:
                continue
            start = index_map[min(match.start(), len(index_map) - 1)]
            end = index_map[min(match.end() - 1, len(index_map) - 1)] + 1
            spans.append((start, end))

    if not spans:
        return text

    prepared_parts: list[str] = []
    last_end = 0
    for start, end in sorted(spans):
        if start < last_end:
            continue
        prepared_parts.append(text[last_end:start].rstrip())
        prepared_parts.append(". ")
        last_end = end
    prepared_parts.append(text[last_end:].lstrip())
    return re.sub(r"\s+", " ", "".join(prepared_parts)).strip()


def strip_json_block(text: str) -> str:
    raw = str(text or "").strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s*```$", "", raw)
    start = raw.find("{")
    end = raw.rfind("}")
    if start >= 0 and end > start:
        return raw[start : end + 1]
    return raw


def valid_iso_date(value: Any) -> str | None:
    text = str(value or "").strip()
    if not ISO_DATE_RE.match(text):
        return None
    try:
        return datetime.strptime(text, "%Y-%m-%d").date().isoformat()
    except ValueError:
        return None


def base_year_from_today(today: str | None = None) -> int:
    parsed_today = valid_iso_date(today)
    if parsed_today:
        return datetime.strptime(parsed_today, "%Y-%m-%d").year
    return datetime.now().year


def base_date_from_today(today: str | None = None) -> date:
    parsed_today = valid_iso_date(today)
    if parsed_today:
        return datetime.strptime(parsed_today, "%Y-%m-%d").date()
    return datetime.now().date()


def parse_iso_date_from_text(text: str, today: str | None = None) -> str | None:
    raw = str(text or "")
    normalized = normalize_vietnamese(raw)
    base_date = base_date_from_today(today)
    base_year = base_date.year

    weekday_next_week = {
        "thu 2": 0,
        "thu hai": 0,
        "thu 3": 1,
        "thu ba": 1,
        "thu 4": 2,
        "thu tu": 2,
        "thu 5": 3,
        "thu nam": 3,
        "thu 6": 4,
        "thu sau": 4,
        "thu 7": 5,
        "thu bay": 5,
        "chu nhat": 6,
    }
    for keyword, weekday in weekday_next_week.items():
        if re.search(rf"\b{re.escape(keyword)}\s+tuan\s+sau\b", normalized):
            days_to_next_monday = 7 - base_date.weekday()
            return (base_date + timedelta(days=days_to_next_monday + weekday)).isoformat()

    if re.search(r"\btuan\s+sau\b", normalized):
        return (base_date + timedelta(days=7)).isoformat()

    if re.search(r"\bhom\s+nay\b", normalized):
        return base_date.isoformat()

    if re.search(r"\bngay\s+mai\b", normalized) or re.search(r"\bmai\b", raw.lower()):
        return (base_date + timedelta(days=1)).isoformat()

    raw_lower = raw.lower()
    if (
        re.search(r"\bngay\s+kia\b", normalized)
        or re.search(r"\bngay\s+mot\b", normalized)
        or re.search(r"\bmốt\b", raw_lower)
    ):
        return (base_date + timedelta(days=2)).isoformat()

    m = re.search(r"\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b", raw)
    if m:
        day, month, year = m.groups()
        try:
            return date(int(year), int(month), int(day)).isoformat()
        except ValueError:
            return None

    m = re.search(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", raw)
    if m:
        year, month, day = m.groups()
        try:
            return date(int(year), int(month), int(day)).isoformat()
        except ValueError:
            return None

    m = re.search(r"\b(\d{1,2})[\/\-.](\d{1,2})\b", raw)
    if m:
        day, month = m.groups()
        try:
            return date(base_year, int(month), int(day)).isoformat()
        except ValueError:
            return None

    m = re.search(r"\b(?:ngay\s+)?(?:mung\s+)?(\d{1,2})\s+thang\s+(\d{1,2})(?:\s+nam\s+(\d{4}))?\b", normalized)
    if m:
        day, month, year = m.groups()
        try:
            return date(int(year) if year else base_year, int(month), int(day)).isoformat()
        except ValueError:
            return None

    m = re.search(r"\b(dau|giua|cuoi)?\s*thang\s+(\d{1,2})\b", normalized)
    if m:
        position, month_text = m.groups()
        month = int(month_text)
        if 1 <= month <= 12:
            if position == "giua":
                day = 15
            elif position == "cuoi":
                day = calendar.monthrange(base_year, month)[1]
            else:
                day = 1
            return date(base_year, month, day).isoformat()

    if "cuoi nam" in normalized:
        return date(base_year, 12, 31).isoformat()

    return None


def date_add_days(iso_date: str | None, days: int) -> str | None:
    parsed = valid_iso_date(iso_date)
    if not parsed:
        return None
    value = datetime.strptime(parsed, "%Y-%m-%d").date()
    return (value + timedelta(days=days)).isoformat()


def clamp_due_date(due_date: str | None, event_date: str | None) -> str | None:
    due = valid_iso_date(due_date)
    event = valid_iso_date(event_date)
    if not due:
        return None
    if event and due > event:
        return event
    return due


def fill_missing_task_due_dates(tasks: list[dict[str, Any]], event_date: str | None) -> list[dict[str, Any]]:
    event = valid_iso_date(event_date)
    if not event:
        return tasks

    offsets = [-7, -5, -3, -1, 0]
    fixed: list[dict[str, Any]] = []
    total = len(tasks or [])

    for index, task in enumerate(tasks or []):
        if not isinstance(task, dict):
            continue

        item = dict(task)
        if not valid_iso_date(item.get("due_date")):
            if total > 1 and index == total - 1:
                offset = 0
            else:
                offset = offsets[index] if index < len(offsets) else 0
            item["due_date"] = date_add_days(event, offset)
        else:
            item["due_date"] = clamp_due_date(item.get("due_date"), event)
        fixed.append(item)

    return fixed


def sort_tasks_by_due_date(tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        tasks or [],
        key=lambda task: (
            valid_iso_date(task.get("due_date")) is None,
            valid_iso_date(task.get("due_date")) or "",
        ),
    )


def make_task(event_id: int | None, title: str, description: str, due_date: str | None) -> dict[str, Any]:
    return {
        "event_id": event_id,
        "member_id": None,
        "title": title[:120].strip(),
        "description": description[:500].strip(),
        "due_date": valid_iso_date(due_date),
        "status": "assigned",
    }


def requested_task_count_from_body(body: dict[str, Any]) -> int | None:
    value = parse_int(body.get("requested_task_count"))
    if value is None:
        return None
    return max(1, min(value, 20))


def normalize_task_title_for_compare(task: dict[str, Any]) -> str:
    return normalize_vietnamese(str(task.get("title") or "")).strip()


def task_duplicate_key(task: dict[str, Any]) -> str:
    return normalize_task_title_for_compare(task)


def task_titles_too_similar(title: str, existing_title: str) -> bool:
    current = normalize_vietnamese(title)
    existing = normalize_vietnamese(existing_title)
    if not current or not existing:
        return False
    if current == existing:
        return True
    return SequenceMatcher(None, current, existing).ratio() >= 0.9


def append_unique_task(
    target: list[dict[str, Any]],
    task: dict[str, Any],
    seen_keys: set[str],
) -> bool:
    if not isinstance(task, dict) or not str(task.get("title") or "").strip():
        return False

    key = task_duplicate_key(task)
    if any(task_titles_too_similar(key, seen_key) for seen_key in seen_keys):
        return False

    target.append(task)
    seen_keys.add(key)
    return True


def is_supported_event_prompt(body: dict[str, Any]) -> bool:
    mode = "task_create" if body.get("mode") == "task_create" else "event_create"
    if mode == "task_create":
        current_event = body.get("current_event") if isinstance(body.get("current_event"), dict) else {}
        return bool(parse_int(current_event.get("id")))

    text = normalize_vietnamese(str(body.get("prompt") or ""))
    keywords = (
        "su kien",
        "nghi le",
        "sinh hoat",
        "to chuc",
        "lap ke hoach",
        "chuan bi",
        "gia dinh",
        "dong ho",
        "buoi le",
        "buoi hop",
        "lien hoan",
        "gio",
        "gio to",
        "gio dau",
        "gio man tang",
        "gap mat",
        "hop mat",
        "hop ho",
        "cuoi nam",
        "cuoi hoi",
        "le cuoi",
        "dam cuoi",
        "dam hoi",
        "mung tho",
        "tao mo",
        "thanh minh",
        "khuyen hoc",
        "trao thuong",
        "gay quy",
        "quyen gop",
        "bau ban dai dien",
        "tu sua",
        "sua chua",
        "nha tho",
        "tu duong",
        "day thang",
        "thoi noi",
    )
    return any(keyword in text for keyword in keywords)


def default_event_title(prompt: str) -> str:
    p = normalize_vietnamese(prompt)

    if "gio dau" in p:
        return "Giỗ đầu"
    if "gio man tang" in p:
        return "Giỗ mãn tang"
    if "gio to" in p:
        return "Giỗ tổ"
    if "tao mo" in p or "thanh minh" in p:
        return "Tảo mộ Thanh minh"
    if "khuyen hoc" in p or "trao thuong" in p:
        return "Khuyến học dòng họ"
    if "gay quy" in p or "quyen gop" in p:
        return "Gây quỹ dòng họ"
    if "bau ban dai dien" in p or "hop ho" in p:
        return "Họp họ"
    if "cuoi hoi" in p or "le cuoi" in p or "dam cuoi" in p or "dam hoi" in p:
        return "Lễ cưới hỏi"
    if "day thang" in p:
        return "Lễ đầy tháng"
    if "thoi noi" in p:
        return "Lễ thôi nôi"
    if "gap mat cuoi nam" in p or ("gap mat" in p and "cuoi nam" in p):
        return "Gặp mặt cuối năm"
    if "gap mat" in p or "hop mat" in p or "tu hop" in p:
        return "Gặp mặt dòng họ"
    if "mung tho" in p:
        return "Mừng thọ"
    if "le to tien" in p or "cung to tien" in p:
        return "Lễ tưởng nhớ tổ tiên"
    if "tu sua" in p or "sua chua" in p or "nha tho ho" in p or "tu duong" in p or "nha tho to" in p:
        return "Tu sửa nhà thờ tổ"

    cleaned = str(prompt or "").strip()
    cleaned = re.sub(
        r"^(tạo|tao|thêm|them|lập|lap)\s+(một\s+|mot\s+)?(sự kiện|su kien)\s*",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r",?\s*ngày\s+\d{1,2}[\/\-.]\d{1,2}([\/\-.]\d{4})?", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r",?\s*(đầu|giữa|cuối)?\s*tháng\s+\d{1,2}", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.split(r",|\.|\n", cleaned)[0].strip()

    return (cleaned[:80].strip() or "Sự kiện dòng họ")


def default_tasks_for_event(
    title: str,
    event_date: str | None,
    event_id: int | None,
    existing_tasks: list[dict[str, Any]] | None = None,
    description: str = "",
) -> list[dict[str, Any]]:
    text = normalize_vietnamese(f"{title} {description}")
    before_14 = date_add_days(event_date, -14)
    before_10 = date_add_days(event_date, -10)
    before_7 = date_add_days(event_date, -7)
    before_5 = date_add_days(event_date, -5)
    before_3 = date_add_days(event_date, -3)
    before_1 = date_add_days(event_date, -1)
    same_day = valid_iso_date(event_date)

    if "gio dau" in text or "gio man tang" in text:
        rows = [
            ("Thông báo ngày giỗ cho con cháu", "Gửi thông báo thời gian, địa điểm và nội dung ngày giỗ cho các nhánh gia đình.", before_7),
            ("Chuẩn bị lễ vật và mâm cúng", "Chuẩn bị hương hoa, trái cây, lễ vật và mâm cúng phù hợp với nghi lễ.", before_3),
            ("Dọn dẹp khu vực thờ cúng", "Vệ sinh bàn thờ, khu vực tiếp khách và lối đi trước ngày giỗ.", before_1),
            ("Phân công tiếp khách", "Bố trí người đón tiếp, hướng dẫn chỗ ngồi và hỗ trợ người lớn tuổi.", same_day),
            ("Chuẩn bị mâm cơm thân mật", "Dự trù số mâm, thực đơn, nước uống và người phụ trách hậu cần.", before_1),
            ("Ghi nhận chi phí và đóng góp", "Tổng hợp khoản đóng góp, khoản chi và lưu lại để báo cáo sau ngày giỗ.", same_day),
        ]
    elif "gio to" in text:
        rows = [
            ("Lập danh sách con cháu tham dự", "Tổng hợp số lượng thành viên tham dự để chuẩn bị lễ và tiếp đón.", before_7),
            ("Thông báo thời gian giỗ tổ", "Gửi thông báo ngày giờ, địa điểm và nội dung buổi giỗ tổ cho các nhánh trong dòng họ.", before_7),
            ("Chuẩn bị mâm cúng tổ tiên", "Chuẩn bị lễ vật, hương hoa, trái cây, xôi chè và các vật phẩm thờ cúng.", before_3),
            ("Dọn dẹp nhà thờ tổ", "Vệ sinh bàn thờ, sân nhà thờ tổ, khu vực tiếp khách và lối đi.", before_1),
            ("Phân công đón tiếp con cháu", "Sắp xếp người đón khách, hướng dẫn chỗ ngồi và hỗ trợ người lớn tuổi.", same_day),
            ("Ghi nhận đóng góp và chi phí", "Tổng hợp khoản đóng góp, khoản chi và lưu lại để báo cáo sau sự kiện.", same_day),
        ]
    elif "cuoi hoi" in text or "le cuoi" in text or "dam cuoi" in text or "dam hoi" in text:
        rows = [
            ("Chốt danh sách khách mời hai bên", "Tổng hợp khách mời của hai gia đình để chuẩn bị thiệp, bàn tiệc và đón tiếp.", before_14),
            ("Chuẩn bị thiệp mời hoặc thông báo", "Soạn nội dung, kiểm tra thông tin ngày giờ địa điểm và gửi đến khách mời.", before_10),
            ("Sắp xếp địa điểm tổ chức", "Kiểm tra không gian, bàn ghế, âm thanh, khu vực đón khách và lối đi.", before_7),
            ("Chuẩn bị lễ vật cưới hỏi", "Lập danh sách lễ vật cần có và phân công người chuẩn bị đúng nghi thức.", before_5),
            ("Phân công đón tiếp khách", "Bố trí người đón khách, hướng dẫn chỗ ngồi và hỗ trợ hai bên gia đình.", same_day),
            ("Ghi nhận chi phí tổ chức", "Theo dõi các khoản chi chính, khoản phát sinh và tổng hợp sau lễ.", same_day),
        ]
    elif "tao mo" in text or "thanh minh" in text:
        rows = [
            ("Chốt danh sách người tham gia tảo mộ", "Xác nhận số lượng người tham dự để chuẩn bị phương tiện và dụng cụ.", before_7),
            ("Thông báo thời gian tập trung", "Gửi lịch tập trung, địa điểm gặp và lịch trình di chuyển cho các thành viên.", before_5),
            ("Chuẩn bị hương hoa và dụng cụ vệ sinh mộ", "Chuẩn bị hương, hoa, khăn lau, chổi, bao rác và dụng cụ cần thiết.", before_3),
            ("Phân công nhóm dọn dẹp từng khu mộ", "Chia người phụ trách từng khu để việc vệ sinh diễn ra gọn và đầy đủ.", before_1),
            ("Chuẩn bị phương tiện di chuyển", "Sắp xếp xe, điểm đón và người phụ trách điều phối di chuyển.", before_1),
            ("Tổng kết chi phí và lưu hình ảnh", "Ghi lại chi phí, chụp ảnh tư liệu và lưu vào hồ sơ dòng họ.", same_day),
        ]
    elif "khuyen hoc" in text or "trao thuong" in text:
        rows = [
            ("Lập danh sách học sinh sinh viên được khen thưởng", "Tổng hợp người được đề xuất khen thưởng theo từng nhánh gia đình.", before_14),
            ("Xác minh thành tích", "Kiểm tra giấy khen, điểm số hoặc thông tin thành tích trước khi công bố.", before_10),
            ("Chuẩn bị phần thưởng và giấy khen", "Dự trù ngân sách, mua phần thưởng và chuẩn bị giấy khen.", before_5),
            ("Thông báo lịch trao thưởng", "Gửi thông báo thời gian, địa điểm và danh sách người được khen thưởng.", before_3),
            ("Phân công người dẫn chương trình", "Chuẩn bị kịch bản ngắn, thứ tự trao thưởng và người điều phối.", before_1),
            ("Chụp ảnh và lưu tư liệu", "Ghi lại hình ảnh trao thưởng để lưu trong thư viện dòng họ.", same_day),
        ]
    elif "gay quy" in text or "quyen gop" in text:
        rows = [
            ("Lập mục tiêu gây quỹ", "Xác định mục đích, số tiền cần vận động và thời hạn đóng góp.", before_14),
            ("Thông báo kế hoạch đóng góp", "Gửi kế hoạch gây quỹ, cách chuyển khoản hoặc nộp trực tiếp cho thành viên.", before_10),
            ("Tạo danh sách người phụ trách thu quỹ", "Phân công người tiếp nhận, kiểm tra và cập nhật đóng góp.", before_7),
            ("Theo dõi khoản đóng góp", "Cập nhật từng khoản đóng góp, người đóng và ghi chú liên quan.", before_3),
            ("Công khai thu chi", "Tổng hợp số tiền nhận được, khoản chi và công khai minh bạch cho dòng họ.", same_day),
            ("Tổng kết kết quả gây quỹ", "Báo cáo kết quả so với mục tiêu và đề xuất bước tiếp theo.", same_day),
        ]
    elif "hop ho" in text or "bau ban dai dien" in text:
        rows = [
            ("Chuẩn bị nội dung cuộc họp", "Lập danh sách vấn đề cần trao đổi, tài liệu kèm theo và thứ tự thảo luận.", before_7),
            ("Thông báo thời gian và địa điểm họp", "Gửi lịch họp, địa điểm và nội dung chính đến các thành viên liên quan.", before_7),
            ("Lập danh sách người tham dự", "Xác nhận đại diện các nhánh tham gia để chuẩn bị chỗ ngồi và tài liệu.", before_5),
            ("Chuẩn bị biên bản họp", "Chuẩn bị mẫu biên bản, danh sách ký tên và người ghi chép.", before_3),
            ("Điều phối phần thảo luận bầu chọn", "Sắp xếp thứ tự phát biểu, phương án biểu quyết và người kiểm phiếu nếu có.", same_day),
            ("Tổng hợp kết quả cuộc họp", "Hoàn thiện biên bản, kết luận và gửi lại cho các thành viên sau họp.", same_day),
        ]
    elif "day thang" in text or "thoi noi" in text:
        rows = [
            ("Chốt danh sách khách mời", "Xác nhận số lượng khách gia đình và họ hàng tham dự để chuẩn bị chu đáo.", before_7),
            ("Chuẩn bị lễ cúng", "Chuẩn bị lễ vật, mâm cúng, hương hoa và đồ dùng cần thiết.", before_3),
            ("Chuẩn bị địa điểm tổ chức", "Sắp xếp không gian, bàn ghế, khu vực đón khách và khu vực làm lễ.", before_1),
            ("Đặt tiệc hoặc chuẩn bị đồ ăn", "Dự trù thực đơn, số phần ăn, nước uống và người phụ trách hậu cần.", before_1),
            ("Phân công chụp ảnh lưu niệm", "Chọn người ghi lại hình ảnh buổi lễ để lưu làm kỷ niệm.", same_day),
            ("Tổng kết chi phí", "Ghi nhận các khoản chi và khoản hỗ trợ sau buổi lễ.", same_day),
        ]
    elif "gap mat" in text or "hop mat" in text or "tu hop" in text or "cuoi nam" in text:
        rows = [
            ("Chốt danh sách con cháu tham dự", "Liên hệ các nhánh gia đình để xác nhận số lượng người tham gia buổi gặp mặt.", before_7),
            ("Thông báo lịch gặp mặt cuối năm", "Gửi thông báo về thời gian, địa điểm và nội dung chương trình.", before_7),
            ("Chuẩn bị nhà thờ tổ hoặc địa điểm gặp mặt", "Dọn dẹp, sắp xếp bàn ghế, kiểm tra điện nước và khu vực sinh hoạt chung.", before_3),
            ("Xây dựng chương trình gặp mặt", "Lên thứ tự hoạt động: chào hỏi, báo cáo dòng họ, dùng bữa, chụp ảnh lưu niệm.", before_3),
            ("Chuẩn bị mâm cơm thân mật", "Dự trù thực đơn, số mâm, nước uống và phân công người phụ trách hậu cần.", before_1),
            ("Phân công đón tiếp và hướng dẫn", "Bố trí người đón con cháu, hướng dẫn để xe, chỗ ngồi và hỗ trợ người lớn tuổi.", same_day),
            ("Ghi hình và chụp ảnh lưu niệm", "Phân công người chụp ảnh, quay video và lưu lại tư liệu cho dòng họ.", same_day),
            ("Tổng kết đóng góp sau sự kiện", "Ghi nhận đóng góp, chi phí tổ chức và báo cáo lại cho manager.", same_day),
        ]
    elif "mung tho" in text:
        rows = [
            ("Xác nhận danh sách khách mừng thọ", "Tổng hợp con cháu, họ hàng và khách mời tham dự lễ mừng thọ.", before_7),
            ("Chuẩn bị quà và lời chúc", "Chuẩn bị quà mừng thọ, thiệp chúc và đại diện phát biểu.", before_3),
            ("Trang trí khu vực tổ chức", "Sắp xếp phông nền, bàn ghế, hoa và khu vực chụp ảnh.", before_1),
            ("Chuẩn bị tiệc mừng thọ", "Dự trù số mâm, thực đơn, nước uống và người phụ trách hậu cần.", before_1),
            ("Chụp ảnh và lưu niệm", "Ghi lại hình ảnh buổi lễ để lưu trữ trong dòng họ.", same_day),
            ("Ghi nhận chi phí mừng thọ", "Tổng hợp khoản chi và khoản đóng góp liên quan đến buổi lễ.", same_day),
        ]
    elif "tu sua" in text or "sua chua" in text or "nha tho to" in text or "nha tho ho" in text or "tu duong" in text:
        rows = [
            ("Khảo sát hiện trạng nhà thờ tổ", "Kiểm tra mái, tường, sân, bàn thờ, hệ thống điện nước và các hạng mục cần sửa.", before_7),
            ("Lập danh sách hạng mục tu sửa", "Ghi rõ từng hạng mục, mức độ ưu tiên và người phụ trách theo dõi.", before_7),
            ("Lập dự toán kinh phí", "Tổng hợp vật tư, nhân công, chi phí phát sinh và dự toán tổng ngân sách.", before_3),
            ("Liên hệ đội thợ sửa chữa", "Tìm thợ phù hợp, thống nhất thời gian, chi phí và phạm vi công việc.", before_3),
            ("Thông báo kế hoạch đóng góp", "Gửi kế hoạch tu sửa và kêu gọi đóng góp minh bạch từ các thành viên.", before_1),
            ("Theo dõi nghiệm thu công việc", "Kiểm tra tiến độ, chất lượng thi công và xác nhận hoàn thành từng hạng mục.", same_day),
        ]
    else:
        rows = [
            ("Làm rõ nội dung sự kiện", "Xác định mục đích, thời gian, địa điểm và số lượng người dự kiến tham gia.", before_7),
            ("Lập danh sách người tham dự", "Tổng hợp danh sách thành viên, khách mời và các nhánh gia đình liên quan.", before_7),
            ("Thông báo sự kiện cho dòng họ", "Gửi thông báo chính thức về thời gian, địa điểm và nội dung sự kiện.", before_3),
            ("Chuẩn bị địa điểm tổ chức", "Sắp xếp không gian, bàn ghế, âm thanh, nước uống và khu vực tiếp đón.", before_1),
            ("Phân công hậu cần", "Chia nhiệm vụ chuẩn bị đồ dùng, tiếp khách, vệ sinh và hỗ trợ trong ngày diễn ra.", before_1),
            ("Tổng kết sau sự kiện", "Ghi nhận kết quả, chi phí, đóng góp và các việc cần rút kinh nghiệm.", same_day),
        ]

    seen_keys = {
        task_duplicate_key(item)
        for item in (existing_tasks or [])
        if isinstance(item, dict) and normalize_task_title_for_compare(item)
    }
    tasks: list[dict[str, Any]] = []
    for task_title, desc, due in rows:
        append_unique_task(tasks, make_task(event_id, task_title, desc, due), seen_keys)
    return tasks


def fallback_event_form(body: dict[str, Any]) -> dict[str, Any]:
    mode = "task_create" if body.get("mode") == "task_create" else "event_create"
    prompt = str(body.get("prompt") or "").strip()
    today = str(body.get("today") or "")

    if not is_supported_event_prompt(body):
        return {
            "status": "unsupported",
            "mode": mode,
            "event": {"title": "", "event_date": None, "description": "", "clan_id": None},
            "manager_tasks": [],
        }

    current_event = body.get("current_event") if isinstance(body.get("current_event"), dict) else {}
    existing_tasks = body.get("existing_tasks") if isinstance(body.get("existing_tasks"), list) else []

    if mode == "task_create":
        event_id = parse_int(current_event.get("id"))
        event_date = valid_iso_date(current_event.get("event_date")) or parse_iso_date_from_text(
            str(current_event.get("event_date") or ""), today
        )
        title = str(current_event.get("title") or "Sự kiện dòng họ").strip()[:80]
        description = str(current_event.get("description") or prompt).strip()
        event = {
            "title": title,
            "event_date": event_date,
            "description": description,
            "clan_id": current_event.get("clan_id") or body.get("clan_id"),
        }
        tasks = default_tasks_for_event(title, event_date, event_id, existing_tasks, f"{description} {prompt}")
    else:
        event_date = parse_iso_date_from_text(prompt, today)
        title = default_event_title(prompt)
        event = {
            "title": title,
            "event_date": event_date,
            "description": prompt,
            "clan_id": body.get("clan_id"),
        }
        tasks = default_tasks_for_event(title, event_date, None, existing_tasks, prompt)

    tasks = fill_missing_task_due_dates(tasks, event.get("event_date"))
    tasks = enforce_requested_task_count(tasks, body, mode, event)
    tasks = sort_tasks_by_due_date(tasks)

    return {
        "status": "success",
        "mode": mode,
        "event": event,
        "manager_tasks": tasks,
    }


def normalize_mode(value: Any, body: dict[str, Any]) -> str:
    if value in VALID_MODES:
        return str(value)
    body_mode = body.get("mode")
    return str(body_mode) if body_mode in VALID_MODES else "event_create"


def unsupported_result(mode: str) -> dict[str, Any]:
    return {
        "status": "unsupported",
        "mode": mode,
        "event": {"title": "", "event_date": None, "description": "", "clan_id": None},
        "manager_tasks": [],
    }


def normalize_task(
    task: dict[str, Any],
    mode: str,
    event_id: int | None,
    event_date: str | None,
) -> dict[str, Any] | None:
    title = str(task.get("title") or "").strip()[:120]
    if not title:
        return None

    return {
        "event_id": None if mode == "event_create" else event_id,
        "member_id": None,
        "title": title,
        "description": str(task.get("description") or "").strip()[:500],
        "due_date": clamp_due_date(task.get("due_date"), event_date),
        "status": "assigned",
    }


def enforce_requested_task_count(
    tasks: list[dict[str, Any]],
    body: dict[str, Any],
    mode: str,
    event: dict[str, Any],
) -> list[dict[str, Any]]:
    target = requested_task_count_from_body(body)

    current_event = body.get("current_event") if isinstance(body.get("current_event"), dict) else {}
    event_id = parse_int(current_event.get("id")) if mode == "task_create" else None
    event_title = str(event.get("title") or current_event.get("title") or "Sự kiện dòng họ").strip()
    event_date = valid_iso_date(event.get("event_date")) or valid_iso_date(current_event.get("event_date"))
    event_description = str(
        event.get("description") or current_event.get("description") or body.get("prompt") or ""
    ).strip()

    existing_tasks = body.get("existing_tasks") if isinstance(body.get("existing_tasks"), list) else []
    seen_keys = {
        task_duplicate_key(item)
        for item in existing_tasks
        if isinstance(item, dict) and normalize_task_title_for_compare(item)
    }

    cleaned: list[dict[str, Any]] = []
    for task in tasks or []:
        if append_unique_task(cleaned, task, seen_keys) and target and len(cleaned) >= target:
            break

    if target is None:
        return fill_missing_task_due_dates(cleaned, event_date)

    if len(cleaned) < target:
        fallback_candidates = default_tasks_for_event(
            event_title,
            event_date,
            None if mode == "event_create" else event_id,
            existing_tasks + cleaned,
            event_description,
        )
        for candidate in fallback_candidates:
            if append_unique_task(cleaned, candidate, seen_keys) and len(cleaned) >= target:
                break

    while len(cleaned) < target:
        index = len(cleaned) + 1
        due_date = date_add_days(event_date, -max(target - index, 0)) or event_date
        append_unique_task(
            cleaned,
            make_task(
                None if mode == "event_create" else event_id,
                f"Chuẩn bị bổ sung {index}",
                "Rà soát và hoàn thiện một đầu việc cần thiết để sự kiện diễn ra suôn sẻ.",
                due_date,
            ),
            seen_keys,
        )
        if len(cleaned) < index:
            cleaned.append(
                make_task(
                    None if mode == "event_create" else event_id,
                    f"Công việc bổ sung {index}",
                    "Hoàn thiện đầu việc bổ sung theo yêu cầu của người quản lý.",
                    due_date,
                )
            )

    return fill_missing_task_due_dates(cleaned[:target], event_date)


def normalize_event_form_result(result: dict[str, Any], body: dict[str, Any]) -> dict[str, Any]:
    mode = normalize_mode(result.get("mode"), body)
    fallback = fallback_event_form(body)

    status = str(result.get("status") or "").strip()
    if status == "unsupported":
        return unsupported_result(mode)
    raw_event = result.get("event") if isinstance(result.get("event"), dict) else {}
    raw_tasks = result.get("manager_tasks") if isinstance(result.get("manager_tasks"), list) else []
    has_valid_event = bool(
        str(raw_event.get("title") or "").strip()
        or valid_iso_date(raw_event.get("event_date"))
        or str(raw_event.get("description") or "").strip()
    )
    has_valid_tasks = any(
        isinstance(task, dict) and bool(str(task.get("title") or "").strip())
        for task in raw_tasks
    )
    if status != "success" and not (has_valid_event or has_valid_tasks):
        return unsupported_result(mode)

    current_event = body.get("current_event") if isinstance(body.get("current_event"), dict) else {}
    event_id = parse_int(current_event.get("id")) if mode == "task_create" else None
    if mode == "task_create" and not event_id:
        return unsupported_result(mode)

    event = raw_event
    fallback_event = fallback.get("event") if isinstance(fallback.get("event"), dict) else {}

    event_date = (
        valid_iso_date(event.get("event_date"))
        or valid_iso_date(current_event.get("event_date"))
        or parse_iso_date_from_text(str(body.get("prompt") or ""), str(body.get("today") or ""))
        or fallback_event.get("event_date")
    )
    title = str(event.get("title") or current_event.get("title") or fallback_event.get("title") or "").strip()[:80]
    description = str(
        event.get("description") or current_event.get("description") or fallback_event.get("description") or ""
    ).strip()

    normalized_event = {
        "title": title,
        "event_date": valid_iso_date(event_date),
        "description": description,
        "clan_id": event.get("clan_id") or current_event.get("clan_id") or body.get("clan_id"),
    }

    normalized_tasks: list[dict[str, Any]] = []
    for task in raw_tasks:
        if not isinstance(task, dict):
            continue
        normalized = normalize_task(task, mode, event_id, normalized_event.get("event_date"))
        if normalized:
            normalized_tasks.append(normalized)

    normalized_tasks = fill_missing_task_due_dates(normalized_tasks, normalized_event.get("event_date"))

    if not normalized_tasks and fallback.get("status") == "success":
        normalized_tasks = fallback.get("manager_tasks") or []

    normalized_tasks = enforce_requested_task_count(normalized_tasks, body, mode, normalized_event)
    normalized_tasks = sort_tasks_by_due_date(normalized_tasks)

    return {
        "status": "success",
        "mode": mode,
        "event": normalized_event,
        "manager_tasks": normalized_tasks,
    }


def empty_genealogy_extract_result() -> dict[str, Any]:
    return {
        "members": [],
        "relationships": [],
        "uncertain_items": [],
        "warnings": [],
        "summary": {
            "total_members_detected": 0,
            "total_relationships_detected": 0,
            "needs_human_review": True,
        },
    }


def normalized_text_with_index_map(text: str) -> tuple[str, list[int]]:
    normalized_chars: list[str] = []
    index_map: list[int] = []
    for index, char in enumerate(str(text or "")):
        normalized = strip_accents(char).lower()
        for normalized_char in normalized:
            normalized_chars.append(normalized_char)
            index_map.append(index)
    return "".join(normalized_chars), index_map


def original_slice_from_normalized_span(text: str, index_map: list[int], start: int, end: int) -> str:
    if start < 0 or end <= start or not index_map:
        return ""
    start = min(start, len(index_map) - 1)
    end = min(end, len(index_map))
    original_start = index_map[start]
    original_end = index_map[end - 1] + 1
    return str(text or "")[original_start:original_end]


GENEALOGY_NAME_PREFIXES = {
    "ong",
    "ba",
    "anh",
    "chi",
    "em",
    "bo",
    "cha",
    "me",
    "vo",
    "chong",
    "con",
    "nguoi",
}

GENEALOGY_NAME_STOP_MARKERS = [
    " sinh ",
    " ngay sinh",
    " nam sinh",
    " mat ",
    " ngay mat",
    " nam mat",
    " dia chi",
    " so dien thoai",
    " sdt",
    " email",
    " voi ten",
    " voi co ten",
    " ten la",
    " ten",
    " co ten",
]

GENEALOGY_BAD_NAME_MARKERS = [
    "them con cho",
    "them vo cho",
    "them chong cho",
    "them con",
    "them vo",
    "them chong",
    "tao con cho",
    "tao vo cho",
    "tao chong cho",
    "tao con",
    "tao vo",
    "tao chong",
    "bo sung con cho",
    "bo sung vo cho",
    "bo sung chong cho",
    "bo sung con",
    "bo sung vo",
    "bo sung chong",
    "va them",
    "roi them",
    "sau do them",
    "dong thoi them",
    "va co con",
    "co con ten la",
    "co con la",
]


def has_bad_genealogy_name(value: Any) -> bool:
    normalized = normalize_vietnamese(str(value or ""))
    if not normalized:
        return False
    if any(marker in normalized for marker in GENEALOGY_BAD_NAME_MARKERS):
        return True
    return normalized.startswith("gom ") or " ten la " in f" {normalized} "


def genealogy_result_has_bad_member_name(result: dict[str, Any]) -> bool:
    members = result.get("members") if isinstance(result.get("members"), list) else []
    return any(has_bad_genealogy_name(member.get("full_name")) for member in members if isinstance(member, dict))


def cleanup_genealogy_name(value: str) -> str:
    text = re.split(r"[,.;!?()\[\]\n\r]+", str(value or "").strip(), maxsplit=1)[0]
    text = text.strip(" \t\"'`:-")
    normalized_text = normalize_vietnamese(text)
    for marker in GENEALOGY_BAD_NAME_MARKERS:
        marker_index = normalized_text.find(marker)
        if marker_index > 0:
            text = text[:marker_index].strip()
            normalized_text = normalize_vietnamese(text)
            break
    for marker in GENEALOGY_NAME_STOP_MARKERS:
        normalized = normalize_vietnamese(text)
        marker_index = normalized.find(marker)
        if marker_index > 0:
            text = text[:marker_index].strip()
            break

    words = text.split()
    while words and normalize_vietnamese(words[0].strip(" \t\"'`:-")) in GENEALOGY_NAME_PREFIXES:
        words.pop(0)
    return " ".join(words).strip(" \t\"'`:-")


def named_group_original_text(
    source_text: str,
    index_map: list[int],
    match: re.Match[str],
    group_name: str,
) -> str:
    return cleanup_genealogy_name(named_group_original_raw_text(source_text, index_map, match, group_name))


def named_group_original_raw_text(
    source_text: str,
    index_map: list[int],
    match: re.Match[str],
    group_name: str,
) -> str:
    try:
        start = match.start(group_name)
        end = match.end(group_name)
    except IndexError:
        return ""
    return original_slice_from_normalized_span(source_text, index_map, start, end).strip()


VIETNAMESE_COUNT_WORDS = {
    "mot": 1,
    "hai": 2,
    "ba": 3,
    "bon": 4,
    "bốn": 4,
    "nam": 5,
    "năm": 5,
}


def parse_genealogy_count(value: str | None) -> int | None:
    text = normalize_vietnamese(value or "")
    if not text:
        return None
    if text.isdigit():
        parsed = int(text)
        return parsed if parsed > 0 else None
    return VIETNAMESE_COUNT_WORDS.get(text)


def split_genealogy_names(value: str) -> list[str]:
    text = re.split(r"[.!?]\s*", str(value or "").strip(), maxsplit=1)[0]
    text = re.sub(
        r"^\s*(?:gom|gồm|bao gom|bao gồm|lan luot(?:\s+ten)?\s+la|lần lượt(?:\s+tên)?\s+là|ten\s+(?:la\s+)?|tên\s+(?:là\s+)?|la|là)\s+",
        "",
        text,
        flags=re.IGNORECASE,
    )
    parts = re.split(r"\s*(?:,|;|\n|\r|\s+(?:và|va)\s+)\s*", text, flags=re.IGNORECASE)
    names: list[str] = []
    for part in parts:
        name = cleanup_genealogy_name(part)
        normalized_name = normalize_vietnamese(name)

        if not name:
            continue

        if normalized_name in {"mot", "hai", "ba", "bon", "nam", "1", "2", "3", "4", "5"}:
            continue

        if has_bad_genealogy_name(name):
            continue

        names.append(name)

    return names


def make_genealogy_member(temporary_id: str, full_name: str, gender: str | None = None) -> dict[str, Any]:
    return {
        "temporary_id": temporary_id,
        "full_name": full_name,
        "gender": gender,
        "confidence": 0.92,
    }


def build_rule_based_multi_genealogy_result(
    actions: list[dict[str, Any]],
    input_source: str,
) -> dict[str, Any]:
    members: list[dict[str, Any]] = []
    member_id_by_name: dict[str, str] = {}
    relationships: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    uncertain_items: list[dict[str, Any]] = []

    def get_member_id(full_name: str, gender: str | None = None) -> str | None:
        name = cleanup_genealogy_name(full_name)
        if not name or has_bad_genealogy_name(name):
            return None
        key = normalize_vietnamese(name)
        if key in member_id_by_name:
            member_id = member_id_by_name[key]
            if gender:
                for member in members:
                    if member["temporary_id"] == member_id and not member.get("gender"):
                        member["gender"] = gender
                        break
            return member_id
        member_id = f"p{len(members) + 1}"
        member_id_by_name[key] = member_id
        members.append(make_genealogy_member(member_id, name, gender))
        return member_id

    for action in actions:
        relation_type = action.get("type")
        evidence = action.get("evidence")
        if relation_type == "parent_child":
            parent_names = action.get("parents") or [action.get("parent")]
            parent_ids = [
                parent_id
                for parent_id in (
                    get_member_id(parent_name or "", action.get("parent_gender")) for parent_name in parent_names
                )
                if parent_id
            ]
            child_names = action.get("children") or []
            expected_count = action.get("expected_count")
            if expected_count and expected_count != len(child_names):
                append_genealogy_warning(
                    warnings,
                    "count_mismatch",
                    f"Số lượng người con được nói là {expected_count} nhưng phát hiện {len(child_names)} tên.",
                    parent_ids,
                )
            if expected_count and len(child_names) < expected_count:
                uncertain_items.append(
                    {
                        "item_type": "member_or_relationship",
                        "reference_id": parent_ids[0] if parent_ids else None,
                        "field": "children",
                        "reason": "Số lượng người con được nói ra lớn hơn số tên phát hiện.",
                        "suggested_action": "Bổ sung tên người con còn thiếu hoặc chỉnh lại số lượng.",
                    }
                )
            for child_name in child_names:
                child_id = get_member_id(child_name, action.get("child_gender"))
                if parent_ids and child_id:
                    for parent_id in parent_ids:
                        relationships.append(
                            {
                                "type": "parent_child",
                                "parent": parent_id,
                                "child": child_id,
                                "confidence": 0.92,
                                "evidence": evidence,
                            }
                        )
        elif relation_type == "spouse":
            person_id = get_member_id(action.get("person") or "", action.get("person_gender"))
            spouse_id = get_member_id(action.get("spouse") or "", action.get("spouse_gender"))
            if person_id and spouse_id:
                relationships.append(
                    {
                        "type": "spouse",
                        "from": person_id,
                        "to": spouse_id,
                        "confidence": 0.92,
                        "evidence": evidence,
                    }
                )

    raw_result = {
        "members": members,
        "relationships": relationships,
        "uncertain_items": uncertain_items,
        "warnings": warnings,
    }
    return normalize_genealogy_extract_result(raw_result, input_source)


def fallback_genealogy_extract(prompt_original: str, input_source: str) -> dict[str, Any]:
    original_prompt = str(prompt_original or "").strip()
    normalized_prompt, original_index_map = normalized_text_with_index_map(original_prompt)
    actions: list[dict[str, Any]] = []
    spouse_pairs: list[dict[str, Any]] = []
    child_count = r"(?P<count>mot|hai|ba|bon|nam|\d+)?"

    spouse_patterns = [
        (
            r"(?:^|[.;!?]\s*)(?:tao|them|bo sung|them moi)\s+(?:mot\s+)?(?:nguoi\s+)?(?P<relation>vo|chong)\s+(?:cho|cua)\s+"
            r"(?P<person>.+?)\s+(?:voi\s+)?(?:ten\s+(?:la\s+)?|co\s+ten\s+(?:la\s+)?|la\s+)(?P<spouse>.+?)(?=$|[.;!?])",
            False,
        ),
        (
            r"(?:^|[.;!?]\s*)(?P<person>.+?)\s+co\s+(?P<relation>vo|chong)\s+(?:ten\s+(?:la\s+)?|la\s+)(?P<spouse>.+?)(?=$|[.;!?])",
            False,
        ),
        (
            r"(?:^|[.;!?]\s*)(?P<spouse>.+?)\s+la\s+(?P<relation>vo|chong)\s+cua\s+(?P<person>.+?)(?=$|[.;!?])",
            True,
        ),
    ]
    for pattern, _spouse_first in spouse_patterns:
        for match in re.finditer(pattern, normalized_prompt):
            person = named_group_original_text(original_prompt, original_index_map, match, "person")
            spouse = named_group_original_text(original_prompt, original_index_map, match, "spouse")
            relation = match.group("relation")
            spouse_gender = "female" if relation == "vo" else "male"
            if person and spouse:
                action = {
                    "type": "spouse",
                    "person": person,
                    "spouse": spouse,
                    "spouse_gender": spouse_gender,
                    "evidence": original_prompt,
                    "_start": match.start(),
                }
                actions.append(action)
                spouse_pairs.append(action)

    child_patterns = [
        (
            rf"(?:^|[.;!?]\s*)(?:tao|them|bo sung|them moi)\s+{child_count}\s*(?:nguoi\s+)?con\s+(?:cho|cua)\s+"
            r"(?P<parent>.+?)\s+(?:voi\s+)?(?:gom|bao gom|lan luot(?:\s+ten)?\s+la|ten\s+(?:la\s+)?|co\s+ten\s+(?:la\s+)?|la)\s+(?P<children>.+?)(?=$|[.;!?])",
            True,
        ),
        (
            rf"(?:^|[.;!?]\s*)(?P<parent>.+?)\s+co\s+{child_count}\s*(?:nguoi\s+)?(?:con|cac\s+con)\s+(?:ten\s+(?:la\s+)?|la\s+)?(?P<children>.+?)(?=$|[.;!?])",
            True,
        ),
        (
            r"(?:^|[.;!?]\s*)(?P<children>.+?)\s+la\s+(?:mot\s+)?(?:nguoi\s+)?con\s+(?:cua|cho)\s+(?P<parent>.+?)(?=$|[.;!?])",
            False,
        ),
    ]
    for pattern, parent_first in child_patterns:
        for match in re.finditer(pattern, normalized_prompt):
            parent = named_group_original_text(original_prompt, original_index_map, match, "parent")
            children_raw = named_group_original_raw_text(original_prompt, original_index_map, match, "children")
            child_names = split_genealogy_names(children_raw)
            if not parent_first and child_names:
                parent, child_names = child_names[0], [parent]
            if parent and child_names:
                actions.append(
                    {
                        "type": "parent_child",
                        "parent": parent,
                        "children": child_names,
                        "expected_count": parse_genealogy_count(match.groupdict().get("count")),
                        "evidence": original_prompt,
                        "_start": match.start(),
                    }
                )

    parentless_spouse_pattern = (
        r"(?:^|[.;!?]\s*)(?:tao|them|bo sung|them moi)\s+(?:mot\s+)?(?:nguoi\s+)?(?P<relation>vo|chong)\s+"
        r"(?:ten\s+(?:la\s+)?|co\s+ten\s+(?:la\s+)?|la\s+)(?P<spouse>.+?)(?=$|[.;!?])"
    )
    for match in re.finditer(parentless_spouse_pattern, normalized_prompt):
        recent_person = None
        for action in actions:
            if action.get("_start", 0) >= match.start():
                continue
            if action.get("type") == "parent_child":
                recent_person = (action.get("parents") or [action.get("parent")])[0]
            elif action.get("type") == "spouse":
                recent_person = action.get("person")
        spouse = named_group_original_text(original_prompt, original_index_map, match, "spouse")
        relation = match.group("relation")
        spouse_gender = "female" if relation == "vo" else "male"
        if recent_person and spouse:
            action = {
                "type": "spouse",
                "person": recent_person,
                "spouse": spouse,
                "spouse_gender": spouse_gender,
                "evidence": original_prompt,
                "_start": match.start(),
            }
            actions.append(action)
            spouse_pairs.append(action)

    parentless_child_pattern = (
        rf"(?:^|[.;!?]\s*)(?:hai\s+nguoi\s+)?co\s+{child_count}\s*(?:nguoi\s+)?(?:con|cac\s+con)\s+"
        r"(?:ten\s+(?:la\s+)?|la\s+)?(?P<children>.+?)(?=$|[.;!?])"
    )
    for match in re.finditer(parentless_child_pattern, normalized_prompt):
        child_names = split_genealogy_names(named_group_original_raw_text(original_prompt, original_index_map, match, "children"))
        recent_spouse = None
        for spouse_pair in spouse_pairs:
            if spouse_pair["_start"] < match.start():
                recent_spouse = spouse_pair
        if recent_spouse and child_names:
            actions.append(
                {
                    "type": "parent_child",
                    "parents": [recent_spouse["person"], recent_spouse["spouse"]],
                    "children": child_names,
                    "expected_count": parse_genealogy_count(match.groupdict().get("count")),
                    "evidence": original_prompt,
                    "_start": match.start(),
                }
            )

    actions.sort(key=lambda action: (action.get("_start", 0), 0 if action.get("type") == "spouse" else 1))
    for action in actions:
        action.pop("_start", None)

    if actions:
        normalized_result = build_rule_based_multi_genealogy_result(actions, input_source)
        if normalized_result.get("members"):
            return normalized_result

    return empty_genealogy_extract_result()


def nullable_text(value: Any, max_length: int | None = None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:max_length] if max_length else text


def clamp_confidence(value: Any) -> float:
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return 0.0
    return round(min(max(confidence, 0.0), 1.0), 2)


def parse_year(value: Any) -> int | None:
    try:
        year = int(value)
    except (TypeError, ValueError):
        return None
    return year if 1 <= year <= 9999 else None


def normalize_genealogy_member(member: dict[str, Any], temporary_id: str) -> dict[str, Any]:
    gender = nullable_text(member.get("gender"))
    return {
        "temporary_id": temporary_id,
        "full_name": nullable_text(member.get("full_name"), 255),
        "gender": gender if gender in VALID_GENDERS else None,
        "birth_year": parse_year(member.get("birth_year")),
        "death_year": parse_year(member.get("death_year")),
        "birth_date": valid_iso_date(member.get("birth_date")),
        "death_date": valid_iso_date(member.get("death_date")),
        "phone": nullable_text(member.get("phone"), 50),
        "address": nullable_text(member.get("address"), 500),
        "notes": nullable_text(member.get("notes"), 1000),
        "confidence": clamp_confidence(member.get("confidence")),
    }


def normalize_related_ids(value: Any, id_map: dict[str, str]) -> list[str]:
    if not isinstance(value, list):
        return []
    related_ids: list[str] = []
    for raw_id in value:
        mapped = id_map.get(str(raw_id).strip())
        if mapped and mapped not in related_ids:
            related_ids.append(mapped)
    return related_ids


def append_genealogy_warning(
    warnings: list[dict[str, Any]],
    warning_type: str,
    message: str,
    related_ids: list[str] | None = None,
) -> None:
    warning = {
        "warning_type": warning_type,
        "message": message,
        "related_ids": related_ids or [],
    }
    if warning not in warnings:
        warnings.append(warning)


def has_parent_cycle(relationships: list[dict[str, Any]]) -> bool:
    graph: dict[str, list[str]] = {}
    for relation in relationships:
        if relation.get("type") != "parent_child":
            continue
        parent = relation.get("parent")
        child = relation.get("child")
        if parent and child:
            graph.setdefault(str(parent), []).append(str(child))

    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node: str) -> bool:
        if node in visiting:
            return True
        if node in visited:
            return False
        visiting.add(node)
        for child in graph.get(node, []):
            if visit(child):
                return True
        visiting.remove(node)
        visited.add(node)
        return False

    return any(visit(node) for node in graph)


def normalize_genealogy_extract_result(result: dict[str, Any], input_source: str) -> dict[str, Any]:
    output = empty_genealogy_extract_result()

    raw_members = result.get("members") if isinstance(result.get("members"), list) else []
    id_map: dict[str, str] = {}
    members: list[dict[str, Any]] = []

    for index, raw_member in enumerate(raw_members, start=1):
        if not isinstance(raw_member, dict):
            continue
        temporary_id = f"p{len(members) + 1}"
        original_id = nullable_text(raw_member.get("temporary_id")) or f"member_{index}"
        id_map[original_id] = temporary_id
        id_map[temporary_id] = temporary_id
        members.append(normalize_genealogy_member(raw_member, temporary_id))

    relationships: list[dict[str, Any]] = []
    raw_relationships = result.get("relationships") if isinstance(result.get("relationships"), list) else []
    for raw_relation in raw_relationships:
        if not isinstance(raw_relation, dict):
            continue
        relation_type = nullable_text(raw_relation.get("type"))
        if relation_type not in VALID_RELATIONSHIP_TYPES:
            continue

        base = {
            "type": relation_type,
            "confidence": clamp_confidence(raw_relation.get("confidence")),
            "evidence": nullable_text(raw_relation.get("evidence"), 1000),
        }

        if relation_type == "parent_child":
            parent = id_map.get(str(raw_relation.get("parent") or "").strip())
            child = id_map.get(str(raw_relation.get("child") or "").strip())
            if parent and child:
                relationships.append({"type": relation_type, "parent": parent, "child": child, **base})
        else:
            from_id = id_map.get(str(raw_relation.get("from") or "").strip())
            to_id = id_map.get(str(raw_relation.get("to") or "").strip())
            if from_id and to_id:
                relationships.append({"type": relation_type, "from": from_id, "to": to_id, **base})

    raw_uncertain_items = result.get("uncertain_items") if isinstance(result.get("uncertain_items"), list) else []
    uncertain_items: list[dict[str, Any]] = []
    for item in raw_uncertain_items:
        if not isinstance(item, dict):
            continue
        reference_id = nullable_text(item.get("reference_id"))
        uncertain_items.append(
            {
                "item_type": nullable_text(item.get("item_type"), 100) or "member_or_relationship",
                "reference_id": id_map.get(reference_id, reference_id) if reference_id else None,
                "field": nullable_text(item.get("field"), 100),
                "reason": nullable_text(item.get("reason"), 1000),
                "suggested_action": nullable_text(item.get("suggested_action"), 1000),
            }
        )

    raw_warnings = result.get("warnings") if isinstance(result.get("warnings"), list) else []
    warnings: list[dict[str, Any]] = []
    for warning in raw_warnings:
        if not isinstance(warning, dict):
            continue
        warnings.append(
            {
                "warning_type": nullable_text(warning.get("warning_type"), 100),
                "message": nullable_text(warning.get("message"), 1000),
                "related_ids": normalize_related_ids(warning.get("related_ids"), id_map),
            }
        )

    member_by_id = {member["temporary_id"]: member for member in members}
    for member in members:
        birth_year = member.get("birth_year")
        death_year = member.get("death_year")
        if birth_year and death_year and death_year < birth_year:
            append_genealogy_warning(
                warnings,
                "invalid_lifespan",
                "death_year nhỏ hơn birth_year.",
                [member["temporary_id"]],
            )

    seen_names: dict[str, list[str]] = {}
    for member in members:
        name_key = normalize_vietnamese(member.get("full_name") or "")
        if name_key:
            seen_names.setdefault(name_key, []).append(member["temporary_id"])
    for ids in seen_names.values():
        if len(ids) > 1:
            append_genealogy_warning(
                warnings,
                "possible_duplicate_member",
                "Có nhiều thành viên trùng tên, cần kiểm tra có phải cùng một người hay không.",
                ids,
            )

    for relation in relationships:
        if relation.get("type") == "parent_child":
            parent_id = relation.get("parent")
            child_id = relation.get("child")
            if parent_id == child_id:
                append_genealogy_warning(
                    warnings,
                    "self_relationship",
                    "Một người không thể là cha/mẹ của chính mình.",
                    [parent_id],
                )
            parent = member_by_id.get(parent_id)
            child = member_by_id.get(child_id)
            if parent and child and parent.get("birth_year") and child.get("birth_year"):
                if int(child["birth_year"]) - int(parent["birth_year"]) < 15:
                    append_genealogy_warning(
                        warnings,
                        "age_gap_anomaly",
                        "Khoảng cách năm sinh giữa cha/mẹ và con nhỏ hơn 15 năm.",
                        [parent_id, child_id],
                    )
        else:
            from_id = relation.get("from")
            to_id = relation.get("to")
            if from_id == to_id:
                append_genealogy_warning(
                    warnings,
                    "self_relationship",
                    "Một người không thể có quan hệ vợ/chồng với chính mình.",
                    [from_id],
                )

    if has_parent_cycle(relationships):
        append_genealogy_warning(
            warnings,
            "genealogy_cycle",
            "Quan hệ parent_child có thể tạo vòng lặp gia phả.",
            [],
        )

    if input_source == "voice_transcript":
        append_genealogy_warning(
            warnings,
            "voice_transcript_review_required",
            "Dữ liệu từ transcript giọng nói cần được kiểm tra vì có thể sai tên, năm hoặc quan hệ.",
            [],
        )

    output["members"] = members
    output["relationships"] = relationships
    output["uncertain_items"] = uncertain_items
    output["warnings"] = warnings
    output["summary"] = {
        "total_members_detected": len(members),
        "total_relationships_detected": len(relationships),
        "needs_human_review": True,
    }
    return output


def create_app() -> Flask:
    app = Flask(__name__)
    groq_key = os.getenv("GROQ_API_KEY")
    groq_disabled = str(os.getenv("AI_DISABLE_GROQ", "false")).strip().lower() in {"1", "true", "yes", "on"}
    try:
        groq_timeout = float(os.getenv("GROQ_TIMEOUT_SECONDS", "8"))
    except ValueError:
        groq_timeout = 8.0
    groq_client = Groq(api_key=groq_key, timeout=groq_timeout) if groq_key and not groq_disabled else None
    debug_enabled = str(os.getenv("DEBUG", "false")).strip().lower() in {"1", "true", "yes", "on"}

    @app.get("/health")
    def health():
        return jsonify(
            {
                "success": True,
                "service": "ai-server",
                "groq_configured": bool(groq_key and not groq_disabled),
            }
        )

    @app.post("/event-form/generate")
    def event_form_generate():
        body = request.get_json(silent=True) or {}
        prompt = str(body.get("prompt") or "").strip()

        if not prompt:
            return jsonify({"success": False, "message": "Prompt không được để trống"}), 400

        fallback = fallback_event_form(body)
        if groq_client is None or fallback.get("status") == "unsupported":
            return jsonify({"success": True, **fallback})

        user_payload = {
            "mode": body.get("mode") or "event_create",
            "prompt": prompt,
            "today": body.get("today") or datetime.now().date().isoformat(),
            "clan_id": body.get("clan_id"),
            "current_event": body.get("current_event"),
            "existing_tasks": body.get("existing_tasks") or [],
            "requested_task_count": requested_task_count_from_body(body),
        }

        try:
            res = groq_client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "system", "content": EVENT_FORM_SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
                ],
                temperature=0.2,
                max_tokens=1800,
            )
            content = res.choices[0].message.content or "{}"
            if debug_enabled:
                app.logger.debug("EVENT_FORM_AI_RAW=%s", content[:4000])

            parsed = json.loads(strip_json_block(content))
            normalized = normalize_event_form_result(parsed, body)
            return jsonify({"success": True, **normalized})
        except Exception as exc:
            if debug_enabled:
                app.logger.exception("AI event form generation failed: %s", exc)
            return jsonify({"success": True, **fallback})

    @app.post("/genealogy/extract")
    def genealogy_extract():
        body = request.get_json(silent=True) or {}
        original_prompt = str(body.get("prompt") or "").strip()
        input_source = str(body.get("input_source") or "text").strip()
        if input_source not in VALID_GENEALOGY_INPUT_SOURCES:
            input_source = "text"

        if not original_prompt:
            result = empty_genealogy_extract_result()
            append_genealogy_warning(
                result["warnings"],
                "empty_prompt",
                "Prompt không được để trống.",
                [],
            )
            return jsonify(result), 400

        prepared_prompt = prepare_genealogy_prompt(original_prompt)
        fallback = fallback_genealogy_extract(prepared_prompt, input_source)

        if groq_client is None:
            if fallback.get("members") or fallback.get("relationships"):
                return jsonify(fallback)
            result = empty_genealogy_extract_result()
            append_genealogy_warning(
                result["warnings"],
                "ai_model_unavailable",
                "AI model chưa được cấu hình, không thể trích xuất dữ liệu gia phả.",
                [],
            )
            return jsonify(result)

        user_payload = {
            "input_source": input_source,
            "prompt": prepared_prompt,
            "prompt_original": original_prompt,
        }

        try:
            res = groq_client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "system", "content": GENEALOGY_DATA_SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
                ],
                temperature=0.1,
                max_tokens=2400,
            )
            content = res.choices[0].message.content or "{}"
            if debug_enabled:
                app.logger.debug("GENEALOGY_EXTRACT_AI_RAW=%s", content[:4000])

            parsed = json.loads(strip_json_block(content))
            normalized = normalize_genealogy_extract_result(parsed, input_source)
            if genealogy_result_has_bad_member_name(normalized) and (
                fallback.get("members") or fallback.get("relationships")
            ):
                return jsonify(fallback)
            if not normalized.get("members") and (fallback.get("members") or fallback.get("relationships")):
                return jsonify(fallback)
            return jsonify(normalized)
        except Exception as exc:
            if debug_enabled:
                app.logger.exception("AI genealogy extraction failed: %s", exc)
            if fallback.get("members") or fallback.get("relationships"):
                return jsonify(fallback)
            result = empty_genealogy_extract_result()
            append_genealogy_warning(
                result["warnings"],
                "ai_generation_failed",
                "AI không thể trích xuất dữ liệu gia phả lúc này.",
                [],
            )
            return jsonify(result)

    return app


app = create_app()

if __name__ == "__main__":
    debug = str(os.getenv("DEBUG", "false")).strip().lower() in {"1", "true", "yes", "on"}
    app.run(
        host=os.getenv("HOST", "0.0.0.0"),
        port=parse_int(os.getenv("PORT")) or 8001,
        debug=debug,
        use_reloader=debug,
    )
