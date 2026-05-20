import { useLanguage } from "../../../i18n/LanguageContext";
import { formatDateVN } from "../../../shared/utils/dateFormat";
import { getPersonHighlightState, highlightClassNames } from "../utils/treeHighlight";

const CARD_WIDTH = 170;
const CARD_HEIGHT = 185;

function fullName(person, fallback) {
  return person?.display_name || [person?.surname, person?.middle_name, person?.first_name].filter(Boolean).join(" ").trim() || fallback;
}

export default function TreeNodeCard({
  person,
  selected,
  dragging,
  canDrag = true,
  canEdit = false,
  canDelete = false,
  founder = false,
  size = { width: CARD_WIDTH, height: CARD_HEIGHT },
  hasChildren = false,
  collapsed = false,
  highlightOptions = {},
  onPointerDown,
  onResizePointerDown,
  onEdit,
  onDelete,
  onQuickCreate,
  onToggleCollapse,
}) {
  const { t } = useLanguage();
  const name = fullName(person, t("tree.card.fallbackName"));
  const genderClass = Number(person.gender) === 1 ? "is-male" : Number(person.gender) === 2 ? "is-female" : "is-unknown";
  const birthText = formatDateVN(person.birth_date);
  const deathText = formatDateVN(person.death_date);
  const deceased = Number(person.is_living) === 0;
  const isClanChief = Number(person.role_id) === 2;
  const state = getPersonHighlightState(person, { ...highlightOptions, selectedPersonId: selected ? person.id : highlightOptions.selectedPersonId });
  const stateClasses = highlightClassNames(state);
  const badges = [
    state.self ? t("tree.card.badges.self") : "",
    state.online ? t("tree.card.badges.online") : "",
    state.search ? t("tree.card.badges.search") : "",
    state.editing ? t("tree.card.badges.editing") : "",
    state.error ? t("tree.card.badges.error") : "",
  ].filter(Boolean);
  const tooltip = [name, ...badges, ...state.errors].join("\n");

  const lifeParts = [];
  if (birthText) lifeParts.push(t("tree.card.born", { date: birthText }));
  if (deceased && deathText) lifeParts.push(t("tree.card.died", { date: deathText }));

  const stopActionPointer = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      id={`fte-person-${person.id}`}
      className={`fte-personCard ${genderClass} ${founder ? "is-founder" : ""} ${deceased ? "is-deceased" : ""} ${stateClasses} ${dragging ? "is-dragging" : ""}`}
      style={{ left: person.tree_x, top: person.tree_y, width: size.width, height: size.height }}
      role="group"
      tabIndex={0}
      title={tooltip}
      onPointerDown={(event) => onPointerDown(event, person)}
      data-static={!canDrag}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit(person);
        }
      }}
    >
      {hasChildren ? (
        <button
          type="button"
          className="fte-collapseButton"
          title={collapsed ? t("tree.card.collapse.expand") : t("tree.card.collapse.collapse")}
          onPointerDown={stopActionPointer}
          onClick={(event) => {
            event.stopPropagation();
            onToggleCollapse?.(person.id);
          }}
        >
          <span className="material-symbols-outlined">{collapsed ? "add" : "remove"}</span>
        </button>
      ) : null}

      {badges.length ? (
        <div className="fte-stateDots" aria-hidden="true">
          {state.self ? <span className="is-self" /> : null}
          {state.online ? <span className="is-online" /> : null}
          {state.search ? <span className="is-search" /> : null}
          {state.editing ? <span className="is-editing" /> : null}
          {state.error ? <span className="is-error" /> : null}
        </div>
      ) : null}

      {canEdit || canDelete ? (
        <div className="fte-cardHoverActions" aria-label={t("posts.modal.create.tabs.ariaLabel")}>
          {canEdit ? (
            <button type="button" className="is-create" title={t("tree.card.addRelation")} onPointerDown={stopActionPointer} onClick={(event) => { event.stopPropagation(); onQuickCreate?.(person); }}>
              <span className="material-symbols-outlined">add</span>
            </button>
          ) : null}
          {canEdit ? (
            <button type="button" title={t("tree.card.edit")} onPointerDown={stopActionPointer} onClick={(event) => { event.stopPropagation(); onEdit(person); }}>
              <span className="material-symbols-outlined">edit</span>
            </button>
          ) : null}
          {canDelete ? (
            <button type="button" className="is-danger" title={t("tree.card.delete")} onPointerDown={stopActionPointer} onClick={(event) => { event.stopPropagation(); onDelete(person); }}>
              <span className="material-symbols-outlined">delete</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {isClanChief ? <span className="fte-chiefBadge">{t("tree.card.chief")}</span> : null}
      <div className={`fte-ancestorIcon ${person.avatar_url ? "has-photo" : ""}`}>
        {person.avatar_url ? <img className="fte-mainPhoto" src={person.avatar_url} alt="" /> : <span className="material-symbols-outlined">person</span>}
      </div>
      <div className="fte-cardName">{name}</div>
      <div className="fte-cardGeneration">{t("tree.card.generation", { count: person.generation || 1 })}</div>
      <div className="fte-cardMeta">{lifeParts.length > 0 ? lifeParts.join(" - ") : t("tree.card.noBirthDate")}</div>
      {state.editing ? <span className="fte-nodeBadge is-editing">{t("tree.card.badges.editing")}</span> : null}
      {state.error ? <span className="fte-nodeBadge is-error">!</span> : null}
      {canEdit ? (
        <span className="fte-resizeHandle" role="presentation" title={t("tree.card.resize")} onPointerDown={(event) => onResizePointerDown(event, person)} />
      ) : null}
    </div>
  );
}

