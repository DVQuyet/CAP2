# CAP2 – Gia Phả Việt

Kế hoạch và thứ tự làm: `docs/KE_HOACH_TONG_THE.md`. Việc còn mở: `docs/VIEC_CHUA_LAM.md`.

## Trọng tâm
Cây gia phả, xuất ảnh, AI hỏi quan hệ. Giao diện trước, tính năng sau.
Module khác (fund, time-capsule, posts, billing, voice) chỉ sửa lỗi.
Không dùng dịch vụ trả phí.

## Kiến trúc
- Backend: route -> controller -> service -> repository. Controller không có SQL.
  Service không đụng req/res. core/ là hàm thuần.
- Frontend: features/<tên>/{pages,components,hooks,model,api.js}.
  Feature không import từ feature khác.
- Một máy chủ, một tiến trình, một DB. Cache, realtime, lưu file, Groq sẽ chỉ gọi qua src/platform/*
  (thư mục này chưa có; tạo ở bước E7.4 của kế hoạch, từ đó mã mới phải đi qua nó).
- Không thêm Redis, hàng đợi, dịch vụ lưu trữ hay thành phần hạ tầng mới.

## Tiếng Việt trong chatbot
- Không bỏ dấu trước khi phân tích câu. Dùng text/vietnameseText, text/lexicon, text/pattern
  (chưa có; viết ở phần B của kế hoạch. Parser cũ còn bỏ dấu, không thêm chỗ bỏ dấu mới).
- Từ mới thêm vào lexicon bằng chữ có dấu; không viết tay dạng không dấu.
- Câu không dấu mà nhiều cách hiểu thì hỏi lại, không đoán.
- LLM chỉ lập kế hoạch hoặc trả lời kiến thức phong tục; quan hệ họ hàng do graph trả lời.

## Cây gia phả
- Không gọi setState trong pointermove; kéo bằng ref + requestAnimationFrame.
- Thẻ đặt vị trí bằng transform; thẻ là React.memo, props phải ổn định.
- Kiểu thẻ chỉ sửa ở TreeCard.css (tạo ở bước A1.3), màu lấy từ tokens.css.

## Quy ước
- File mới <= 400 dòng, hàm <= 80 dòng. Không làm file cũ dài thêm.
- Chuỗi giao diện qua i18n (vi.json và en.json cùng key).
- Route ghi dữ liệu phải có schema ở shared/validation/schemas.js.
- Di chuyển file và đổi hành vi không nằm chung một commit.
- Thông tin liên hệ của người trên cây (SĐT, email, địa chỉ) chỉ trả cho người có quyền:
  dùng genealogy/contactPrivacy.js khi thêm endpoint trả danh sách người cho thành viên thường.

## Cấm
- ALTER/CREATE TABLE trong src/. Đổi schema = thêm file ở database/migrations/.
- Thêm biến toàn cục giữ trạng thái người dùng.
- Thêm route trong server.js; gộp controller bằng spread.
- Chạy test hay script với DB thật; sửa .env.
- Hạ ngưỡng --min trong ci.yml.
- Trả error.message thô cho client; thêm console.log.
- Đưa dump có dữ liệu thật vào repo.

## Kiểm tra trước khi xong
- Backend: cd Backend && npm test && node scripts/chatbot-e2e-check.js --min 199 --min-conversation 7
- Frontend: cd Frontend && npm run lint && npm test && npm run build
- Cả hai: npm test và npm run lint ở gốc repo.
- Đổi giao diện cây: chụp ảnh 390x844 và 1280x800 trên dev/tree-preview.html.
- Việc còn mở ghi vào docs/VIEC_CHUA_LAM.md.
