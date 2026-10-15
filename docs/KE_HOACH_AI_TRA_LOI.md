# Kiểm tra trợ lý AI và kế hoạch trả lời mượt, đủ loại câu hỏi về dòng họ

Cập nhật 15/10/2026. Phần 1 là kết quả kiểm tra thật trên mã hiện tại; phần 2 là danh mục câu hỏi
người dùng có thể hỏi; phần 3 là kế hoạch sửa theo giai đoạn, có thước đo để biết khi nào xong.

> Danh sách việc để làm tiếp (có ô đánh dấu, vị trí mã, mốc điểm): [TIEP_TUC_AI_TRA_LOI.md](TIEP_TUC_AI_TRA_LOI.md).

## 1. Kết quả kiểm tra

### 1.1 Cách kiểm tra

- Gọi đúng hàm xử lý `POST /api/chatbot/ask` (không giả lập phần trả lời) với một **dòng họ mẫu 22 người,
  5 đời**: vợ cả và vợ lẽ, con nuôi, hai người cùng tên "Đinh Văn Hùng", ngày giỗ âm lịch, sự kiện,
  lịch cá nhân/chung, kỷ niệm, lịch sử và địa chỉ nhà thờ họ. Người hỏi là "Đinh Văn Quyết" (đời 4).
- DB giả, **không gọi Groq** — đúng tình huống thiếu/lỗi `GROQ_API_KEY` trên Render. Khi có Groq, một số câu
  "chưa hỗ trợ" có thể được LLM phân loại lại, nhưng các câu **trả lời sai** dưới đây đi qua luật trước nên
  vẫn sai dù có Groq.
- 82 câu thuộc 9 nhóm + 1 hội thoại 5 lượt, mỗi câu có đáp án phải có và đáp án không được có.
- Chạy lại: `cd Backend && node scripts/chatbot-e2e-check.js` (thêm `--all` để xem mọi câu).

### 1.2 Kết quả

| Nhóm | Đúng | Ghi chú |
|---|---|---|
| Bản thân và gia đình gần | 7/17 | Hỏi "Ai là <xưng hô> của tôi" sai nhiều |
| Quan hệ theo tên | 12/19 | Trùng tên không hỏi lại; con nuôi/vợ lẽ chưa có |
| Thông tin một người | 3/13 | Thấp nhất |
| Thống kê | 8/10 | |
| Ngày giỗ, sự kiện | 4/6 | |
| Tạo lịch | 3/3 | |
| Dòng họ (lịch sử, nhà thờ, thủy tổ) | 3/6 | |
| Viết không dấu/sai chính tả | 4/4 | |
| Ngoài phạm vi, an toàn | 3/4 | |
| **Tổng** | **47/82 (57%)** | |
| Hội thoại nối tiếp ("ông ấy", "thế còn…") | **0/5** | |

Phần xử lý trong máy rất nhanh (trung vị 0,6 ms). Độ trễ người dùng cảm nhận đến từ DB và Groq.

### 1.3 Lỗi nghiêm trọng: trả lời sai nhưng vẫn khẳng định

