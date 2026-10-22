import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./clanRegister.css";
import { registerClanManagerAPI } from "../../../api/authService";
import DateInput from "../../../shared/components/DateInput";
import { vietnamDateToIso } from "../../../shared/utils/dateFormat";
import termsText from "./terms.txt?raw";
import privacyText from "./privacy.txt?raw";
import { notify } from "../../../shared/utils/toast";

const ClanRegister = () => {
  const { t } = useTranslation();
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
      setModalTitle(t("clan.register.termsTitle"));
      setModalContent(termsText);
    } else if (type === "privacy") {
      setModalTitle(t("clan.register.privacyTitle"));
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
      setError(t("clan.register.clanNameRequired"));
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
      setError(t("clan.register.clanNameMissing"));
      return;
    }

    if (managerForm.password !== managerForm.confirm_password) {
      setError(t("clan.register.passwordMismatch"));
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
        notify(t("clan.register.success"));
        navigate("/login");
      }
    } catch (err) {
      setError(err.message || t("clan.register.failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="clan-register-page">
      <Link to="/" className="back-btn">
        ← {t("navigation.backHome")}
      </Link>

      <div className="clan-register-container">
        {step === 1 ? (
          <>
            <h2>{t("clan.register.newClanTitle")}</h2>
            <p className="subtitle">{t("clan.register.newClanSubtitle")}</p>

            {error && <div className="error-box">{error}</div>}

            <form onSubmit={handleClanSubmit}>
              <input
                name="clan_name"
                value={clanName}
                placeholder={t("clan.register.clanNamePlaceholder")}
                onChange={(e) => setClanName(e.target.value)}
                required
              />

              <button type="submit" className="submit-btn">
                {t("clan.register.nextStep")}
              </button>
            </form>

            <p className="footer-link">
              {t("auth.register.hasAccount")} <Link to="/login">{t("common.login")}</Link>
            </p>
          </>
        ) : (
          <>
            <h2>{t("clan.register.managerTitle")}</h2>
            <h2>"{clanName}"</h2>
            <p className="subtitle">{t("clan.register.managerSubtitle")}</p>

            {error && <div className="error-box">{error}</div>}

            <form onSubmit={handleManagerSubmit}>
              <input
                name="display_name"
                value={managerForm.display_name}
                placeholder={t("clan.register.fullNamePlaceholder")}
                onChange={handleFullNameChange}
                required
              />

              <div className="input-row">
                <input
                  name="surname"
                  value={managerForm.surname}
                  placeholder={t("auth.register.surname")}
                  onChange={handleManagerChange}
                  required
                />
                <input
                  name="middle_name"
                  value={managerForm.middle_name}
                  placeholder={t("auth.register.middleName")}
                  onChange={handleManagerChange}
                />
                <input
                  name="first_name"
                  value={managerForm.first_name}
                  placeholder={t("auth.register.firstName")}
                  onChange={handleManagerChange}
                  required
                />
              </div>

              <div className="input-row">
                <select name="gender" value={managerForm.gender} onChange={handleManagerChange} required>
                  <option value="1">{t("auth.register.male")}</option>
                  <option value="2">{t("auth.register.female")}</option>
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
                placeholder={t("auth.register.emailPlaceholder")}
                type="email"
                onChange={handleManagerChange}
                required
              />

              <input
                name="password"
                value={managerForm.password}
                type="password"
                placeholder={t("auth.register.passwordPlaceholder")}
                onChange={handleManagerChange}
                required
              />

              <input
                name="confirm_password"
                value={managerForm.confirm_password}
                type="password"
                placeholder={t("auth.invite.confirmPassword")}
                onChange={handleManagerChange}
                required
              />

              <input
                name="hometown"
                value={managerForm.hometown}
                placeholder={t("auth.register.hometownPlaceholder")}
                onChange={handleManagerChange}
                required
              />

              <div className="checkbox-group">
                <input type="checkbox" id="terms" required />
                <label htmlFor="terms">
                  {t("auth.register.agreePrefix")}
                  <a
                    href="#"
                    className="policy-link"
                    onClick={(e) => {
                      e.preventDefault();
                      openModal("terms");
                    }}
                  >
                    {" "}
                    {t("auth.register.terms")}
                  </a>
                  {t("auth.register.and")}
                  <a
                    href="#"
                    className="policy-link"
                    onClick={(e) => {
                      e.preventDefault();
                      openModal("privacy");
                    }}
                  >
                    {" "}
                    {t("auth.register.privacy")}
                  </a>
                </label>
              </div>

              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? t("clan.register.processing") : t("clan.register.finish")}
              </button>
            </form>

            <p className="footer-link">
              <button type="button" className="link-button" onClick={() => setStep(1)}>
                {t("clan.register.backToStep")}
              </button>
            </p>

            <p className="footer-link">
              {t("auth.register.hasAccount")} <Link to="/login">{t("common.login")}</Link>
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