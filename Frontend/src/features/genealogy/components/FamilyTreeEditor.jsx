import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { createPortal } from "react-dom";
import { createPersonAPI, deletePersonAPI, linkRelationsAPI, previewRelationsAPI, saveTreeLayoutBatchAPI, saveTreeLayoutAPI, updatePersonAPI } from "../../../api/managerService";
import { extractGenealogyAI } from "../../../api/aiServerService";
import { onSocketEvent } from "../../../services/socket";
import { vietnamDateToIso } from "../../../shared/utils/dateFormat";
import TreeToolbar from "./TreeToolbarParts/TreeToolbar";
import TreeMobileControls from "./TreeToolbarParts/TreeMobileControls";
import TreeZoomControls from "./TreeToolbarParts/TreeZoomControls";
import TreeStyleControls from "./TreeToolbarParts/TreeStyleControls";
import CoupleCard from "./CoupleCard";
import TreeNodeCard from "./TreeNodeCard";
import { useLanguage } from "../../../i18n/LanguageContext";
import { useTreeSearch } from "../hooks/useTreeSearch";
import { useTreeViewMode } from "../hooks/useTreeViewMode";
import { useTreeRealtime } from "../hooks/useTreeRealtime";
import { buildFamilyIndexes, getAncestorIds, getDescendantIds, getHiddenDescendantIds } from "../utils/treeFilter";
import VoiceRecorder from "../../voice/components/VoiceRecorder";
import { validateTreeData } from "../utils/treeValidation";
import { CANVAS_PADDING, CARD_HEIGHT, CARD_WIDTH } from "../utils/tree-editor/treeConstants";
import { asArray, extractCreatedPersonId, formatDisplayDate, fullName, normalizePerson, readCurrentAccount, snap, snapLine, clamp, toInt } from "../utils/tree-editor/treePersonUtils";
import { clearCardSizes, clearLineRoutes, getCardSize, loadCardSizes, loadLineRoutes, normalizeCardSize, normalizeLayoutObject, normalizeLayoutSettings, saveCardSizes, saveLineRoutes } from "../utils/tree-editor/treeStorage";
import { dedupePeopleByAccount, remapChildrenByPeople, remapFamiliesByPeople } from "../utils/tree-editor/treeNormalize";
import { autoLayoutPeople, computeReferencePlacements, findFounderIds, generationY, mergeManualAndAutoLayout } from "../utils/tree-editor/treeLayout";
import ReferenceCard from "./ReferenceCard";
import { blankCreateForm, buildCreateRelationFields, buildLinkPayload, defaultRelationOptions, findParentFamilyForChild, findSpouse, findSpouseFamily, getChildOrderMapForFamily, getChildrenForFamily, getFamiliesForPerson, relationCandidates, relationLinkedIds } from "../utils/tree-editor/treeRelations";
import { downloadBlob, exportFileName, exportPreparedTree, prepareTreeExportPayload } from "../utils/tree-editor/treeExport";
import { DEFAULT_TREE_EXPORT_OPTIONS, TREE_EXPORT_FORMAT, TREE_EXPORT_MODE } from "../utils/tree-editor/treeExportConfig";
import { TREE_CARD_ORIENTATION, TREE_DISPLAY_MODE, TREE_THEME, TREE_THEMES, TREE_THEME_BACKGROUNDS } from "../utils/tree-editor/treeDisplayConfig";
import { DISPLAY_NODE_TYPE, buildDisplayTree, buildDisplayTreeLines } from "../utils/tree-editor/treeDisplayNodes";
import { FORM_ONLY_FIELDS, historicalPayloadFromForm } from "../utils/tree-editor/historicalDates";
import { CenterNoticeDialog, CreatePersonDialog, PersonInspector, QuickCreateRelationDialog, RelationSelectDialog, ArchivedMembersDialog } from "./FamilyTreeEditorParts/index.js";
import "./FamilyTreeEditor.css";
import "./FamilyTreeEditor.v2.css";

const shouldSuppressInlineRelationError = (error) => Boolean(error?.__centeredNoticeShown);

const todayIsoDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Kiểm tra form người: ngày nhập sai (vd 99/99/2000) không được lưu im lặng thành rỗng; số điện thoại hợp lệ.
const PHONE_PATTERN = /^\+?[0-9 .-]{8,15}$/;
const personFormError = (form, t) => {
  for (const [field, label] of [["birth_date", "birthDate"], ["death_date", "deathDate"]]) {
    const text = String(form?.[field] || "").trim();
    const yearOnly = ["year", "approximate", "unknown"].includes(form?.[`${field.replace("_date", "")}_date_precision`]);
    if (text && !yearOnly && !vietnamDateToIso(text)) {
      return t("tree.formErrors.invalidDate", { field: t(`tree.inspector.fields.${label}`) });
    }
  }
  const phone = String(form?.phone || "").trim();
  if (phone && !PHONE_PATTERN.test(phone)) return t("tree.formErrors.invalidPhone");
  return "";
};

const isBirthDateInFuture = (birthDate) => {
  const birthIso = vietnamDateToIso(birthDate);
  return Boolean(birthIso && birthIso > todayIsoDate());
};



const isoDateOnlyValue = (value) => {
  const converted = vietnamDateToIso(value);
  if (converted) return converted;
  const text = String(value || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
};

const addYearsToIsoDate = (value, years) => {
  const iso = isoDateOnlyValue(value);
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(year + years, month - 1, day));
  return Number.isNaN(target.getTime()) ? "" : target.toISOString().slice(0, 10);
};

const parentChildAgeConstraintMessage = (childBirthDate, parentBirthDate) => {
  const childBirth = isoDateOnlyValue(childBirthDate);
  const parentBirth = isoDateOnlyValue(parentBirthDate);
  if (!childBirth || !parentBirth) return "";

  if (childBirth === parentBirth) {
    return "Cha/mẹ và con không được có cùng ngày tháng năm sinh.";
  }

  if (childBirth < parentBirth) {
    return "Ngày sinh của con phải nhỏ hơn của cha mẹ.";
  }

  const minChildBirth = addYearsToIsoDate(parentBirth, 16);
  if (minChildBirth && childBirth < minChildBirth) {
    return "Cha/mẹ phải lớn hơn con ít nhất 16 tuổi.";
  }

  return "";
};

const personBirthValue = (person) => person?.birth_date || person?.birthDate || person?.birth || "";

const LAYOUT_BATCH_SIZE = 5;
const LAYOUT_FLUSH_DELAY_MS = 10000;
const AI_RELATION_TYPES = ["parent_child", "spouse"];
const AI_RELATION_TYPE_OPTIONS = [
  { value: "parent_child", labelKey: "tree.genealogyAi.relationshipOptions.parentChild" },
  { value: "spouse", labelKey: "tree.genealogyAi.relationshipOptions.spouse" },
];

const TREE_TITLE_STORAGE_PREFIX = "family-tree-title-label:";
const DISPLAY_NODE_POSITION_STORAGE_PREFIX = "family-tree-display-node-positions:";
const TREE_STYLE_STORAGE_PREFIX = "family-tree-style:";
const USE_LOCAL_DRAFT_LAYOUT = false;
const DEFAULT_TREE_TITLE_LABEL = {
  x: 60,
  y: 42,
  color: "#7d1f13",
  fontSize: 42,
};
const DEFAULT_TREE_STYLE = {
  cardOrientation: TREE_CARD_ORIENTATION.HORIZONTAL,
  theme: TREE_THEME.TRADITIONAL,
  // null = dùng màu nền của chủ đề.
  backgroundColor: null,
  fontSize: 17,
};
// Màu nền mặc định cũ; dữ liệu đã lưu với màu này được coi là "chưa chọn màu riêng".
const LEGACY_DEFAULT_BACKGROUND = "#f8f2e8";

const TREE_MOBILE_QUERY = "(max-width: 760px)";
// Dưới mức zoom này thẻ chỉ hiện tên (chữ lớn hơn) để vẫn đọc được khi xem toàn cây.
const FAR_ZOOM_SCALE = 0.55;
// Hệ số phóng chữ = FAR_ZOOM_TEXT_TARGET / zoom, để tên trên màn hình luôn khoảng 9px trở lên.
const FAR_ZOOM_TEXT_TARGET = 0.66;
// Khoảng trống bên trái cây dành cho nhãn "Đời N".
const GENERATION_LANE_GUTTER = 120;

// Giữ tiêu đề luôn nằm trong vùng an toàn của canvas.
// Local layout draft is disabled by default; database layout is the canonical source.
const TREE_TITLE_SAFE_BOUNDS = {
  minX: 16,
  minY: 16,
  maxX: 1600,
  maxY: 520,
};

const getTreeTitleStorageKey = (clanId) => `${TREE_TITLE_STORAGE_PREFIX}${clanId || "default"}`;
const getDisplayNodePositionStorageKey = (clanId) => `${DISPLAY_NODE_POSITION_STORAGE_PREFIX}${clanId || "default"}`;
const getTreeStyleStorageKey = (clanId) => `${TREE_STYLE_STORAGE_PREFIX}${clanId || "default"}`;

const normalizeHexColor = (value, fallback) => (
  /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback
);

const normalizeTreeStyle = (value) => {
  const source = value && typeof value === "object" ? value : {};
  const fontSize = Number(source.fontSize ?? source.font_size);
  return {
    cardOrientation: source.cardOrientation === TREE_CARD_ORIENTATION.VERTICAL
      ? TREE_CARD_ORIENTATION.VERTICAL
      : TREE_CARD_ORIENTATION.HORIZONTAL,
    theme: TREE_THEMES.includes(source.theme) ? source.theme : DEFAULT_TREE_STYLE.theme,
    backgroundColor: (() => {
      const color = normalizeHexColor(source.backgroundColor ?? source.background_color, null);
      return color && color.toLowerCase() !== LEGACY_DEFAULT_BACKGROUND ? color : null;
    })(),
    fontSize: Number.isFinite(fontSize) ? clamp(fontSize, 12, 28) : DEFAULT_TREE_STYLE.fontSize,
    titleLabel: normalizeTreeTitleLabel(source.titleLabel || source.title_label),
  };
};

const normalizeTreeTitleLabel = (value) => {
  const source = value && typeof value === "object" ? value : {};
  const x = Number(source.x);
  const y = Number(source.y);
  const fontSize = Number(source.fontSize ?? source.font_size);
  const color = /^#[0-9a-f]{6}$/i.test(String(source.color || ""))
    ? String(source.color)
    : DEFAULT_TREE_TITLE_LABEL.color;

  return {
    x: Number.isFinite(x) ? clamp(x, TREE_TITLE_SAFE_BOUNDS.minX, TREE_TITLE_SAFE_BOUNDS.maxX) : DEFAULT_TREE_TITLE_LABEL.x,
    y: Number.isFinite(y) ? clamp(y, TREE_TITLE_SAFE_BOUNDS.minY, TREE_TITLE_SAFE_BOUNDS.maxY) : DEFAULT_TREE_TITLE_LABEL.y,
    color,
    fontSize: Number.isFinite(fontSize) ? clamp(fontSize, 18, 96) : DEFAULT_TREE_TITLE_LABEL.fontSize,
  };
};

const loadTreeTitleLabel = (clanId) => {
  if (!USE_LOCAL_DRAFT_LAYOUT) return normalizeTreeTitleLabel(null);
  if (typeof window === "undefined") return normalizeTreeTitleLabel(null);
  try {
    const raw = window.localStorage.getItem(getTreeTitleStorageKey(clanId));
    return normalizeTreeTitleLabel(raw ? JSON.parse(raw) : null);
  } catch (error) {
    console.warn("Cannot read saved tree title label", error);
    return normalizeTreeTitleLabel(null);
  }
};

const saveTreeTitleLabel = (clanId, value) => {
  if (!USE_LOCAL_DRAFT_LAYOUT) return;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getTreeTitleStorageKey(clanId), JSON.stringify(normalizeTreeTitleLabel(value)));
  } catch (error) {
    console.warn("Cannot save tree title label", error);
  }
};

const loadDisplayNodePositions = (clanId) => {
  if (!USE_LOCAL_DRAFT_LAYOUT) return {};
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(getDisplayNodePositionStorageKey(clanId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const saveDisplayNodePositions = (clanId, value) => {
  if (!USE_LOCAL_DRAFT_LAYOUT) return;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getDisplayNodePositionStorageKey(clanId), JSON.stringify(value || {}));
  } catch {
  }
};

const loadTreeStyle = (clanId) => {
  if (!USE_LOCAL_DRAFT_LAYOUT) return normalizeTreeStyle(null);
  if (typeof window === "undefined") return normalizeTreeStyle(null);
  try {
    const raw = window.localStorage.getItem(getTreeStyleStorageKey(clanId));
    return normalizeTreeStyle(raw ? JSON.parse(raw) : null);
  } catch (error) {
    console.warn("Cannot read saved tree style", error);
    return normalizeTreeStyle(null);
  }
};

const saveTreeStyle = (clanId, value) => {
  if (!USE_LOCAL_DRAFT_LAYOUT) return;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getTreeStyleStorageKey(clanId), JSON.stringify(normalizeTreeStyle(value)));
  } catch (error) {
    console.warn("Cannot save tree style", error);
  }
};

const aiRelationshipTypeLabel = (type, t) => {
  const option = AI_RELATION_TYPE_OPTIONS.find((item) => item.value === type);
  return option ? t(option.labelKey) : type;
};

const toAiDraftGender = (gender) => {
  if (gender === "male" || Number(gender) === 1) return "male";
  if (gender === "female" || Number(gender) === 2) return "female";
  return "";
};

const aiGenderToPersonGender = (gender) => {
  if (gender === "male") return 1;
  if (gender === "female") return 2;
  return null;
};

const aiGenderToParentRole = (gender) => {
  if (gender === "female") return "mother";
  return "father";
};

const normalizeAiYear = (value) => {
  const year = Number(value);
  return Number.isFinite(year) && year > 0 ? String(Math.round(year)) : "";
};

const normalizeAiDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim()) ? String(value).trim() : "");

const normalizeAiLivingStatus = (member = {}) => {
  const raw = member?.is_living ?? member?.living_status ?? member?.life_status ?? member?.status;
  const text = String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (["1", "true", "living", "alive", "con song", "song"].includes(text)) return "1";
  if (["0", "false", "deceased", "dead", "da mat", "mat", "passed", "passed away"].includes(text)) return "0";

  return "0";
};

const normalizeAiNameKey = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const buildExistingPeopleByName = (people = [], t) => {
  const map = new Map();
  asArray(people).forEach((person) => {
    const key = normalizeAiNameKey(fullName(person, t("tree.card.fallbackName")));
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(person);
  });
  return map;
};

const existingPersonOptionLabel = (person, t) => {
  const parts = [
    fullName(person, t("tree.card.fallbackName")),
    person?.generation ? t("tree.card.generation", { count: person.generation }) : null,
    person?.birth_date ? person.birth_date : null,
    person?.id ? `ID ${person.id}` : null,
  ].filter(Boolean);
  return parts.join(" - ");
};

const normalizeAiGeneration = (value) => {
  const generation = Number(value);
  return Number.isFinite(generation) && generation > 0 ? Math.max(1, Math.round(generation)) : null;
};

const resolveAiExistingPerson = (member, existingPeopleByAiName, people = []) => {
  const selectedExistingId = Number(member?.existing_person_id);
  if (Number.isFinite(selectedExistingId) && selectedExistingId > 0) {
    return asArray(people).find((person) => Number(person.id) === selectedExistingId) || null;
  }

  return null;
};

const computeAiDraftGenerationMap = (members = [], relationships = [], existingPeopleByAiName, people = []) => {
  const memberIds = new Set(members.map((member) => member.temporary_id));
  const generations = new Map();
  const locked = new Set();

  members.forEach((member) => {
    const existing = resolveAiExistingPerson(member, existingPeopleByAiName, people);
    const generation = normalizeAiGeneration(existing?.generation);
    if (!generation) return;
    generations.set(member.temporary_id, generation);
    locked.add(member.temporary_id);
  });

  const setGeneration = (temporaryId, nextGeneration) => {
    if (!memberIds.has(temporaryId) || locked.has(temporaryId)) return false;
    const generation = normalizeAiGeneration(nextGeneration);
    if (!generation || generations.get(temporaryId) === generation) return false;
    generations.set(temporaryId, generation);
    return true;
  };

  for (let pass = 0; pass < Math.max(4, members.length + relationships.length); pass += 1) {
    let changed = false;

    for (const relation of relationships) {
      if (relation.type === "spouse") {
        const left = relation.from;
        const right = relation.to;
        if (!memberIds.has(left) || !memberIds.has(right)) continue;

        const leftGeneration = generations.get(left);
        const rightGeneration = generations.get(right);
        if (leftGeneration) changed = setGeneration(right, leftGeneration) || changed;
        else if (rightGeneration) changed = setGeneration(left, rightGeneration) || changed;
        else {
          changed = setGeneration(left, 1) || changed;
          changed = setGeneration(right, 1) || changed;
        }
      }

      if (relation.type === "parent_child") {
        const parent = relation.parent;
        const child = relation.child;
        if (!memberIds.has(parent) || !memberIds.has(child)) continue;

        const parentGeneration = generations.get(parent);
        const childGeneration = generations.get(child);
        if (parentGeneration) changed = setGeneration(child, parentGeneration + 1) || changed;
        else if (childGeneration) changed = setGeneration(parent, Math.max(1, childGeneration - 1)) || changed;
        else {
          changed = setGeneration(parent, 1) || changed;
          changed = setGeneration(child, 2) || changed;
        }
      }
    }

    if (!changed) break;
  }

  members.forEach((member) => {
    if (!generations.has(member.temporary_id)) generations.set(member.temporary_id, 1);
  });

  return generations;
};

const normalizeAiDraftMembers = (members = []) =>
  asArray(members).map((member, index) => {
    const temporaryId = String(member?.temporary_id || `p${index + 1}`).trim() || `p${index + 1}`;
    const isLiving = normalizeAiLivingStatus(member);
    return {
      temporary_id: temporaryId,
      full_name: String(member?.full_name || "").trim(),
      gender: toAiDraftGender(member?.gender),
      birth_year: normalizeAiYear(member?.birth_year),
      death_year: isLiving === "1" ? "" : normalizeAiYear(member?.death_year),
      birth_date: normalizeAiDate(member?.birth_date),
      death_date: isLiving === "1" ? "" : normalizeAiDate(member?.death_date),
      is_living: isLiving,
      phone: String(member?.phone || "").trim(),
      address: String(member?.address || "").trim(),
      account_email: String(member?.account_email || member?.email || "").trim(),
      account_password: "",
      notes: String(member?.notes || "").trim(),
      confidence: member?.confidence ?? "",
      existing_person_id: "",
    };
  });

const normalizeAiDraftRelationships = (relationships = [], members = []) => {
  const memberIds = new Set(members.map((member) => member.temporary_id));
  const memberById = new Map(members.map((member) => [member.temporary_id, member]));

  return asArray(relationships).map((relation, index) => {
    const type = AI_RELATION_TYPES.includes(relation?.type) ? relation.type : "parent_child";
    const parent = String(relation?.parent || "").trim();
    const child = String(relation?.child || "").trim();
    const from = String(relation?.from || "").trim();
    const to = String(relation?.to || "").trim();
    const normalized = {
      draft_id: `r${index + 1}`,
      type,
      parent: memberIds.has(parent) ? parent : "",
      child: memberIds.has(child) ? child : "",
      from: memberIds.has(from) ? from : "",
      to: memberIds.has(to) ? to : "",
      parent_role: aiGenderToParentRole(memberById.get(parent)?.gender),
      evidence: String(relation?.evidence || "").trim(),
      confidence: relation?.confidence ?? "",
    };

    if (type !== "parent_child") {
      normalized.from = normalized.from || normalized.parent;
      normalized.to = normalized.to || normalized.child;
    }

    return normalized;
  });
};

