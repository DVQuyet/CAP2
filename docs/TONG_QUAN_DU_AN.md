# Tổng quan dự án CAP2 – Gia Phả Việt

Tổng hợp từ mã nguồn và tài liệu trong repo (10/11/2026). Phần nào code không có thông tin thì ghi rõ.

## 1. Web dùng để làm gì, ai dùng, bao nhiêu người

**Mục đích:** hệ thống quản lý gia phả và hoạt động dòng họ.

- Cây gia phả: chỉnh sửa, thu gọn nhánh, xuất PNG/SVG, sổ gia phả in PDF, nhập/xuất GEDCOM, phát hiện trùng lặp.
- Lịch giỗ, sinh nhật và sự kiện, kèm giao việc.
- Quỹ dòng họ, bài đăng, kỷ niệm, "time capsule", lời mời tham gia dòng họ.
- Chatbot AI hỏi đáp quan hệ họ hàng bằng tiếng Việt, hiểu cả cách gọi theo vùng ("anh hai", "chú út").
- Gói thanh toán qua SePay, ghi âm giọng nói, trang chủ do admin chỉnh sửa.

**Vai trò (`Backend/src/config/roles.js`):**

| Vai trò | role_id | Mô tả |
|---|---|---|
| admin | 1 | Quản trị hệ thống, quản lý nội dung trang chủ |
| manager | 2 | Quản lý một dòng họ |
| member | 3 | Thành viên, được mời qua link |

**Số người dùng:** code không có số liệu. DB hiện tại là dữ liệu test. Dấu hiệu quy mô: pool DB `connectionLimit` 10, cache nội bộ từng tiến trình, tức thiết kế cho quy mô nhỏ.

## 2. Công nghệ

| Lớp | Công nghệ |
|---|---|
| Frontend | React 18, Vite 7, React Router 6, i18next (vi/en), Recharts, socket.io-client, PWA (`vite-plugin-pwa`), ESLint |
| Backend | Node 22, Express 5, Socket.IO, Passport (Google/Facebook), JWT, bcryptjs, multer, nodemailer, `xlsx` |
| Database | MySQL (`mysql2`); dữ liệu test trên Aiven; ảnh upload lưu trong DB (`media_files`, LONGBLOB) |
| AI | Groq SDK, kết hợp rule engine của Backend (`relationshipEngine` xác minh quan hệ; AI không tự ghi DB) |
| Voice | Python, faster-whisper, hàng đợi qua MySQL |
| CI | GitHub Actions: test backend, e2e chatbot, lint + test + build frontend |
| Hosting | Frontend: Vercel (`cap-2-seven.vercel.app`); Backend: Render (`cap2-backend.onrender.com`); DB: Aiven |


## 3. Vấn đề đang gặp

- **File quá lớn, khó thêm tính năng:** `FamilyTreeEditor.jsx` 4.119 dòng, `ClanFundPage.jsx` 2.765, `chatbotController.js` 2.675, `member.controller.js` 2.413.
- **Backend controller dày:** logic nghiệp vụ lẫn trong controller, chỉ một số module có tầng `service`.
- **Khởi động chậm:** Render gói miễn phí ngủ đông (frontend có banner "máy chủ đang khởi động").
- **Cache một tiến trình:** cache trang chủ (60 giây), cache tài khoản (30 giây) không đồng bộ khi chạy nhiều instance.
- **Ảnh lưu trong DB:** ảnh lớn làm DB phình; ảnh nền 6,2 MB và 4,1 MB nên đổi sang WebP.
- **CSS:** 915 màu hex khác nhau, 122 kiểu nút, `.btn-primary` định nghĩa 2 lần (đã gom 1.945 giá trị vào `tokens.css`).
- **Rủi ro deploy:** phải sao lưu DB rồi `npm run migrate` mỗi đợt; còn DDL phát sinh lúc request (có cờ `DISABLE_RUNTIME_DDL`).
- **ESLint:** còn 138 cảnh báo.
- **Thiếu QA trình duyệt** cho nhiều thay đổi UI gần đây.
- **Chatbot còn nhập nhằng:** "ba cô tôi" (cụ hay bà cô), "chú ba/thím ba" không dấu.
- **Bảo mật khi chạy local:** `.env` của Backend trỏ vào DB và URL của bản thật (hiện chỉ là dữ liệu test).
- **Dependencies:** `npm audit` báo 3 lỗ hổng ở Backend (2 moderate, 1 high), chưa xử lý.

## 4. Hướng phát triển

Theo `docs/VIEC_CHUA_LAM.md` và các mục "còn mở":

- Hoàn tất trang chủ do admin quản lý: khối demo, `/loi-ich`, sidebar tin tức, trang chi tiết bài, khối "custom".
- Ảnh đại diện thật khi xuất cây (hiện là chữ cái đầu).
- Validate đầu vào cho route calendar/events.
- Chuyển ảnh sang CDN/storage riêng; đổi ảnh nền sang WebP.
- Dọn dẹp: gỡ `html-to-image` không dùng, sửa import tĩnh lẫn lazy của Login/Register, bỏ logo trùng.
- Dark mode (đã có sẵn tokens CSS).
- Tách file lớn, đồng bộ cache khi chạy nhiều instance.

**Làm team / mở rộng:** code không nói rõ. Có CI, validation đầu vào, tài liệu API và nhật ký theo đợt, cho thấy repo được chuẩn bị cho nhiều người cùng làm.

## Tài liệu liên quan

- `README.md`, `Backend/README.md`, `Frontend/README.md`, `voice/README.md`
- `docs/API_LIST.md`, `docs/AI_FAMILY_ASSISTANT_ARCHITECTURE.md`
- `docs/VIEC_CHUA_LAM.md`, `docs/nhat-ky/CAI_THIEN_HE_THONG.md`, `docs/UI_TOI_UU_DE_XUAT.md`
