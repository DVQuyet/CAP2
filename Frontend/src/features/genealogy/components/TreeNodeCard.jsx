import { useLanguage } from "../../../i18n/LanguageContext";
import { formatDateVN } from "../../../shared/utils/dateFormat";
import { getPersonHighlightState, highlightClassNames } from "../utils/treeHighlight";
import { CARD_HEIGHT, CARD_WIDTH, META_FONT_SIZE, META_FONT_WEIGHT, NAME_FONT_SIZE, NAME_FONT_WEIGHT } from "../utils/tree-editor/treeConstants";
import { TREE_DISPLAY_MODE, getTreeDisplayConfig } from "../utils/tree-editor/treeDisplayConfig";

function fullName(person, fallback) {
  return person?.display_name || [person?.surname, person?.middle_name, person?.first_name].filter(Boolean).join(" ").trim() || fallback;
}

function yearOnly(value) {
  const text = String(value || "");
  const match = text.match(/\d{4}/);
  return match ? match[0] : "";
}

export default function TreeNodeCard({
  person,
  selected,
  dragging,
  canDrag = true,
  canEdit = false,
  canDelete = false,
  founder = false,
  directLineage = false,
  size = { width: CARD_WIDTH, height: CARD_HEIGHT },
  displayMode = TREE_DISPLAY_MODE.DETAIL,
  cardOrientation = "horizontal",
  fontSize,
  related = false,
  dimmed = false,
  hasChildren = false,
  hasAncestors = false,
  collapsed = false,
  ancestorsCollapsed = false,
  highlightOptions = {},
  onPointerDown,
  onResizePointerDown,
  onEdit,
  onDelete,
  onQuickCreate,
  onToggleCollapse,
  onToggleDescendants,
  onToggleAncestors,
}) {
  const { t } = useLanguage();
  const name = fullName(person, t("tree.card.fallbackName"));
  const genderClass = Number(person.gender) === 1 ? "is-male" : Number(person.gender) === 2 ? "is-female" : "is-unknown";
  const birthText = formatDateVN(person.birth_date);
  const deathText = formatDateVN(person.death_date);
  const deceased = Number(person.is_living) === 0;
  const isClanChief = Number(person.role_id) === 2;
  const generation = Number(person.generation) || 1;
  const generationClass = founder ? "is-generation-root" : generation <= 2 ? "is-generation-early" : generation <= 4 ? "is-generation-mid" : "is-generation-late";
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
  const displayConfig = getTreeDisplayConfig(displayMode);
  const resolvedFontSize = Number(fontSize) || displayConfig.singleNameFontSize || displayConfig.nameFontSize || NAME_FONT_SIZE;
  const showMeta = displayConfig.showMeta !== false;
  const showAvatar = false;

  const birthYear = yearOnly(person.birth_date || birthText);
  const deathYear = deceased ? yearOnly(person.death_date || deathText) : "";
  const lifeText = birthYear && deathYear ? `${birthYear}-${deathYear}` : birthYear || deathYear || "";
  const metaItems = [
    person.generation ? t("tree.card.generation", { count: person.generation }) : "",
    lifeText,
    person.branch ? `Chi ${person.branch}` : "",
    Number(person.role_id) === 2 ? t("tree.card.chief") : "",
  ].filter(Boolean);

  const stopActionPointer = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      id={`fte-person-${person.id}`}
      className={`fte-personCard is-${displayMode} is-${cardOrientation} ${genderClass} ${generationClass} ${founder ? "is-founder" : ""} ${deceased ? "is-deceased" : ""} ${stateClasses} ${related ? "is-related" : ""} ${dimmed ? "is-dimmed" : ""} ${dragging ? "is-dragging" : ""}`}
      style={{
        left: person.tree_x,
        top: person.tree_y,
        width: size.width,
        height: size.height,
        "--fte-card-width": `${size.width}px`,
        "--fte-card-height": `${size.height}px`,
        "--fte-card-name-size": `${resolvedFontSize}px`,
        "--fte-card-name-weight": NAME_FONT_WEIGHT,
        "--fte-card-meta-size": `${Math.max(10, Math.round(resolvedFontSize * 0.7)) || displayConfig.singleMetaFontSize || displayConfig.metaFontSize || META_FONT_SIZE}px`,
        "--fte-card-meta-weight": META_FONT_WEIGHT,
      }}
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

      {canEdit || canDelete || hasChildren || hasAncestors ? (
        <div className="fte-cardHoverActions" aria-label={t("posts.modal.create.tabs.ariaLabel")}>
          {canEdit ? (
            <button type="button" className="is-create" title={t("tree.card.addRelation")} onPointerDown={stopActionPointer} onClick={(event) => { event.stopPropagation(); onQuickCreate?.(person); }}>
              <span className="material-symbols-outlined">add</span>
            </button>
          ) : null}
          {hasChildren ? (
            <button
              type="button"
              title={collapsed ? "Mo tat ca doi con chau" : "Dong tat ca doi con chau"}
              onPointerDown={stopActionPointer}
              onClick={(event) => { event.stopPropagation(); onToggleDescendants?.(person.id); }}
            >
              <span className="material-symbols-outlined">{collapsed ? "unfold_more" : "unfold_less"}</span>
            </button>
          ) : null}
          {hasAncestors ? (
            <button
              type="button"
              title={ancestorsCollapsed ? "Mo tat ca doi to tien" : "Dong tat ca doi to tien"}
              onPointerDown={stopActionPointer}
              onClick={(event) => { event.stopPropagation(); onToggleAncestors?.(person.id); }}
            >
              <span className="material-symbols-outlined">{ancestorsCollapsed ? "keyboard_double_arrow_down" : "keyboard_double_arrow_up"}</span>
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
      {directLineage ? <span className="fte-directLineageMark" title="Truc he" aria-label="Truc he">◎</span> : null}
      {showAvatar ? <div className={`fte-ancestorIcon ${person.avatar_url ? "has-photo" : ""}`}>
        {person.avatar_url ? <img className="fte-mainPhoto" src={person.avatar_url} alt="" /> : <span className="material-symbols-outlined">person</span>}
      </div> : null}
      <div className="fte-cardName">{name}</div>
      {showMeta && metaItems.length ? <div className="fte-cardMeta">{metaItems.join(" · ")}</div> : null}
      {state.editing ? <span className="fte-nodeBadge is-editing">{t("tree.card.badges.editing")}</span> : null}
      {state.error ? <span className="fte-nodeBadge is-error">!</span> : null}
      {canEdit ? (
        <span className="fte-resizeHandle" role="presentation" title={t("tree.card.resize")} onPointerDown={(event) => onResizePointerDown(event, person)} />
      ) : null}
    </div>
  );
}