| Câu hỏi | Trợ lý trả lời | Đúng ra | Nguyên nhân |
|---|---|---|---|
| Bà nội của tôi là ai? | "cha của bạn là: Đinh Văn Hùng, Lê Thị Cúc, Đinh Văn An" | Trần Thị Lan | Từ "ba" (bố, miền Nam) bị chuẩn hóa thành "cha" nên "bà nội" thành "cha nội"; danh sách "cha" lại sai tiếp (xem dòng dưới) |
| Cô tôi là ai? | 12 người, có cả nam giới | Đinh Thị Hạnh | `pathMatchesKinship` so khớp **chuỗi con trên nhãn đã bỏ dấu**: "co" khớp cô/cố/con…, "cha" nằm trong "**cha**u" |
| Cụ nội của tôi là ai? | "cu của bạn là: Đinh Công Thành, Đinh Thị Mai, …" | Đinh Công Thành | Như trên; nhãn in ra mất dấu ("cu", "chu", "co của bạn") |
| Chú tôi / Ông chú của tôi | Cùng một danh sách trộn chú ruột, chú họ và ông chú | Chú: Đinh Văn Hùng (em bố); ông chú: Đinh Văn Bình | Như trên; không phân biệt ruột/họ, không ưu tiên cụm dài "ông chú" |
| Con của Đinh Văn Hùng là ai? | Chọn ngầm một trong hai người cùng tên | Phải hỏi lại "Hùng nào?" | Đường "<quan hệ> của <tên>" coi trùng tên tuyệt đối là "đã xác định" |
| Có ai tên Lan không? | "Không tìm thấy người tên **Ai Lan**" | Có Trần Thị Lan | Tên tách ra còn dính chữ "ai" |
| Tôi có mấy anh chị em? | Số chi/nhánh | Đinh Thị Linh | "chị" bị hiểu là "chi" (chi họ) |
| Tôi đời thứ mấy? | "Gia phả có 5 đời" | Đời thứ 4 | Parser thống kê đứng trước parser đời |
| Ai là em của ông nội tôi? | "Ông nội của bạn là Đinh Văn Hòa" | Đinh Văn Bình, Đinh Thị Mai | Bỏ qua "em của" |
| Thủy tổ của dòng họ là ai? | Không tìm thấy người tên "dòng họ là ai" | Đinh Công Thành | Parser tổ tiên coi "dòng họ" là tên người |
| Đinh Văn Hòa mất năm nào? | In ngày **sinh** | 1999 | Câu trả lời thông tin người luôn theo một mẫu cố định |
| A và B có quan hệ gì? | "…vì **cha của bạn**, rồi đến…" | Không liên quan người hỏi | Câu giải thích dùng mẫu của "X là gì của tôi" |

Điểm then chốt: câu "X là gì của tôi" dùng bộ đặt tên quan hệ theo tổ tiên chung (`describeKinship`) nên đúng
("Đinh Văn Nam là em họ", "Đinh Văn Bình là ông chú"), còn chiều ngược lại "Ai là <xưng hô> của tôi" dùng bộ so khớp
cũ nên sai. Hai chiều phải dùng chung một nguồn.

### 1.4 Chưa hỗ trợ (trả "Tôi chưa hiểu rõ câu hỏi" khi không có Groq)

"Đinh Văn Lâm là ai?", "Ông Bình là ai?", tuổi, còn sống không, có mấy vợ, con nuôi, vợ lẽ, con trưởng,
đời nào đông nhất, ngày giỗ của một người, "họp họ khi nào", **nhà thờ họ ở đâu** (dữ liệu có sẵn trong
`clans.hall_address` nhưng không được dùng), trưởng họ, "Tôi với X là gì của nhau", câu ngoài phạm vi
(trả lời chung chung thay vì nói rõ), và toàn bộ hội thoại nối tiếp: "Vợ của **ông ấy** là ai?" bị tìm người
tên "ong ay".

### 1.5 Vấn đề làm trợ lý kém mượt

| Vấn đề | Chi tiết |
|---|---|
| Chậm hoặc treo khi Groq chậm | Câu về người, sự kiện, kỷ niệm, chào hỏi luôn gọi Groq để "diễn đạt lại"; câu luật không hiểu gọi thêm Groq để phân loại. Timeout 15 s và thử lại 1 lần, nên một câu có thể chờ ~30–60 s |
| Hỏi lại khi trùng tên bị đứt | Trả HTTP 409/404 nên không được lưu vào lịch sử; bấm chọn người thì giao diện đổi câu hỏi thành "Tôi gọi X bằng gì?" (mất câu gốc) và giữ `targetPersonId` cho các câu sau |
| Bắt buộc chọn "bạn là ai trong cây" | Ô nhập bị khóa cho tới khi chọn, kể cả câu không cần "tôi" (thống kê, sự kiện, quan hệ theo tên). Tài khoản quản lý thường chưa gắn hồ sơ |
| Cách nói | Ngày dạng `1940-10-25`; giải thích "vì cha của bạn, rồi đến cha của người đó, rồi đến em trai của người đó…"; "Cảm ơn" được đáp "Chào …"; câu trả lời nhiều dòng bị dồn một đoạn (thiếu `white-space: pre-line`) |
| Gợi ý không theo ngữ cảnh | Chip gợi ý chỉ tải lúc mở; gợi ý server trả kèm câu trả lời bị bỏ qua |
| Trí nhớ hội thoại trong RAM | Mất khi Render ngủ/khởi động lại, không dùng chung giữa nhiều instance |

### 1.6 Rủi ro dữ liệu liên quan

`POST /api/me/context/person` (bước "chọn bạn là ai" của chat) cho mọi tài khoản trong họ tự gắn mình với
**bất kỳ** hồ sơ nào trong họ, và ghi luôn `accounts.person_id` nếu đang trống. Không kiểm tra hồ sơ đã có tài khoản
khác, người đã mất, hay cần quản lý duyệt.

## 2. Danh mục câu hỏi người dùng có thể hỏi

Trạng thái theo bộ kiểm tra: ✔ trả đúng, ⚠ có trả nhưng sai/thiếu, ✘ chưa hỗ trợ.

| # | Nhóm | Ví dụ | Trạng thái | Dữ liệu cần |
|---|---|---|---|---|
| 1 | Bản thân, cha mẹ, ông bà, anh chị em, con | "Bố tôi là ai?", "Tôi có mấy anh chị em?" | ✔ / ⚠ | Có |
| 2 | Xưng hô họ hàng | "Ai là chú/cô/dì/cậu/mợ/thím/ông chú/bà cô/cụ của tôi?", "anh họ tôi" | ⚠ sai nhiều | Có |
| 3 | Quan hệ theo tên, giữa hai người | "Cha của X", "X là gì của tôi", "A với B là gì của nhau" | ✔ / ⚠ trùng tên | Có |
| 4 | Hôn nhân đặc biệt, con nuôi | "Vợ lẽ của X", "X có mấy vợ", "con nuôi của X", "con riêng" | ✘ | Có (`union_type`, `child_type`) — phải theo quyền xem |
| 5 | Thông tin một người | "X là ai", sinh/mất, tuổi, còn sống, quê, tiểu sử, đời | ⚠ / ✘ | Có |
| 6 | Thống kê | Số người, số đời, nam/nữ, còn sống/đã mất, lớn/nhỏ tuổi nhất, đời đông nhất, con trưởng | ✔ 8/10 | Có |
| 7 | Ngày giỗ, sinh nhật, sự kiện | "Tháng này có giỗ ai", "Giỗ cụ tổ ngày nào", "Họp họ khi nào" | ✔ / ✘ theo người | Có |
| 8 | Tạo lịch, nhắc | "Nhắc tôi giỗ ông nội 15/3 âm lịch" | ✔ | Có |
| 9 | Dòng họ | Lịch sử, nguồn gốc, nhà thờ họ, thủy tổ, trưởng họ/trưởng chi, kỷ niệm | ⚠ 3/6 | Trưởng họ **chưa có trường** |
| 10 | Hội thoại nối tiếp, làm rõ | "Còn vợ ông ấy?", "Thế còn X?", chọn người khi trùng tên | ✘ 0/5 | — |
| 11 | Không dấu, sai chính tả, xưng hô vùng miền | "bo cua dinh van lam", "tía/má/bầm/u" | ✔ (mẫu nhỏ) | — |
| 12 | Ngoài phạm vi, riêng tư, an toàn | Thời tiết, số điện thoại, yêu cầu bỏ qua hướng dẫn | ⚠ | Quy tắc quyền xem |

## 3. Kế hoạch

### Mục tiêu đo được

- Bộ kiểm tra đầu-cuối (chế độ không Groq): **≥ 74/82 câu (90%)**, hội thoại **≥ 4/5**.
- **Không còn câu "sai mà khẳng định"** ở nhóm xưng hô và trùng tên.
- Thời gian trả lời p95: **< 1,5 s** khi không cần LLM, **< 4 s** khi cần; không câu nào chờ quá 8 s.
- Sau 2 tuần chạy thật: tỉ lệ câu `unknown` trong `chatbot_messages` **< 10%**.

