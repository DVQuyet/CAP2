import { useLanguage } from "../../../../i18n/LanguageContext";
import { fullName } from "../../utils/tree-editor/treePersonUtils";

// Kết quả kiểm tra trước khi lưu quan hệ: lỗi chặn, điểm cần xác nhận, thông báo và thay đổi đời.
export default function RelationPreview({ preview, loading, peopleById }) {
  const { t } = useLanguage();
  if (loading) {
    return <div className="fte-relationPreview is-loading">{t("tree.relationPreview.checking")}</div>;
  }
  if (!preview) return null;
  const blocking = preview.blocking || [];
  const confirm = preview.confirm || [];
  const notices = preview.notices || [];
  const generationChanges = preview.generation_changes || [];
  if (!blocking.length && !confirm.length && !notices.length && !generationChanges.length) {
    return <div className="fte-relationPreview is-ok">{t("tree.relationPreview.ok")}</div>;
  }
  const nameOf = (personId) => fullName(peopleById?.get?.(Number(personId)), `#${personId}`);
  return (
    <div className={`fte-relationPreview ${blocking.length ? "is-blocked" : confirm.length ? "is-warning" : "is-notice"}`}>
      {blocking.map((issue, index) => (
        <p key={`b-${index}`} className="is-blocking">
          <span className="material-symbols-outlined">block</span>
          {issue.message}
        </p>
      ))}
      {confirm.map((issue, index) => (
        <p key={`c-${index}`} className="is-confirm">
          <span className="material-symbols-outlined">history_edu</span>
          {issue.message}
          {issue.severity === "legal" ? <em>{t("tree.relationPreview.needsReason")}</em> : null}
        </p>
      ))}
      {notices.map((issue, index) => (
        <p key={`n-${index}`} className="is-notice">
          <span className="material-symbols-outlined">info</span>
          {issue.message}
        </p>
      ))}
      {generationChanges.length ? (
        <p className="is-notice">
          <span className="material-symbols-outlined">stairs</span>
          {t("tree.relationPreview.generationChanges", {
            count: generationChanges.length,
            list: generationChanges.slice(0, 4).map((change) => `${nameOf(change.person_id)}: ${change.from ?? "?"} → ${change.to}`).join("; "),
          })}
        </p>
      ) : null}
    </div>
  );
}
