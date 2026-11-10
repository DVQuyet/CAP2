# Tối ưu trợ lý AI, cấu trúc dữ liệu quan hệ và hiển thị gia phả

Cập nhật 15/10/2026. Tài liệu trả lời năm câu hỏi: tối ưu cách AI trả lời, cấu trúc cơ sở dữ liệu,
cách hiển thị, cách lưu quan hệ giữa các thành viên, và cách AI trả lời được nhiều loại câu hỏi hơn
(kể cả thêm sự kiện giúp người dùng). Mọi số liệu dưới đây lấy từ mã hiện tại hoặc từ script đo kèm repo.

## 1. Tóm tắt

| Vấn đề | Hiện trạng | Đã làm | Nên làm tiếp |
|---|---|---|---|
| AI hiểu câu hỏi | Luật nhận ra 34/46 câu mẫu (74%) | Nâng lên 42/46 (91%): sự kiện theo mốc, cùng đời, tổ tiên, hỏi chức năng | Ghi log câu chưa nhận ra để mở rộng luật theo dữ liệu thật |
| AI trả lời sai/bịa | Dữ kiện chỉ lấy từ DB, LLM chỉ diễn đạt | Giữ nguyên tắc; sửa 1 câu bị phân loại nhầm ("kỷ niệm" thành "tra tên người") | Nút 👍/👎 và bộ câu hỏi đáp án chuẩn chạy trong CI |
| Lưu quan hệ | Mô hình hôn phối + liên kết con đã đủ cho nhiều vợ, con nuôi, ngày ước lượng | Đã có từ đợt trước (xem mục 3) | Bảng tổ tiên dựng sẵn khi dòng họ lớn (xem 3.3) |
| Hiển thị | Cây theo cặp vợ chồng, thẻ tham chiếu, nét đứt/chấm | Tìm kiếm chỉ căn giữa và tô sáng, không mở form; thanh công cụ xuống dòng ở ~900px | Tải theo nhánh/độ sâu cho cây rất lớn |
| AI thêm sự kiện | Tạo bản nháp, người dùng bấm xác nhận mới lưu | Thêm thứ trong tuần ("chủ nhật tuần sau"), "hẹn họp" | Sự kiện lặp hằng năm, gắn với người (giỗ) |

## 2. Cách AI trả lời

> Kết quả kiểm tra đầu-cuối (47/82 câu đúng, hội thoại 0/5) và kế hoạch chi tiết: [KE_HOACH_AI_TRA_LOI.md](KE_HOACH_AI_TRA_LOI.md).

### 2.1 Luồng hiện tại

```text
Tin nhắn
  -> "<quan hệ> của <tên>"?      parseNamedRelationshipExpression
  -> lệnh tạo sự kiện?           eventCommandService      (bản nháp + nút xác nhận)
  -> parser ý định bằng luật     intentParserService      (không tốn token, ổn định)
  -> biểu thức quan hệ thuần     parseRelationshipExpression ("em trai tôi", "anh họ tôi")
  -> LLM planner (Groq)          chỉ khi luật không nhận ra; đầu ra bị kiểm tra bởi plannerValidatorService
  -> handler đọc DB / đồ thị     relationshipEngine, dataIntentHandlers
  -> LLM diễn đạt lại (tùy chọn) rồi lọc quyền theo người hỏi (permissionAwareResponseService)
```

Nguyên tắc nên giữ: **AI không tạo dữ kiện gia phả**. LLM chỉ (1) hiểu câu hỏi khi luật bó tay và
(2) diễn đạt lại kết quả đã có. Nhờ vậy câu trả lời kiểm chứng được và không lộ dữ liệu ngoài quyền.

### 2.2 Độ phủ đo được

Chạy `node scripts/chatbot-coverage.js` trong `Backend/` (không cần DB, không gọi LLM).

| Nhóm | Trước | Sau |
|---|---|---|
| Quan hệ (19 câu) | 16 | 18 |
| Thống kê (6) | 6 | 6 |
| Thông tin người (6) | 5 | 5 |
| Lịch và sự kiện (6) | 2 | 5 |
| Tạo sự kiện (4) | 3 | 4 |
| Khác (5) | 2 | 4 |
| **Tổng (46)** | **34 (74%)** | **42 (91%)** |

Các thay đổi chính (`intentParserService.js`, `dataIntentHandlers.js`, `chatbotController.js`):

- **Sự kiện theo mốc và loại**: "hôm nay", "ngày mai", "tuần này/sau", "tháng này/sau"; loại giỗ hoặc sinh nhật.
  Trước đây câu phải nhắc kèm "dòng họ/gia phả/lễ/giỗ" mới nhận ra, nên "Sắp tới có sự kiện gì" rơi sang LLM.
- **Lịch của chính người hỏi**: câu trả lời sự kiện gồm cả lịch cá nhân/lịch chung đã thêm qua trợ lý
  (trước đó chỉ đọc bảng `events`). Lịch cá nhân của người khác không lộ.
- **Cùng đời** (`same_generation`) và **tổ tiên** (`list_ancestors`, nhóm theo cha mẹ/ông bà/cụ/kỵ/cao tổ,
  không tính cha mẹ kế).
- **Hỏi chức năng** ("Bạn làm được những gì"): trả danh sách việc trợ lý làm được kèm ví dụ,
  cũng là chỗ giới thiệu tính năng tạo lịch.
- **Chip gợi ý** dùng tên người thật trong dòng họ (kiểm quyền theo dòng họ); không còn "[Tên người]".

### 2.3 Còn thiếu và cách làm

| Câu hỏi | Vì sao chưa có | Cách làm đề xuất |
|---|---|---|
| "Ai là con trưởng của ông Hòa" | Cần thứ tự con (`children.sort_order`/năm sinh) | Thêm bước "con thứ N" vào bộ giải biểu thức; hỏi lại nếu thứ tự chưa nhập |
| "Giỗ ông nội là ngày nào" | Trường `death_anniversary_lunar` chưa nằm trong dữ liệu `person_info` | Thêm cột vào truy vấn hồ sơ **sau khi** xác nhận cột có ở mọi môi trường (truy vấn lỗi sẽ làm mọi câu `person_info` trả rỗng) |
| "Số điện thoại của X" | Quyết định riêng tư, chưa có quy tắc | Chỉ trả khi người hỏi có quyền xem trường đó trong hồ sơ; còn lại trả hướng dẫn mở hồ sơ |
| Ngoài phạm vi ("thời tiết") | Cố ý | Trả lời lịch sự kèm 3 ví dụ câu hỏi hợp lệ thay vì "chưa hiểu" |

### 2.4 Đề xuất tối ưu tiếp (theo thứ tự đáng làm)

1. **Khai thác câu hỏi không nhận ra**: bảng `chatbot_messages` đã lưu `intent`; lọc các dòng `intent = 'unknown'`
   (hoặc câu phải nhờ LLM planner) rồi mỗi tuần lấy 20 câu phổ biến nhất bổ sung vào luật và vào
   `scripts/chatbot-coverage.js`. Rẻ hơn nhiều so với nâng cấp LLM.
2. **Đưa bộ đo vào CI** với ngưỡng (`--min`) để sửa luật không làm tụt độ phủ; bộ `chatbot.eval.test.js`
   đã kiểm tra đáp án, script này kiểm tra độ phủ.
3. **Hỏi lại có chọn** khi mơ hồ: đã có danh sách ứng viên cho trùng tên; mở rộng cho "con trưởng của ai",
   "bác nào" (có nhiều bác).
4. **Trả lời kèm bằng chứng**: tên người trung gian trong đường quan hệ ("A là con của B, B là anh của C").
   `FamilyPathVisualizer` đã có; chỉ cần luôn gửi `relationshipPath` ở mọi intent quan hệ.
5. **Ngữ cảnh hội thoại**: `conversationMemoryService` đã giữ người vừa nhắc; cho "còn vợ của ông ấy?" dùng lại.
6. **Giới hạn chi phí LLM**: với intent đã nhận ra bằng luật, bỏ bước diễn đạt lại khi câu trả lời đã ngắn
   (danh sách tên, số đếm) — giảm độ trễ và rủi ro diễn đạt sai.

## 3. Cấu trúc dữ liệu và lưu quan hệ

### 3.1 Mô hình hiện tại (đã kiểm tra trong `database/migrations/2026_10_05_genealogy_relationship_model.sql`)