### Giai đoạn 0 — Lưới an toàn (0,5 ngày; phần lớn đã có)

1. `scripts/chatbot-e2e-check.js` (đã thêm) vào CI với `--min` tăng dần theo từng giai đoạn (bắt đầu 47).
2. Mỗi lỗi sửa xong thêm câu vào bộ kiểm tra; lấy thêm câu thật từ `chatbot_messages` có `intent = 'unknown'`.

### Giai đoạn 1 — Hết trả lời sai (1,5–2 ngày, ưu tiên cao nhất)

1. **Một nguồn xưng hô cho cả hai chiều.** "Ai là <xưng hô> của tôi/của X" tính nhãn của từng người bằng
   `describeKinship` (cùng hàm của "X là gì của tôi"), rồi so **khớp nguyên nhãn có dấu** với từ hỏi và từ đồng nghĩa
   (bố/cha/ba/tía; mẹ/má/u/bầm…). Bỏ `pathMatchesKinship` so chuỗi con. Trả lời tách "ruột/họ"
   ("Chú ruột: …; chú họ: …"). File: `relationshipEngine.js`, `vietnameseKinshipRules.js`, `intentParserService.js`.
2. **Hiểu từ không dấu theo cụm, không theo từng chữ**: "ba noi" = bà nội, "ong chu" = ông chú, "co toi" = cô tôi;
   khi vẫn mơ hồ ("co" = cô hay cố?) thì hỏi lại. In nhãn luôn có dấu.
3. **Trùng tên ở mọi đường tìm người**: hai người cùng tên → hỏi lại kèm thông tin phân biệt
   ("Đinh Văn Hùng — đời 3, con bà Trần Thị Lan" / "… con bà Lê Thị Cúc"). Gom về một hàm `resolvePerson`.
4. **Sửa thứ tự/điều kiện parser**: "mấy anh chị em", "tôi đời thứ mấy", "em của ông nội tôi", "thủy tổ dòng họ",
   "có ai tên X không".
5. **Thông tin người trả đúng trường được hỏi** (sinh, mất, còn sống, tuổi, quê, tiểu sử) thay cho mẫu cố định.
6. **Câu so sánh hai người** giải thích theo góc nhìn người thứ nhất, không dùng "bạn".

### Giai đoạn 2 — Phủ đủ câu hỏi (2–3 ngày)

1. Ý định mới hoặc mở rộng, đều dùng dữ liệu đã có: "X là ai" (đời, cha mẹ, vợ/chồng, con, sinh/mất), tuổi,
   còn sống, đếm vợ/chồng/con, con trưởng/con thứ N (`children.sort_order`, rồi năm sinh), đời đông nhất,
   ngày giỗ của một người (âm lịch), "sự kiện X khi nào", nhà thờ họ (`hall_address`), "A với B là gì của nhau".
2. Vợ lẽ, con nuôi, con riêng: trả lời **theo quyền xem** quan hệ nhạy cảm (`families.visibility`, chính sách
   `sensitiveRelationVisibility`) — thành viên thường không thấy nếu dòng họ đặt chỉ quản lý được xem.
3. Câu ngoài phạm vi: nói rõ trợ lý chỉ trả lời về gia phả và đưa 3 ví dụ, thay cho "chưa hiểu".
4. Nâng LLM planner (chỉ chạy khi luật không hiểu): thêm vào prompt và `plannerValidatorService` các ý định/thuộc tính
   mới — người gốc có tên, trường của thông tin người, mốc/loại sự kiện, chỉ số thống kê, `unsupported` — kèm
   15–20 ví dụ lấy từ bộ kiểm tra. LLM vẫn chỉ phân loại, không tạo dữ kiện.

### Giai đoạn 3 — Hội thoại mượt (2 ngày)