export default function FamilyTreeEditor({
  clan,
  people: initialPeople = [],
  families = [],
  children: childRows = [],
  loading = false,
  onReload,
  layoutSettings,
  permission,
  editPermission,
  readOnly = false,
  enableRealtime = true,
}) {
  const [isTreeMobile, setIsTreeMobile] = useState(() => (
    typeof window !== "undefined" && window.matchMedia(TREE_MOBILE_QUERY).matches
  ));
  const [mobileTreePanel, setMobileTreePanel] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia(TREE_MOBILE_QUERY);
    const syncMobileState = (event) => setIsTreeMobile(event.matches);

    syncMobileState(mediaQuery);
    mediaQuery.addEventListener?.("change", syncMobileState);

    return () => {
      mediaQuery.removeEventListener?.("change", syncMobileState);
    };
  }, []);

  useEffect(() => {
    if (!isTreeMobile && mobileTreePanel) {
      setMobileTreePanel(null);
    }
  }, [isTreeMobile, mobileTreePanel]);

  const { t, language } = useLanguage();
  const treeRef = useRef(null);
  const viewportRef = useRef(null);
  const transformApiRef = useRef(null);
  const genealogyRecognitionRef = useRef(null);
  const lastAutoFitKeyRef = useRef("");
  const scaleRef = useRef(0.85);
  const defaultTreeTitleText = String(clan?.clan_name || t("tree.card.fallbackName")).toUpperCase();
  const databaseTreeStyle = useMemo(
    () => normalizeTreeStyle(layoutSettings?.tree_style || clan?.tree_style || null),
    [clan?.tree_style, layoutSettings?.tree_style],
  );
  const [currentScale, setCurrentScale] = useState(0.85);
  const [transformReady, setTransformReady] = useState(0);
  const lastDragRef = useRef(null);
  const dragGroupRef = useRef(null);
  const bulkSelectRef = useRef(null);
  const lineDragRef = useRef(null);
  const titleDragRef = useRef(null);
  const [treeTitleLabel, setTreeTitleLabel] = useState(() => normalizeTreeTitleLabel(null));
  const [displayNodePositions, setDisplayNodePositions] = useState(() => (USE_LOCAL_DRAFT_LAYOUT ? loadDisplayNodePositions(clan?.id) : {}));
  const [draggingTitleLabel, setDraggingTitleLabel] = useState(false);
  const [people, setPeople] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedType, setSelectedType] = useState("person");
  const [selectedCoupleId, setSelectedCoupleId] = useState(null);
  const [couplePersonAction, setCouplePersonAction] = useState(null);
  const [treeDisplayMode, setTreeDisplayMode] = useState(TREE_DISPLAY_MODE.DETAIL);
  const [treeStyle, setTreeStyle] = useState(() => databaseTreeStyle);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState(DEFAULT_TREE_EXPORT_OPTIONS);
  const [bulkMoveMode, setBulkMoveMode] = useState(false);
  const [bulkSelectionRect, setBulkSelectionRect] = useState(null);
  const [selectedDisplayNodeIds, setSelectedDisplayNodeIds] = useState(() => new Set());
  const [draggingId, setDraggingId] = useState(null);
  const [draggingLineId, setDraggingLineId] = useState(null);
  const [lineRoutes, setLineRoutes] = useState(() => ({
    ...(USE_LOCAL_DRAFT_LAYOUT ? loadLineRoutes(clan?.id) : {}),
    ...normalizeLayoutSettings(layoutSettings).line_routes,
  }));
  const [cardSizes, setCardSizes] = useState(() => ({
    ...(USE_LOCAL_DRAFT_LAYOUT ? loadCardSizes(clan?.id) : {}),
    ...normalizeLayoutSettings(layoutSettings).card_sizes,
  }));
  const [status, setStatus] = useState("");
  const [constraintNotice, setConstraintNotice] = useState("");
  const [billingWarning, setBillingWarning] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [treeFullscreen, setTreeFullscreen] = useState(false);
  const [relationDialog, setRelationDialog] = useState(null);
  const [quickCreateDialog, setQuickCreateDialog] = useState(null);
  const [treeRelationPicker, setTreeRelationPicker] = useState(null);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [genealogyAiOpen, setGenealogyAiOpen] = useState(false);
  const [genealogyAiPrompt, setGenealogyAiPrompt] = useState("");
  const [genealogyAiResult, setGenealogyAiResult] = useState(null);
  const [genealogyAiDraftMembers, setGenealogyAiDraftMembers] = useState([]);
  const [genealogyAiDraftRelationships, setGenealogyAiDraftRelationships] = useState([]);
  const [genealogyAiError, setGenealogyAiError] = useState("");
  const [genealogyAiLoading, setGenealogyAiLoading] = useState(false);
  const [genealogyAiSaving, setGenealogyAiSaving] = useState(false);
  const [genealogyVoiceListening, setGenealogyVoiceListening] = useState(false);
  const [dialogSaving, setDialogSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState(() => new Map());
  const [selfPersonId, setSelfPersonId] = useState(null);
  const currentAccount = useMemo(readCurrentAccount, []);
  const layoutClientIdRef = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `layout-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const pendingLayoutRef = useRef({
    nodes: new Map(),
    lineRoutes: new Map(),
    cardSizes: new Map(),
  });
  const layoutFlushTimerRef = useRef(null);
  const layoutFlushInFlightRef = useRef(false);

  useEffect(() => {
    if (!isTreeMobile || !mobileTreePanel) return;
    if (
      dialog ||
      selectedId ||
      relationDialog ||
      quickCreateDialog ||
      couplePersonAction ||
      archiveDialogOpen ||
      genealogyAiOpen ||
      constraintNotice
    ) {
      setMobileTreePanel(null);
    }
  }, [
    archiveDialogOpen,
    constraintNotice,
    couplePersonAction,
    dialog,
    genealogyAiOpen,
    isTreeMobile,
    mobileTreePanel,
    quickCreateDialog,
    relationDialog,
    selectedId,
  ]);

  const getPendingLayoutChangeCount = useCallback(() => {
    const pending = pendingLayoutRef.current;
    return pending.nodes.size + pending.lineRoutes.size + pending.cardSizes.size;
  }, []);

  const flushLayoutChanges = useCallback(async () => {
    if (layoutFlushInFlightRef.current) return false;
    const pending = pendingLayoutRef.current;
    if (!pending.nodes.size && !pending.lineRoutes.size && !pending.cardSizes.size) return true;

    if (layoutFlushTimerRef.current) {
      window.clearTimeout(layoutFlushTimerRef.current);
      layoutFlushTimerRef.current = null;
    }

    const nodes = Array.from(pending.nodes.values());
    const lineRoutes = {};
    pending.lineRoutes.forEach((item) => {
      const familyId = Number(item.family_id);
      if (!Number.isFinite(familyId)) return;
      const routeKey = item.route_key || "baseY";
      lineRoutes[familyId] = { ...(lineRoutes[familyId] || {}), [routeKey]: item.value };
    });
    const cardSizesPayload = Object.fromEntries(pending.cardSizes.entries());
    pendingLayoutRef.current = {
      nodes: new Map(),
      lineRoutes: new Map(),
      cardSizes: new Map(),
    };

    layoutFlushInFlightRef.current = true;
    try {
      await saveTreeLayoutBatchAPI({
        clan_id: clan?.id,
        client_layout_id: layoutClientIdRef.current,
        nodes,
        line_routes: lineRoutes,
        card_sizes: cardSizesPayload,
      });
      return true;
    } catch (error) {
      const current = pendingLayoutRef.current;
      nodes.forEach((node) => {
        const key = Number(node.person_id);
        if (!current.nodes.has(key)) current.nodes.set(key, node);
      });
      Object.entries(lineRoutes).forEach(([familyId, routes]) => {
        Object.entries(routes || {}).forEach(([routeKey, value]) => {
          const key = `${familyId}:${routeKey}`;
          if (!current.lineRoutes.has(key)) {
            current.lineRoutes.set(key, { family_id: Number(familyId), route_key: routeKey, value });
          }
        });
      });
      Object.entries(cardSizesPayload).forEach(([personId, size]) => {
        if (!current.cardSizes.has(String(personId))) current.cardSizes.set(String(personId), size);
      });
      setStatus(error?.message || t("tree.messages.saveLayoutError"));
      return false;
    } finally {
      layoutFlushInFlightRef.current = false;
      if (getPendingLayoutChangeCount() > 0 && !layoutFlushTimerRef.current) {
        layoutFlushTimerRef.current = window.setTimeout(() => {
          layoutFlushTimerRef.current = null;
          flushLayoutChanges();
        }, LAYOUT_FLUSH_DELAY_MS);
      }
    }
  }, [clan?.id, getPendingLayoutChangeCount, t]);

  const enqueueLayoutChanges = useCallback((changes = {}) => {
    const pending = pendingLayoutRef.current;

    asArray(changes.nodes).forEach((node) => {
      const personId = Number(node?.person_id ?? node?.id);
      if (!Number.isFinite(personId) || personId <= 0) return;
      pending.nodes.set(personId, {
        person_id: personId,
        tree_x: snap(node.tree_x),
        tree_y: snap(node.tree_y),
      });
    });

    asArray(changes.lineRoutes).forEach((route) => {
      const familyId = Number(route?.family_id ?? route?.familyId);
      const routeKey = route?.route_key || route?.routeKey || "baseY";
      const value = snapLine(route?.value);
      if (!Number.isFinite(familyId)) return;
      pending.lineRoutes.set(`${familyId}:${routeKey}`, {
        family_id: familyId,
        route_key: routeKey,
        value,
      });
    });

    asArray(changes.cardSizes).forEach((item) => {
      const personId = Number(item?.person_id ?? item?.personId ?? item?.id);
      if (!Number.isFinite(personId) || personId <= 0) return;
      pending.cardSizes.set(String(personId), normalizeCardSize(item));
    });

    if (getPendingLayoutChangeCount() >= LAYOUT_BATCH_SIZE) {
      flushLayoutChanges();
      return;
    }

    if (layoutFlushTimerRef.current) window.clearTimeout(layoutFlushTimerRef.current);
    layoutFlushTimerRef.current = window.setTimeout(() => {
      layoutFlushTimerRef.current = null;
      flushLayoutChanges();
    }, LAYOUT_FLUSH_DELAY_MS);
  }, [flushLayoutChanges, getPendingLayoutChangeCount]);

  const applyRemoteLayoutUpdate = useCallback((payload) => {
    const layout = payload?.layout;
    if (!layout || typeof layout !== "object") return;

    const nodeChanges = asArray(layout.nodes);
    if (nodeChanges.length) {
      setPeople((current) =>
        current.map((person) => {
          const change = nodeChanges.find((item) => Number(item.person_id ?? item.id) === Number(person.id));
          return change ? { ...person, tree_x: snap(change.tree_x), tree_y: snap(change.tree_y) } : person;
        }),
      );
    }

    const nextLineRoutesPatch = normalizeLayoutObject(layout.line_routes || layout.lineRoutes);
    if (layout.line_routes_full || Object.keys(nextLineRoutesPatch).length) {
      setLineRoutes((current) => {
        const next = layout.line_routes_full ? { ...nextLineRoutesPatch } : { ...current };
        if (!layout.line_routes_full) {
          Object.entries(nextLineRoutesPatch).forEach(([familyId, routes]) => {
            if (!routes || typeof routes !== "object" || Array.isArray(routes)) return;
            next[familyId] = { ...(next[familyId] || {}), ...routes };
          });
        }
        if (USE_LOCAL_DRAFT_LAYOUT) saveLineRoutes(clan?.id, next);
        return next;
      });
    }

    const nextCardSizesPatch = normalizeLayoutObject(layout.card_sizes || layout.cardSizes);
    if (layout.card_sizes_full || Object.keys(nextCardSizesPatch).length) {
      setCardSizes((current) => {
        const next = layout.card_sizes_full ? {} : { ...current };
        Object.entries(nextCardSizesPatch).forEach(([personId, size]) => {
          next[personId] = normalizeCardSize(size);
        });
        if (USE_LOCAL_DRAFT_LAYOUT) saveCardSizes(clan?.id, next);
        return next;
      });
    }

    const nextTreeStyle = layout.tree_style || layout.treeStyle;
    if (nextTreeStyle && typeof nextTreeStyle === "object" && !Array.isArray(nextTreeStyle)) {
      const normalized = normalizeTreeStyle(nextTreeStyle);
      setTreeStyle(normalized);
      setTreeTitleLabel(normalizeTreeTitleLabel(normalized.titleLabel));
    }
  }, [clan?.id]);

  useEffect(() => {
    const normalizedSettings = normalizeLayoutSettings(layoutSettings);
    setLineRoutes({
      ...(USE_LOCAL_DRAFT_LAYOUT ? loadLineRoutes(clan?.id) : {}),
      ...normalizedSettings.line_routes,
    });
    setCardSizes({
      ...(USE_LOCAL_DRAFT_LAYOUT ? loadCardSizes(clan?.id) : {}),
      ...normalizedSettings.card_sizes,
    });
  }, [clan?.id, layoutSettings]);

  useEffect(() => {
    setTreeTitleLabel(USE_LOCAL_DRAFT_LAYOUT ? loadTreeTitleLabel(clan?.id) : normalizeTreeTitleLabel(databaseTreeStyle.titleLabel || databaseTreeStyle.title_label));
    setDisplayNodePositions(USE_LOCAL_DRAFT_LAYOUT ? loadDisplayNodePositions(clan?.id) : {});
    setTreeStyle(USE_LOCAL_DRAFT_LAYOUT ? loadTreeStyle(clan?.id) : databaseTreeStyle);
  }, [clan?.id, databaseTreeStyle]);

  useEffect(() => {
    saveTreeTitleLabel(clan?.id, treeTitleLabel);
  }, [clan?.id, treeTitleLabel]);

  useEffect(() => {
    saveTreeStyle(clan?.id, treeStyle);
  }, [clan?.id, treeStyle]);

  useEffect(() => {
    if (!enableRealtime) return undefined;

    const offTreeUpdated = onSocketEvent("tree_updated", async (data) => {
      console.log("[FamilyTreeEditor] tree_updated:", data);

      if (data?.clan_id && clan?.id && Number(data.clan_id) !== Number(clan.id)) {
        return;
      }

      if (data?.action === "tree_layout_updated") {
        if (data?.client_layout_id && data.client_layout_id === layoutClientIdRef.current) {
          return;
        }
        applyRemoteLayoutUpdate(data);
        return;
      }

      await flushLayoutChanges();
    });

    return () => {
      offTreeUpdated();
    };
  }, [applyRemoteLayoutUpdate, enableRealtime, clan?.id, flushLayoutChanges]);

  useEffect(() => {
    const flushPendingLayout = () => {
      flushLayoutChanges();
    };

    window.addEventListener("pagehide", flushPendingLayout);
    window.addEventListener("beforeunload", flushPendingLayout);

    return () => {
      window.removeEventListener("pagehide", flushPendingLayout);
      window.removeEventListener("beforeunload", flushPendingLayout);
      if (layoutFlushTimerRef.current) {
        window.clearTimeout(layoutFlushTimerRef.current);
        layoutFlushTimerRef.current = null;
      }
      flushLayoutChanges();
    };
  }, [flushLayoutChanges]);

  const resolvedPermission = useMemo(() => {
    const activePermission = permission || editPermission;
    if (activePermission) {
      return {
        canEdit: activePermission.canEdit === true,
        editScope: activePermission.editScope || "none",
        allowedNodeIds: asArray(activePermission.allowedNodeIds).map((id) => Number(id)).filter((id) => Number.isFinite(id)),
      };
    }
    if (readOnly) {
      return { canEdit: false, editScope: "none", allowedNodeIds: [] };
    }
    return { canEdit: true, editScope: "all", allowedNodeIds: [] };
  }, [editPermission, permission, readOnly]);
  const canEditAll = resolvedPermission.canEdit && resolvedPermission.editScope === "all";
  const canEditLimited = resolvedPermission.canEdit && resolvedPermission.editScope === "limited";
  const allowedNodeSet = useMemo(() => new Set(resolvedPermission.allowedNodeIds.map((id) => Number(id))), [resolvedPermission.allowedNodeIds]);

  const canonicalTree = useMemo(() => {
    const { people: uniquePeople, idMap } = dedupePeopleByAccount(initialPeople);
    const familyData = remapFamiliesByPeople(families, idMap, uniquePeople);
    return {
      people: uniquePeople,
      families: familyData.families,
      childRows: remapChildrenByPeople(childRows, idMap, familyData.familyIdMap, familyData.families, uniquePeople),
    };
  }, [initialPeople, families, childRows]);

  useEffect(() => {
    const nextPeople = mergeManualAndAutoLayout(canonicalTree.people, canonicalTree.families, canonicalTree.childRows);
    setPeople(nextPeople);
    setSelectedId((current) => (current && nextPeople.some((person) => person.id === current) ? current : null));
    setSelectedCoupleId(null);
  }, [canonicalTree]);

  const selectedPerson = useMemo(
    () => {
      const person = people.find((item) => Number(item.id) === Number(selectedId)) || null;
      if (!person) return null;
      const childRow = asArray(canonicalTree.childRows).find((row) => Number(row.person_id) === Number(person.id));
      if (!childRow) return person;
      const childOrder = toInt(childRow.sort_order, 0);
      return {
        ...person,
        child_family_id: Number(childRow.family_id),
        child_order: childOrder,
        child_sort_order: childOrder,
      };
    },
    [canonicalTree.childRows, people, selectedId],
  );
  const selectedSpouse = useMemo(
    () => findSpouse(selectedPerson, canonicalTree.families, people),
    [canonicalTree.families, people, selectedPerson],
  );
  const existingPeopleByAiName = useMemo(() => buildExistingPeopleByName(people, t), [people, t]);
  const genealogyAiExistingMatches = useMemo(() => {
    const matches = new Map();
    genealogyAiDraftMembers.forEach((member) => {
      const selectedExistingId = Number(member.existing_person_id);
      if (Number.isFinite(selectedExistingId) && selectedExistingId > 0) {
        const selected = people.find((person) => Number(person.id) === selectedExistingId);
        if (selected) matches.set(member.temporary_id, selected);
      }
    });
    return matches;
  }, [existingPeopleByAiName, genealogyAiDraftMembers, people]);
  const dialogSourcePerson = useMemo(
  () =>
    people.find((person) => Number(person.id) === Number(dialog?.sourcePersonId)) ||
    selectedPerson ||
    null,
  [people, dialog?.sourcePersonId, selectedPerson]
);

const dialogSourceSpouse = useMemo(
  () => findSpouse(dialogSourcePerson, canonicalTree.families, people),
  [dialogSourcePerson, canonicalTree.families, people]
);

const quickCreateSourcePerson = useMemo(
  () =>
    people.find((person) => Number(person.id) === Number(quickCreateDialog?.sourcePersonId)) ||
    null,
  [people, quickCreateDialog?.sourcePersonId]
);
const coupleActionPerson = useMemo(
  () =>
    people.find((person) => Number(person.id) === Number(couplePersonAction?.personId)) ||
    null,
  [people, couplePersonAction?.personId]
);
  const treeRelationSource = useMemo(
    () => people.find((person) => Number(person.id) === Number(treeRelationPicker?.sourcePersonId)) || null,
    [people, treeRelationPicker?.sourcePersonId],
  );
  const canEditPerson = useCallback(
    (personId) => canEditAll || (canEditLimited && allowedNodeSet.has(Number(personId))),
    [allowedNodeSet, canEditAll, canEditLimited],
  );
  const treeSearch = useTreeSearch(people);
  const treeViewMode = useTreeViewMode({
    people,
    families: canonicalTree.families,
    childRows: canonicalTree.childRows,
  });
  const treeRealtime = useTreeRealtime({
    clanId: clan?.id,
    enabled: enableRealtime,
  });
  const visiblePeople = treeViewMode.visibleData.people;
  const visibleFamilies = treeViewMode.visibleData.families;
  const visibleChildRows = treeViewMode.visibleData.childRows;
  const renderOffset = useMemo(() => {
    if (!visiblePeople.length) return { x: 0, y: 0 };
    const minX = Math.min(...visiblePeople.map((person) => toInt(person.tree_x, 0)));
    const minY = Math.min(...visiblePeople.map((person) => toInt(person.tree_y, 0)));
    return {
      x: Math.max(0, CANVAS_PADDING - minX),
      y: Math.max(0, CANVAS_PADDING - minY),
    };
  }, [visiblePeople]);
  const renderPeople = useMemo(
    () => visiblePeople.map((person) => ({
      ...person,
      tree_x: toInt(person.tree_x, 0) + renderOffset.x,
      tree_y: toInt(person.tree_y, 0) + renderOffset.y,
    })),
    [renderOffset.x, renderOffset.y, visiblePeople],
  );
  const renderPersonById = useMemo(
    () => new Map(renderPeople.map((person) => [Number(person.id), person])),
    [renderPeople],
  );
  const referencePlacements = useMemo(
    () => computeReferencePlacements(canonicalTree.people, canonicalTree.families, canonicalTree.childRows),
    [canonicalTree],
  );
  const displayTree = useMemo(
    () => buildDisplayTree(renderPeople, visibleFamilies, visibleChildRows, {
      nodePositions: USE_LOCAL_DRAFT_LAYOUT ? displayNodePositions : {},
      cardOrientation: treeStyle.cardOrientation,
      referencePlacements,
    }),
    [displayNodePositions, referencePlacements, renderPeople, treeStyle.cardOrientation, visibleFamilies, visibleChildRows],
  );
  const displayNodes = displayTree.nodes;
  const displayNodeByPersonId = displayTree.nodeByPersonId;

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const localStorageKeys = listFamilyTreeLocalStorageKeys();
    console.log({
      clanId: clan?.id,
      sourceOfLayout: USE_LOCAL_DRAFT_LAYOUT ? "localDraft" : "database",
      localStorageKeys,
      dbPositionCount: visiblePeople.filter((person) => toInt(person.tree_x, 0) !== 0 || toInt(person.tree_y, 0) !== 0).length,
      localPositionCount: Object.keys(displayNodePositions || {}).length,
    });
  }, [clan?.id, displayNodePositions, visiblePeople]);

  const selectedCoupleNode = useMemo(
    () => displayNodes.find((node) => node.id === selectedCoupleId) || null,
    [displayNodes, selectedCoupleId],
  );
  const selectedRelatedIds = useMemo(() => {
    const id = Number(selectedId);
    if (selectedType === "couple" && selectedCoupleNode) {
      const ids = new Set(selectedCoupleNode.personIds.map(Number));
      selectedCoupleNode.children.forEach((child) => ids.add(Number(child.id)));
      return ids;
    }
    if (!Number.isFinite(id) || id <= 0) return new Set();
    const indexes = buildFamilyIndexes(people, canonicalTree.families, canonicalTree.childRows);
    const ids = new Set([id]);
    getAncestorIds(id, indexes).forEach((ancestorId) => ids.add(Number(ancestorId)));
    getDescendantIds(id, indexes).forEach((descendantId) => ids.add(Number(descendantId)));
    Array.from(ids).forEach((personId) => {
      const spouses = indexes.spousesByPersonId.get(Number(personId)) || new Set();
      spouses.forEach((spouseId) => ids.add(Number(spouseId)));
    });
    return ids;
  }, [canonicalTree.childRows, canonicalTree.families, people, selectedCoupleNode, selectedId, selectedType]);
  const childCountByParentId = useMemo(() => {
    const counts = new Map();
    asArray(canonicalTree.childRows).forEach((row) => {
      const family = asArray(canonicalTree.families).find((item) => Number(item.id) === Number(row.family_id));
      if (!family) return;
      [family.father_id, family.mother_id].filter(Boolean).forEach((parentId) => {
        counts.set(Number(parentId), (counts.get(Number(parentId)) || 0) + 1);
      });
    });
    return counts;
  }, [canonicalTree.childRows, canonicalTree.families]);
  const directLineagePersonIds = useMemo(() => {
    const peopleById = new Map(people.map((person) => [Number(person.id), person]));
    const familyById = new Map(asArray(canonicalTree.families).map((family) => [Number(family.id), family]));
    const result = new Set();

    asArray(canonicalTree.childRows).forEach((row) => {
      const child = peopleById.get(Number(row.person_id));
      const family = familyById.get(Number(row.family_id));
      if (!child || !family) return;

      const childGeneration = toInt(child.generation, 1);
      const hasUpperParent = [family.father_id, family.mother_id].some((parentId) => {
        const parent = peopleById.get(Number(parentId));
        return parent && toInt(parent.generation, 1) < childGeneration;
      });
      if (hasUpperParent) result.add(Number(child.id));
    });

    return result;
  }, [canonicalTree.childRows, canonicalTree.families, people]);
  const lineageControlsByPersonId = useMemo(() => {
    const indexes = buildFamilyIndexes(people, canonicalTree.families, canonicalTree.childRows);
    const map = new Map();
    people.forEach((person) => {
      const id = Number(person.id);
      if (!Number.isFinite(id)) return;
      const ancestorIds = Array.from(getAncestorIds(id, indexes)).map(Number).filter(Number.isFinite);
      const descendantIds = Array.from(getDescendantIds(id, indexes)).map(Number).filter(Number.isFinite);
      map.set(id, {
        ancestorIds,
        descendantIds,
        hasAncestors: ancestorIds.length > 0,
        hasDescendants: descendantIds.length > 0,
      });
    });
    return map;
  }, [canonicalTree.childRows, canonicalTree.families, people]);
  const lines = useMemo(
    () => buildDisplayTreeLines(displayTree, visibleFamilies, visibleChildRows, lineRoutes),
    [displayTree, visibleFamilies, visibleChildRows, lineRoutes],
  );

  const persistFullLayout = useCallback(async (nextPeople = people, nextLineRoutes = lineRoutes, nextCardSizes = cardSizes) => {
    if (!canEditAll) return false;
    try {
      await saveTreeLayoutAPI(nextPeople, clan?.id, {
        lineRoutes: nextLineRoutes,
        cardSizes: nextCardSizes,
        treeStyle: normalizeTreeStyle({ ...treeStyle, titleLabel: treeTitleLabel }),
        clientLayoutId: layoutClientIdRef.current,
      });
      if (USE_LOCAL_DRAFT_LAYOUT) {
        saveLineRoutes(clan?.id, nextLineRoutes);
        saveCardSizes(clan?.id, nextCardSizes);
      }
      return true;
    } catch (error) {
      setStatus(error?.message || t("tree.messages.saveLayoutError"));
      return false;
    }
  }, [canEditAll, cardSizes, clan?.id, lineRoutes, people, treeStyle, treeTitleLabel, t]);

  const applyAutoLayoutAndSave = useCallback(async () => {
    if (!canEditAll) return;
    const ok = window.confirm(t("tree.messages.autoLayoutConfirm"));
    if (!ok) return;
    setSaving(true);
    setStatus("");
    const nextPeople = autoLayoutPeople(canonicalTree.people, canonicalTree.families, canonicalTree.childRows);
    try {
      setPeople(nextPeople);
      setLineRoutes({});
      if (USE_LOCAL_DRAFT_LAYOUT) saveLineRoutes(clan?.id, {});
      const saved = await persistFullLayout(nextPeople, {}, cardSizes);
      setStatus(saved ? t("tree.messages.autoLayoutSuccess") : t("tree.messages.autoLayoutError"));
      await onReload?.();
    } finally {
      setSaving(false);
    }
  }, [canEditAll, canonicalTree, persistFullLayout, cardSizes, clan?.id, onReload, t]);

  const canvasSize = useMemo(() => {
    const lineNumbers = lines.flatMap((line) => String(line.d || "").match(/-?\d+(?:\.\d+)?/g)?.map(Number) || []);
    const lineXs = lineNumbers.filter((_, index) => index % 2 === 0);
    const lineYs = lineNumbers.filter((_, index) => index % 2 === 1);
    const maxX = Math.max(2400, ...displayNodes.map((node) => toInt(node.x, 0) + node.width + CANVAS_PADDING), ...lineXs.map((x) => x + CANVAS_PADDING));
    const maxY = Math.max(1400, ...displayNodes.map((node) => toInt(node.y, 0) + node.height + CANVAS_PADDING), ...lineYs.map((y) => y + CANVAS_PADDING));
    return { width: maxX, height: maxY };
  }, [displayNodes, lines]);

  const generationLanes = useMemo(() => {
    const byGeneration = new Map();
    displayNodes.forEach((node) => {
      const generation = toInt(node.generation, 0);
      if (!generation) return;
      const top = toInt(node.y, 0);
      const bottom = top + node.height;
      const current = byGeneration.get(generation);
      byGeneration.set(generation, current
        ? { top: Math.min(current.top, top), bottom: Math.max(current.bottom, bottom) }
        : { top, bottom });
    });
    if (byGeneration.size < 2) return [];
    const left = Math.min(...displayNodes.map((node) => toInt(node.x, 0))) - GENERATION_LANE_GUTTER;
    const right = Math.max(...displayNodes.map((node) => toInt(node.x, 0) + node.width)) + 40;
    return [...byGeneration.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([generation, range], index) => ({
        generation,
        left: Math.max(0, left),
        top: range.top - 18,
        width: right - Math.max(0, left),
        height: range.bottom - range.top + 36,
        striped: index % 2 === 1,
      }));
  }, [displayNodes]);

  const canvasPointFromEvent = useCallback((event) => {
    const rect = treeRef.current?.getBoundingClientRect();
    const scale = scaleRef.current || 1;
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (event.clientX - rect.left) / scale,
      y: (event.clientY - rect.top) / scale,
    };
  }, []);

  const normalizeSelectionRect = useCallback((start, end) => {
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const right = Math.max(start.x, end.x);
    const bottom = Math.max(start.y, end.y);
    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  }, []);

  const nodeIntersectsRect = useCallback((node, rect) => {
    if (!node || !rect) return false;
    const nodeLeft = toInt(node.x, 0);
    const nodeTop = toInt(node.y, 0);
    const nodeRight = nodeLeft + Number(node.width || 0);
    const nodeBottom = nodeTop + Number(node.height || 0);
    const rectRight = rect.x + rect.width;
    const rectBottom = rect.y + rect.height;
    return nodeLeft <= rectRight && nodeRight >= rect.x && nodeTop <= rectBottom && nodeBottom >= rect.y;
  }, []);

  const toggleBulkMoveMode = useCallback(() => {
    if (!canEditAll) return;
    setBulkMoveMode((current) => {
      const next = !current;
      setBulkSelectionRect(null);
      if (!next) setSelectedDisplayNodeIds(new Set());
      return next;
    });
  }, [canEditAll]);

  const beginBulkSelection = useCallback((event) => {
    if (!bulkMoveMode || !canEditAll || (event.button != null && event.button !== 0)) return;
    if (event.target?.closest?.(".fte-personCard, .fte-coupleCard, .fte-lineControl, .fte-canvasTitle, button, input, textarea, select")) return;

    event.preventDefault();
    event.stopPropagation();
    const start = canvasPointFromEvent(event);
    bulkSelectRef.current = { start };
    setBulkSelectionRect({ x: start.x, y: start.y, width: 0, height: 0 });

    const handleMove = (moveEvent) => {
      moveEvent.preventDefault();
      const current = canvasPointFromEvent(moveEvent);
      const rect = normalizeSelectionRect(start, current);
      bulkSelectRef.current = { start, current };
      setBulkSelectionRect(rect);
    };

    const handleUp = (upEvent) => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      const end = canvasPointFromEvent(upEvent);
      const rect = normalizeSelectionRect(start, end);
      bulkSelectRef.current = null;
      setBulkSelectionRect(null);

      if (rect.width < 8 && rect.height < 8) {
        setSelectedDisplayNodeIds(new Set());
        return;
      }

      const selectedNodes = displayNodes.filter((node) =>
        nodeIntersectsRect(node, rect) && asArray(node.personIds).some((personId) => canEditPerson(personId)),
      );
      setSelectedDisplayNodeIds(new Set(selectedNodes.map((node) => node.id)));
      setStatus(selectedNodes.length ? `Da chon ${selectedNodes.length} card. Keo mot card trong vung de di chuyen ca mang.` : "Khong co card nao trong vung chon.");
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
  }, [bulkMoveMode, canEditAll, canEditPerson, canvasPointFromEvent, displayNodes, nodeIntersectsRect, normalizeSelectionRect]);

  const autoFitSignature = useMemo(() => (
    [
      clan?.id || "default",
      treeViewMode.mode,
      treeViewMode.rootPersonId || "all",
      treeStyle.cardOrientation,
      isTreeMobile ? "mobile" : "desktop",
      treeFullscreen ? "fullscreen" : "inline",
      displayNodes.map((node) => node.id).sort().join(","),
    ].join(":")
  ), [clan?.id, displayNodes, isTreeMobile, treeFullscreen, treeStyle.cardOrientation, treeViewMode.mode, treeViewMode.rootPersonId]);

  const focusPerson = useCallback((personId, options = {}) => {
    const id = Number(personId);
    if (!Number.isFinite(id) || id <= 0) return false;
    const target = renderPersonById.get(id) || people.find((person) => Number(person.id) === id);
    const targetNode = displayNodeByPersonId.get(id);
    if (!target) return false;
    treeViewMode.expandPathToPerson(id);
    setSelectedType("person");
    setSelectedCoupleId(null);
    setSelectedId(id);
    if (options.search) treeSearch.markResult(id);
    if (options.self) setSelfPersonId(id);

    window.setTimeout(() => {
      const api = transformApiRef.current;
      const viewport = viewportRef.current;
      if (api?.setTransform && viewport) {
        const rect = viewport.getBoundingClientRect();
        const nextScale = options.scale || 1.25;
        const targetCenterX = targetNode ? targetNode.x + targetNode.width / 2 : toInt(target.tree_x, 0) + CARD_WIDTH / 2;
        const targetCenterY = targetNode ? targetNode.y + targetNode.height / 2 : toInt(target.tree_y, 0) + CARD_HEIGHT / 2;
        const nextX = rect.width / 2 - targetCenterX * nextScale;
        const nextY = rect.height / 2 - targetCenterY * nextScale;
        api.setTransform(nextX, nextY, nextScale, 320);
        return;
      }

      const element = document.getElementById(`fte-person-${id}`);
      if (element?.scrollIntoView) {
        element.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      }
    }, 120);
    return true;
  }, [displayNodeByPersonId, people, renderPersonById, treeSearch, treeViewMode]);

  const handleFindMe = useCallback(() => {
    const accountId = Number(currentAccount?.account_id || currentAccount?.accountId || currentAccount?.id);
    const personIdFromAccount = Number(currentAccount?.person_id || currentAccount?.personId);
    const matched = Number.isFinite(personIdFromAccount) && personIdFromAccount > 0
      ? people.find((person) => Number(person.id) === personIdFromAccount)
      : people.find((person) => Number(person.account_id) === accountId);

    if (!matched) {
      setStatus(t("tree.messages.noAccountLinked"));
      return;
    }
    setStatus("");
    setMobileTreePanel(null);
    if (!visiblePeople.some((person) => Number(person.id) === Number(matched.id))) {
      treeViewMode.setFullMode();
    }
    focusPerson(matched.id, { self: true });
  }, [currentAccount, focusPerson, people, t, treeViewMode, visiblePeople]);

  const handleValidateTree = useCallback(() => {
    const errors = validateTreeData(people, canonicalTree.families, canonicalTree.childRows);
    setValidationErrors(errors);
    setStatus(errors.size ? t("tree.messages.validationErrorCount", { count: errors.size }) : t("tree.messages.validationSuccess"));
  }, [canonicalTree.childRows, canonicalTree.families, people, t]);

  const openGenealogyAiDialog = useCallback(() => {
    if (!canEditAll) return;
    setMobileTreePanel(null);
    setGenealogyAiOpen(true);
    setGenealogyAiError("");
  }, [canEditAll]);

  const updateGenealogyAiDraftMember = useCallback((temporaryId, patch) => {
    setGenealogyAiDraftMembers((current) =>
      current.map((member) => (member.temporary_id === temporaryId ? { ...member, ...patch } : member)),
    );
  }, []);

  const updateGenealogyAiDraftRelationship = useCallback((draftId, patch) => {
    setGenealogyAiDraftRelationships((current) =>
      current.map((relation) => (relation.draft_id === draftId ? { ...relation, ...patch } : relation)),
    );
  }, []);

  const removeGenealogyAiDraftRelationship = useCallback((draftId) => {
    setGenealogyAiDraftRelationships((current) => current.filter((relation) => relation.draft_id !== draftId));
  }, []);

  const appendGenealogyAiTranscript = useCallback((text) => {
    const transcript = String(text || "").trim();
    if (!transcript) {
      setGenealogyAiError(t("tree.genealogyAi.errors.emptyTranscript"));
      return;
    }

    setGenealogyAiError("");
    setGenealogyAiPrompt((current) => {
      const prompt = String(current || "").trim();
      if (!prompt) return transcript;
      const separator = /[.!?…]$/.test(prompt) ? " " : ". ";
      return `${prompt}${separator}${transcript}`;
    });
  }, [t]);

  const toggleGenealogyAiVoiceInput = useCallback(() => {
    if (genealogyVoiceListening) {
      genealogyRecognitionRef.current?.stop?.();
      setGenealogyVoiceListening(false);
      return;
    }

    const SpeechRecognition =
      typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SpeechRecognition) {
      setGenealogyAiError(t("common.speechUnsupported"));
      return;
    }

    const hostname = window.location.hostname;
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    if (!window.isSecureContext && !isLocalhost) {
      setGenealogyAiError(t("eventsTasks.errors.speechSecureContextRequired"));
      return;
    }

    genealogyRecognitionRef.current?.abort?.();

    const recognition = new SpeechRecognition();
    recognition.lang = language === "en" ? "en-US" : "vi-VN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results || [])
        .map((result) => result?.[0]?.transcript || "")
        .join(" ");
      appendGenealogyAiTranscript(transcript);
    };

    recognition.onerror = (event) => {
      const errorName = event?.error || "";
      if (errorName === "not-allowed") {
        setGenealogyAiError(t("eventsTasks.errors.micBlocked"));
      } else if (errorName === "service-not-allowed") {
        setGenealogyAiError(t("eventsTasks.errors.speechSecureContextRequired"));
      } else if (errorName === "network") {
        setGenealogyAiError(t("eventsTasks.errors.speechNetworkFailed"));
      } else if (errorName === "no-speech") {
        setGenealogyAiError(t("eventsTasks.errors.noSpeechDetected"));
      } else {
        setGenealogyAiError(t("eventsTasks.errors.speechConversionFailed"));
      }
    };

    recognition.onend = () => {
      setGenealogyVoiceListening(false);
      genealogyRecognitionRef.current = null;
    };

    genealogyRecognitionRef.current = recognition;
    setGenealogyAiError("");
    setGenealogyVoiceListening(true);
    try {
      recognition.start();
    } catch {
      genealogyRecognitionRef.current = null;
      setGenealogyVoiceListening(false);
      setGenealogyAiError(t("eventsTasks.errors.speechConversionFailed"));
    }
  }, [appendGenealogyAiTranscript, genealogyVoiceListening, language, t]);

  useEffect(() => {
    return () => {
      genealogyRecognitionRef.current?.abort?.();
      genealogyRecognitionRef.current = null;
    };
  }, []);

  const submitGenealogyAiExtract = useCallback(async () => {
    const prompt = genealogyAiPrompt.trim();
    if (!prompt) {
      setGenealogyAiError(t("tree.genealogyAi.errors.emptyPrompt"));
      return;
    }

    setGenealogyAiLoading(true);
    setGenealogyAiError("");
    setGenealogyAiResult(null);
    try {
      const result = await extractGenealogyAI({
        input_source: "text",
        prompt,
        clan_id: clan?.id || null,
        context: {
          screen: "family_tree_editor",
        },
      });
      setGenealogyAiResult({
        members: Array.isArray(result?.members) ? result.members : [],
        relationships: Array.isArray(result?.relationships) ? result.relationships : [],
        uncertain_items: Array.isArray(result?.uncertain_items) ? result.uncertain_items : [],
        warnings: Array.isArray(result?.warnings) ? result.warnings : [],
        summary: result?.summary || {
          total_members_detected: 0,
          total_relationships_detected: 0,
          needs_human_review: true,
        },
      });
      const draftMembers = normalizeAiDraftMembers(result?.members || []);
      setGenealogyAiDraftMembers(draftMembers);
      setGenealogyAiDraftRelationships(normalizeAiDraftRelationships(result?.relationships || [], draftMembers));
    } catch (error) {
      setGenealogyAiError(error?.message || t("tree.genealogyAi.errors.extractFailed"));
    } finally {
      setGenealogyAiLoading(false);
    }
  }, [clan?.id, genealogyAiPrompt, t]);

  const saveGenealogyAiDraftToTree = useCallback(async () => {
    if (!canEditAll || genealogyAiSaving) return;

    const draftMembers = genealogyAiDraftMembers
      .map((member) => ({
        ...member,
        full_name: String(member.full_name || "").trim(),
        is_living: member.is_living === "1" ? "1" : "0",
        account_email: String(member.account_email || "").trim(),
        account_password: String(member.account_password || ""),
      }))
      .filter((member) => member.full_name);

    if (!draftMembers.length) {
      setGenealogyAiError(t("tree.genealogyAi.errors.noMembersToSave"));
      return;
    }

    const memberIds = new Set(draftMembers.map((member) => member.temporary_id));
    const invalidRelation = genealogyAiDraftRelationships.find((relation) => {
      if (relation.type === "parent_child") {
        return !memberIds.has(relation.parent) || !memberIds.has(relation.child) || relation.parent === relation.child;
      }
      return !memberIds.has(relation.from) || !memberIds.has(relation.to) || relation.from === relation.to;
    });

    if (invalidRelation) {
      setGenealogyAiError(t("tree.genealogyAi.errors.invalidRelationship"));
      return;
    }

    const draftMemberByTemporaryId = new Map(draftMembers.map((member) => [member.temporary_id, member]));
    const getDraftOrExistingPerson = (temporaryId) => {
      const member = draftMemberByTemporaryId.get(temporaryId);
      if (!member) return null;
      const existingId = Number(member.existing_person_id);
      if (Number.isFinite(existingId) && existingId > 0) {
        return people.find((person) => Number(person.id) === existingId) || member;
      }
      return member;
    };
    const invalidAgeRelation = genealogyAiDraftRelationships.find((relation) => {
      if (relation.type !== "parent_child") return false;
      const parent = getDraftOrExistingPerson(relation.parent);
      const child = getDraftOrExistingPerson(relation.child);
      return parentChildAgeConstraintMessage(personBirthValue(child), personBirthValue(parent));
    });

    if (invalidAgeRelation) {
      const parent = getDraftOrExistingPerson(invalidAgeRelation.parent);
      const child = getDraftOrExistingPerson(invalidAgeRelation.child);
      const message = parentChildAgeConstraintMessage(personBirthValue(child), personBirthValue(parent));
      setGenealogyAiError(message);
      setConstraintNotice(message);
      return;
    }

    const incompleteAccount = draftMembers.find((member) => {
      if (member.is_living !== "1") return false;
      const selectedExistingId = Number(member.existing_person_id);
      if (Number.isFinite(selectedExistingId) && selectedExistingId > 0) return false;
      if (!member.account_password) return false;
      return !member.account_email || member.account_password.length < 6;
    });

    if (incompleteAccount) {
      setGenealogyAiError(t("tree.genealogyAi.errors.incompleteAccount", { name: incompleteAccount.full_name }));
      return;
    }

    const existingCount = draftMembers.filter((member) => {
      const selectedExistingId = Number(member.existing_person_id);
      return Number.isFinite(selectedExistingId) && selectedExistingId > 0;
    }).length;
    const createCount = draftMembers.length - existingCount;
    const generationByTemporaryId = computeAiDraftGenerationMap(
      draftMembers,
      genealogyAiDraftRelationships,
      existingPeopleByAiName,
      people,
    );

    const ok = window.confirm(t("tree.genealogyAi.confirmSave", { count: draftMembers.length, createCount, existingCount }));
    if (!ok) return;

    setGenealogyAiSaving(true);
    setGenealogyAiError("");
    setStatus("");

    try {
      const idMap = new Map();
      const createdPeople = [];
      const baseX = CANVAS_PADDING + Math.max(0, people.length % 8) * 40;

      for (const [index, member] of draftMembers.entries()) {
        const selectedExistingId = Number(member.existing_person_id);
        if (Number.isFinite(selectedExistingId) && selectedExistingId > 0) {
          idMap.set(member.temporary_id, selectedExistingId);
          continue;
        }

        const isLiving = member.is_living === "1";
        const shouldCreateAccount = isLiving && Boolean(member.account_email && member.account_password.length >= 6);
        const memberGeneration = generationByTemporaryId.get(member.temporary_id) || 1;
        const memberX = baseX + (index % 4) * (CARD_WIDTH + 70);
        const memberY = generationY(memberGeneration);
        const noteParts = [
          member.notes,
          member.birth_year && !member.birth_date ? `${t("tree.genealogyAi.birthYearNote")}: ${member.birth_year}` : null,
          !isLiving && member.death_year && !member.death_date ? `${t("tree.genealogyAi.deathYearNote")}: ${member.death_year}` : null,
          t("tree.genealogyAi.aiDraftNote"),
        ].filter(Boolean);

        const createdResponse = await createPersonAPI({
          clan_id: clan?.id,
          display_name: member.full_name,
          gender: aiGenderToPersonGender(member.gender),
          is_living: isLiving ? 1 : 0,
          generation: memberGeneration,
          birth_date: member.birth_date || null,
          death_date: isLiving ? null : member.death_date || null,
          phone: member.phone || null,
          email: member.account_email || null,
          account_email: shouldCreateAccount ? member.account_email : null,
          account_password: shouldCreateAccount ? member.account_password : null,
          address: member.address || null,
          note: noteParts.join("\n"),
          tree_x: memberX,
          tree_y: memberY,
        });

        const newPersonId = extractCreatedPersonId(createdResponse);
        if (!newPersonId) throw new Error(t("tree.genealogyAi.errors.createdIdMissing"));
        const newAccountId = Number(
          createdResponse?.account_id ||
            createdResponse?.data?.account_id ||
            createdResponse?.account?.id ||
            createdResponse?.data?.account?.id ||
            0,
        );
        idMap.set(member.temporary_id, newPersonId);
        createdPeople.push(normalizePerson({
          id: newPersonId,
          account_id: Number.isFinite(newAccountId) && newAccountId > 0 ? newAccountId : null,
          account_email: shouldCreateAccount ? member.account_email : null,
          account_status: shouldCreateAccount ? "active" : null,
          role_id: shouldCreateAccount ? 3 : null,
          display_name: member.full_name,
          gender: aiGenderToPersonGender(member.gender),
          is_living: isLiving ? 1 : 0,
          birth_date: member.birth_date || null,
          death_date: isLiving ? null : member.death_date || null,
          phone: member.phone || null,
          email: member.account_email || null,
          address: member.address || null,
          note: noteParts.join("\n"),
          tree_x: memberX,
          tree_y: memberY,
          generation: memberGeneration,
        }));
      }

      for (const relation of genealogyAiDraftRelationships) {
        if (relation.type === "spouse") {
          await linkRelationsAPI({
            person_id: idMap.get(relation.from),
            spouse_person_id: idMap.get(relation.to),
          });
        }
      }

      const parentAssignments = new Map();
      for (const relation of genealogyAiDraftRelationships) {
        if (relation.type !== "parent_child") continue;
        const childId = idMap.get(relation.child);
        const parentId = idMap.get(relation.parent);
        const current = parentAssignments.get(childId) || { father_person_id: null, mother_person_id: null };
        if (relation.parent_role === "mother") {
          current.mother_person_id = parentId;
        } else {
          current.father_person_id = parentId;
        }
        parentAssignments.set(childId, current);
      }

      for (const [childId, parents] of parentAssignments.entries()) {
        await linkRelationsAPI({
          person_id: childId,
          father_person_id: parents.father_person_id,
          mother_person_id: parents.mother_person_id,
        });
      }

      if (createdPeople.length) {
        setPeople((current) => [...current, ...createdPeople.filter((person) => !current.some((item) => Number(item.id) === Number(person.id)))]);
      }
      setStatus(t("tree.genealogyAi.saveSuccess", { count: createdPeople.length, existingCount }));
      setGenealogyAiOpen(false);
      setGenealogyAiResult(null);
      setGenealogyAiDraftMembers([]);
      setGenealogyAiDraftRelationships([]);
      await onReload?.();
    } catch (error) {
      if (!shouldSuppressInlineRelationError(error)) {
        setGenealogyAiError(error?.message || t("tree.genealogyAi.errors.saveFailed"));
      }
    } finally {
      setGenealogyAiSaving(false);
    }
  }, [canEditAll, clan?.id, existingPeopleByAiName, genealogyAiDraftMembers, genealogyAiDraftRelationships, genealogyAiSaving, onReload, people.length, t]);

  useEffect(() => {
    if (!validationErrors.size) return;
    const errors = validateTreeData(people, canonicalTree.families, canonicalTree.childRows);
    setValidationErrors(errors);
    if (!errors.size) setStatus(t("tree.messages.validationFixed"));
  }, [canonicalTree.childRows, canonicalTree.families, people, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const validationIssueRows = useMemo(() => {
    if (!validationErrors.size) return [];
    const peopleById = new Map(people.map((person) => [Number(person.id), person]));
    return Array.from(validationErrors.entries()).flatMap(([personId, messages]) => {
      const person = peopleById.get(Number(personId));
      return asArray(messages).map((message) => ({
        personId: Number(personId),
        personName: fullName(person, t("tree.card.fallbackName")),
        generation: person?.generation || "",
        message,
      }));
    });
  }, [people, validationErrors]);

  const beginDrag = useCallback((event, person) => {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setDraggingId(person.id);

    const startX = event.clientX;
    const startY = event.clientY;
    const originX = toInt(person.tree_x, 0);
    const originY = toInt(person.tree_y, 0);
    lastDragRef.current = { tree_x: originX, tree_y: originY };
    const draggedPersonId = Number(person.id);
    const collapsedBranchIds = treeViewMode.collapsedIds.has(draggedPersonId)
      ? getHiddenDescendantIds([draggedPersonId], people, canonicalTree.families, canonicalTree.childRows)
      : new Set();
    const movedIds = new Set([draggedPersonId, ...collapsedBranchIds]);
    const originPositions = new Map(
      people
        .filter((item) => movedIds.has(Number(item.id)))
        .map((item) => [Number(item.id), {
          tree_x: toInt(item.tree_x, 0),
          tree_y: toInt(item.tree_y, 0),
        }]),
    );
    dragGroupRef.current = { movedIds, originPositions };

    const handleMove = (moveEvent) => {
      moveEvent.preventDefault();
      const scale = scaleRef.current || 1;
      const nextPosition = {
        tree_x: snap(originX + (moveEvent.clientX - startX) / scale),
        tree_y: snap(originY + (moveEvent.clientY - startY) / scale),
      };
      const deltaX = nextPosition.tree_x - originX;
      const deltaY = nextPosition.tree_y - originY;
      lastDragRef.current = nextPosition;
      const dragGroup = dragGroupRef.current;
      setPeople((current) => current.map((item) => {
        const origin = dragGroup?.originPositions.get(Number(item.id));
        if (!origin) return item;
        return {
          ...item,
          tree_x: snap(origin.tree_x + deltaX),
          tree_y: snap(origin.tree_y + deltaY),
        };
      }));
    };

    const handleUp = async () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      setDraggingId(null);
      const finalPosition = lastDragRef.current;
      const dragGroup = dragGroupRef.current;
      dragGroupRef.current = null;
      if (!finalPosition) return;
      if (finalPosition.tree_x === originX && finalPosition.tree_y === originY) {
        // Bấm mà không kéo: chọn người này để tô sáng các đường nối của họ.
        setSelectedType("person");
        setSelectedCoupleId(null);
        setSelectedId(person.id);
        return;
      }
      if (finalPosition.tree_x !== originX || finalPosition.tree_y !== originY) {
        const deltaX = finalPosition.tree_x - originX;
        const deltaY = finalPosition.tree_y - originY;
        const nodes = Array.from(dragGroup?.originPositions.entries() || []).map(([personId, origin]) => ({
          person_id: personId,
          tree_x: snap(origin.tree_x + deltaX),
          tree_y: snap(origin.tree_y + deltaY),
        }));
        enqueueLayoutChanges({
          nodes: nodes.length ? nodes : [{ person_id: person.id, ...finalPosition }],
        });
      }
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
  }, [canonicalTree.childRows, canonicalTree.families, enqueueLayoutChanges, people, treeViewMode.collapsedIds]);

  const beginDisplayNodeDrag = useCallback((event, node, options = {}) => {
    if (!node || (event.button != null && event.button !== 0)) return;
    const movableIds = asArray(node.personIds).filter((personId) => canEditPerson(personId));
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const originX = toInt(node.x, 0);
    const originY = toInt(node.y, 0);
    let hasDragged = false;
    lastDragRef.current = { tree_x: originX, tree_y: originY };
    const selectedGroupNodes = bulkMoveMode && selectedDisplayNodeIds.has(node.id) && selectedDisplayNodeIds.size > 1
      ? displayNodes.filter((item) => selectedDisplayNodeIds.has(item.id) && asArray(item.personIds).some((personId) => canEditPerson(personId)))
      : [];

    if (selectedGroupNodes.length > 1) {
      let nextSavedPositions = displayNodePositions;
      const originNodes = new Map(selectedGroupNodes.map((item) => [item.id, {
        type: item.type,
        x: toInt(item.x, 0),
        y: toInt(item.y, 0),
      }]));
      const movedPersonIds = new Set(
        selectedGroupNodes
          .flatMap((item) => asArray(item.personIds).map(Number))
          .filter(Number.isFinite),
      );
      const originPeople = new Map(
        people
          .filter((item) => movedPersonIds.has(Number(item.id)))
          .map((item) => [Number(item.id), {
            tree_x: toInt(item.tree_x, 0),
            tree_y: toInt(item.tree_y, 0),
          }]),
      );

      const handleMove = (moveEvent) => {
        moveEvent.preventDefault();
        const scale = scaleRef.current || 1;
        const movedDistance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
        if (!hasDragged && movedDistance < 4) return;
        if (!hasDragged) {
          hasDragged = true;
          setDraggingId(node.id);
        }
        const nextPosition = {
          x: snap(originX + (moveEvent.clientX - startX) / scale),
          y: snap(originY + (moveEvent.clientY - startY) / scale),
        };
        const deltaX = nextPosition.x - originX;
        const deltaY = nextPosition.y - originY;
        lastDragRef.current = { tree_x: nextPosition.x, tree_y: nextPosition.y };

        setPeople((current) => current.map((item) => {
          const origin = originPeople.get(Number(item.id));
          if (!origin) return item;
          return {
            ...item,
            tree_x: snap(origin.tree_x + deltaX),
            tree_y: snap(origin.tree_y + deltaY),
          };
        }));
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        setDraggingId(null);
        if (!hasDragged) {
          options.onClick?.();
          return;
        }
        const finalPosition = lastDragRef.current;
        if (!finalPosition) return;
        if (finalPosition.tree_x !== originX || finalPosition.tree_y !== originY) {
          if (USE_LOCAL_DRAFT_LAYOUT && Array.from(originNodes.values()).some((origin) => origin.type === DISPLAY_NODE_TYPE.COUPLE)) {
            saveDisplayNodePositions(clan?.id, nextSavedPositions);
          }
          const deltaX = finalPosition.tree_x - originX;
          const deltaY = finalPosition.tree_y - originY;
          const nodes = Array.from(originPeople.entries()).map(([personId, origin]) => ({
            person_id: personId,
            tree_x: snap(origin.tree_x + deltaX),
            tree_y: snap(origin.tree_y + deltaY),
          }));
          if (nodes.length) enqueueLayoutChanges({ nodes });
        }
      };

      window.addEventListener("pointermove", handleMove, { passive: false });
      window.addEventListener("pointerup", handleUp);
      return;
    }

    if (node.type === DISPLAY_NODE_TYPE.COUPLE) {
      const originPeople = new Map(
        people
          .filter((item) => movableIds.map(Number).includes(Number(item.id)))
          .map((item) => [Number(item.id), {
            tree_x: toInt(item.tree_x, 0),
            tree_y: toInt(item.tree_y, 0),
          }]),
      );

      const handleMove = (moveEvent) => {
        moveEvent.preventDefault();
        const scale = scaleRef.current || 1;
        const movedDistance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
        if (!hasDragged && movedDistance < 4) return;
        if (!hasDragged) {
          hasDragged = true;
          setDraggingId(node.id);
        }
        if (!movableIds.length) return;
        const nextPosition = {
          x: snap(originX + (moveEvent.clientX - startX) / scale),
          y: snap(originY + (moveEvent.clientY - startY) / scale),
        };
        lastDragRef.current = { tree_x: nextPosition.x, tree_y: nextPosition.y };
        const deltaX = nextPosition.x - originX;
        const deltaY = nextPosition.y - originY;
        setPeople((current) => current.map((item) => {
          const origin = originPeople.get(Number(item.id));
          if (!origin) return item;
          return {
            ...item,
            tree_x: snap(origin.tree_x + deltaX),
            tree_y: snap(origin.tree_y + deltaY),
          };
        }));
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        setDraggingId(null);
        if (!hasDragged) {
          options.onClick?.();
          return;
        }
        const finalPosition = lastDragRef.current;
        if (!finalPosition) return;
        if (finalPosition.tree_x !== originX || finalPosition.tree_y !== originY) {
          const deltaX = finalPosition.tree_x - originX;
          const deltaY = finalPosition.tree_y - originY;
          const nodes = Array.from(originPeople.entries()).map(([personId, origin]) => ({
            person_id: personId,
            tree_x: snap(origin.tree_x + deltaX),
            tree_y: snap(origin.tree_y + deltaY),
          }));
          if (nodes.length) enqueueLayoutChanges({ nodes });
        }
      };

      window.addEventListener("pointermove", handleMove, { passive: false });
      window.addEventListener("pointerup", handleUp);
      return;
    }

    const movedIds = new Set(movableIds.map(Number));
    const originPositions = new Map(
      people
        .filter((item) => movedIds.has(Number(item.id)))
        .map((item) => [Number(item.id), {
          tree_x: toInt(item.tree_x, 0),
          tree_y: toInt(item.tree_y, 0),
        }]),
    );
    dragGroupRef.current = { movedIds, originPositions };

    const handleMove = (moveEvent) => {
      moveEvent.preventDefault();
      const scale = scaleRef.current || 1;
      const movedDistance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (!hasDragged && movedDistance < 4) return;
      if (!hasDragged) {
        hasDragged = true;
        setDraggingId(node.id);
      }
      if (!movableIds.length) return;
      const nextPosition = {
        tree_x: snap(originX + (moveEvent.clientX - startX) / scale),
        tree_y: snap(originY + (moveEvent.clientY - startY) / scale),
      };
      const deltaX = nextPosition.tree_x - originX;
      const deltaY = nextPosition.tree_y - originY;
      lastDragRef.current = nextPosition;
      const dragGroup = dragGroupRef.current;
      setPeople((current) => current.map((item) => {
        const origin = dragGroup?.originPositions.get(Number(item.id));
        if (!origin) return item;
        return {
          ...item,
          tree_x: snap(origin.tree_x + deltaX),
          tree_y: snap(origin.tree_y + deltaY),
        };
      }));
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      setDraggingId(null);
      if (!hasDragged) {
        options.onClick?.();
        dragGroupRef.current = null;
        return;
      }
      const finalPosition = lastDragRef.current;
      const dragGroup = dragGroupRef.current;
      dragGroupRef.current = null;
      if (!finalPosition) return;
      if (finalPosition.tree_x !== originX || finalPosition.tree_y !== originY) {
        const deltaX = finalPosition.tree_x - originX;
        const deltaY = finalPosition.tree_y - originY;
        const nodes = Array.from(dragGroup?.originPositions.entries() || []).map(([personId, origin]) => ({
          person_id: personId,
          tree_x: snap(origin.tree_x + deltaX),
          tree_y: snap(origin.tree_y + deltaY),
        }));
        enqueueLayoutChanges({ nodes });
      }
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
  }, [bulkMoveMode, canEditPerson, clan?.id, displayNodePositions, displayNodes, enqueueLayoutChanges, people, selectedDisplayNodeIds]);

  const openPersonEditor = useCallback((person) => {
    if (!person) return;
    if (canEditPerson(person.id)) treeRealtime.startEditing(person.id);
    setCouplePersonAction(null);
    setSelectedType("person");
    setSelectedCoupleId(null);
    setSelectedId(person.id);
  }, [canEditPerson, treeRealtime]);

  const handleDeletePersonByCard = useCallback(async (person) => {
    if (!person || !canEditAll) {
      setStatus(t("tree.messages.noPermissionAction"));
      return;
    }
    const ok = window.confirm(t("tree.messages.deleteConfirm", { name: fullName(person) }));
    if (!ok) return;
    setSaving(true);
    setStatus("");
    try {
      const res = await deletePersonAPI(person.id);
      setPeople((current) => current.filter((item) => item.id !== person.id));
      setSelectedId((current) => (Number(current) === Number(person.id) ? null : current));
      setStatus(res?.message || t("tree.messages.deleteSuccess"));
      await onReload?.();
    } catch (error) {
      setStatus(error?.message || t("tree.messages.deleteError"));
    } finally {
      setSaving(false);
    }
  }, [canEditAll, onReload, t]);


  const requestRelationPreview = useCallback((targetId, options) => {
    if (!selectedPerson || !relationDialog?.relation) return Promise.resolve(null);
    const payload = buildLinkPayload(relationDialog.relation, selectedPerson, targetId, options || {}, canonicalTree.families, canonicalTree.childRows);
    return payload ? previewRelationsAPI(payload) : Promise.resolve(null);
  }, [canonicalTree.childRows, canonicalTree.families, relationDialog?.relation, selectedPerson]);

  const submitTreeRelationPick = useCallback((targetPerson) => {
    if (!treeRelationPicker || !targetPerson) return;
    const relation = treeRelationPicker.relation;
    const sourcePerson = people.find((item) => Number(item.id) === Number(treeRelationPicker.sourcePersonId));
    if (!sourcePerson) {
      setTreeRelationPicker(null);
      setStatus(t("tree.messages.linkSourceNotFound"));
      return;
    }
    const linkedIds = relationLinkedIds(relation, sourcePerson, canonicalTree.families, canonicalTree.childRows);
    if (linkedIds.has(Number(targetPerson.id))) {
      setConstraintNotice(t("tree.messages.linkAlreadyExists"));
      return;
    }
    const candidates = relationCandidates(relation, sourcePerson, people, linkedIds, canonicalTree.families);
    const allowed = candidates.some((item) => Number(item.id) === Number(targetPerson.id));
    if (!allowed) {
      setConstraintNotice(t("tree.messages.linkNotAllowed"));
      return;
    }
    // Mở lại hộp thoại với người vừa chọn để người dùng thấy kết quả kiểm tra và chọn "con với ai" trước khi lưu.
    setTreeRelationPicker(null);
    setSelectedType("person");
    setSelectedCoupleId(null);
    setSelectedId(sourcePerson.id);
    setRelationDialog({
      relation,
      personId: targetPerson.id,
      options: treeRelationPicker.options || defaultRelationOptions(relation, sourcePerson, canonicalTree.families, people),
    });
  }, [canonicalTree.families, canonicalTree.childRows, people, t, treeRelationPicker]);

  const handleCardPointerDown = useCallback(
    (event, person) => {
      if (treeRelationPicker) {
        event.preventDefault();
        event.stopPropagation();
        submitTreeRelationPick(person);
        return;
      }
      if (!canEditPerson(person.id)) {
        event.preventDefault();
        event.stopPropagation();
        setSelectedType("person");
        setSelectedCoupleId(null);
        setSelectedId(person.id);
        if (resolvedPermission.editScope === "limited") {
          setStatus(t("tree.toolbar.limitedEdit"));
        }
        return;
      }
      if (bulkMoveMode) {
        const displayNode = displayNodeByPersonId.get(Number(person.id));
        if (displayNode) {
          beginDisplayNodeDrag(event, displayNode, {
            onClick: () => {
              setSelectedDisplayNodeIds(new Set([displayNode.id]));
              setSelectedType("person");
              setSelectedCoupleId(null);
              setSelectedId(person.id);
            },
          });
          return;
        }
      }
      beginDrag(event, person);
    },
    [beginDisplayNodeDrag, beginDrag, bulkMoveMode, canEditPerson, displayNodeByPersonId, resolvedPermission.editScope, submitTreeRelationPick, treeRelationPicker],
  );

  const handleCouplePointerDown = useCallback((event, node) => {
    if (!node) return;
    const personId = Number(event.target?.closest?.("[data-person-id]")?.dataset?.personId);
    const clickedPerson = Number.isFinite(personId)
      ? people.find((person) => Number(person.id) === personId)
      : null;
    if (bulkMoveMode) {
      beginDisplayNodeDrag(event, node, {
        onClick: () => {
          setSelectedDisplayNodeIds(new Set([node.id]));
          setCouplePersonAction(null);
          setSelectedType("couple");
          setSelectedId(null);
          setSelectedCoupleId(node.id);
        },
      });
      return;
    }
    beginDisplayNodeDrag(event, node, {
      onClick: () => {
        if (treeRelationPicker && clickedPerson) {
          submitTreeRelationPick(clickedPerson);
          return;
        }
        if (clickedPerson) {
          setSelectedType("person");
          setSelectedCoupleId(null);
          setSelectedId(null);
          setCouplePersonAction({ personId: clickedPerson.id, coupleId: node.id });
          if (resolvedPermission.editScope === "limited" && !canEditPerson(clickedPerson.id)) {
            setStatus(t("tree.toolbar.limitedEdit"));
          }
          return;
        }
        setSelectedType("couple");
        setCouplePersonAction(null);
        setSelectedId(null);
        setSelectedCoupleId(node.id);
      },
    });
  }, [beginDisplayNodeDrag, bulkMoveMode, canEditPerson, people, resolvedPermission.editScope, setStatus, submitTreeRelationPick, t, treeRelationPicker]);

  const beginLineDrag = useCallback((event, controlLine) => {
    if (!canEditAll || (event.button != null && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();

    const familyId = Number(controlLine.familyId);
    if (!Number.isFinite(familyId)) return;

    const routeKey = controlLine.routeKey || "baseY";
    const axis = controlLine.dragAxis === "xy" ? "xy" : controlLine.dragAxis === "x" ? "x" : "y";
    if (axis === "xy") {
      const routeKeyX = controlLine.routeKeyX || `${routeKey}X`;
      const routeKeyY = controlLine.routeKeyY || `${routeKey}Y`;
      const originX = Number(controlLine.x ?? lineRoutes?.[familyId]?.[routeKeyX]);
      const originY = Number(controlLine.y ?? lineRoutes?.[familyId]?.[routeKeyY]);
      const minX = Number(controlLine.minX);
      const maxX = Number(controlLine.maxX);
      const minY = Number(controlLine.minY);
      const maxY = Number(controlLine.maxY);
      setDraggingLineId(`${familyId}:${routeKey}`);
      lineDragRef.current = { familyId, routeKeyX, routeKeyY, x: originX, y: originY, axis };

      const handleMove = (moveEvent) => {
        moveEvent.preventDefault();
        const scale = scaleRef.current || 1;
        const nextX = snapLine(clamp(originX + (moveEvent.clientX - event.clientX) / scale, minX, maxX));
        const nextY = snapLine(clamp(originY + (moveEvent.clientY - event.clientY) / scale, minY, maxY));
        lineDragRef.current = { familyId, routeKeyX, routeKeyY, x: nextX, y: nextY, axis };
        setLineRoutes((current) => ({
          ...current,
          [familyId]: { ...(current?.[familyId] || {}), [routeKeyX]: nextX, [routeKeyY]: nextY },
        }));
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        setDraggingLineId(null);
        const finalRoute = lineDragRef.current;
        lineDragRef.current = null;
        const finalX = finalRoute?.x ?? originX;
        const finalY = finalRoute?.y ?? originY;
        setLineRoutes((current) => {
          const next = {
            ...current,
            [familyId]: { ...(current?.[familyId] || {}), [routeKeyX]: finalX, [routeKeyY]: finalY },
          };
          if (USE_LOCAL_DRAFT_LAYOUT) saveLineRoutes(clan?.id, next);
          enqueueLayoutChanges({
            lineRoutes: [
              { family_id: familyId, route_key: routeKeyX, value: finalX },
              { family_id: familyId, route_key: routeKeyY, value: finalY },
            ],
          });
          return next;
        });
      };

      window.addEventListener("pointermove", handleMove, { passive: false });
      window.addEventListener("pointerup", handleUp);
      return;
    }

    const startClient = axis === "x" ? event.clientX : event.clientY;
    const originValue = Number((axis === "x" ? controlLine.x : controlLine.y) ?? lineRoutes?.[familyId]?.[routeKey]);
    const minValue = Number(axis === "x" ? controlLine.minX : controlLine.minY);
    const maxValue = Number(axis === "x" ? controlLine.maxX : controlLine.maxY);
    setDraggingLineId(`${familyId}:${routeKey}`);
    lineDragRef.current = { familyId, routeKey, value: originValue };

    const handleMove = (moveEvent) => {
      moveEvent.preventDefault();
      const scale = scaleRef.current || 1;
      const currentClient = axis === "x" ? moveEvent.clientX : moveEvent.clientY;
      const nextValue = snapLine(clamp(originValue + (currentClient - startClient) / scale, minValue, maxValue));
      lineDragRef.current = { familyId, routeKey, value: nextValue };
      setLineRoutes((current) => ({
        ...current,
        [familyId]: { ...(current?.[familyId] || {}), [routeKey]: nextValue },
      }));
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      setDraggingLineId(null);
      const finalRoute = lineDragRef.current;
      lineDragRef.current = null;
        setLineRoutes((current) => {
          const next = {
            ...current,
            [familyId]: { ...(current?.[familyId] || {}), [routeKey]: finalRoute?.value ?? originValue },
          };
        if (USE_LOCAL_DRAFT_LAYOUT) saveLineRoutes(clan?.id, next);
        enqueueLayoutChanges({
          lineRoutes: [{
            family_id: familyId,
            route_key: routeKey,
            value: finalRoute?.value ?? originValue,
          }],
        });
        return next;
      });
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
  }, [canEditAll, clan?.id, enqueueLayoutChanges, lineRoutes]);

  const resetLineRoutes = useCallback(async () => {
    if (!canEditAll) {
      setStatus(t("tree.messages.noPermissionAction"));
      return;
    }

    setSaving(true);
    setStatus("");
    setMobileTreePanel(null);
    setLineRoutes({});
    setCardSizes({});
    clearLineRoutes(clan?.id);
    clearCardSizes(clan?.id);
    try {
      const nextPeople = autoLayoutPeople(canonicalTree.people, canonicalTree.families, canonicalTree.childRows);
      setPeople(nextPeople);
      const saved = await persistFullLayout(nextPeople, {}, {});
      if (saved) await onReload?.();
      setStatus(saved ? t("tree.messages.saveSuccess") : t("tree.messages.saveLayoutError"));
    } finally {
      setSaving(false);
    }
  }, [canEditAll, canonicalTree.childRows, canonicalTree.families, canonicalTree.people, clan?.id, onReload, persistFullLayout, t]);

  const resetLocalLayout = useCallback(() => {
    const removedKeys = clearFamilyTreeLocalStorage();
    const normalizedSettings = normalizeLayoutSettings(layoutSettings);
    setDisplayNodePositions({});
    setLineRoutes(normalizedSettings.line_routes);
    setCardSizes(normalizedSettings.card_sizes);
    setTreeStyle(databaseTreeStyle);
    setTreeTitleLabel(normalizeTreeTitleLabel(databaseTreeStyle.titleLabel));
    setStatus(`Đã xóa ${removedKeys.length} layout local. Dữ liệu đăng nhập được giữ nguyên.`);
  }, [databaseTreeStyle, layoutSettings]);

  const resetLayoutFromDatabase = useCallback(async () => {
    clearFamilyTreeLocalStorage();
    pendingLayoutRef.current = {
      nodes: new Map(),
      lineRoutes: new Map(),
      cardSizes: new Map(),
    };
    if (layoutFlushTimerRef.current) {
      window.clearTimeout(layoutFlushTimerRef.current);
      layoutFlushTimerRef.current = null;
    }
    setDisplayNodePositions({});
    setTreeStyle(databaseTreeStyle);
    setTreeTitleLabel(normalizeTreeTitleLabel(databaseTreeStyle.titleLabel));
    setStatus("Đang tải lại layout từ database...");
    await onReload?.();
  }, [databaseTreeStyle, onReload]);

  const saveLayoutToDatabase = useCallback(async () => {
    if (!canEditAll) {
      setStatus(t("tree.messages.noPermissionAction"));
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      await flushLayoutChanges();
      const saved = await persistFullLayout(people, lineRoutes, cardSizes);
      if (saved) {
        await onReload?.();
        setStatus("Đã lưu layout vào database.");
      }
    } finally {
      setSaving(false);
    }
  }, [canEditAll, cardSizes, flushLayoutChanges, lineRoutes, onReload, people, persistFullLayout, t]);

  const openExportDialog = useCallback(() => {
    setMobileTreePanel(null);
    setExportDialogOpen(true);
    setStatus("");
  }, []);

  const updateExportOptions = useCallback((patch) => {
    setExportOptions((current) => ({ ...current, ...patch }));
  }, []);

  const updateTreeStyle = useCallback((patch) => {
    setTreeStyle((current) => normalizeTreeStyle({ ...current, ...patch }));
  }, []);

  const handleExport = async (nextOptions = exportOptions) => {
    setSaving(true);
    setStatus("");
    try {
      const normalizedOptions = { ...exportOptions, ...nextOptions };
      const payload = prepareTreeExportPayload({
        people: renderPeople,
        families: visibleFamilies,
        childRows: visibleChildRows,
        nodePositions: displayNodePositions,
        options: {
          ...normalizedOptions,
          lineRoutes,
          directLineagePersonIds: Array.from(bloodLinePersonIds),
          displayNodes,
          displayLines: lines,
          treeStyle,
        },
        clan,
        t,
      });
      const blob = await exportPreparedTree({ ...payload, clan, t });
      const extension = normalizedOptions.format === TREE_EXPORT_FORMAT.SVG ? "svg" : normalizedOptions.format === TREE_EXPORT_FORMAT.PDF ? "pdf" : "png";
      downloadBlob(blob, exportFileName(clan?.clan_name, extension));
      setStatus(normalizedOptions.format === TREE_EXPORT_FORMAT.SVG ? t("tree.export.svgDone") : t("tree.messages.exportSuccess"));
      setExportDialogOpen(false);
    } catch (error) {
      console.error("Export tree failed:", error);
      setStatus(`${t("tree.messages.exportError")}${error?.message ? `: ${error.message}` : "."}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSavePerson = async (form) => {
    if (!selectedPerson || !canEditPerson(selectedPerson.id)) {
      setStatus(t("tree.messages.noPermissionAction"));
      return;
    }
    if (isBirthDateInFuture(form.birth_date)) {
      setConstraintNotice("Ngày sinh không được lớn hơn ngày hiện tại.");
      return;
    }
    const saveFormError = personFormError(form, t);
    if (saveFormError) {
      setConstraintNotice(saveFormError);
      return;
    }

    setSaving(true);
    setStatus("");
    try {
      // Ngày theo độ chính xác (đủ ngày / chỉ năm / ước lượng / không rõ), âm hoặc dương lịch, ngày giỗ, nguồn.
      const historical = historicalPayloadFromForm(form);
      if (historical.error) {
        setConstraintNotice(t(`tree.historical.errors.${historical.error}`));
        return;
      }
      const wantsCreateAccount = canEditAll && !selectedPerson.account_id && form.role_id === "3";
      const accountEmail = String(form.account_email || "").trim();
      const accountPassword = String(form.account_password || "");

      if (wantsCreateAccount && form.is_living !== "1") {
        setConstraintNotice(t("tree.createModal.fields.incompleteAccountHint"));
        return;
      }

      if (wantsCreateAccount && (!accountEmail || accountPassword.length < 6)) {
        setConstraintNotice(t("tree.createModal.fields.incompleteAccountHint"));
        return;
      }

      const payload = {
        ...form,
        ...historical.payload,
        gender: form.gender === "" ? null : Number(form.gender),
        generation: Number(form.generation) || 1,
        branch: String(form.branch || "").trim() === "" ? null : Number(form.branch),
      };
      FORM_ONLY_FIELDS.forEach((key) => delete payload[key]);

      // Người đã mất/người được thêm thủ công có thể chưa có tài khoản.
      // Không gửi role_id rỗng lên backend, nếu không backend sẽ hiểu là đang đổi vai trò
      // và chặn việc lưu ngày sinh/ngày mất với lỗi "Vai trò chỉ hỗ trợ...".
      delete payload.role_id;
      delete payload.account_email;
      delete payload.account_password;

      if (canEditAll && selectedPerson.account_id && (form.role_id === "2" || form.role_id === "3")) {
        payload.role_id = Number(form.role_id);
      }

      if (wantsCreateAccount) {
        payload.role_id = 3;
        payload.account_email = accountEmail;
        payload.account_password = accountPassword;
      }

      if (canEditAll && Number(selectedPerson.child_family_id) > 0) {
        const childOrderText = String(form.child_order ?? "").trim();
        payload.child_order = childOrderText === "" ? 0 : Math.max(0, Math.round(Number(childOrderText) || 0));
      }
      const result = await updatePersonAPI(selectedPerson.id, payload);
      if (result.person) {
        let nextPeopleForValidation = null;
        let clearedAllValidationErrors = false;
        setPeople((current) =>
          {
            nextPeopleForValidation = current.map((person) =>
              person.id === selectedPerson.id ? normalizePerson({ ...person, ...result.person }) : person,
            );
            return nextPeopleForValidation;
          },
        );
        if (validationErrors.size && nextPeopleForValidation) {
          const errors = validateTreeData(nextPeopleForValidation, canonicalTree.families, canonicalTree.childRows);
          setValidationErrors(errors);
          clearedAllValidationErrors = !errors.size;
          if (clearedAllValidationErrors) setStatus(t("tree.messages.validationFixed"));
        }
        if (!clearedAllValidationErrors) setStatus(t("tree.messages.saveSuccess"));
      } else {
        setStatus(t("tree.messages.saveSuccess"));
      }
      await onReload?.();
    } catch (error) {
      if (!shouldSuppressInlineRelationError(error)) setConstraintNotice(error?.message || t("tree.messages.saveError"));
    } finally {
      treeRealtime.stopEditing(selectedPerson.id);
      setSaving(false);
    }
  };

  const handleDeletePerson = async () => {
    if (!selectedPerson || !canEditAll) {
      setStatus(t("tree.messages.noPermissionAction"));
      return;
    }
    const ok = window.confirm(t("tree.messages.deleteConfirm", { name: fullName(selectedPerson) }));
    if (!ok) return;
    setSaving(true);
    setStatus("");
    try {
      const res = await deletePersonAPI(selectedPerson.id);
      setPeople((current) => current.filter((person) => person.id !== selectedPerson.id));
      setSelectedId(null);
      setStatus(res?.message || t("tree.messages.deleteSuccess"));
      await onReload?.();
    } catch (error) {
      setStatus(error?.message || t("tree.messages.deleteError"));
    } finally {
      setSaving(false);
    }
  };

  const openQuickCreateDialog = (person) => {
  setBillingWarning(null);
  setMobileTreePanel(null);

  if (!canEditAll) {
    setStatus(t("tree.inspector.limitedNote"));
    return;
  }

  if (!person?.id) {
    setStatus(t("tree.messages.linkSourceNotFound"));
    return;
  }

  // Khi bấm icon thêm liên kết, chỉ mở bảng chọn loại liên kết.
  // Không chọn/mở panel thông tin thành viên phía sau.
  setSelectedId(null);
  setQuickCreateDialog({ sourcePersonId: person.id });
};

const openCreateDialogFromQuickRelation = (relation) => {
  const sourcePerson = quickCreateSourcePerson;

  if (!sourcePerson) {
    setStatus(t("tree.messages.linkSourceNotFound"));
    setQuickCreateDialog(null);
    return;
  }

  const spouse = findSpouse(sourcePerson, canonicalTree.families, people);

  setDialog({
    relation,
    sourcePersonId: sourcePerson.id,
    form: blankCreateForm(relation, sourcePerson, spouse),
    relationOptions: defaultRelationOptions(relation, sourcePerson, canonicalTree.families, people),
  });

  setQuickCreateDialog(null);
};

const listFamilyTreeLocalStorageKeys = () => {
  if (typeof window === "undefined") return [];
  return Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
    .filter((key) => key && key.startsWith("family-tree-"));
};

const clearFamilyTreeLocalStorage = () => {
  if (typeof window === "undefined") return [];
  const keys = listFamilyTreeLocalStorageKeys();
  keys.forEach((key) => window.localStorage.removeItem(key));
  return keys;
};

const openCreateDialogForPerson = (person, relation) => {
  if (!person?.id) {
    setStatus(t("tree.messages.linkSourceNotFound"));
    return;
  }
  if (!canEditAll) {
    setStatus(t("tree.inspector.limitedNote"));
    return;
  }

  const spouse = findSpouse(person, canonicalTree.families, people);
  setDialog({
    relation,
    sourcePersonId: person.id,
    form: blankCreateForm(relation, person, spouse),
    relationOptions: defaultRelationOptions(relation, person, canonicalTree.families, people),
  });
  setCouplePersonAction(null);
  setSelectedCoupleId(null);
  setSelectedId(null);
};

  const openCreateDialog = (relation) => {
    setBillingWarning(null);
    setMobileTreePanel(null);
    if (!canEditAll) {
      setStatus(t("tree.inspector.limitedNote"));
      return;
    }
    if (relation !== "person" && !selectedPerson) {
      setStatus(t("tree.messages.linkSourceNotFound"));
      return;
    }
    if (relation !== "person") {
      const currentIds = relationLinkedIds(relation, selectedPerson, canonicalTree.families, canonicalTree.childRows);
      setRelationDialog({
        relation,
        personId: [...currentIds][0] || "",
        options: defaultRelationOptions(relation, selectedPerson, canonicalTree.families, people),
      });
      setTreeRelationPicker(null);
      return;
    }
    setDialog({
      relation,
      form: blankCreateForm(relation, selectedPerson, selectedSpouse),
    });
  };

const submitCreateDialog = async () => {
  if (!canEditAll || !dialog) return;

  const form = dialog.form;
  const relation = dialog.relation;
  const sourcePersonId = dialog?.sourcePersonId ? Number(dialog.sourcePersonId) : null;

  const display = String(form.display_name || "").trim();
  const parts = [form.surname, form.middle_name, form.first_name].filter(Boolean).join(" ").trim();

  if (!display && !parts) {
    setConstraintNotice(t("tree.formErrors.nameRequired"));
    return;
  }
  const createFormError = personFormError(form, t);
  if (createFormError) {
    setConstraintNotice(createFormError);
    return;
  }

  if (form.is_living === "1") {
    const email = String(form.account_email || "").trim();
    const password = String(form.account_password || "");

    if (password && (!email || password.length < 6)) {
      setStatus(t("tree.createModal.fields.incompleteAccountHint"));
      return;
    }
  }

  if (isBirthDateInFuture(form.birth_date)) {
    setConstraintNotice("Ngày sinh không được lớn hơn ngày hiện tại.");
    return;
  }

  if (relation === "child" && sourcePersonId && !dialog.relationOptions?.unionKey) {
    setConstraintNotice(t("tree.relationOptions.chooseUnionHint"));
    return;
  }

  setDialogSaving(true);
  setStatus("");

  try {
    const historical = historicalPayloadFromForm(form);
    if (historical.error) {
      setConstraintNotice(t(`tree.historical.errors.${historical.error}`));
      return;
    }
    const accountEmail = String(form.account_email || "").trim();
    const accountPassword = String(form.account_password || "");
    const shouldCreateAccount = form.is_living === "1" && Boolean(accountEmail && accountPassword.length >= 6);
    const createBody = {
      ...form,
      ...historical.payload,
      clan_id: clan?.id,
      gender: form.gender === "" ? null : Number(form.gender),
      generation: Number(form.generation) || 1,
      branch: String(form.branch || "").trim() === "" ? null : Number(form.branch),
      tree_x: Number(form.tree_x) || 0,
      tree_y: Number(form.tree_y) || 0,
      email: accountEmail || null,
      account_email: shouldCreateAccount ? accountEmail : null,
      account_password: shouldCreateAccount ? accountPassword : null,
    };
    FORM_ONLY_FIELDS.forEach((key) => delete createBody[key]);
    const relationSource = sourcePersonId ? people.find((person) => Number(person.id) === Number(sourcePersonId)) : null;
    if (relationSource && relation !== "person") {
      Object.assign(createBody, buildCreateRelationFields(
        relation,
        relationSource,
        dialog.relationOptions || defaultRelationOptions(relation, relationSource, canonicalTree.families, people),
        canonicalTree.families,
        canonicalTree.childRows,
      ));
    }
    const createdResponse = await createPersonAPI(createBody);

    const newPersonId = extractCreatedPersonId(createdResponse);
    if (createdResponse?.person?.id) {
      const createdPerson = normalizePerson(createdResponse.person);
      setPeople((current) =>
        current.some((person) => Number(person.id) === Number(createdPerson.id))
          ? current.map((person) => (Number(person.id) === Number(createdPerson.id) ? { ...person, ...createdPerson } : person))
          : [...current, createdPerson],
      );
    }

    if (sourcePersonId && relation !== "person" && !newPersonId) {
      throw new Error(t("tree.messages.linkError"));
    }

    setDialog(null);

    if (sourcePersonId && relation !== "person") {
      setStatus(t("tree.messages.saveSuccess"));
    } else {
      setStatus(t("tree.messages.saveSuccess"));
    }

    await onReload?.();
  } catch (error) {
    const errorCode = error?.code || error?.data?.code;
    const billing = error?.billing || error?.data?.billing;

    if (errorCode === "PERSON_LIMIT_REACHED") {
      const currentPeople = billing?.current_people;
      const personLimit = billing?.person_limit;
      const planName = billing?.plan_name || t("common.currentPlan");
      const message =
        currentPeople != null && personLimit != null
          ? t("tree.messages.personLimitReached", { current: currentPeople, limit: personLimit, plan: planName })
          : t("tree.messages.personLimitReached", { current: currentPeople, limit: "?", plan: planName });

      setBillingWarning({ message });
      setStatus(message);
      return;
    }

    if (errorCode === "SUBSCRIPTION_EXPIRED") {
      const message = t("tree.messages.subscriptionExpired");
      setBillingWarning({ message });
      setStatus(message);
      return;
    }

    if (!shouldSuppressInlineRelationError(error)) setConstraintNotice(error?.message || t("tree.messages.saveError"));
  } finally {
    setDialogSaving(false);
  }
};

  const submitRelationDialog = async () => {
    if (!canEditAll || !relationDialog || !selectedPerson || !relationDialog.personId) return;
    const relation = relationDialog.relation;
    const targetId = Number(relationDialog.personId);
    // Tuổi cha mẹ - con do máy chủ kiểm tra theo độ chính xác của ngày (hộp thoại đã hiện kết quả xem trước).

    setDialogSaving(true);
    setStatus("");
    try {
      const relationOptions = relationDialog.options || defaultRelationOptions(relation, selectedPerson, canonicalTree.families, people);
      if (relation === "child" && !relationOptions.unionKey) {
        setConstraintNotice(t("tree.relationOptions.chooseUnionHint"));
        return;
      }
      await linkRelationsAPI(buildLinkPayload(relation, selectedPerson, targetId, relationOptions, canonicalTree.families, canonicalTree.childRows));

      setRelationDialog(null);
      setStatus(t("tree.messages.linkSuccess", { relation: t(`tree.relations.${relation}`) }));
      await onReload?.();
    } catch (error) {
      if (!shouldSuppressInlineRelationError(error)) setConstraintNotice(error?.message || t("tree.messages.linkError"));
    } finally {
      setDialogSaving(false);
    }
  };

  const unlinkRelationDialog = async () => {
    if (!canEditAll || !relationDialog || !selectedPerson) return;
    const relation = relationDialog.relation;
    const targetId = Number(relationDialog.personId);

    setDialogSaving(true);
    setStatus("");
    try {
      if (relation === "spouse") {
        const family = findSpouseFamily(selectedPerson.id, targetId, canonicalTree.families);
        await linkRelationsAPI({
          person_id: selectedPerson.id,
          family_id: family?.id || null,
          spouse_person_id: null,
        });
      }

      if (relation === "child") {
        const family = asArray(canonicalTree.families).find((item) =>
          asArray(canonicalTree.childRows).some(
            (row) => Number(row.family_id) === Number(item.id) && Number(row.person_id) === targetId,
          ) && (Number(item.father_id) === Number(selectedPerson.id) || Number(item.mother_id) === Number(selectedPerson.id))
        );
        if (!family) {
          setConstraintNotice(t("tree.messages.unlinkError"));
          return;
        }
        const existingChildren = getChildrenForFamily(family.id, canonicalTree.childRows);
        const childrenIds = existingChildren.filter((id) => Number(id) !== targetId);
        const childOrders = getChildOrderMapForFamily(family.id, canonicalTree.childRows);
        delete childOrders[targetId];
        await linkRelationsAPI({
          person_id: selectedPerson.id,
          family_id: family.id,
          children_person_ids: childrenIds,
          child_orders: childOrders,
        });
      }

      if (relation === "father" || relation === "mother") {
        const currentParents = findParentFamilyForChild(selectedPerson.id, canonicalTree.families, canonicalTree.childRows);
        await linkRelationsAPI({
          person_id: selectedPerson.id,
          father_person_id: relation === "father" ? null : currentParents?.father_id || null,
          mother_person_id: relation === "mother" ? null : currentParents?.mother_id || null,
        });
      }

      setRelationDialog(null);
      setStatus(t("tree.messages.unlinkSuccess", { relation: t(`tree.relations.${relation}`) }));
      await onReload?.();
    } catch (error) {
      if (!shouldSuppressInlineRelationError(error)) setConstraintNotice(error?.message || t("tree.messages.unlinkError"));
    } finally {
      setDialogSaving(false);
    }
  };

  const founderIds = useMemo(
    () => findFounderIds(people, canonicalTree.families, canonicalTree.childRows),
    [people, canonicalTree.families, canonicalTree.childRows],
  );
  // Người trực hệ để tô màu thẻ: con cháu có cha mẹ trong cây, cộng thủy tổ ở gốc
  // (người chồng của cặp gốc, hoặc người gốc không có chồng).
  const bloodLinePersonIds = useMemo(() => {
    const result = new Set(directLineagePersonIds);
    founderIds.forEach((id) => {
      const isWifeOfFounder = asArray(canonicalTree.families).some((family) => (
        Number(family.mother_id) === Number(id) && founderIds.has(Number(family.father_id))
      ));
      if (!isWifeOfFounder) result.add(Number(id));
    });
    return result;
  }, [canonicalTree.families, directLineagePersonIds, founderIds]);

  const beginCardResize = useCallback((event, person) => {
    if (!canEditPerson(person.id) || (event.button != null && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();

    const personId = Number(person.id);
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = getCardSize(cardSizes, personId);
    let latest = origin;

    const handleMove = (moveEvent) => {
      moveEvent.preventDefault();
      const scale = scaleRef.current || 1;
      latest = normalizeCardSize({
        width: snap(origin.width + (moveEvent.clientX - startX) / scale),
        height: snap(origin.height + (moveEvent.clientY - startY) / scale),
      });
      setCardSizes((current) => ({ ...current, [personId]: latest }));
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      setCardSizes((current) => {
        const next = { ...current, [personId]: latest };
        if (USE_LOCAL_DRAFT_LAYOUT) saveCardSizes(clan?.id, next);
        enqueueLayoutChanges({
          cardSizes: [{ person_id: personId, ...latest }],
        });
        return next;
      });
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
  }, [canEditPerson, cardSizes, clan?.id, enqueueLayoutChanges]);

  const selectedCanEdit = selectedPerson ? canEditPerson(selectedPerson.id) : false;
  const selectedNotice = selectedPerson
    ? canEditAll
      ? ""
      : selectedCanEdit
        ? t("tree.inspector.limitedNote")
        : canEditLimited
          ? t("tree.toolbar.limitedEdit")
          : t("tree.inspector.readOnlyNote")
    : "";

  const fitTreeToScreen = useCallback((duration = 320) => {
    const api = transformApiRef.current;
    const viewport = viewportRef.current;
    if (!api?.setTransform || !viewport || !displayNodes.length) return false;
    const rect = viewport.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;

    const bounds = displayNodes.reduce((acc, node) => {
      const left = toInt(node.x, 0);
      const top = toInt(node.y, 0);
      return {
        left: Math.min(acc.left, left),
        top: Math.min(acc.top, top),
        right: Math.max(acc.right, left + node.width),
        bottom: Math.max(acc.bottom, top + node.height),
      };
    }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });

    if (generationLanes.length) bounds.left -= GENERATION_LANE_GUTTER;
    const treeWidth = Math.max(1, bounds.right - bounds.left);
    const treeHeight = Math.max(1, bounds.bottom - bounds.top);
    const padding = isTreeMobile ? 42 : 92;
    const usableWidth = Math.max(1, rect.width - padding * 2);
    const usableHeight = Math.max(1, rect.height - padding * 2);
    // Không thu nhỏ quá mức đọc được; cây lớn hơn màn hình thì căn theo đỉnh để thấy thủy tổ trước.
    const minFitScale = isTreeMobile ? 0.3 : 0.2;
    const fitScale = Math.min(usableWidth / treeWidth, usableHeight / treeHeight);
    const nextScale = clamp(fitScale, minFitScale, 1.05);
    const treeCenterX = bounds.left + treeWidth / 2;
    const treeCenterY = bounds.top + treeHeight / 2;
    const nextX = rect.width / 2 - treeCenterX * nextScale;
    const overflowsVertically = treeHeight * nextScale > usableHeight;
    const nextY = overflowsVertically
      ? padding + (isTreeMobile ? 48 : 0) - bounds.top * nextScale
      : rect.height / 2 - treeCenterY * nextScale;

    scaleRef.current = nextScale;
    setCurrentScale(nextScale);
    api.setTransform(nextX, nextY, nextScale, duration);
    return true;
  }, [displayNodes, generationLanes.length, isTreeMobile]);

  useEffect(() => {
    document.body.classList.toggle("fte-bodyFullscreen", treeFullscreen);

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setTreeFullscreen(false);
      }
    };

    if (treeFullscreen) {
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.body.classList.remove("fte-bodyFullscreen");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [treeFullscreen]);

  useEffect(() => {
    if (loading || !displayNodes.length || draggingId !== null || draggingLineId !== null || draggingTitleLabel) return undefined;
    if (lastAutoFitKeyRef.current === autoFitSignature) return undefined;

    const timer = window.setTimeout(() => {
      if (fitTreeToScreen(360)) lastAutoFitKeyRef.current = autoFitSignature;
    }, 90);

    return () => window.clearTimeout(timer);
  }, [autoFitSignature, displayNodes.length, draggingId, draggingLineId, draggingTitleLabel, fitTreeToScreen, loading, transformReady]);

  const updateTreeTitleLabel = useCallback((patch) => {
    setTreeTitleLabel((current) => normalizeTreeTitleLabel({ ...current, ...patch }));
  }, []);

  const resizeTreeTitleLabel = useCallback((delta) => {
    if (!canEditAll) return;
    updateTreeTitleLabel({ fontSize: (Number(treeTitleLabel.fontSize) || DEFAULT_TREE_TITLE_LABEL.fontSize) + delta });
  }, [canEditAll, treeTitleLabel.fontSize, updateTreeTitleLabel]);

  const resetTreeTitleLabel = useCallback(() => {
    if (!canEditAll) return;
    updateTreeTitleLabel({ ...DEFAULT_TREE_TITLE_LABEL });
  }, [canEditAll, updateTreeTitleLabel]);

  const beginTreeTitleDrag = useCallback((event) => {
    if (!canEditAll || event.button !== 0) return;
    if (event.target?.closest?.("button, input")) return;
    event.preventDefault();
    event.stopPropagation();
    titleDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: Number(treeTitleLabel.x) || 0,
      originY: Number(treeTitleLabel.y) || 0,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraggingTitleLabel(true);
  }, [canEditAll, treeTitleLabel.x, treeTitleLabel.y]);

  const moveTreeTitleDrag = useCallback((event) => {
    const drag = titleDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const scale = scaleRef.current || 1;
    updateTreeTitleLabel({
      x: drag.originX + (event.clientX - drag.startX) / scale,
      y: drag.originY + (event.clientY - drag.startY) / scale,
    });
  }, [updateTreeTitleLabel]);

  const endTreeTitleDrag = useCallback((event) => {
    const drag = titleDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    titleDragRef.current = null;
    setDraggingTitleLabel(false);
  }, []);

  const busy = loading || saving;
  const toggleTreeFullscreen = () => {
    setTreeFullscreen((value) => !value);
    window.setTimeout(() => fitTreeToScreen(260), 120);
  };
  const treeSearchProps = {
    query: treeSearch.query,
    onQueryChange: treeSearch.setQuery,
    onSubmit: treeSearch.submitSearch,
    onClear: treeSearch.clearSearch,
    submittedQuery: treeSearch.submittedQuery,
    results: treeSearch.results,
    onFindMe: handleFindMe,
    onResultClick: (person) => {
      if (!visiblePeople.some((item) => Number(item.id) === Number(person.id))) {
        treeViewMode.setFullMode();
      }
      focusPerson(person.id, { search: true });
    },
  };
  const rootPersonForToolbar = people.find((person) => Number(person.id) === Number(treeViewMode.rootPersonId));
  const rootSelectorProps = {
    people,
    mode: treeViewMode.mode,
    rootPersonId: treeViewMode.rootPersonId,
    rootName: rootPersonForToolbar ? fullName(rootPersonForToolbar, "") : "",
    onFullMode: treeViewMode.setFullMode,
    onRootMode: (personId) => {
      treeViewMode.setRootMode(personId);
      focusPerson(personId);
    },
  };
  const toolbarPrimaryActions = [
    { key: "add", icon: "person_add", label: t("tree.toolbar.addPerson"), primary: true, onClick: () => openCreateDialog("person"), disabled: busy, hidden: !canEditAll },
    { key: "auto", icon: "auto_fix_high", label: t("tree.toolbar.autoLayout"), title: t("tree.toolbar.autoLayoutHint"), onClick: applyAutoLayoutAndSave, disabled: busy, hidden: !canEditAll },
    { key: "save", icon: "save", label: t("tree.toolbar.saveLayout"), onClick: saveLayoutToDatabase, disabled: busy, hidden: !canEditAll },
    { key: "export", icon: "download", label: t("tree.toolbar.exportPng"), onClick: openExportDialog, disabled: busy },
  ];
  const toolbarToolGroups = [
    {
      key: "layout",
      label: t("tree.toolbar.groupLayout"),
      items: [
        { key: "resetLines", icon: "alt_route", label: t("tree.toolbar.resetLines"), onClick: resetLineRoutes, disabled: busy, hidden: !canEditAll },
        { key: "bulk", icon: "select_all", label: bulkMoveMode ? t("tree.toolbar.bulkSelectOff") : t("tree.toolbar.bulkSelect"), onClick: toggleBulkMoveMode, disabled: busy, active: bulkMoveMode, hidden: !canEditAll },
        { key: "resetTitle", icon: "title", label: t("tree.toolbar.resetTitle"), onClick: resetTreeTitleLabel, disabled: busy, hidden: !canEditAll },
        { key: "reload", icon: "cloud_sync", label: t("tree.toolbar.reloadLayout"), onClick: resetLayoutFromDatabase, disabled: busy },
        { key: "clearLocal", icon: "delete_sweep", label: t("tree.toolbar.clearLocalLayout"), onClick: resetLocalLayout, disabled: busy },
      ],
    },
    {
      key: "data",
      label: t("tree.toolbar.groupData"),
      items: [
        { key: "validate", icon: "rule", label: t("tree.toolbar.validate"), onClick: handleValidateTree, disabled: busy },
        { key: "ai", icon: "auto_awesome", label: t("tree.genealogyAi.open"), onClick: openGenealogyAiDialog, disabled: busy, hidden: !canEditAll },
        { key: "archive", icon: "inventory_2", label: t("tree.toolbar.archive"), onClick: () => setArchiveDialogOpen(true), disabled: busy, hidden: !canEditAll },
      ],
    },
  ];
  const mobileSpeedDialActions = [
    { key: "add", icon: "person_add", label: t("tree.toolbar.addPerson"), onClick: () => openCreateDialog("person"), disabled: busy, hidden: !canEditAll },
    { key: "findMe", icon: "my_location", label: t("tree.toolbar.findMe"), onClick: handleFindMe },
    { key: "auto", icon: "auto_fix_high", label: t("tree.toolbar.autoLayout"), onClick: applyAutoLayoutAndSave, disabled: busy, hidden: !canEditAll },
    { key: "save", icon: "save", label: t("tree.toolbar.saveLayout"), onClick: saveLayoutToDatabase, disabled: busy, hidden: !canEditAll },
    { key: "export", icon: "download", label: t("tree.toolbar.exportPng"), onClick: openExportDialog, disabled: busy },
  ];
  const treeStyleControls = <TreeStyleControls treeStyle={treeStyle} onChange={updateTreeStyle} />;

  const treeEditorShell = (
    <section className={`fte-shell fte2 ${treeFullscreen ? "is-fullscreen" : ""} ${isTreeMobile ? "is-mobile" : ""}`} data-tree-theme={treeStyle.theme}>
      <TransformWrapper
        initialScale={isTreeMobile ? 0.68 : 0.85}
        minScale={isTreeMobile ? 0.12 : 0.18}
        maxScale={2.6}
        centerOnInit={true}
        limitToBounds={false}
        panning={{ disabled: bulkMoveMode || draggingId !== null || draggingLineId !== null || draggingTitleLabel, velocityDisabled: false }}
        doubleClick={{ disabled: true }}

        pinch={{ step: 5 }}
        velocityAnimation={{ sensitivity: 1.05, animationTime: 260 }}
        alignmentAnimation={{ sizeX: 0, sizeY: 0, animationTime: 220 }}
        onInit={(ref) => {
          transformApiRef.current = ref;
          const scale = ref?.state?.scale || 0.85;
          scaleRef.current = scale;
          setCurrentScale(scale);
          setTransformReady((value) => value + 1);
        }}
        onZoom={(ref) => {
          const scale = ref?.state?.scale || 0.85;
          scaleRef.current = scale;
          setCurrentScale(scale);
        }}
        onTransformed={(ref) => {
          const scale = ref?.state?.scale || 0.85;
          scaleRef.current = scale;
          setCurrentScale(scale);
        }}
      >
        {({ zoomIn, zoomOut }) => (
          <>
            {isTreeMobile ? null : (
              <TreeToolbar
                search={treeSearchProps}
                rootSelector={rootSelectorProps}
                displayMode={treeDisplayMode}
                onDisplayModeChange={setTreeDisplayMode}
                primaryActions={toolbarPrimaryActions}
                toolGroups={toolbarToolGroups}
                styleControls={treeStyleControls}
                badge={canEditLimited ? t("tree.toolbar.limitedEdit") : ""}
              />
            )}

            {billingWarning ? (
              <div className="fte-billingWarning">
                <div>
                  <strong>{t("tree.messages.billingLimit")}</strong>
                  <p>{billingWarning.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = "/manager/billing";
                  }}
                >
                  <span className="material-symbols-outlined">workspace_premium</span>
                  {t("tree.messages.billingUpgrade")}
                </button>
              </div>
            ) : null}

            {status ? <div className="fte-status" role="status" aria-live="polite">{status}</div> : null}
            {validationIssueRows.length ? (
              <div className="fte-validationPanel" role="status" aria-live="polite">
                <div className="fte-validationPanelHead">
                  <strong>{t("tree.messages.validationTitle")}</strong>
                  <span>{t("tree.messages.validationSummary", { count: validationErrors.size })}</span>
                </div>
                <div className="fte-validationList">
                  {validationIssueRows.slice(0, 12).map((issue, index) => (
                    <button
                      key={`${issue.personId}-${index}-${issue.message}`}
                      type="button"
                      onClick={() => focusPerson(issue.personId, { scale: 1.2 })}
                    >
                      <span className="material-symbols-outlined">warning</span>
                      <strong>{issue.personName}{issue.generation ? ` - ${t("tree.card.generation", { count: issue.generation })}` : ""}</strong>
                      <small>{issue.message}</small>
                    </button>
                  ))}
                  {validationIssueRows.length > 12 ? (
                    <span className="fte-validationMore">{t("tree.messages.validationMore", { count: validationIssueRows.length - 12 })}</span>
                  ) : null}
                </div>
              </div>
            ) : null}
            {constraintNotice ? <CenterNoticeDialog message={constraintNotice} onClose={() => setConstraintNotice("")} /> : null}
            {treeRelationPicker ? (
              <div className="fte-treePickFloating" role="status" aria-live="polite">
                <div>
                  <strong>{t("tree.messages.treePickHint", { relation: t(`tree.relations.${treeRelationPicker.relation}`), name: treeRelationSource ? fullName(treeRelationSource) : t("tree.card.fallbackName") })}</strong>
                </div>
                <button type="button" onClick={() => { setTreeRelationPicker(null); setStatus(""); }}>{t("common.cancel")}</button>
              </div>
            ) : null}

            <div className="fte-workspace">
              <div className="fte-viewport" ref={viewportRef} style={treeStyle.backgroundColor ? { "--fte-tree-bg": treeStyle.backgroundColor } : undefined}>
                {loading ? (
                  <div className="fte-loading">{t("tree.messages.loading")}</div>
                ) : (
                  <TransformComponent wrapperClass="fte-transformWrapper" contentClass="fte-transformContent">
                    <div
                      id="family-tree"
                      ref={treeRef}
                      className={`fte-canvas ${treeRelationPicker ? "is-relation-picking" : ""} ${bulkMoveMode ? "is-bulkMoveMode" : ""} ${currentScale < FAR_ZOOM_SCALE ? "is-zoomFar" : ""}`}
                      style={{
                        width: canvasSize.width,
                        height: canvasSize.height,
                        // Khi thu nhỏ, phóng chữ trên thẻ để tên vẫn đọc được (thu phóng theo ngữ nghĩa).
                        "--fte2-zoom-comp": clamp(FAR_ZOOM_TEXT_TARGET / Math.max(currentScale, 0.12), 1, 3).toFixed(3),
                      }}
                      onPointerDown={beginBulkSelection}
                    >
                      {bulkSelectionRect ? (
                        <div
                          className="fte-bulkSelectionRect"
                          style={{
                            left: bulkSelectionRect.x,
                            top: bulkSelectionRect.y,
                            width: bulkSelectionRect.width,
                            height: bulkSelectionRect.height,
                          }}
                        />
                      ) : null}
                      <div
                        className={`fte-canvasTitle ${canEditAll ? "is-editable" : ""} ${draggingTitleLabel ? "is-dragging" : ""}`}
                        style={{
                          left: treeTitleLabel.x,
                          top: treeTitleLabel.y,
                          // Màu mặc định thì để theo chủ đề; chỉ áp màu riêng khi người dùng đã chọn.
                          color: treeTitleLabel.color === DEFAULT_TREE_TITLE_LABEL.color ? undefined : treeTitleLabel.color,
                          "--tree-title-size": `${treeTitleLabel.fontSize}px`,
                        }}
                        title={canEditAll ? "Kéo để di chuyển tiêu đề, dùng nút bên dưới để đổi màu/cỡ chữ" : undefined}
                        onPointerDown={beginTreeTitleDrag}
                        onPointerMove={moveTreeTitleDrag}
                        onPointerUp={endTreeTitleDrag}
                        onPointerCancel={endTreeTitleDrag}
                      >
                        <span>{t("tree.title")}</span>
                        <strong>{defaultTreeTitleText}</strong>
                        {canEditAll ? (
                          <div className="fte-canvasTitleTools" onPointerDown={(event) => event.stopPropagation()}>
                            <label className="fte-canvasTitleColor" title="Đổi màu chữ">
                              <span className="material-symbols-outlined">palette</span>
                              <input
                                type="color"
                                value={treeTitleLabel.color}
                                onChange={(event) => updateTreeTitleLabel({ color: event.target.value })}
                                aria-label="Đổi màu chữ tiêu đề"
                              />
                            </label>
                            <button type="button" onClick={() => resizeTreeTitleLabel(-4)} title="Thu nhỏ chữ">
                              <span className="material-symbols-outlined">text_decrease</span>
                            </button>
                            <button type="button" onClick={() => resizeTreeTitleLabel(4)} title="Phóng to chữ">
                              <span className="material-symbols-outlined">text_increase</span>
                            </button>
                            <button type="button" onClick={resetTreeTitleLabel} title="Đặt lại vị trí, màu và cỡ chữ">
                              <span className="material-symbols-outlined">restart_alt</span>
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {generationLanes.map((lane) => (
                        <div
                          key={`lane-${lane.generation}`}
                          className={`fte2-lane ${lane.striped ? "is-striped" : ""}`}
                          style={{ left: lane.left, top: lane.top, width: lane.width, height: lane.height }}
                          aria-hidden="true"
                        >
                          <span className="fte2-laneLabel">{t("tree.lanes.generation", { count: lane.generation })}</span>
                        </div>
                      ))}
                      <svg className="fte-lines" width={canvasSize.width} height={canvasSize.height} aria-hidden={false}>
                        {lines.filter((line) => line.type !== "route-control").map((line, index) => (
                          (() => {
                            const lineRelated = !selectedRelatedIds.size || asArray(line.relatedPersonIds).some((id) => selectedRelatedIds.has(Number(id)));
                            return (
                          <path
                            key={line.id || `${line.type}-${index}`}
                            className={`fte-line is-${line.type} ${line.variant ? `is-variant-${line.variant}` : ""} ${line.branchLevel === 0 && line.type === "blood" ? "is-mainBranch" : ""} ${selectedRelatedIds.size ? (lineRelated ? "is-related" : "is-dimmed") : ""} ${line.dragAxis ? `is-axis-${line.dragAxis}` : ""} ${canEditAll && line.dragAxis ? "is-draggable" : ""} ${draggingLineId === `${Number(line.familyId)}:${line.routeKey || "baseY"}` ? "is-dragging" : ""}`}
                            d={line.d}
                            style={line.color ? { "--line-color": line.color } : undefined}
                            onPointerDown={canEditAll && line.dragAxis ? (event) => beginLineDrag(event, line) : undefined}
                          />
                            );
                          })()
                        ))}
                        {canEditAll ? lines.filter((line) => line.type === "route-control").map((line) => (
                          <g
                            key={line.id}
                            className={`fte-lineControl ${line.dragAxis ? `is-axis-${line.dragAxis}` : ""} ${draggingLineId === `${Number(line.familyId)}:${line.routeKey || "baseY"}` ? "is-dragging" : ""}`}
                            transform={`translate(${line.x}, ${line.y})`}
                            onPointerDown={(event) => beginLineDrag(event, line)}
                          >
                            {line.dragAxis === "xy" ? (
                              <>
                                <line x1="0" y1="-28" x2="0" y2="28" />
                                <line x1="-28" y1="0" x2="28" y2="0" />
                              </>
                            ) : line.dragAxis === "x" ? (
                              <line x1="0" y1="-28" x2="0" y2="28" />
                            ) : (
                              <line x1="-28" y1="0" x2="28" y2="0" />
                            )}
                            <circle cx="0" cy="0" r="12" />
                            <path d={line.dragAxis === "xy" ? "M -7 -7 L -2 -7 M 7 -7 L 2 -7 M -7 7 L -2 7 M 7 7 L 2 7 M -7 -7 L -7 -2 M -7 7 L -7 2 M 7 -7 L 7 -2 M 7 7 L 7 2" : line.dragAxis === "x" ? "M -3 -5 L -8 0 L -3 5 M 3 -5 L 8 0 L 3 5" : "M -5 -3 L 0 -8 L 5 -3 M -5 3 L 0 8 L 5 3"} />
                          </g>
                        )) : null}
                      </svg>
                      {displayNodes.map((node) => {
                        const related = asArray(node.personIds).some((personId) => selectedRelatedIds.has(Number(personId)));
                        const dimmed = selectedRelatedIds.size > 0 && !related;
                        if (node.type === DISPLAY_NODE_TYPE.REFERENCE) {
                          const referenceRelated = selectedRelatedIds.has(Number(node.refPersonId));
                          return (
                            <ReferenceCard
                              key={node.id}
                              node={node}
                              related={referenceRelated}
                              dimmed={selectedRelatedIds.size > 0 && !referenceRelated}
                              onOpen={(personId) => focusPerson(personId, { scale: 1.1 })}
                            />
                          );
                        }
                        if (node.type === DISPLAY_NODE_TYPE.COUPLE) {
                          return (
                            <CoupleCard
                              key={node.id}
                              node={node}
                              selectedPersonId={selectedType === "person" ? selectedId : null}
                              selectedCouple={(selectedType === "couple" && selectedCoupleId === node.id) || selectedDisplayNodeIds.has(node.id)}
                              related={related}
                              dimmed={dimmed}
                              dragging={draggingId === node.id}
                              canDrag={node.personIds.some((personId) => canEditPerson(personId))}
                              directLineagePersonIds={bloodLinePersonIds}
                              lineageControlsByPersonId={lineageControlsByPersonId}
                              collapsedIds={treeViewMode.collapsedIds}
                              hiddenAncestorIds={treeViewMode.hiddenAncestorIds}
                              cardOrientation={treeStyle.cardOrientation}
                              displayMode={treeDisplayMode}
                              fontSize={treeStyle.fontSize}
                              onToggleDescendants={treeViewMode.toggleDescendantBranch}
                              onToggleAncestors={treeViewMode.toggleAncestorBranch}
                              onPointerDown={handleCouplePointerDown}
                            />
                          );
                        }

                        const person = node.person;
                        const renderPerson = {
                          ...person,
                          tree_x: node.x,
                          tree_y: node.y,
                        };
                        return (
                          <TreeNodeCard
                            key={node.id}
                            person={renderPerson}
                            selected={(selectedType === "person" && selectedId === person.id) || selectedDisplayNodeIds.has(node.id)}
                            dragging={draggingId === person.id}
                            canDrag={canEditPerson(person.id)}
                            canEdit={canEditPerson(person.id)}
                            canDelete={canEditAll && canEditPerson(person.id)}
                            founder={founderIds.has(Number(person.id))}
                            directLineage={bloodLinePersonIds.has(Number(person.id))}
                            size={{ width: node.width, height: node.height }}
                            displayMode={treeDisplayMode}
                            cardOrientation={treeStyle.cardOrientation}
                            fontSize={treeStyle.fontSize}
                            related={related}
                            dimmed={dimmed}
                            hasChildren={(childCountByParentId.get(Number(person.id)) || 0) > 0}
                            hasAncestors={lineageControlsByPersonId.get(Number(person.id))?.hasAncestors}
                            collapsed={treeViewMode.collapsedIds.has(Number(person.id))}
                            ancestorsCollapsed={lineageControlsByPersonId.get(Number(person.id))?.ancestorIds?.some((id) => treeViewMode.hiddenAncestorIds.has(Number(id)))}
                            highlightOptions={{
                              onlinePersonIds: treeRealtime.onlinePersonIds,
                              editingPersonIds: treeRealtime.editingPersonIds,
                              searchPersonId: treeSearch.highlightedPersonId,
                              selfPersonId,
                              validationErrors,
                            }}
                            onPointerDown={(event) => handleCardPointerDown(event, person)}
                            onResizePointerDown={(event) => beginCardResize(event, person)}
                            onEdit={() => openPersonEditor(person)}
                            onDelete={() => handleDeletePersonByCard(person)}
                            onQuickCreate={() => openQuickCreateDialog(person)}
                            onToggleCollapse={treeViewMode.toggleCollapse}
                            onToggleDescendants={treeViewMode.toggleDescendantBranch}
                            onToggleAncestors={treeViewMode.toggleAncestorBranch}
                          />
                        );
                      })}
                    </div>
                  </TransformComponent>
                )}
              </div>
              <TreeZoomControls
                scale={currentScale}
                compact={isTreeMobile}
                onZoomIn={() => zoomIn(0.16, 180)}
                onZoomOut={() => zoomOut(0.16, 180)}
                onFit={() => fitTreeToScreen(260)}
                fullscreen={treeFullscreen}
                onToggleFullscreen={toggleTreeFullscreen}
              />
              {isTreeMobile ? (
                <TreeMobileControls
                  speedDialActions={mobileSpeedDialActions}
                  search={treeSearchProps}
                  rootSelector={rootSelectorProps}
                  displayMode={treeDisplayMode}
                  onDisplayModeChange={setTreeDisplayMode}
                  toolGroups={toolbarToolGroups}
                  styleControls={treeStyleControls}
                />
              ) : null}
            </div>
          </>
        )}
      </TransformWrapper>

      {exportDialogOpen && (
        <div className="fte-modalOverlay" role="presentation" onMouseDown={() => !saving && setExportDialogOpen(false)}>
          <div className="fte-modal fte-exportModal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="fte-modalHeader">
              <div>
                <span>{t("tree.export.eyebrow")}</span>
                <h3>{t("tree.export.title")}</h3>
              </div>
              <button
                type="button"
                className="fte-iconButton"
                onClick={() => setExportDialogOpen(false)}
                disabled={saving}
                title={t("common.close")}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="fte-exportGrid">
              <section>
                <h4>{t("tree.export.mode")}</h4>
                {[
                  { value: TREE_EXPORT_MODE.OVERVIEW, label: t("tree.toolbar.overview") },
                  { value: TREE_EXPORT_MODE.DETAIL, label: t("tree.toolbar.detail") },
                ].map((item) => (
                  <label key={item.value} className="fte-radioRow">
                    <input
                      type="radio"
                      name="exportMode"
                      value={item.value}
                      checked={(exportOptions.mode || TREE_EXPORT_MODE.DETAIL) === item.value}
                      disabled={saving}
                      onChange={() => updateExportOptions({ mode: item.value })}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </section>

              <section>
                <h4>{t("tree.export.format")}</h4>
                <div className="fte-segmented">
                  {[TREE_EXPORT_FORMAT.PNG, TREE_EXPORT_FORMAT.SVG].map((format) => (
                    <button
                      key={format}
                      type="button"
                      className={exportOptions.format === format ? "is-active" : ""}
                      onClick={() => updateExportOptions({ format })}
                      disabled={saving}
                    >
                      {format.toUpperCase()}
                    </button>
                  ))}
                </div>
                <button type="button" className="fte-pdfStub" disabled>
                  {t("tree.export.pdfSoon")}
                </button>
              </section>

              <section>
                <h4>{t("tree.export.quality")}</h4>
                <div className="fte-segmented">
                  {[1, 2, 3, 4].map((quality) => (
                    <button
                      key={quality}
                      type="button"
                      className={Number(exportOptions.quality) === quality ? "is-active" : ""}
                      onClick={() => updateExportOptions({ quality })}
                      disabled={saving || exportOptions.format === TREE_EXPORT_FORMAT.SVG}
                    >
                      {quality}x
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h4>{t("tree.export.options")}</h4>
                <label className="fte-checkRow">
                  <input
                    type="checkbox"
                    checked={exportOptions.includeBackground}
                    onChange={(event) => updateExportOptions({ includeBackground: event.target.checked })}
                    disabled={saving}
                  />
                  <span>{t("tree.export.background")}</span>
                </label>
                <label className="fte-checkRow">
                  <input
                    type="checkbox"
                    checked={exportOptions.includeTitle}
                    onChange={(event) => updateExportOptions({ includeTitle: event.target.checked })}
                    disabled={saving}
                  />
                  <span>{t("tree.export.includeTitle")}</span>
                </label>
                <label className="fte-checkRow" title={t("tree.export.frameHint")}>
                  <input
                    type="checkbox"
                    checked={Boolean(exportOptions.includeFrame)}
                    onChange={(event) => updateExportOptions({ includeFrame: event.target.checked })}
                    disabled={saving}
                  />
                  <span>{t("tree.export.frame")}</span>
                </label>
              </section>

              <section className="fte2 fte2-exportAppearance" data-tree-theme={treeStyle.theme}>
                <h4>{t("tree.export.appearance")}</h4>
                <TreeStyleControls treeStyle={treeStyle} onChange={updateTreeStyle} />
              </section>
            </div>

            <div className="fte-modalFooter">
              <button type="button" className="fte-ghostButton" onClick={() => setExportDialogOpen(false)} disabled={saving}>
                {t("common.cancel")}
              </button>
              <button type="button" className="fte-primaryButton" onClick={() => handleExport(exportOptions)} disabled={saving}>
                <span className="material-symbols-outlined">{saving ? "progress_activity" : "download"}</span>
                {saving ? t("tree.export.exporting") : t("tree.export.submit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {coupleActionPerson ? (
        <div className="fte-modalOverlay" role="presentation" onMouseDown={() => setCouplePersonAction(null)}>
          <div
            className="fte-modal fte-personActionModal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="fte-modalHeader">
              <div>
                <span>Chọn thao tác</span>
                <h3>{fullName(coupleActionPerson, t("tree.card.fallbackName"))}</h3>
              </div>
              <button type="button" className="fte-iconButton" onClick={() => setCouplePersonAction(null)} title={t("common.close")}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="fte-personActionChoices">
              <button type="button" className="fte-personActionChoice" disabled={!canEditAll} onClick={() => openCreateDialogForPerson(coupleActionPerson, "spouse")}>
                <span className="material-symbols-outlined">favorite</span>
                <strong>Tạo thêm vợ/chồng</strong>
                <small>Tạo card mới và liên kết quan hệ hôn phối với người này.</small>
              </button>
              <button type="button" className="fte-personActionChoice" disabled={!canEditAll} onClick={() => openCreateDialogForPerson(coupleActionPerson, "child")}>
                <span className="material-symbols-outlined">person_add</span>
                <strong>Tạo thêm con</strong>
                <small>Tạo hồ sơ con mới và nối vào gia đình hiện tại nếu có.</small>
              </button>
              <button type="button" className="fte-personActionChoice" onClick={() => openPersonEditor(coupleActionPerson)}>
                <span className="material-symbols-outlined">badge</span>
                <strong>Thông tin</strong>
                <small>Đổi thông tin cá nhân hoặc chỉ định thêm vợ/con/cha/mẹ đã có.</small>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedType === "couple" && selectedCoupleNode ? (
        <div className="fte-inspectorOverlay" role="presentation" onMouseDown={() => setSelectedCoupleId(null)}>
          <aside className="fte-inspector fte-coupleInspector" role="dialog" aria-modal="false" onMouseDown={(event) => event.stopPropagation()}>
            <div className="fte-inspectorHeader">
              <div>
                <span>{t("tree.couple.eyebrow")}</span>
                <h3>{fullName(selectedCoupleNode.husband, t("tree.card.fallbackName"))}</h3>
                <p>{fullName(selectedCoupleNode.wife, t("tree.card.fallbackName"))}</p>
              </div>
              <button
                type="button"
                className="fte-iconButton"
                onClick={() => setSelectedCoupleId(null)}
                title={t("common.close")}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="fte-coupleInspectorChildren">
              <strong>{t("tree.couple.children")}</strong>
              {selectedCoupleNode.children.length ? (
                <div>
                  {selectedCoupleNode.children.map((child) => (
                    <button key={child.id} type="button" onClick={() => focusPerson(child.id, { scale: 1.1 })}>
                      {fullName(child, t("tree.card.fallbackName"))}
                    </button>
                  ))}
                </div>
              ) : (
                <p>{t("tree.couple.noChildren")}</p>
              )}
            </div>
            <div className="fte-inspectorActions">
              <button type="button" onClick={() => openPersonEditor(selectedCoupleNode.husband)}>
                <span className="material-symbols-outlined">man</span>
                {t("tree.couple.editHusband")}
              </button>
              <button type="button" onClick={() => openPersonEditor(selectedCoupleNode.wife)}>
                <span className="material-symbols-outlined">woman</span>
                {t("tree.couple.editWife")}
              </button>
              <button
                type="button"
                disabled={!canEditAll}
                onClick={() => {
                  setDialog({
                    relation: "child",
                    sourcePersonId: selectedCoupleNode.husband.id,
                    form: blankCreateForm("child", selectedCoupleNode.husband, selectedCoupleNode.wife),
                  });
                  setSelectedCoupleId(null);
                }}
              >
                <span className="material-symbols-outlined">person_add</span>
                {t("tree.couple.addChild")}
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {genealogyAiOpen && (
        <div className="fte-modalOverlay" role="presentation" onMouseDown={() => !genealogyAiLoading && !genealogyAiSaving && setGenealogyAiOpen(false)}>
          <div className="fte-modal fte-aiModal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="fte-modalHeader">
              <div>
                <span>{t("tree.genealogyAi.eyebrow")}</span>
                <h3>{t("tree.genealogyAi.title")}</h3>
              </div>

              <button
                type="button"
                className="fte-iconButton"
                onClick={() => setGenealogyAiOpen(false)}
                disabled={genealogyAiLoading || genealogyAiSaving}
                title={t("common.close")}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="fte-aiComposer">
              <label className="fte-aiPromptField">
                <span>{t("tree.genealogyAi.promptLabel")}</span>
                <div className="fte-aiVoiceRow">
                  <div className="fte-aiVoiceControls">
                    <button
                      type="button"
                      className={`fte-browserVoiceButton ${genealogyVoiceListening ? "is-listening" : ""}`}
                      onClick={toggleGenealogyAiVoiceInput}
                      disabled={genealogyAiLoading || genealogyAiSaving}
                      title={genealogyVoiceListening ? t("common.stopVoice") : t("common.startVoice")}
                      aria-label={genealogyVoiceListening ? t("common.stopVoice") : t("common.startVoice")}
                    >
                      <span className="material-symbols-outlined">{genealogyVoiceListening ? "mic_off" : "mic"}</span>
                    </button>
                    <VoiceRecorder
                      disabled={genealogyAiLoading || genealogyAiSaving}
                      maxSeconds={180}
                      onTranscript={appendGenealogyAiTranscript}
                    />
                  </div>
                  <small>{t("tree.genealogyAi.voiceHelp")}</small>
                </div>
                <textarea
                  value={genealogyAiPrompt}
                  onChange={(event) => setGenealogyAiPrompt(event.target.value)}
                  placeholder={t("tree.genealogyAi.promptPlaceholder")}
                  disabled={genealogyAiLoading || genealogyAiSaving}
                  rows={6}
                />
              </label>

              {genealogyAiError ? (
                <div className="fte-aiError" role="alert">
                  <span className="material-symbols-outlined">error</span>
                  <span>{genealogyAiError}</span>
                </div>
              ) : null}

              <div className="fte-aiActions">
                <span>{t("tree.genealogyAi.draftNotice")}</span>
                <button
                  type="button"
                  className="fte-primaryButton"
                  onClick={submitGenealogyAiExtract}
                  disabled={genealogyAiLoading || genealogyAiSaving}
                >
                  <span className="material-symbols-outlined">{genealogyAiLoading ? "progress_activity" : "auto_awesome"}</span>
                  {genealogyAiLoading ? t("tree.genealogyAi.extracting") : t("tree.genealogyAi.extract")}
                </button>
              </div>
            </div>

            {genealogyAiResult ? (
              <div className="fte-aiResult">
                <div className="fte-aiSummary">
                  <div>
                    <strong>{genealogyAiResult.summary?.total_members_detected ?? genealogyAiResult.members.length}</strong>
                    <span>{t("tree.genealogyAi.members")}</span>
                  </div>
                  <div>
                    <strong>{genealogyAiResult.summary?.total_relationships_detected ?? genealogyAiResult.relationships.length}</strong>
                    <span>{t("tree.genealogyAi.relationships")}</span>
                  </div>
                  <div>
                    <strong>{genealogyAiResult.summary?.needs_human_review ? t("tree.genealogyAi.yes") : t("tree.genealogyAi.no")}</strong>
                    <span>{t("tree.genealogyAi.needsReview")}</span>
                  </div>
                </div>

                <div className="fte-aiResultGrid">
                  <section className="fte-aiDraftSection">
                    <h4>{t("tree.genealogyAi.members")}</h4>
                    {genealogyAiResult.members.length ? (
                      <div className="fte-aiDraftList">
                        {genealogyAiResult.members.map((member) => (
                          <div className="fte-aiDraftItem" key={member.temporary_id}>
                            <strong>{member.full_name || t("tree.genealogyAi.unknownName")}</strong>
                            <span>
                              {member.temporary_id}
                              {member.gender ? ` · ${member.gender}` : ""}
                              {member.birth_year ? ` · ${member.birth_year}` : ""}
                              {member.death_year ? ` - ${member.death_year}` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p>{t("tree.genealogyAi.emptyMembers")}</p>
                    )}
                  </section>

                  <section className="fte-aiDraftSection">
                    <h4>{t("tree.genealogyAi.relationships")}</h4>
                    {genealogyAiResult.relationships.length ? (
                      <div className="fte-aiDraftList">
                        {genealogyAiResult.relationships.map((relation, index) => (
                          <div className="fte-aiDraftItem" key={`${relation.type}-${index}`}>
                            <strong>{aiRelationshipTypeLabel(relation.type, t)}</strong>
                            <span>
                              {relation.type === "parent_child"
                                ? `${relation.parent || "?"} -> ${relation.child || "?"}`
                                : `${relation.from || "?"} -> ${relation.to || "?"}`}
                            </span>
                            {relation.evidence ? <small>{relation.evidence}</small> : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p>{t("tree.genealogyAi.emptyRelationships")}</p>
                    )}
                  </section>
                </div>

                <div className="fte-aiEditableGrid">
                  <section className="fte-aiDraftSection">
                    <h4>{t("tree.genealogyAi.editMembers")}</h4>
                    {genealogyAiDraftMembers.length ? (
                      <div className="fte-aiDraftList">
                        {genealogyAiDraftMembers.map((member) => (
                          <div className="fte-aiDraftItem" key={`edit-${member.temporary_id}`}>
                            <div className="fte-aiDraftItemHead">
                              <strong>{member.temporary_id}</strong>
                              <span>
                                {genealogyAiExistingMatches.has(member.temporary_id)
                                  ? t("tree.genealogyAi.existingMatched")
                                  : `${t("tree.genealogyAi.confidence")}: ${member.confidence || "?"}`}
                              </span>
                            </div>
                            <label>
                              {t("tree.genealogyAi.fullName")}
                              <input value={member.full_name} onChange={(event) => updateGenealogyAiDraftMember(member.temporary_id, { full_name: event.target.value })} disabled={genealogyAiSaving} />
                            </label>
                            {(existingPeopleByAiName.get(normalizeAiNameKey(member.full_name)) || []).length ? (
                              <label>
                                {t("tree.genealogyAi.existingPerson")}
                                <select
                                  value={member.existing_person_id}
                                  onChange={(event) => updateGenealogyAiDraftMember(member.temporary_id, { existing_person_id: event.target.value })}
                                  disabled={genealogyAiSaving}
                                >
                                  <option value="">{t("tree.genealogyAi.createNewPerson")}</option>
                                  {(existingPeopleByAiName.get(normalizeAiNameKey(member.full_name)) || []).map((person) => (
                                    <option key={person.id} value={person.id}>
                                      {existingPersonOptionLabel(person, t)}
                                    </option>
                                  ))}
                                </select>
                                {(existingPeopleByAiName.get(normalizeAiNameKey(member.full_name)) || []).length > 1 && !member.existing_person_id ? (
                                  <small>{t("tree.genealogyAi.selectExistingHint")}</small>
                                ) : null}
                              </label>
                            ) : null}
                            <div className="fte-aiDraftFields">
                              <label>
                                {t("tree.genealogyAi.gender")}
                                <select value={member.gender} onChange={(event) => updateGenealogyAiDraftMember(member.temporary_id, { gender: event.target.value })} disabled={genealogyAiSaving}>
                                  <option value="">{t("tree.genealogyAi.unknown")}</option>
                                  <option value="male">{t("tree.genealogyAi.male")}</option>
                                  <option value="female">{t("tree.genealogyAi.female")}</option>
                                </select>
                              </label>
                              <label>
                                {t("tree.genealogyAi.status")}
                                <select
                                  value={member.is_living || "0"}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    updateGenealogyAiDraftMember(member.temporary_id, {
                                      is_living: value,
                                      ...(value === "1" ? { death_year: "", death_date: "" } : { account_email: "", account_password: "" }),
                                    });
                                  }}
                                  disabled={genealogyAiSaving || genealogyAiExistingMatches.has(member.temporary_id)}
                                >
                                  <option value="1">{t("tree.inspector.fields.statusOptions.living")}</option>
                                  <option value="0">{t("tree.inspector.fields.statusOptions.deceased")}</option>
                                </select>
                              </label>
                            </div>
                            <div className="fte-aiDraftFields">
                              <label>
                                {t("tree.genealogyAi.birthDate")}
                                <input type="date" value={member.birth_date} onChange={(event) => updateGenealogyAiDraftMember(member.temporary_id, { birth_date: event.target.value })} disabled={genealogyAiSaving} />
                              </label>
                              <label>
                                {t("tree.genealogyAi.deathDate")}
                                <input type="date" value={member.death_date} onChange={(event) => updateGenealogyAiDraftMember(member.temporary_id, { death_date: event.target.value })} disabled={genealogyAiSaving || member.is_living === "1"} />
                              </label>
                            </div>
                            {member.is_living === "1" && !genealogyAiExistingMatches.has(member.temporary_id) ? (
                              <div className="fte-aiAccountFields">
                                <label>
                                  {t("tree.genealogyAi.accountEmail")}
                                  <input
                                    type="email"
                                    value={member.account_email || ""}
                                    onChange={(event) => updateGenealogyAiDraftMember(member.temporary_id, { account_email: event.target.value })}
                                    disabled={genealogyAiSaving}
                                  />
                                </label>
                                <label>
                                  {t("tree.genealogyAi.accountPassword")}
                                  <input
                                    type="password"
                                    value={member.account_password || ""}
                                    onChange={(event) => updateGenealogyAiDraftMember(member.temporary_id, { account_password: event.target.value })}
                                    disabled={genealogyAiSaving}
                                    minLength={6}
                                  />
                                </label>
                                <small>{t("tree.genealogyAi.accountCreateHint")}</small>
                              </div>
                            ) : null}
                            <label>
                              {t("tree.genealogyAi.notes")}
                              <textarea value={member.notes} onChange={(event) => updateGenealogyAiDraftMember(member.temporary_id, { notes: event.target.value })} disabled={genealogyAiSaving} rows={2} />
                            </label>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p>{t("tree.genealogyAi.emptyMembers")}</p>
                    )}
                  </section>

                  <section className="fte-aiDraftSection">
                    <h4>{t("tree.genealogyAi.editRelationships")}</h4>
                    {genealogyAiDraftRelationships.length ? (
                      <div className="fte-aiDraftList">
                        {genealogyAiDraftRelationships.map((relation) => (
                          <div className="fte-aiDraftItem" key={`edit-${relation.draft_id}`}>
                            <div className="fte-aiDraftItemHead">
                              <strong>{relation.draft_id}</strong>
                              <button type="button" className="fte-aiSmallDanger" onClick={() => removeGenealogyAiDraftRelationship(relation.draft_id)} disabled={genealogyAiSaving} title={t("common.delete")}>
                                <span className="material-symbols-outlined">delete</span>
                              </button>
                            </div>
                            <label>
                              {t("tree.genealogyAi.relationshipType")}
                              <select value={relation.type} onChange={(event) => updateGenealogyAiDraftRelationship(relation.draft_id, { type: event.target.value })} disabled={genealogyAiSaving}>
                                {AI_RELATION_TYPE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {t(option.labelKey)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {relation.type === "parent_child" ? (
                              <>
                                <div className="fte-aiDraftFields">
                                  <label>
                                    {t("tree.genealogyAi.parent")}
                                    <select value={relation.parent} onChange={(event) => updateGenealogyAiDraftRelationship(relation.draft_id, { parent: event.target.value })} disabled={genealogyAiSaving}>
                                      <option value="">?</option>
                                      {genealogyAiDraftMembers.map((member) => <option key={member.temporary_id} value={member.temporary_id}>{member.temporary_id} - {member.full_name || t("tree.genealogyAi.unknownName")}</option>)}
                                    </select>
                                  </label>
                                  <label>
                                    {t("tree.genealogyAi.child")}
                                    <select value={relation.child} onChange={(event) => updateGenealogyAiDraftRelationship(relation.draft_id, { child: event.target.value })} disabled={genealogyAiSaving}>
                                      <option value="">?</option>
                                      {genealogyAiDraftMembers.map((member) => <option key={member.temporary_id} value={member.temporary_id}>{member.temporary_id} - {member.full_name || t("tree.genealogyAi.unknownName")}</option>)}
                                    </select>
                                  </label>
                                </div>
                                <label>
                                  {t("tree.genealogyAi.parentRole")}
                                  <select value={relation.parent_role} onChange={(event) => updateGenealogyAiDraftRelationship(relation.draft_id, { parent_role: event.target.value })} disabled={genealogyAiSaving}>
                                    <option value="father">{t("tree.genealogyAi.father")}</option>
                                    <option value="mother">{t("tree.genealogyAi.mother")}</option>
                                  </select>
                                </label>
                              </>
                            ) : (
                              <div className="fte-aiDraftFields">
                                <label>
                                  {t("tree.genealogyAi.from")}
                                  <select value={relation.from} onChange={(event) => updateGenealogyAiDraftRelationship(relation.draft_id, { from: event.target.value })} disabled={genealogyAiSaving}>
                                    <option value="">?</option>
                                    {genealogyAiDraftMembers.map((member) => <option key={member.temporary_id} value={member.temporary_id}>{member.temporary_id} - {member.full_name || t("tree.genealogyAi.unknownName")}</option>)}
                                  </select>
                                </label>
                                <label>
                                  {t("tree.genealogyAi.to")}
                                  <select value={relation.to} onChange={(event) => updateGenealogyAiDraftRelationship(relation.draft_id, { to: event.target.value })} disabled={genealogyAiSaving}>
                                    <option value="">?</option>
                                    {genealogyAiDraftMembers.map((member) => <option key={member.temporary_id} value={member.temporary_id}>{member.temporary_id} - {member.full_name || t("tree.genealogyAi.unknownName")}</option>)}
                                  </select>
                                </label>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p>{t("tree.genealogyAi.emptyRelationships")}</p>
                    )}
                  </section>
                </div>

                {genealogyAiResult.uncertain_items.length || genealogyAiResult.warnings.length ? (
                  <div className="fte-aiReviewGrid">
                    <section className="fte-aiDraftSection">
                      <h4>{t("tree.genealogyAi.uncertain")}</h4>
                      {genealogyAiResult.uncertain_items.length ? (
                        <div className="fte-aiDraftList">
                          {genealogyAiResult.uncertain_items.map((item, index) => (
                            <div className="fte-aiDraftItem" key={`uncertain-${index}`}>
                              <strong>{item.reference_id || item.item_type || t("tree.genealogyAi.uncertain")}</strong>
                              <span>{item.reason || item.field || t("tree.genealogyAi.needsReview")}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p>{t("tree.genealogyAi.emptyUncertain")}</p>
                      )}
                    </section>

                    <section className="fte-aiDraftSection">
                      <h4>{t("tree.genealogyAi.warnings")}</h4>
                      {genealogyAiResult.warnings.length ? (
                        <div className="fte-aiDraftList">
                          {genealogyAiResult.warnings.map((warning, index) => (
                            <div className="fte-aiDraftItem is-warning" key={`warning-${index}`}>
                              <strong>{warning.warning_type || t("tree.genealogyAi.warning")}</strong>
                              <span>{warning.message || t("tree.genealogyAi.needsReview")}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p>{t("tree.genealogyAi.emptyWarnings")}</p>
                      )}
                    </section>
                  </div>
                ) : null}
                <div className="fte-aiSaveBar">
                  <span>{t("tree.genealogyAi.saveNotice")}</span>
                  <button type="button" className="fte-primaryButton" onClick={saveGenealogyAiDraftToTree} disabled={genealogyAiSaving || genealogyAiLoading}>
                    <span className="material-symbols-outlined">{genealogyAiSaving ? "progress_activity" : "save"}</span>
                    {genealogyAiSaving ? t("tree.genealogyAi.saving") : t("tree.genealogyAi.saveToTree")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <PersonInspector
        person={selectedPerson}
        spouse={selectedSpouse}
        saving={saving}
        canEdit={selectedCanEdit}
        canEditRole={canEditAll && selectedCanEdit}
        canEditRelations={canEditAll && selectedCanEdit}
        canDelete={canEditAll && selectedCanEdit}
        notice={selectedNotice}
        onClose={() => {
          if (selectedPerson && selectedCanEdit) treeRealtime.stopEditing(selectedPerson.id);
          setSelectedId(null);
        }}
        onSave={handleSavePerson}
        onDelete={handleDeletePerson}
        onCreateRelation={openCreateDialog}
      />

      <RelationSelectDialog
        relation={relationDialog?.relation}
        selectedPerson={selectedPerson}
        people={people}
        families={canonicalTree.families}
        childRows={canonicalTree.childRows}
        value={relationDialog?.personId}
        saving={dialogSaving}
        relationOptions={relationDialog?.options || {}}
        onRelationOptionsChange={(options) => setRelationDialog((current) => (current ? { ...current, options } : current))}
        requestPreview={requestRelationPreview}
        onChange={(personId) => setRelationDialog((current) => (current ? { ...current, personId } : current))}
        onCancel={() => !dialogSaving && setRelationDialog(null)}
        onSubmit={submitRelationDialog}
        onUnlink={unlinkRelationDialog}
        onPickOnTree={() => {
          if (!selectedPerson) return;
          const relation = relationDialog?.relation;
          setTreeRelationPicker({ relation, sourcePersonId: selectedPerson.id, options: relationDialog?.options });
          setRelationDialog(null);
          setSelectedId(null);
          setStatus("");
        }}
      />
      
      <QuickCreateRelationDialog
        sourcePerson={quickCreateSourcePerson}
        onChoose={openCreateDialogFromQuickRelation}
        onCancel={() => !dialogSaving && setQuickCreateDialog(null)}
      />

        <CreatePersonDialog
          relation={dialog?.relation}
            form={dialog?.form}
            selectedPerson={dialogSourcePerson}
            saving={dialogSaving}
            families={canonicalTree.families}
            people={people}
            relationOptions={dialog?.relationOptions || {}}
            onRelationOptionsChange={(relationOptions) => setDialog((current) => (current ? { ...current, relationOptions } : current))}
            onChange={(form) => setDialog((current) => (current ? { ...current, form } : current))}
            onCancel={() => !dialogSaving && setDialog(null)}
            onSubmit={submitCreateDialog}
          />
        {archiveDialogOpen && (
          <ArchivedMembersDialog
            people={people}
            onClose={() => setArchiveDialogOpen(false)}
            onReload={async () => {
              await onReload?.();
            }}
          />
        )}
    </section>
  );

  return treeFullscreen ? createPortal(treeEditorShell, document.body) : treeEditorShell;
}






//thêm con cho ĐINH VIẾT HOÀI TÊN LÀ ĐINH THỊ TUYẾT,ĐINH THỊ NGUYỆT,ĐINH VIẾT VANG,ĐINH THỊ HOA,ĐINH THỊ HÒE VÀ ĐINH VIẾT KHANG.THÊM CON CHO ĐINH VIẾT THANH TÊN LÀ ĐINH THỊ XUÂN, ĐINH THỊ HUÊ,ĐINH THỊ THẮM,ĐINH VIẾT BẢNG, ĐINH VIẾT ĐẠI , ĐINH VIẾT ĐỒNG, ĐINH VIẾT TÂM.THÊM CON CHO ĐINH VIẾT TÂM  TÊN LÀ ĐINH VIẾT TIẾN VÀ ĐINH THỊ CHÂU ANH. THÊM CON CHO ĐINH VIẾT BẢNG TÊN LÀ ĐINH THỊ LỢI, ĐINH THỊ YẾN VÀ ĐINH THỊ PHƯƠNG. THÊM CON CHO ĐINH THỊ XUÂN TÊN LÀ NGUYỄN NGỌC BA, NGUYỄN NGỌC BÌNH VÀ NGUYỄN NGỌC HAI. THÊM CON CHO ĐINH THỊ HUÊ TÊN LÀ NGUYỄN THỊ NGÂN , NGUYỄN VĂN NGỰ VÀ NGUYỄN VĂN TUẤN. THÊM CON CHO ĐINH THỊ THẮM TÊN LÀ PHAN THỊ ANH , PHAN THỊ NGA, PHAN THỊ DUNG VÀ PHAN THỊ SƯƠNG. THÊM CON CHO ĐINH VIẾT ĐẠI TÊN LÀ ĐINH VIẾT TUẤN VÀ ĐINH VIẾT CƯỜNG.
