# Việc tiếp theo: trợ lý AI trả lời (bàn giao cho lần làm sau)

Ghi ngày 15/10/2026. Lý do, số liệu kiểm tra và bối cảnh đầy đủ: [KE_HOACH_AI_TRA_LOI.md](KE_HOACH_AI_TRA_LOI.md).
Số dòng trong file này tính theo commit `1f98244`; sau khi sửa có thể lệch vài dòng, tìm theo tên hàm.

## Bắt đầu phiên sau

1. `git pull`, đọc file này (danh sách việc) và `KE_HOACH_AI_TRA_LOI.md` (lý do).
2. Chạy mốc hiện tại: `cd Backend && node scripts/chatbot-e2e-check.js`
   → lúc ghi: **47/82 câu đúng, hội thoại 0/5**. Thêm `--all` để xem từng câu.
3. Làm lần lượt **Giai đoạn 1 → 5**. Xong mỗi giai đoạn:
   - Backend `npm test`; Frontend `npm test && npx eslint src && npx vite build` (0 lỗi).
   - `node scripts/chatbot-e2e-check.js --min <mốc của giai đoạn>`.
   - Commit + push `main`, đánh dấu ô bên dưới, cập nhật bảng **Tiến độ**.
4. Nếu phải dừng giữa chừng: chỉ commit phần đã qua test, ghi lại việc đang dở ở mục **Ghi chú phiên trước**.

## Quy ước (đã từng gây lỗi)