```text
people     1 ─┐                      ngày sinh/mất có độ chính xác (exact/month/year/approximate/unknown),
              │                      lịch dương/âm, death_anniversary_lunar (MM-DD), nguồn dữ liệu
families   ───┤  = một cuộc hôn nhân/quan hệ: father_id, mother_id, union_type (marriage/concubine/...),
              │    relationship_status, wife_rank/husband_rank, visibility (public/managers)
children   ───┘  = liên kết con: family_id, person_id, child_type (biological/adopted/heir/step/foster),
                   is_primary_lineage
genealogy_relation_overrides  = lưu vết khi quản lý xác nhận quan hệ bất thường (gia phả giấy)
clans.genealogy_policy (JSON) = dòng nội/mẫu hệ, vùng xưng hô, mốc luật hôn nhân, giới hạn tuổi...
```

Điểm mạnh nên giữ:

- **Quan hệ nằm ở `families`/`children`, không ở cột cha/mẹ trên `people`**: một người có nhiều vợ,
  một người có nhiều gia đình cha mẹ (ruột + nuôi/thừa tự), cặp chưa rõ cha hoặc mẹ.
- **Đời được tính từ quan hệ** (con = đời cha/mẹ dòng chính + 1, dâu/rể theo vợ/chồng) nên không lệch khi sửa quan hệ.
- **Mọi ghi quan hệ đi qua một lõi** (`modules/genealogy/core`): kiểm tra 3 mức (lỗi/pháp lý/cảnh báo),
  ngữ cảnh lịch sử, và ghi vết ngoại lệ. Trợ lý AI đọc đúng đồ thị đó nên không mâu thuẫn với cây.

### 3.2 Chỉ mục hiện có

`children`: `UK_family_person (family_id, person_id)`, `idx_children_person`, `idx_children_family_sort`;
`families`: `FK_Fam_Clan`, `idx_families_clan_father`. Đủ cho truy vấn theo dòng họ và theo người.
Trước khi thêm chỉ mục mới, chạy `SHOW INDEX FROM families` trên DB thật để tránh trùng.

### 3.3 Khi nào cần đổi cấu trúc

Đồ thị được dựng một lần cho mỗi dòng họ rồi cache trong bộ nhớ, tự làm mới khi phiên bản đồ thị đổi
(`graph version`). Cách này đủ cho vài nghìn người. Chỉ cân nhắc bảng dựng sẵn khi đo thấy chậm:

| Dấu hiệu | Việc làm |
|---|---|
| Dòng họ > ~5.000 người, mở cây hoặc hỏi quan hệ > 1 giây | Bảng `person_ancestors(person_id, ancestor_id, depth)` cập nhật khi đổi `children`; truy vấn tổ tiên/hậu duệ thành một câu SELECT |
| Nhiều instance server, cache lệch | Đưa `graph version` vào một nơi dùng chung (Redis hoặc bảng) |
| Cần "hoàn tác" thay đổi cây | Bảng lịch sử thay đổi quan hệ (trước/sau); `genealogy_relation_overrides` chỉ lưu quyết định xác nhận |

Đo trước bằng `scripts/load-test-family-tree.js`; không thêm bảng khi chưa có số liệu.

### 3.4 Rủi ro dữ liệu cần xử lý một lần

- Các hàm `ensure*Schema` tự `ALTER` khi chạy lần đầu: **sao lưu DB trước khi triển khai**, hoặc chạy
  `npm run migrate` ở môi trường thử trước (xem `docs/CAI_THIEN_HE_THONG.md`).
- Hồ sơ cũ thiếu độ chính xác ngày: mặc định `exact` có thể sinh sinh nhật/ngày giỗ giả. Lịch đã bỏ qua ngày không
  `exact`; nên rà các hồ sơ chỉ biết năm và đặt đúng `*_date_precision`.

## 4. Hiển thị

Đã có: bố cục theo cặp vợ chồng, nhiều vợ cùng cụm, thẻ tham chiếu cho người xuất hiện ở hai nhánh,
nét đứt/chấm cho quan hệ đã kết thúc/con nuôi/vợ lẽ, xuất ảnh giữ đúng kiểu nét, hộp thoại kiểm tra gia phả.

Đã sửa trong đợt này:

- Chọn người từ ô tìm kiếm, "Xem từ một người", "Tìm tôi" chỉ **căn giữa và tô sáng**; form hồ sơ chỉ mở
  khi bấm vào thẻ. Lưu hồ sơ xong thì đóng và báo bằng toast.
- Thanh công cụ xuống dòng ở màn hình ~900px; menu "Thêm công cụ" không vượt khỏi khung nhìn.
- Lịch: ô ngày không còn bị tên ngày lễ trùng ngày che sự kiện (vd. 20/10); thêm chế độ xem Ngày.

