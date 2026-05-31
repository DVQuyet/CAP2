import { Link } from "react-router-dom";
import "./LegalPage.css";

const pages = {
  privacy: {
    title: "Chính sách quyền riêng tư",
    body: [
      "Ứng dụng Family Tree Login sử dụng thông tin cơ bản từ Facebook như tên, email và ảnh đại diện để hỗ trợ đăng nhập vào hệ thống gia phả/dòng họ.",
      "Chúng tôi chỉ sử dụng dữ liệu này để:",
    ],
    bullets: [
      "Xác thực tài khoản người dùng",
      "Quản lý quyền truy cập vào hệ thống",
      "Hiển thị thông tin tài khoản trong ứng dụng",
    ],
    closing: [
      "Chúng tôi không bán, chia sẻ hoặc sử dụng dữ liệu người dùng cho mục đích quảng cáo.",
      "Người dùng có thể yêu cầu xóa dữ liệu bằng cách liên hệ qua email: dinhvietquyet984@gmail.com",
    ],
  },
  terms: {
    title: "Điều khoản dịch vụ",
    body: [
      "Người dùng đăng nhập vào hệ thống để xem và quản lý thông tin gia phả/dòng họ theo quyền được cấp.",
      "Người dùng không được:",
    ],
    bullets: [
      "Đăng tải thông tin sai lệch",
      "Chia sẻ dữ liệu gia phả cho người không có quyền truy cập",
      "Sử dụng hệ thống cho mục đích vi phạm pháp luật",
      "Xâm phạm quyền riêng tư của thành viên khác",
    ],
    closing: [
      "Hệ thống có quyền khóa hoặc giới hạn tài khoản nếu phát hiện hành vi vi phạm.",
    ],
  },
  deleteData: {
    title: "Xóa dữ liệu người dùng",
    body: [
      "Nếu bạn muốn xóa dữ liệu đã dùng để đăng nhập bằng Facebook, vui lòng gửi yêu cầu đến email: dinhvietquyet984@gmail.com.",
      "Dữ liệu có thể được xóa bao gồm:",
    ],
    bullets: [
      "Tên",
      "Email",
      "Ảnh đại diện",
      "Thông tin liên kết tài khoản Facebook",
      "Dữ liệu đăng nhập liên quan đến tài khoản",
    ],
    closing: [
      "Chúng tôi sẽ xử lý yêu cầu xóa dữ liệu trong thời gian sớm nhất.",
    ],
  },
};

export default function LegalPage({ type }) {
  const page = pages[type] || pages.privacy;

  return (
    <main className="legal-page" data-no-translate="true">
      <section className="legal-document">
        <Link className="legal-back-link" to="/">{"<-"} Về trang chủ</Link>
        <h1>{page.title}</h1>

        {page.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}

        <ul>
          {page.bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        {page.closing.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </section>
    </main>
  );
}
