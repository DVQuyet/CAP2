# BÁO CÁO CẢI TIẾN THIẾT KẾ CƠ SỞ DỮ LIỆU & KIẾN TRÚC HỆ THỐNG
*Kính gửi: Giảng viên hướng dẫn / Hội đồng phản biện dự án Genealogy Management System*

Nhóm phát triển xin gửi lời cảm ơn chân thành đến Thầy vì những nhận xét, góp ý vô cùng sâu sắc và chuẩn xác về mặt kỹ thuật đối với hệ thống Cơ sở dữ liệu (CSDL) và thiết kế hệ thống. Nhóm đã nghiêm túc tiếp thu, tiến hành rà soát toàn diện và thực hiện các cải tiến kỹ thuật trực tiếp trên cơ sở dữ liệu cũng như mã nguồn hệ thống. 

Dưới đây là chi tiết các nội dung đã được khắc phục và nâng cấp:

---

### 1. Chuẩn hóa thuật ngữ chuyên ngành (Bảng `fund_campaigns`)
* **Nội dung góp ý:** Thuật ngữ văn hóa đặc thù "Đinh" (nhân khẩu nam trong dòng họ) dễ gây khó hiểu và thiếu tính học thuật khi thể hiện trong các tài liệu hoặc thiết kế cơ sở dữ liệu bằng tiếng Anh.
* **Giải pháp thực hiện:** Nhóm đã chuẩn hóa toàn bộ các trường liên quan trong CSDL và mã nguồn hệ thống sang tiếng Anh chuẩn mực:
  * Trường `amount_per_dinh` (Số tiền đóng mỗi đinh) được đổi thành `amount_per_member` (Số tiền đóng trên mỗi thành viên/suất đóng).
  * Trường `dinh_definition` (Định nghĩa diện đóng góp) được đổi thành `contribution_unit_definition` (Định nghĩa đơn vị đóng góp).
  * Hàm tính toán nội bộ `internalCalculateDinh` ở Backend được tái cấu trúc thành `internalCalculateContributionUnit`.
  * Giao diện người dùng (Frontend) được cập nhật đồng bộ các nhãn hiển thị thành **Mức đóng góp trên thành viên** và **Định nghĩa suất đóng**, giúp hệ thống chuyên nghiệp và có tính phổ quát cao hơn.

---

### 2. Tối ưu hóa tính Toàn vẹn Dữ liệu (Bảng `password_reset_tokens`)
* **Nội dung góp ý:** Việc sử dụng trường `email` làm tham chiếu trực tiếp trong bảng khôi phục mật khẩu có nguy cơ làm mất toàn vẹn dữ liệu (Data Integrity) và dễ phát sinh lỗi khi người dùng thay đổi địa chỉ email hệ thống.
* **Giải pháp thực hiện:** 
  * Nhóm đã bổ sung kịch bản tạo bảng chuẩn hóa `password_reset_tokens` liên kết trực tiếp tới khóa chính của bảng tài khoản thông qua `account_id` dưới dạng Khóa ngoại (Foreign Key).
  * Thiết lập ràng buộc `CONSTRAINT fk_password_reset_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE`. Điều này đảm bảo tính toàn vẹn tầng CSDL: khi tài khoản người dùng bị xóa, tất cả các token đặt lại mật khẩu liên quan sẽ tự động bị xóa sạch (Cascading Delete).
  * Đồng bộ hóa toàn bộ Backend API xử lý gửi mã OTP và đổi mật khẩu để truy vấn liên kết bảng (`JOIN`) thông qua `account_id` thay vì so khớp chuỗi `email` trực tiếp như trước.

---

### 3. Nâng cao khả năng mở rộng hệ thống (Cloud Readiness)
* **Nội dung góp ý:** Hệ thống lưu trữ hình ảnh và ghi âm ở thư mục cục bộ (Local Storage). Nếu đưa lên môi trường điện toán đám mây (AWS S3, Google Cloud Storage), kiến trúc lưu trữ cần thay đổi như thế nào để không phải thiết kế lại CSDL?
* **Giải pháp thực hiện:** Nhóm đã chủ động tái thiết kế bảng lưu trữ media `media_files` để sẵn sàng mở rộng quy mô (Cloud Scalability) mà **hoàn toàn không cần thay đổi cấu trúc bảng** trong tương lai:
  * Bổ sung trường `storage_type` dạng `ENUM('local', 's3', 'gcs') DEFAULT 'local'` giúp hệ thống phân biệt rõ vị trí vật lý lưu trữ file.
  * Bổ sung trường `storage_key` (`VARCHAR(500)`) để lưu định danh duy nhất của file trên Cloud Object Storage (S3/GCS Object Key).
  * Bổ sung trường `file_url` (`VARCHAR(1000)`) để lưu đường dẫn truy cập trực tiếp từ dịch vụ phân phối nội dung đám mây (Cloud CDN URL).
  * Thay đổi thuộc tính cột lưu trữ nhị phân vật lý `image_data` từ `LONGBLOB NOT NULL` thành `LONGBLOB DEFAULT NULL`. Khi chuyển đổi lên đám mây, tệp tin sẽ được lưu trực tiếp trên S3/GCS, trường `image_data` sẽ nhận giá trị rỗng (`NULL`) để giảm tải tài nguyên hệ thống, thay vào đó CSDL chỉ lưu giữ liên kết đám mây trung lập (`file_url`).

---

### KẾT LUẬN
Nhờ những góp ý mang tính định hướng chuyên môn cao của Thầy, hệ thống quản lý gia phả hiện tại không chỉ khắc phục được các hạn chế về mặt lý thuyết thiết kế mà còn đạt được độ hoàn thiện kỹ thuật xuất sắc, đáp ứng đầy đủ các tiêu chuẩn về **Tính toàn vẹn dữ liệu (Data Integrity)**, **Chuẩn hóa thuật ngữ quốc tế (Standardization)** và **Khả năng mở rộng quy mô lớn (Scalability/Cloud-Readiness)**.

Nhóm phát triển kính mong tiếp tục nhận được sự chỉ dẫn của Thầy để hoàn thiện dự án tốt hơn nữa.

*Xin chân thành cảm ơn Thầy!*