Nên làm tiếp:

1. **Tải theo nhánh/độ sâu** cho cây rất lớn (cần đổi API và editor; đo trước).
2. **Tô sáng đường quan hệ trên cây** khi trợ lý trả lời một câu quan hệ (nối `relationshipPath` với
   `focusPerson`, dùng `focusedPersonId` vừa thêm).
3. **Thu gọn/mở rộng nhánh** nhớ theo người dùng, mặc định mở 3 đời quanh người đang xem.

## 5. Trợ lý thêm sự kiện

### 5.1 Cách hoạt động và vì sao an toàn

```text
"Nhắc tôi giỗ ông nội ngày 15/3 âm lịch, nhắc trước 3 ngày"
  -> eventCommandService.parseEventCommand   (tiêu đề, ngày, giờ, loại, nhắc trước)
  -> trả về bản nháp + nút "Thêm vào lịch"   (CHƯA lưu)
  -> người dùng bấm nút -> POST /api/calendar/events bằng quyền của chính họ
```

- Trợ lý **không tự lưu**; lưu chỉ khi người dùng bấm, nên câu hiểu sai không để lại dữ liệu.
- Quyền do API lịch quyết định: thành viên chỉ tạo lịch cá nhân, quản lý mới tạo lịch chung.
- Thiếu ngày thì hỏi lại thay vì đoán.

Đã hỗ trợ: hôm nay/ngày mai/ngày kia/tuần sau; `dd/mm[/yyyy]`; "ngày X tháng Y"; thứ trong tuần
("thứ bảy", "chủ nhật tuần sau"); âm lịch (lấy lần giỗ gần nhất sắp tới); giờ ("8h", "7 giờ tối"); "nhắc trước N ngày";
loại giỗ/sinh nhật/họp họ/cá nhân.

### 5.2 Nên làm tiếp

| Tính năng | Giá trị | Ghi chú |
|---|---|---|
| Sự kiện lặp hằng năm (giỗ, sinh nhật) | Không phải đặt lại mỗi năm | Lịch hiện tính giỗ/sinh nhật từ hồ sơ; chỉ cần "gắn với người" thay vì tạo bản ghi từng năm |
| Gắn sự kiện với người (`person_id`) | "Giỗ ông nội" tự lấy đúng ngày từ hồ sơ | Cần chọn người khi mơ hồ (đã có luồng hỏi lại) |
| Thẻ xác nhận cho chọn phạm vi cá nhân/dòng họ | Quản lý tránh gửi nhắc tới cả họ ngoài ý muốn | Mặc định cá nhân (đã áp dụng ở trang lịch) |
| Sửa/xóa sự kiện qua chat | Tiện | Luôn qua xác nhận; chỉ trên sự kiện do chính người dùng tạo |
| Gợi chủ động | "Sắp tới giỗ cụ X, thêm nhắc?" | Dùng danh sách giỗ sắp tới đã có; chỉ gợi, không tự thêm |

## 6. Lộ trình đề xuất

| # | Việc | Công sức | Giá trị | Rủi ro |
|---|---|---|---|---|
| 1 | Log câu `unknown` + mở rộng luật hằng tuần | nhỏ | cao | thấp |
| 2 | Ngưỡng độ phủ trong CI | nhỏ | trung bình | thấp |
| 3 | Hỏi "con trưởng/con thứ N" | nhỏ | trung bình | thấp |
| 4 | Giỗ theo người (`death_anniversary_lunar` trong hồ sơ) | nhỏ | cao | trung bình (kiểm cột trên mọi môi trường) |
| 5 | Tô sáng đường quan hệ trên cây khi AI trả lời | trung bình | cao | thấp |
| 6 | Sự kiện lặp/gắn người | trung bình | cao | trung bình |
| 7 | Bảng tổ tiên dựng sẵn, tải cây theo nhánh | lớn | chỉ khi dòng họ lớn | cao; đo trước |

## 7. Cách kiểm tra lại

```bash
cd Backend
node scripts/chatbot-coverage.js --min 40   # độ phủ luật
npm test                                    # gồm kiểm tra parser, sự kiện, gợi ý, lệnh tạo sự kiện
cd ../Frontend && npm test && npm run lint  # Esc đóng modal, tiện ích cây/ngày
```
