import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./clanRegister.css";
import { registerClanManagerAPI } from "../../../api/authService";
import DateInput from "../../../shared/components/DateInput";
import { vietnamDateToIso } from "../../../shared/utils/dateFormat";
import termsText from "./terms.txt?raw";
import privacyText from "./privacy.txt?raw";

const ClanRegister = () => {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [clanName, setClanName] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalContent, setModalContent] = useState("");

  const [managerForm, setManagerForm] = useState({
    display_name: "",
    first_name: "",
    middle_name: "",
    surname: "",
    email: "",
    password: "",
    confirm_password: "",
    birth_date: "",
    hometown: "",
    gender: "1",
  });

  const openModal = (type) => {
    if (type === "terms") {
      setModalTitle("Điều khoản sử dụng");
      setModalContent(termsText);
    } else if (type === "privacy") {
      setModalTitle("Chính sách bảo mật");
      setModalContent(privacyText);
    }
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalTitle("");
    setModalContent("");
  };

  const handleClanSubmit = (e) => {
    e.preventDefault();
    setError("");

    if (!clanName || String(clanName).trim() === "") {
      setError("Vui lòng nhập tên dòng họ");
      return;
    }

    setStep(2);
  };

  const handleManagerChange = (e) => {
    const { name, value } = e.target;
    setManagerForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleFullNameChange = (e) => {
    const fullName = e.target.value;
    const parts = fullName.trim().split(/\s+/);

    let surname = "";
    let middle_name = "";
    let first_name = "";

    if (parts.length === 1 && parts[0] !== "") {
      first_name = parts[0];
    } else if (parts.length === 2) {
      surname = parts[0];
      first_name = parts[1];
    } else if (parts.length >= 3) {
      surname = parts[0];
      first_name = parts[parts.length - 1];
      middle_name = parts.slice(1, parts.length - 1).join(" ");
    }

    setManagerForm((prev) => ({
      ...prev,
      display_name: fullName,
      surname,
      middle_name,
      first_name,
    }));
  };

  const handleManagerSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!clanName || String(clanName).trim() === "") {
      setError("Tên dòng họ bị mất, vui lòng quay lại bước trước");
      return;
    }

    if (managerForm.password !== managerForm.confirm_password) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }

    setLoading(true);

    try {
      const { confirm_password, ...payload } = managerForm;

      const res = await registerClanManagerAPI({
        clan_name: clanName,
        ...payload,
        birth_date: vietnamDateToIso(payload.birth_date) || null,
      });

      if (res.success) {
        alert("Đăng ký dòng họ và tài khoản Trưởng họ thành công!");
        navigate("/login");
      }
    } catch (err) {
      setError(err.message || "Lỗi trong quá trình tạo dòng họ và quản lý");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="clan-register-page">
      <Link to="/" className="back-btn">
        ← Về trang chủ
      </Link>

      <div className="clan-register-container">
        {step === 1 ? (
          <>
            <h2>Tạo dòng họ mới</h2>
            <p className="subtitle">Nhập tên dòng họ của bạn.</p>

            {error && <div className="error-box">{error}</div>}

            <form onSubmit={handleClanSubmit}>
              <input
                name="clan_name"
                value={clanName}
                placeholder="Tên dòng họ"
                onChange={(e) => setClanName(e.target.value)}
                required
              />

              <button type="submit" className="submit-btn">
                Tiếp theo: Đăng ký tài khoản
              </button>
            </form>

            <p className="footer-link">
              Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
            </p>
          </>
        ) : (
          <>
            <h2>Tạo tài khoản Trưởng họ cho dòng họ</h2>
            <h2>"{clanName}"</h2>
            <p className="subtitle">Người đăng ký sẽ được gán quyền "Trưởng họ" của dòng họ này.</p>

            {error && <div className="error-box">{error}</div>}

            <form onSubmit={handleManagerSubmit}>
              <input
                name="display_name"
                value={managerForm.display_name}
                placeholder="Họ tên đầy đủ"
                onChange={handleFullNameChange}
                required
              />

              <div className="input-row">
                <input
                  name="surname"
                  value={managerForm.surname}
                  placeholder="Họ"
                  onChange={handleManagerChange}
                  required
                />
                <input
                  name="middle_name"
                  value={managerForm.middle_name}
                  placeholder="Tên đệm"
                  onChange={handleManagerChange}
                />
                <input
                  name="first_name"
                  value={managerForm.first_name}
                  placeholder="Tên"
                  onChange={handleManagerChange}
                  required
                />
              </div>

              <div className="input-row">
                <select name="gender" value={managerForm.gender} onChange={handleManagerChange} required>
                  <option value="1">Nam</option>
                  <option value="2">Nữ</option>
                </select>
                <DateInput
                  name="birth_date"
                  value={managerForm.birth_date}
                  onChange={handleManagerChange}
                  required
                />
              </div>

              <input
                name="email"
                value={managerForm.email}
                placeholder="Email đăng nhập"
                type="email"
                onChange={handleManagerChange}
                required
              />

              <input
                name="password"
                value={managerForm.password}
                type="password"
                placeholder="Mật khẩu"
                onChange={handleManagerChange}
                required
              />

              <input
                name="confirm_password"
                value={managerForm.confirm_password}
                type="password"
                placeholder="Xác nhận mật khẩu"
                onChange={handleManagerChange}
                required
              />

              <input
                name="hometown"
                value={managerForm.hometown}
                placeholder="Quê quán"
                onChange={handleManagerChange}
                required
              />

              <div className="checkbox-group">
                <input type="checkbox" id="terms" required />
                <label htmlFor="terms">
                  Tôi đồng ý
                  <a
                    href="#"
                    className="policy-link"
                    onClick={(e) => {
                      e.preventDefault();
                      openModal("terms");
                    }}
                  >
                    {" "}
                    Điều khoản sử dụng
                  </a>
                  và
                  <a
                    href="#"
                    className="policy-link"
                    onClick={(e) => {
                      e.preventDefault();
                      openModal("privacy");
                    }}
                  >
                    {" "}
                    Chính sách bảo mật
                  </a>
                </label>
              </div>

              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? "Đang xử lý..." : "Hoàn tất đăng ký"}
              </button>
            </form>

            <p className="footer-link">
              <button type="button" className="link-button" onClick={() => setStep(1)}>
                ← Quay về bước trước
              </button>
            </p>

            <p className="footer-link">
              Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
            </p>
          </>
        )}

        {modalOpen && (
          <div className="policy-modal-overlay" onClick={closeModal}>
            <div className="policy-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="policy-modal-header">
                <h3>{modalTitle}</h3>
                <button className="policy-modal-close" type="button" onClick={closeModal}>
                  ×
                </button>
              </div>
              <div className="policy-modal-body">
                <pre>{modalContent}</pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClanRegister;