// Phần thân dùng chung cho thẻ một người và mỗi nửa của thẻ vợ chồng: ảnh đại diện + tên + năm sinh/mất.
import { useLanguage } from "../../../i18n/LanguageContext";

export function yearOf(value) {
  const match = String(value || "").match(/\d{4}/);
  return match ? match[0] : "";
}

export function lifeYears(person) {
  const birth = yearOf(person?.birth_date);
  const death = Number(person?.is_living) === 0 ? yearOf(person?.death_date) : "";
  if (birth && death) return `${birth} – ${death}`;
  if (death) return `? – ${death}`;
  return birth;
}

// Chữ cái đầu của tên gọi (từ cuối trong họ tên tiếng Việt).
export function initialsOf(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] || "";
  return last.charAt(0).toUpperCase() || "?";
}

export function genderKey(person) {
  const gender = Number(person?.gender);
  if (gender === 1) return "male";
  if (gender === 2) return "female";
  return "unknown";
}

export function PersonAvatar({ person, name }) {
  const deceased = Number(person?.is_living) === 0;
  return (
    <span className={`fte2-avatar is-${genderKey(person)} ${deceased ? "is-deceased" : ""}`} aria-hidden="true">
      {person?.avatar_url ? <img src={person.avatar_url} alt="" draggable={false} /> : <span>{initialsOf(name)}</span>}
    </span>
  );
}

export function CardPersonBody({ person, name, meta, showAvatar, directLineage }) {
  const { t } = useLanguage();
  const deceased = Number(person?.is_living) === 0;
  return (
    <div className="fte2-cardBody">
      {showAvatar ? <PersonAvatar person={person} name={name} /> : null}
      <div className="fte2-cardText">
        <div className="fte-cardName">{name}</div>
        {meta ? <div className="fte-cardMeta">{meta}</div> : null}
      </div>
      {deceased ? <span className="fte2-deceasedTag" title={t("tree.card.deceased")}>{t("tree.card.deceased")}</span> : null}
      {directLineage ? <span className="fte2-srOnly">{t("tree.card.badges.directLineage", { defaultValue: "Trực hệ" })}</span> : null}
    </div>
  );
}
