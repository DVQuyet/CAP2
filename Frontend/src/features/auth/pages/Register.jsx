import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./register.css";
import { registerAPI } from "../../../api/authService";
import DateInput from "../../../shared/components/DateInput";
import { vietnamDateToIso } from "../../../shared/utils/dateFormat";
import termsText from "./terms.txt?raw";
import privacyText from "./privacy.txt?raw";

const initialForm = {
  display_name: "",
  first_name: "",
  middle_name: "",
  surname: "",
  email: "",
  password: "",
  birth_date: "",
  hometown: "",
  gender: "1",
  clan_id: "",
  termsAccepted: false,
};

export default function Register({ isOpen, onClose, onLoginClick }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isModal = typeof isOpen === "boolean";
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalContent, setModalContent] = useState("");
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (!isModal) return;
    if (!isOpen) return;
    setError("");
    setSuccessMessage("");
  }, [isModal, isOpen]);

  useEffect(() => {
    if (!isModal || !isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isModal, isOpen, onClose]);

  if (isModal && !isOpen) return null;

  const openModal = (type) => {
    if (type === "terms") {
      setModalTitle(t("auth.register.terms"));
      setModalContent(termsText);
    } else if (type === "privacy") {
      setModalTitle(t("auth.register.privacy"));
      setModalContent(privacyText);
    }
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalTitle("");
    setModalContent("");
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
    if (error) setError("");
  };

  const handleClose = () => {
    if (isModal) {
      onClose?.();
      return;
    }
    navigate("/");
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    const surname = form.surname.trim();
    const middleName = form.middle_name.trim();
    const firstName = form.first_name.trim();
    const displayName = form.display_name.trim() || [surname, middleName, firstName].filter(Boolean).join(" ");
    const clanId = Number(String(form.clan_id || "").trim());

    if (!surname || !firstName || !displayName) {
      setError(t("auth.register.errors.nameRequired"));
      return;
    }
    if (!form.email.trim()) {
      setError(t("auth.register.errors.emailRequired"));
      return;
    }
    if (form.password.length < 6) {
      setError(t("auth.register.errors.passwordLength"));
      return;
    }
    if (!form.birth_date) {
      setError(t("auth.register.errors.birthDateRequired"));
      return;
    }
    if (!form.hometown.trim()) {
      setError(t("auth.register.errors.hometownRequired"));
      return;
    }
    if (!Number.isInteger(clanId) || clanId <= 0) {
      setError(t("auth.register.errors.clanIdInvalid"));
      return;
    }
    if (!form.termsAccepted) {
      setError(t("auth.register.errors.termsRequired"));
      return;
    }

    setLoading(true);

    try {
      const result = await registerAPI({
        ...form,
        surname,
        middle_name: middleName,
        first_name: firstName,
        display_name: displayName,
        email: form.email.trim(),
        hometown: form.hometown.trim(),
        gender: Number(form.gender) || 1,
        clan_id: clanId,
        birth_date: vietnamDateToIso(form.birth_date) || null,
      });

      setSuccessMessage(result?.message || t("auth.register.success"));
      setForm(initialForm);
      setTimeout(() => {
        onClose?.();
        navigate("/waiting");
      }, 650);
    } catch (err) {
      setError(err?.message || t("auth.register.failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={isModal ? "register-page register-page--modal" : "register-page"} onClick={isModal ? handleClose : undefined} data-no-translate="true">
      <div className="register-container" role="dialog" aria-modal="true" aria-labelledby="register-title" onClick={(event) => event.stopPropagation()}>
        <button className="register-close-btn" type="button" aria-label={t("auth.close")} onClick={handleClose}>
          ×
        </button>

        <h2 id="register-title">{t("auth.register.title")}</h2>
        <p className="subtitle">{t("auth.register.subtitle")}</p>

        <div className="info-link">
          {t("auth.register.newClanPrompt")} <Link to="/clan-register" onClick={isModal ? onClose : undefined}>{t("auth.register.learnMore")}</Link>
        </div>

        {error && <div className="error-box">{error}</div>}
        {successMessage && !error && <div className="success-box">{successMessage}</div>}

        <form onSubmit={handleRegister}>
          <div className="input-row input-row--three">
            <input name="surname" value={form.surname} placeholder={t("auth.register.surname")} onChange={handleChange} required />
            <input name="middle_name" value={form.middle_name} placeholder={t("auth.register.middleName")} onChange={handleChange} />
            <input name="first_name" value={form.first_name} placeholder={t("auth.register.firstName")} onChange={handleChange} required />
          </div>

          <input name="display_name" value={form.display_name} placeholder={t("auth.register.displayName")} onChange={handleChange} required />

          <div className="input-row input-row--two">
            <select name="gender" value={form.gender} onChange={handleChange} required>
              <option value="1">{t("auth.register.male")}</option>
              <option value="2">{t("auth.register.female")}</option>
              <option value="0">{t("auth.register.unknown")}</option>
            </select>
            <DateInput name="birth_date" value={form.birth_date} onChange={handleChange} required />
          </div>

          <input name="email" value={form.email} placeholder={t("auth.register.emailPlaceholder")} type="email" autoComplete="username" onChange={handleChange} required />
          <input name="password" value={form.password} type="password" placeholder={t("auth.register.passwordPlaceholder")} autoComplete="new-password" onChange={handleChange} required />
          <input name="hometown" value={form.hometown} placeholder={t("auth.register.hometownPlaceholder")} onChange={handleChange} required />

          <label className="form-field" htmlFor="clan_id">
            <span>{t("auth.register.clanId")}</span>
            <input
              id="clan_id"
              name="clan_id"
              value={form.clan_id}
              placeholder={t("auth.register.clanIdPlaceholder")}
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              onChange={handleChange}
              required
            />
            <small>{t("auth.register.clanIdHelp")}</small>
          </label>

          <div className="checkbox-group">
            <input
              type="checkbox"
              id="terms"
              name="termsAccepted"
              checked={form.termsAccepted}
              onChange={handleChange}
              required
            />
            <label htmlFor="terms">
              {t("auth.register.agreePrefix")}
              <button className="policy-link policy-link-button" type="button" onClick={() => openModal("terms")}>{t("auth.register.terms")}</button>
              {t("auth.register.and")}
              <button className="policy-link policy-link-button" type="button" onClick={() => openModal("privacy")}>{t("auth.register.privacy")}</button>
            </label>
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? t("auth.register.submitting") : t("auth.register.submit")}
          </button>
        </form>

        <p className="footer-link">
          {t("auth.register.hasAccount")}{" "}
          {isModal ? (
            <button
              type="button"
              className="register-inline-link"
              onClick={() => {
                onClose?.();
                onLoginClick?.();
              }}
            >
              {t("auth.register.loginNow")}
            </button>
          ) : (
            <Link to="/login">{t("auth.register.loginNow")}</Link>
          )}
        </p>

        {modalOpen && (
          <div className="policy-modal-overlay" onClick={closeModal}>
            <div className="policy-modal-card" onClick={(event) => event.stopPropagation()}>
              <div className="policy-modal-header">
                <h3>{modalTitle}</h3>
                <button className="policy-modal-close" type="button" onClick={closeModal}>×</button>
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
}