1. **Đại từ và câu lược chủ ngữ**: thay "ông ấy/bà ấy/người đó/anh ấy…" bằng người vừa nhắc **trước khi** phân tích
   ý định; "Thế còn X?", "Còn X thì sao?" lặp lại ý định trước với người mới. Ghi nhớ người chính sau mọi câu trả lời.
2. **Lưu trí nhớ hội thoại theo cuộc hội thoại trong DB** thay vì RAM (sống qua lúc Render ngủ).
3. **Hỏi lại có trạng thái**: trả 200 kèm `needsClarification` + ứng viên, lưu ý định đang chờ ở server; người dùng bấm
   ứng viên thì trả lời đúng câu gốc. Sửa `handleCandidatePick` và xóa `targetPersonId` sau khi dùng.
4. **Gợi ý theo ngữ cảnh** sau mỗi câu trả lời (dùng `suggestions` server đã trả).

### Giai đoạn 4 — Nhanh và nói tự nhiên (1–1,5 ngày)

1. Không gọi Groq để diễn đạt lại câu trả lời ngắn (danh sách, số, ngày, nhãn quan hệ); chỉ dùng cho lịch sử/kỷ niệm,
   với timeout chat 4 s và không thử lại, quá hạn thì trả bản có sẵn.
2. Ngày kiểu Việt (25/10/1940, kèm âm lịch khi là ngày giỗ); gọi người kèm xưng hô ("ông Bình", "chú Lâm").
3. Giải thích quan hệ bằng tên: "Nam là con chú Lâm; chú Lâm là con ông Bình — em ruột ông nội bạn."
4. Giao diện: `white-space: pre-line`, nút "Thử lại" khi lỗi, đáp "Cảm ơn" đúng ngữ cảnh, ghi thời gian từng bước
   (phân tích, DB, LLM) vào metadata để đo p95.

### Giai đoạn 5 — Quyền và dữ liệu (0,5–1 ngày)

1. Cho hỏi ngay khi đã biết dòng họ; chỉ yêu cầu chọn "bạn là ai" khi câu hỏi cần "tôi".
2. Siết `POST /api/me/context/person`: chỉ gắn hồ sơ chưa có tài khoản, còn sống, có ghi vết; hoặc chỉ lưu "góc nhìn"
   cho chat mà không ghi `accounts.person_id`.
3. Số điện thoại, địa chỉ, email: chỉ trả khi người hỏi có quyền xem trường đó trong hồ sơ; còn lại hướng dẫn mở hồ sơ.

### Giai đoạn 6 — Vòng cải tiến liên tục

Mỗi tuần xem câu `unknown`, câu phải hỏi lại và đánh giá 👍/👎 (thêm nút); bổ sung luật và câu vào bộ kiểm tra.
Chạy bộ kiểm tra **có LLM** bằng key Groq riêng cho môi trường dev mỗi khi đổi prompt.

### Ước lượng

| Giai đoạn | Công sức | Kết quả mong đợi trên bộ kiểm tra |
|---|---|---|
| 0 | 0,5 ngày | Có thước đo trong CI |
| 1 | 1,5–2 ngày | ~62/82, hết câu "sai mà khẳng định" |
| 2 | 2–3 ngày | ~76/82 |
| 3 | 2 ngày | Hội thoại ≥ 4/5 |
| 4 | 1–1,5 ngày | p95 < 1,5 s (không LLM) |
| 5 | 0,5–1 ngày | Hết rủi ro tự gắn hồ sơ, câu riêng tư theo quyền |
| **Tổng** | **~8–10 ngày công** | |

### Cần nhóm quyết định

1. **Trưởng họ/trưởng chi**: thêm trường dữ liệu (ví dụ người đứng đầu dòng họ, từng chi) hay trả "chưa ghi nhận"?
2. **Thông tin liên lạc**: trợ lý có được trả số điện thoại/địa chỉ không, theo quyền nào?
3. **Key Groq cho dev** để chạy bộ kiểm tra có LLM (không dùng key production).
4. **Bước "chọn bạn là ai" trong chat** có được gắn vĩnh viễn tài khoản với hồ sơ như hiện nay không.
