Dưới đây là báo cáo đánh giá độc lập chi tiết về bản diff và 30 câu hỏi thực tế của người dùng Việt Nam.

---

# VIỆC 1: DANH SÁCH LỖI THỰC TẾ (BUGS & VULNERABILITIES)

### 1. Regex `\b` xử lý sai với nguyên âm/ký tự tiếng Việt có dấu (`\bđâu`)
- **File & Dòng:** [`Backend/src/modules/chatbot/typingNormalizer.js:609`](file:///D:/quyet_test/CAP2-dvquyet/Backend/src/modules/chatbot/typingNormalizer.js#L609)
- **Mức độ:** **Trung bình**
- **Đoạn mã liên quan:**
  ```javascript
  const TRAILING_POLITE = /(?:\s+(?:ạ|nhé|nhe|nha|nhỉ|với|voi|vậy|vay|zậy|dzậy|z)|(?<=\b(?:ai|gi|gì|nao|nào|không|khong|nhiêu|nhieu|nhieu|đâu|dau|mấy|may|sao))\s+(?:a|ah))+\s*(?=[?.!]*\s*$)/i;
  ```
- **Tình huống tái hiện cụ thể:**
  - Trong JavaScript RegExp (khi không dùng flag unicode property classes), `\b` là ranh giới từ giữa ký tự ASCII `\w` (`[a-zA-Z0-9_]`) và `\W`. Ký tự `đ` (U+0111) là ký tự ngoài ASCII nên thuộc `\W`.
  - Khi người dùng gõ câu có dấu kết thúc bằng từ đệm: `"Nhà thờ họ ở đâu a?"` hoặc `"Mộ tổ ở đâu ah?"`, vị trí ngay trước chữ `đ` là khoảng trắng (`\W`), chữ `đ` cũng là `\W`. Do đó **không tồn tại ranh giới từ `\b` giữa khoảng trắng và chữ `đ`**.
  - `\bđâu` sẽ **không bao giờ khớp** sau một khoảng trắng. Từ đệm `" a"` hoặc `" ah"` sau `"đâu"` hoàn toàn không bị loại bỏ, câu bị giữ nguyên `"Nhà thờ họ ở đâu a"`, khiến intent parser nhận diện sai intent hoặc trích xuất sai thực thể vị trí.
  - Trớ trêu là nếu người dùng gõ không dấu `"o dau a"` thì `\bdau` bắt đầu bằng `d` (ASCII `\w`) nên lại hoạt động bình thường.

---

### 2. Regex cắt nhầm/biến đổi tên người thật của người Việt: Tên "Tui", "Ko", "Hỏi", và từ "nôi"
- **File & Dòng:** 
  - [`Backend/src/modules/chatbot/typingNormalizer.js:599-601`](file:///D:/quyet_test/CAP2-dvquyet/Backend/src/modules/chatbot/typingNormalizer.js#L599-L601)
  - [`Backend/src/modules/chatbot/typingNormalizer.js:605`](file:///D:/quyet_test/CAP2-dvquyet/Backend/src/modules/chatbot/typingNormalizer.js#L605)
- **Mức độ:** **Cao**
- **Tình huống tái hiện cụ thể:**
  - **Tên "Tui" (tên người thật rất phổ biến ở Trung Bộ và Nam Bộ trong gia phả):**
    - Tại dòng 600: `[/\btui\b/gi, 'tôi', 'toi']`.
    - Người dùng tra cứu: `"Bà Nguyễn Thị Tui sinh năm bao nhiêu?"` hoặc `"Cụ Đinh Tui mất năm nào?"`.
    - `normalizeTyping` biến chuỗi thành `"Bà Nguyễn Thị tôi sinh năm bao nhiêu?"`, `"Cụ Đinh tôi mất năm nào?"`. Database tìm tên `"Nguyễn Thị tôi"` và trả về `PERSON_NOT_FOUND`.
    - Đặc biệt với câu: `"Bác Tui là con ai?"` -> bị đổi thành `"Bác tôi là con ai?"`, thay đổi hoàn toàn ngữ nghĩa từ hỏi về người tên Tui thành hỏi về người bác ruột của chính mình (quan hệ ngôi thứ nhất).
  - **Tên "Ko" (tên người thật, người đồng bào Tây Nguyên như Ê-đê, Ba Na trong gia phả hoặc người Kinh tên Ko):**
    - Tại dòng 599: `[/\b(ko|k0|hok)\b/gi, 'không', 'khong']`.
    - Người dùng hỏi: `"Đinh Ko là con ai?"` hoặc `"Tìm cụ Y Ko Niê"`.
    - `normalizeTyping` biến thành `"Đinh không là con ai?"`, `"Tìm cụ Y không Niê"`. Tên người bị phá hủy hoàn toàn.
  - **Tên "Hỏi" (tên người thật, ví dụ "Đinh Văn Hỏi"):**
    - Tại dòng 605: `LEADING_POLITE` có nhánh `|(?:cho\s+)?(?:hỏi|hoi)(?:\s+(?:chút|chut))?(?=\s)`.
    - Người dùng hỏi: `"Hỏi là con ai?"` hoặc `"Hỏi sinh năm mấy?"`.
    - `withoutLead` coi chữ `"Hỏi "` là lời xã giao đầu câu và cắt bỏ, chuỗi còn lại `"là con ai?"` (3 từ $\ge$ 2), làm biến mất hoàn toàn chủ ngữ của câu.
  - **Từ "nôi" trong "cái nôi" bị đổi thành "nội":**
    - Tại dòng 601: `[/\b(nọi|nôi)\b/gi, 'nội', 'noi']`.
    - Trong app gia phả/dòng họ, người dùng rất hay hỏi lịch sử dòng họ: `"Cái nôi của dòng họ Đinh ở đâu?"`.
    - `normalizeTyping` đổi `"nôi"` thành `"nội"` $\rightarrow$ `"Cái nội của dòng họ Đinh ở đâu?"`.

---

### 3. Cắt nhầm tên người ở cuối câu: "Văn A", "Thị Nha", "Văn Vay", "Văn Với", "Văn Voi", "Văn Di", "Văn Thế"
- **File & Dòng:** 
  - [`Backend/scripts/chatbot-unknown-report.js:120`](file:///D:/quyet_test/CAP2-dvquyet/Backend/scripts/chatbot-unknown-report.js#L120)
  - [`Backend/src/modules/chatbot/typingNormalizer.js:609`](file:///D:/quyet_test/CAP2-dvquyet/Backend/src/modules/chatbot/typingNormalizer.js#L609)
- **Mức độ:** **Cao**
- **Tình huống tái hiện cụ thể:**
  - **Trong `chatbot-unknown-report.js:120`:**
    ```javascript
    .replace(/\s+(a|ah|ạ|nhe|nha|di|vay|the)$/, '')
    ```
    - Khi người dùng hỏi các câu như: `"Tìm Nguyễn Văn A"`, `"Ai là Nguyễn Văn A"`, `"Thông tin về Đinh Văn A"`, `"Cụ Đinh Văn A"`:
    - Regex xóa không điều kiện `\s+a$` ở cuối chuỗi. Tên `"Nguyễn Văn A"` bị chặt đuôi thành `"Nguyễn Văn"`!
    - Tương tự với các tên người Việt có chữ cuối trùng danh sách:
      - `"Đinh Thị Nha"` $\rightarrow$ bị cắt thành `"Đinh Thị"`.
      - `"Phạm Văn Di"` / `"Vũ Thị Di"` $\rightarrow$ bị cắt thành `"Phạm Văn"` / `"Vũ Thị"`.
      - `"Lê Văn Thế"` $\rightarrow$ bị cắt thành `"Lê Văn"`.
      - `"Nguyễn Văn Vay"` $\rightarrow$ bị cắt thành `"Nguyễn Văn"`.
    - Hậu quả: Báo cáo thống kê câu chưa hiểu (`groupUnknownQuestions`) gom nhầm toàn bộ các câu hỏi về những người này thành `"Nguyễn Văn"` / `"Đinh Thị"`.
    - *(Lưu ý thêm: ở dòng 120 có từ `ạ` nhưng trước đó ở dòng 114 đã chạy `stripDiacritics` và dòng 116 đã lọc `[^a-z0-9\s]`, nên `ạ` ở dòng 120 là dead pattern).*
  - **Trong `typingNormalizer.js:609` (`TRAILING_POLITE`):**
    - Nhóm đầu tiên `(?:\s+(?:ạ|nhé|nhe|nha|nhỉ|với|voi|vậy|vay|zậy|dzậy|z))` **không có lookbehind từ để hỏi**.
    - Khi người dùng hỏi: `"Ai là vợ của ông Trần Văn Với?"` hoặc `"Ai là cha của Nguyễn Văn Vay?"` hoặc `"Tìm thông tin Lê Văn Voi"` hoặc `"Tìm cụ Đinh Thị Nha"`:
    - Regex khớp `" Với?"`, `" Vay?"`, `" Voi"`, `" Nha"` ở cuối câu và xóa sạch tên riêng.
    - Kết quả: `"Ai là vợ của ông Trần Văn Với?"` bị biến thành `"Ai là vợ của ông Trần Văn?"`. Bot sẽ tra cứu nhầm vợ của cụ Trần Văn (thế hệ cha) thay vì Trần Văn Với.

---

### 4. `ambiguityResponse` đánh rơi trường `relationshipPath`, vi phạm API contract của nút "Xem trên cây"
- **File & Dòng:** [`Backend/src/modules/chatbot/chatbotController.js:276`](file:///D:/quyet_test/CAP2-dvquyet/Backend/src/modules/chatbot/chatbotController.js#L276)
- **Mức độ:** **Trung bình**
- **Đoạn mã liên quan:**
  ```javascript
  body.personIds = withTreeFields(body).personIds;
  body.messageId = await storeTurnAnswer(res, body);
  return res.status(200).json(body);
  ```
- **Tình huống tái hiện cụ thể:**
  - `withTreeFields(payload)` trả về một object mới gồm cả `personIds` và `relationshipPath` (luôn là mảng rỗng `[]` đối với các intent quan hệ như `find_relationship`, `compare_relationship` theo quy ước mới).
  - Tuy nhiên, tại dòng 276, hàm chỉ gán duy nhất: `body.personIds = withTreeFields(body).personIds;`, bỏ qua toàn bộ phần còn lại.
  - Khi một câu hỏi quan hệ rơi vào trường hợp trùng tên cần hỏi lại (ví dụ hỏi quan hệ với một người có 2 người trùng tên trong dòng họ):
    - Phản hồi trả về có `success: true`, `intent: 'find_relationship'`, `needsClarification: true`.
    - Nhưng trường `relationshipPath` **hoàn toàn không tồn tại (`undefined`)**.
    - Điều này làm vi phạm điều kiện kiểm tra tại [`Backend/scripts/chatbot-e2e-check.js:64-67`](file:///D:/quyet_test/CAP2-dvquyet/Backend/scripts/chatbot-e2e-check.js#L64-L67) và khiến frontend xử lý nút "Xem trên cây" có thể bị lỗi `TypeError` hoặc không mở được cây quan hệ.

---

### 5. Lỗi logic trong `collectPersonIds`: Gọi thừa `add(payload.sourcePerson)` vô điều kiện, làm vô hiệu hóa bộ lọc loại bỏ chính người hỏi
- **File & Dòng:** [`Backend/src/modules/chatbot/chatbotResponseMeta.js:526-529`](file:///D:/quyet_test/CAP2-dvquyet/Backend/src/modules/chatbot/chatbotResponseMeta.js#L526-L529)
- **Mức độ:** **Trung bình**
- **Đoạn mã liên quan:**
  ```javascript
  const source = toId(payload.sourcePerson?.id);
  (payload.people || []).forEach(add);
  add(payload.targetPerson);
  add(payload.subjectPerson);
  add(payload.person);
  if (source && source !== me) add(payload.sourcePerson); // Dòng 526: lọc bỏ me
  (payload.pathNodes || []).forEach(add);
  (payload.pathPeople || []).forEach(add);
  add(payload.sourcePerson);                              // Dòng 529: add lại vô điều kiện!
  (payload.candidates || []).forEach(add);
  ```
- **Tình huống tái hiện cụ thể:**
  - Ở dòng 526, tác giả đã chủ đích viết: `if (source && source !== me) add(payload.sourcePerson);` để không đưa ID của chính người đang hỏi (`me`) vào danh sách đối tượng trọng tâm.
  - Nhưng chỉ 3 dòng sau, tại dòng 529, code lại gọi `add(payload.sourcePerson);` mà không hề kiểm tra `source !== me`.
  - Hậu quả: Dòng 526 trở thành dead logic vô nghĩa. ID của chính người hỏi (`currentMemberId`) vẫn luôn bị nhét vào `personIds`, khiến danh sách ID trả về cho client để hiển thị trên cây luôn bao gồm cả người hỏi.

---

### 6. Script `chatbot-unknown-report.js` có nguy cơ crash DB vì dùng `JSON_EXTRACT` trực tiếp trong SQL
- **File & Dòng:** [`Backend/scripts/chatbot-unknown-report.js:181`](file:///D:/quyet_test/CAP2-dvquyet/Backend/scripts/chatbot-unknown-report.js#L181)
- **Mức độ:** **Trung bình**
- **Đoạn mã liên quan:**
  ```sql
  SELECT intent, metadata, created_at
  FROM chatbot_messages
  WHERE ${assistantFilter}
    AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    AND (intent = 'unknown' OR JSON_EXTRACT(metadata, '$.fallback') IS NOT NULL)
  ```
- **Tình huống tái hiện cụ thể:**
  - Trong MySQL, nếu cột `metadata` được lưu kiểu `TEXT` hoặc `VARCHAR` (không phải kiểu native `JSON`) và có bất kỳ dòng nào chứa chuỗi rỗng `""`, chuỗi lỗi `"undefined"`, hoặc dữ liệu cũ không đúng định dạng JSON:
  - Hàm `JSON_EXTRACT(metadata, '$.fallback')` sẽ quăng lỗi ngay lập tức:
    `ERROR 3141 (22032): Invalid JSON text in argument 1 to function json_extract`
  - Toàn bộ script `chatbot-unknown-report.js` bị crash và dừng tiến trình thay vì đọc và lọc dữ liệu an toàn bằng hàm `parseMetadata` sẵn có trong Node.js.

---

### 7. Lỗ hổng phân quyền / toàn vẹn: Thiếu kiểm tra quyền truy cập dòng họ (`canAccessClan`) trong API feedback
- **File & Dòng:** [`Backend/src/modules/chatbot/chatbotFeedbackService.js:466-474`](file:///D:/quyet_test/CAP2-dvquyet/Backend/src/modules/chatbot/chatbotFeedbackService.js#L466-L474)
- **Mức độ:** **Trung bình**
- **Tình huống tái hiện cụ thể:**
  - Tất cả các API của chatbot (`ask`, `history`, `suggestions`, `getRelationshipById`) đều bắt buộc kiểm tra `await canAccessClan(req, clanId, currentMemberId)`.
  - Tuy nhiên, trong `saveFeedback`, hệ thống chỉ kiểm tra `Number(message.account_id) === Number(accountId)` mà **không hề kiểm tra quyền truy cập hiện tại đối với `message.clan_id`**.
  - Nếu một thành viên đã bị quản trị viên loại bỏ (kick) khỏi dòng họ hoặc tự rời dòng họ, token của họ vẫn hợp lệ thì họ vẫn có thể gọi `POST /api/chatbot/messages/:id/feedback` để gửi đánh giá tiêu cực và comment quấy phá vào dữ liệu dòng họ đó (`clan_id`).
  - Ngoài ra, nếu cơ sở dữ liệu `chatbot_messages` không có cột `account_id` (hệ thống vốn hỗ trợ bảng không có cột này, xem `columns.has('account_id')` trong `chatbotController.js`), `message.account_id` trả về `undefined` $\rightarrow$ `Number(undefined)` là `NaN` $\rightarrow$ `NaN !== Number(accountId)` luôn đúng, dẫn đến 100% người dùng hợp lệ đều bị chặn lỗi `403 Forbidden`.

---

### 8. Bỏ sót đại từ nhân xưng `tớ` trong `parseRelationshipToCurrentUser`
- **File & Dòng:** [`Backend/src/modules/chatbot/intentParserService.js:574`](file:///D:/quyet_test/CAP2-dvquyet/Backend/src/modules/chatbot/intentParserService.js#L574)
- **Mức độ:** **Thấp**
- **Đoạn mã liên quan:**
  ```javascript
  const match = text.match(/^(.+?)\s+(?:là|la)\s+(?:gì|gi)\s+(?:của|cua)\s+(tôi|toi|mình|minh|con|em|cháu|chau)\??$/i);
  ```
- **Tình huống tái hiện cụ thể:**
  - Tại đầu file [`intentParserService.js:4`](file:///D:/quyet_test/CAP2-dvquyet/Backend/src/modules/chatbot/intentParserService.js#L4), hệ thống định nghĩa `SELF_WORD_PATTERN = '(?:tôi|toi|mình|minh|tui|tớ)';` và `LEADING_POLITE` cũng có `tớ`.
  - Nhưng trong `parseRelationshipToCurrentUser`, danh sách đại từ nhân xưng chỉ có `(tôi|toi|mình|minh|con|em|cháu|chau)` mà thiếu hẳn `tớ`.
  - Người dùng hỏi: *"Đinh Văn Nam là gì của tớ?"* $\rightarrow$ Regex không khớp, bị rơi xuống fallback.

---

### 9. `withoutTail` không loại bỏ được từ đệm trong câu hỏi ngắn 1 từ ngữ cảnh
- **File & Dòng:** [`Backend/src/modules/chatbot/typingNormalizer.js:628`](file:///D:/quyet_test/CAP2-dvquyet/Backend/src/modules/chatbot/typingNormalizer.js#L628)
- **Mức độ:** **Thấp**
- **Đoạn mã liên quan:**
  ```javascript
  const withoutTail = text.replace(TRAILING_POLITE, '');
  if (withoutTail && withoutTail.split(/\s+/).length >= 2) text = withoutTail;
  ```
- **Tình huống tái hiện cụ thể:**
  - Điều kiện kiểm tra `withoutTail.split(/\s+/).length >= 2` khiến các câu hỏi ngữ cảnh ngắn gồm 1 danh từ + 1 từ đệm/xã giao bị bỏ qua việc cắt đuôi:
    - *"Ai ạ?"* $\rightarrow$ `withoutTail` là `"Ai"` (1 từ, $< 2$). Giữ nguyên `"Ai ạ?"`.
    - *"Bác ạ?"* $\rightarrow$ giữ nguyên `"Bác ạ?"`.
    - *"Ai vậy?"* $\rightarrow$ giữ nguyên `"Ai vậy?"`.
  - Các câu này giữ nguyên từ đệm, gây khó khăn cho parser khi xử lý hội thoại nối tiếp (ellipsis/follow-up).

---

# VIỆC 2: 30 CÂU HỎI NGƯỜI DÙNG THỰC TẾ GIA PHẢ MÀ BỘ LUẬT HIỆN TẠI DỄ BỎ SÓT / HIỂU SAI

### Nhóm 1: Xưng hô vùng miền Nam Bộ & Trung Bộ ("tía", "má", "ông cố", "dượng", "mợ", "thím")
1. **"tía tui tên là gì vậy bot"**
   - *Lý do luật khó hiểu:* Luật chỉ chuẩn hóa "ba", "bo" thành cha; "tía" chưa nằm trong từ điển quan hệ chính thức; "tui" bị ép đổi thành "tôi".
2. **"má của đinh văn lâm là ai"**
   - *Lý do luật khó hiểu:* "má" chưa được chuẩn hóa triệt để trong các hàm bóc tách biểu thức quan hệ có tên riêng dạng `"má của X"`.
3. **"ông cố nội của tôi là ai"**
   - *Lý do luật khó hiểu:* Quan hệ 3 đời ("ông cố nội" = cụ nội, cha của ông nội). Luật chỉ mới giải quyết "ông nội", "bà nội", chưa có luật phân tích chuỗi "ông cố nội".
4. **"bà cố tui thọ bao nhiêu tuổi"**
   - *Lý do luật khó hiểu:* "bà cố" (cụ bà) kết hợp đại từ "tui" và từ chỉ tuổi thọ "thọ bao nhiêu tuổi" (luật chỉ bắt "bao nhiêu tuổi", "sinh năm nào", "mất năm nào").
5. **"dượng út tên gì"**
   - *Lý do luật khó hiểu:* "dượng" (chồng của dì hoặc cô) và thứ bậc "út" là cách gọi đặc trưng Nam Bộ, không có tên riêng đi kèm, engine quan hệ chưa có rule suy diễn dượng.
6. **"mợ hai là ai trong họ mình"**
   - *Lý do luật khó hiểu:* "mợ" (vợ của cậu) kết hợp thứ bậc miền Nam ("hai" = con trưởng), luật hiện tại không map được "mợ" sang vợ của anh trai mẹ.
7. **"thím ba có mấy người con"**
   - *Lý do luật khó hiểu:* "thím" (vợ của chú) + thứ "ba". Luật liệt kê con chỉ bắt "con của X" với X là tên cụ thể hoặc cha/mẹ, không hiểu danh xưng họ hàng bắc cầu "thím ba".
8. **"anh hai của tía tui là ai"**
   - *Lý do luật khó hiểu:* Chuỗi quan hệ khẩu ngữ lồng ghép miền Nam ("anh hai" = bác trưởng, "tía" = cha, "tui" = tôi).
9. **"chú út có vợ chưa"**
   - *Lý do luật khó hiểu:* Từ chỉ thứ bậc "út" đi kèm câu hỏi tình trạng hôn nhân ("có vợ chưa"), luật hiện tại bắt theo tên riêng hoặc "tôi".

### Nhóm 2: Teencode, viết tắt chat hiện đại ("j", "k", "dc", "ntn", "sao")
10. **"dinh van hoa la j cua minh"**
    - *Lý do luật khó hiểu:* Dùng teencode `"j"` thay vì `"gì"`. Regex `parseRelationshipToCurrentUser` chỉ bắt `(?:gì|gi)`, lập tức trượt rule.
11. **"ong noi toi ten j the"**
    - *Lý do luật khó hiểu:* Kết hợp `"j"` (gì) và từ đệm `"the"` (thế).
12. **"cho hỏi họ mik có bn ng z"**
    - *Lý do luật khó hiểu:* Viết tắt `"mik"` (mình), `"ng"` (người), `"z"` (vậy). Mặc dù `"bn"` được đổi thành bao nhiêu, nhưng chuỗi `"mik có bn ng z"` không khớp intent thống kê thành viên.
13. **"bác bình sn bao nhiu v"**
    - *Lý do luật khó hiểu:* Viết tắt `"sn"` (sinh năm), `"bao nhiu"` (lỗi gõ/teencode), `"v"` (vậy).
14. **"ai qh gan nhat vs toi"**
    - *Lý do luật khó hiểu:* Viết tắt `"qh"` (quan hệ), `"vs"` (với), câu hỏi dạng khoảng cách quan hệ gần nhất chưa có rule.
15. **"dong ho co ai lam quan to k"**
    - *Lý do luật khó hiểu:* Dùng `"k"` ở cuối câu thay cho không. Bảng `ABBREVIATIONS` chỉ bắt `\b(ko|k0|hok)\b`, không bắt chữ `k` đơn lẻ vì sợ cắt nhầm chữ cái.

### Nhóm 3: Không dấu hoàn toàn, cấu trúc đảo, ngôn ngữ nói
16. **"dinh van binh voi dinh van hoa ai la anh ai la em"**
    - *Lý do luật khó hiểu:* Câu hỏi so sánh thứ bậc giữa 2 người không dấu theo cấu trúc dân dã ("ai là anh ai là em"), luật `compare_relationship` chỉ bắt mẫu "A và B có quan hệ gì".
17. **"trong ho ai la nguoi lon tuoi nhat"**
    - *Lý do luật khó hiểu:* Câu hỏi thống kê cực trị (già nhất, lớn tuổi nhất), hiện tại intent parser chủ yếu phục vụ đếm số lượng (`stats_count`) hoặc tra cứu cá nhân.
18. **"dinh thi mai lay ai"**
    - *Lý do luật khó hiểu:* "lấy ai" (kết hôn với ai / chồng là ai). Luật `find_spouse` bắt "chồng/vợ của X là ai", không có pattern "X lấy ai".
19. **"nha tho to nam o dau"**
    - *Lý do luật khó hiểu:* Câu hỏi địa điểm nhà thờ tổ không dấu, parser lịch sử/thông tin dòng họ thường tìm "thông tin dòng họ" hoặc "lịch sử".
20. **"ong to ho minh ten la gi"**
    - *Lý do luật khó hiểu:* "ông tổ" / "thủy tổ" / "tiên tổ". Không có tên riêng, câu hỏi danh tính người khởi tổ dòng họ.

### Nhóm 4: Sai chính tả l/n, ch/tr, s/x, d/gi/r, hỏi/ngã
21. **"bố tôi sinh lăm nào"**
    - *Lý do luật khó hiểu:* Lỗi phát âm l/n phổ biến vùng đồng bằng Bắc Bộ ("lăm" thay vì "năm"). Regex tìm năm sinh (`/sinh năm/`) không khớp.
22. **"bác đinh văn bình mất dỗ ngày lào"**
    - *Lý do luật khó hiểu:* Lỗi dấu ngã/hỏi ("dỗ" thay vì "giỗ"), l/n ("lào" thay vì "nào"), d/gi ("dỗ" thay vì "giỗ").
23. **"ông lội tôi tên là gì"**
    - *Lý do luật khó hiểu:* Lỗi l/n ("lội" thay vì "nội"). Bảng `ABBREVIATIONS` chỉ bắt lỗi gõ phím `nọi`, `nôi` chứ không bắt lỗi phát âm `lội`.
24. **"ai chưởng họ vậy bạn"**
    - *Lý do luật khó hiểu:* Sai chính tả tr/ch ("chưởng họ" thay vì "trưởng họ").

### Nhóm 5: Câu hỏi dài dòng, ngữ cảnh kể chuyện trước khi hỏi
25. **"nhà tôi ở bên nhánh bác hai mà lâu ngày không về quê không biết cụ hòa là vai vế gì với tôi"**
    - *Lý do luật khó hiểu:* Người dùng kể chuyện dài trước khi chốt câu hỏi. Rule dựa vào `stripQuestionNoise` chỉ cắt được vài từ xã giao đầu câu, gặp câu kể dài sẽ không bóc tách được `cụ hòa` và `vai vế gì với tôi`.
26. **"bố tôi bảo nhà mình có cụ làm quan ngày xưa thế cụ đó tên là gì"**
    - *Lý do luật khó hiểu:* Câu hỏi nhiều mệnh đề phức hợp, chủ ngữ câu hỏi nằm ở vế sau, rule không bóc tách được câu hỏi cốt lõi.
27. **"tôi muốn tìm hiểu xem nhánh của ông bình sinh năm 1940 có bao nhiêu người cả trai lẫn gái"**
    - *Lý do luật khó hiểu:* Câu phức dài lòng vòng ("tôi muốn tìm hiểu xem...", "cả trai lẫn gái"), kết hợp lọc theo nhánh con cháu của một người cụ thể.

### Nhóm 6: Quan hệ gia đình phức tạp, dâu/rể, ngoại tộc
28. **"vợ của anh trai bố tôi thì gọi là gì"**
    - *Lý do luật khó hiểu:* Chuỗi biểu thức xưng hô bắc cầu 3 bước ("vợ của anh trai bố") kết hợp câu hỏi xưng hô ("gọi là gì").
29. **"dâu trưởng của họ mình hiện tại là ai"**
    - *Lý do luật khó hiểu:* Khái niệm "dâu trưởng" (vợ của người con trai trưởng nhánh trưởng), engine cần truy vấn kết hợp vai vế trưởng họ và quan hệ hôn nhân.
30. **"con của cô ruột tôi thì là gì của tôi"**
    - *Lý do luật khó hiểu:* Quan hệ họ hàng qua dòng nữ ("cô ruột" $\rightarrow$ con của cô là anh em họ/con cô con cậu). Luật hiện tại chủ yếu xử lý tên trực tiếp hoặc chuỗi cha/mẹ/con.