- **Không** chạy migration/server với `Backend/.env` (DB Aiven production). Kiểm tra bằng DB giả (`tests/helpers.mockDb.js`, `scripts/chatbot-e2e-check.js`).
- File trong repo dùng CRLF. Script vá có regex (`\s`, `\b`, `\.`) phải tạo bằng công cụ ghi file, **không** qua heredoc bash (bị mất một dấu `\`). Vá xong grep lại dòng đã sửa và chạy test.
- Mỗi lỗi sửa xong thêm câu tương ứng vào `scripts/chatbot-e2e-check.js` (và test đơn vị nếu được).
- Không gọi Groq bằng key production để chạy bộ kiểm tra.

## Tiến độ

| Giai đoạn | Trạng thái | E2E sau giai đoạn | Commit |
|---|---|---|---|
| 0 – CI | xong | 47/82 (ngày cố định 15/10/2026) | GĐ0 |
| 1 – Hết câu trả lời sai | xong | 69/82, hội thoại 1/5 | GĐ1 |
| 2 – Phủ câu hỏi | xong | 82/82, hội thoại 1/5 | GĐ2 |
| 3 – Hội thoại | xong | 82/82, hội thoại 7/7 | GĐ3 |
| 4 – Nhanh, nói tự nhiên | chưa làm | giữ điểm, p95 < 1,5 s không LLM | |
| 5 – Quyền và dữ liệu | chưa làm | giữ điểm | |

Ước lượng: tổng ~1,2–1,9 triệu token (~8–10 ngày công nếu làm tay).

## Giai đoạn 0 — Lưới an toàn (~50k token)

- [x] Thêm bước `node scripts/chatbot-e2e-check.js --min 47` vào job backend trong `.github/workflows/ci.yml`; nâng `--min` sau mỗi giai đoạn.
  Script cố định "hôm nay" = 15/10/2026 (đổi bằng biến `CHATBOT_E2E_NOW`) để câu về giỗ/sinh nhật không đổi theo ngày chạy.

## Giai đoạn 1 — Hết câu trả lời sai (~350–500k token, mục tiêu ≥ 62/82)

- [x] **1.1 Một nguồn xưng hô cho cả hai chiều.** `relationshipEngine.js:600 findPeopleByKinship` đang lọc bằng
  `vietnameseKinshipRules.js:288 pathMatchesKinship` — so **chuỗi con trên nhãn đã bỏ dấu** ("cha" nằm trong "chau",
  "co" khớp cô/cố/con). Trong khi `buildRelationshipResult` (`relationshipEngine.js:~402`) đã tính nhãn đúng bằng
  `describeKinship` (`genealogy/core/kinshipNaming.js:333`). Sửa: lọc theo `relationshipLabel`/`kinshipCategory` từ
  `describeKinship`, so **khớp nguyên nhãn có dấu** (bỏ hậu tố "(đã kết thúc)") với từ hỏi + đồng nghĩa
  (bố/cha/ba/tía, mẹ/má/u/bầm…); trả lời tách "ruột/họ".
  Câu phải đúng: Bà nội → Trần Thị Lan · Cô → Đinh Thị Hạnh · Cụ nội → Đinh Công Thành (không có Đinh Thị Mai) ·
  Chú → Đinh Văn Hùng (không có Đinh Văn Bình) · Ông chú → Đinh Văn Bình · Bà cô → Đinh Thị Mai · Em họ → Đinh Văn Nam.
- [x] **1.2 Hiểu không dấu theo cụm.** `intentParserService.js:13 normalizeSynonyms` đổi "ba" → "cha" nên "bà nội" thành
  "cha nội". Phân tích trên chuỗi **có dấu** trước; chỉ khi người dùng gõ không dấu mới tra bảng cụm
  ("ba noi" = bà nội, "ong chu" = ông chú, "ba co" = bà cô, "cu noi" = cụ nội, "co toi" = cô tôi); còn mơ hồ ("co" = cô/cố?)
  thì hỏi lại. `parseKinshipLookup` (`:91`) ưu tiên cụm dài; nhãn in ra luôn có dấu (đang in "cu/chu/co của bạn").
- [x] **1.3 Trùng tên phải hỏi lại.** `memberSearchService.js:249` chỉ coi là mơ hồ khi điểm < 0.98, nên hai người cùng tên
  (điểm 1.0) bị chọn ngầm. Sửa: ≥ 2 ứng viên cùng tên chuẩn hóa → `ambiguous`; câu hỏi lại kèm đời, cha/mẹ, năm sinh.
  Áp cho `handleNamedRelationshipExpression` (`chatbotController.js:757`) và mọi chỗ gọi `resolvePerson`.
  Câu phải đúng: "Con của Đinh Văn Hùng là ai?" → hỏi lại Hùng nào.
- [x] **1.4 Sửa thứ tự/điều kiện parser** (`intentParserService.js`):
  - "Tôi có mấy anh chị em?" bị `parseStatsCount` (`:349`) hiểu "chị" thành "chi" (chi họ) → chặn khi có "anh chị em/anh em/chị em".
  - "Tôi đời thứ mấy?" phải ra `find_generation` (người hỏi), không phải thống kê số đời.
  - "Ai là em của ông nội tôi?" phải đi biểu thức chuỗi (`parseRelationshipExpression`), không tra một từ.
  - "Thủy tổ của dòng họ là ai?": `parseAncestors` (`:300`) + `extractSubjectAfterPreposition` (`:280`) đang coi
    "dòng họ là ai" là tên người → chủ thể "dòng họ/họ/gia phả" nghĩa là thủy tổ (người đời đầu không có cha mẹ trong cây).
  - "Có ai tên Lan không?": `parsePersonExists` (`:36`) còn dính chữ "ai" ("Ai Lan") → bỏ "ai tên/ai có tên/người tên".
- [x] **1.5 Thông tin người trả đúng trường được hỏi.** `dataIntentHandlers.js:110 handlePersonInfoIntent` luôn in
  đời/ngày sinh/quê theo một mẫu → "Hòa mất năm nào?" in ngày sinh. Trả theo trường: mất (death_date, độ chính xác),
  còn sống (is_living), tuổi (chỉ khi ngày sinh exact/year), quê, tiểu sử. `parsePersonInfo` (`:433`) không tách được tên
  trong "Quê quán của Đinh Văn Lâm ở đâu?".
- [x] **1.6 Câu so sánh hai người** (`chatbotController.js:400 handleCompareRelationship`): giải thích theo góc nhìn người A,
  không dùng "cha của bạn…".

## Giai đoạn 2 — Phủ đủ câu hỏi (~300–450k token, mục tiêu ≥ 76/82)

- [x] 2.1 "X là ai?", "Ông Bình là ai?" → giới thiệu: đời, cha mẹ, vợ/chồng, con, sinh/mất (ý định mới hoặc mở rộng `person_info`).
- [x] 2.2 Tuổi, còn sống không.
- [x] 2.3 Đếm vợ/chồng/con ("X có mấy vợ", "mấy người con"); vợ lẽ (`families.union_type = 'concubine'`), con nuôi/con riêng
  (`children.child_type`) — tôn trọng `families.visibility = 'managers'` với thành viên thường (xem `modules/genealogy/treeVisibility.js`).
- [x] 2.4 Con trưởng/con thứ N (`children.sort_order`, rồi năm sinh); "Đời nào đông người nhất".
- [x] 2.5 Ngày giỗ của một người: `death_anniversary_lunar` hoặc ngày mất exact → ngày âm + ngày dương sắp tới
  (dùng `convertLunar2SolarDate`/`solarIsoToLunar` export ở cuối `calendar/calendar.controller.js`). Kiểm cột tồn tại trước khi đưa vào SELECT.
- [x] 2.6 Sự kiện theo tên ("Họp họ năm nay tổ chức khi nào?") — tìm theo từ khóa trong `events`/`calendar_events` (theo quyền).
- [x] 2.7 Nhà thờ họ: thêm `clans.hall_address` vào `handleClanHistoryIntent` (`dataIntentHandlers.js:216`) và vào
  `buildExplainData` (`chatbotPrompts.js:67`, hiện thiếu).
- [x] 2.8 "Ai là trưởng họ?" — chờ quyết định dữ liệu; tạm trả "gia phả chưa ghi nhận trưởng họ".
- [x] 2.9 "A với B là gì của nhau", kể cả khi một bên là "tôi".
- [x] 2.10 Câu ngoài phạm vi: nói rõ chỉ trả lời về gia phả + 3 ví dụ, thay câu "Tôi chưa hiểu rõ câu hỏi…" ở nhánh `unknown` cuối `exports.ask`.
- [x] 2.11 LLM planner (chỉ khi luật không hiểu): thêm ý định/thuộc tính mới vào `buildPlanPrompt` (`chatbotPrompts.js:1`),
  `VALID_INTENTS` (`plannerValidatorService.js:1`), `DETERMINISTIC_RULE_INTENTS` (`queryPlannerService.js:7`); 15–20 ví dụ lấy từ bộ e2e.

## Giai đoạn 3 — Hội thoại mượt (~250–400k token, mục tiêu hội thoại ≥ 4/5)

- [x] 3.1 Thay đại từ ("ông ấy/bà ấy/người đó…", danh sách ở `coreferenceResolver.js:7`) bằng người vừa nhắc **trước khi** gọi parser.
  Hiện chỉ thử ở nhánh `unknown` (`chatbotController.js:1349`) nên "Vợ của ông ấy là ai?" bị tìm người tên "ong ay".
- [x] 3.2 "Thế còn X?", "Còn X thì sao?" → lặp lại ý định trước với người mới (lưu ý định + thuộc tính lượt trước).
- [x] 3.3 `memoryPatchFromResponse` (`chatbotController.js:1084`): ghi người chính cho mọi câu trả lời về một người.
- [x] 3.4 Lưu bộ nhớ hội thoại theo cuộc hội thoại trong DB thay cho `Map` trong RAM (`conversationMemoryService.js:4`).
- [x] 3.5 Hỏi lại có trạng thái: thay HTTP 409/404 (`ambiguityResponse :285`, `notFoundResponse :306`) bằng 200 + `needsClarification`
  + ứng viên, lưu ý định đang chờ; client gửi lựa chọn → trả lời đúng câu gốc. Frontend `ChatWindow.jsx:110 handleCandidatePick`
  đang thay câu hỏi bằng "Tôi gọi X bằng gì?" và không xóa `selectedTargetId`.
- [x] 3.6 Chip gợi ý theo ngữ cảnh: dùng `suggestions` server trả kèm câu trả lời (ChatWindow chỉ tải gợi ý một lần ở `:47`).

## Giai đoạn 4 — Nhanh và nói tự nhiên (~150–250k token)

- [ ] 4.1 Bỏ gọi Groq "diễn đạt lại" cho câu trả lời ngắn: `explainResolvedIntent` (`dataIntentHandlers.js:65`) đang gọi cho
  thông tin người, kỷ niệm, sự kiện, chào hỏi; `relationshipExplanationAI` cho biểu thức quan hệ. Chỉ giữ cho lịch sử/kỷ niệm,
  timeout chat ~4 s, không thử lại (`groqClient.js:13`, biến `GROQ_TIMEOUT_MS`, `GROQ_MAX_RETRIES`).
- [ ] 4.2 Ngày kiểu Việt dd/mm/yyyy (kèm âm lịch cho ngày giỗ) ở mọi câu trả lời (đang in `1940-10-25`).
- [ ] 4.3 Giải thích đường quan hệ bằng tên ("Nam là con chú Lâm; chú Lâm là con ông Bình — em ruột ông nội bạn")
  thay cho "vì cha của bạn, rồi đến cha của người đó…".
- [ ] 4.4 Frontend: `white-space: pre-line` cho `.ai-message p` (`AIChat.css:226`); nút "Thử lại" khi lỗi; "Cảm ơn" đáp đúng ngữ cảnh (đang chào lại).
- [ ] 4.5 Ghi thời gian từng bước (phân tích, DB, LLM) vào metadata để đo p95.

## Giai đoạn 5 — Quyền và dữ liệu (~100–200k token)

- [ ] 5.1 Cho chat ngay khi biết dòng họ: `ChatWindow.jsx:37` đang đòi `currentMemberId`; chỉ yêu cầu chọn người khi câu cần "tôi"
  (backend đã trả `needsPersonSelection`).
- [ ] 5.2 Siết `me.controller.js:513 setCurrentPerson`: hiện cho tự gắn với **bất kỳ** hồ sơ trong họ và ghi `accounts.person_id`
  nếu đang trống. Không gắn hồ sơ đã có tài khoản khác hoặc đã mất, ghi vết; hoặc chỉ lưu góc nhìn cho chat (chờ quyết định 4).
- [ ] 5.3 Số điện thoại/địa chỉ/email trả theo quyền xem hồ sơ (chờ quyết định 2).
- [ ] 5.4 Đồ thị chatbot lọc quan hệ nhạy cảm như cây (`genealogy/treeVisibility.js applyFamilyVisibility`) với thành viên thường:
  hiện "Vợ của X", "X có mấy vợ" vẫn lộ vợ lẽ đặt chế độ chỉ quản lý xem. Gợi ý: `loadClanGraph` có 2 tầng cache (đủ/công khai), chọn theo vai trò người hỏi.

## Chờ nhóm quyết định

1. Thêm trường "trưởng họ / trưởng chi" hay trả "chưa ghi nhận"? (việc 2.8)
2. Trợ lý có được trả số điện thoại, địa chỉ không, theo quyền nào? (việc 5.3)
3. Có key Groq riêng cho dev để chạy bộ kiểm tra có LLM không?
4. Bước chọn "bạn là ai" trong chat có được gắn vĩnh viễn tài khoản với hồ sơ như hiện nay không? (việc 5.2)

## Ghi chú phiên trước

- 15/10/2026 (tiếp): GĐ3 xong. `conversationFlowService.js` viết lại câu trước khi phân tích: đại từ (theo giới tính),
  câu lược, chọn người khi hỏi lại. Hỏi lại/không tìm thấy trả 200 và được lưu lịch sử; trạng thái chờ chọn nằm trong bộ nhớ
  hội thoại và được dựng lại từ `chatbot_messages.metadata.turn` khi RAM mất. Giao diện gửi `clarificationChoice` khi bấm
  ứng viên; chip gợi ý cập nhật theo câu trả lời. Bộ kiểm tra có thêm hội thoại hỏi lại (7 lượt), CI chặn dưới 7/7.

- 15/10/2026 (tiếp): GĐ2 xong, 82/82. Ý định mới: `person_anniversary`, `event_lookup`, `clan_info`, `child_status`;
  mở rộng `find_spouse` (đếm, vợ cả/lẽ), `list_children` (nuôi/riêng/trưởng/út/thứ N/đếm), `compare_relationship`
  ("A với B là gì của nhau", có "tôi", nêu cả hai chiều), `person_info` (`contact_info` không tiết lộ số điện thoại/email —
  chờ quyết định 2), thống kê đời đông nhất, câu ngoài phạm vi. Trưởng họ tạm trả "chưa ghi nhận" (chờ quyết định 1).
  Quan hệ nhạy cảm (`families.visibility = 'managers'`) chưa lọc trong đồ thị chatbot → làm ở GĐ5 (việc 5.4).

- 15/10/2026 (tiếp): GĐ1 xong. Tra xưng hô dùng nhãn `describeKinship` (`kinshipTermService.js`, `findPeopleByKinshipTerm`,
  `resolveKinshipChain`); trùng tên hỏi lại kèm đời/năm sinh/cha mẹ; thông tin người theo trường; giải thích quan hệ bằng tên.
  Câu còn trượt thuộc GĐ2 (mấy vợ, con nuôi, vợ lẽ, con trưởng, đời đông nhất, giỗ theo người, họp họ khi nào, nhà thờ,
  trưởng họ, ngoài phạm vi, "A với B là gì của nhau", số điện thoại) và GĐ3 (hội thoại).

- 15/10/2026: mới kiểm tra và lập kế hoạch, chưa sửa mã trả lời. Mốc 47/82, hội thoại 0/5 (commit `1f98244`).
