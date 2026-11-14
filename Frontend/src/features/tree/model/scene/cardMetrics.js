// Kích thước thẻ theo kiểu thẻ (ngang/dọc) và theo nơi vẽ (màn hình hay xuất ảnh).
import { GENERATION_GAP, SIBLING_GAP } from "../config.js";
import {
  TREE_CARD_ORIENTATION,
  WEB_CARD_HEIGHT,
  WEB_CARD_WIDTH,
  WEB_PERSON_SLOT_HEIGHT,
  WEB_PERSON_SLOT_WIDTH,
  WEB_VERTICAL_CARD_HEIGHT,
  WEB_VERTICAL_CARD_WIDTH,
  WEB_VERTICAL_PERSON_SLOT_HEIGHT,
  WEB_VERTICAL_PERSON_SLOT_WIDTH,
} from "../../utils/tree-editor/treeDisplayConfig.js";
import {
  EXPORT_CARD_HEIGHT,
  EXPORT_CARD_WIDTH,
  EXPORT_PERSON_SLOT_HEIGHT,
  EXPORT_PERSON_SLOT_WIDTH,
  EXPORT_VERTICAL_CARD_HEIGHT,
  EXPORT_VERTICAL_CARD_WIDTH,
  EXPORT_VERTICAL_PERSON_SLOT_HEIGHT,
  EXPORT_VERTICAL_PERSON_SLOT_WIDTH,
  TREE_EXPORT_DETAIL_CONFIG,
  TREE_EXPORT_MODE,
  TREE_EXPORT_OVERVIEW_CONFIG,
} from "../../utils/tree-editor/treeExportConfig.js";

export const DISPLAY_NODE_TYPE = {
  SINGLE: "single",
  COUPLE: "couple",
  // Thẻ tham chiếu: người được vẽ ở vị trí chính nơi khác (con nuôi tại nhà cha mẹ đẻ, con gái lấy chồng nhánh khác...).
  REFERENCE: "reference",
};

const METRICS = {
  screen: {
    horizontal: { width: WEB_CARD_WIDTH, height: WEB_CARD_HEIGHT, personSlotWidth: WEB_PERSON_SLOT_WIDTH, personSlotHeight: WEB_PERSON_SLOT_HEIGHT },
    vertical: { width: WEB_VERTICAL_CARD_WIDTH, height: WEB_VERTICAL_CARD_HEIGHT, personSlotWidth: WEB_VERTICAL_PERSON_SLOT_WIDTH, personSlotHeight: WEB_VERTICAL_PERSON_SLOT_HEIGHT },
  },
  export: {
    horizontal: { width: EXPORT_CARD_WIDTH, height: EXPORT_CARD_HEIGHT, personSlotWidth: EXPORT_PERSON_SLOT_WIDTH, personSlotHeight: EXPORT_PERSON_SLOT_HEIGHT },
    vertical: { width: EXPORT_VERTICAL_CARD_WIDTH, height: EXPORT_VERTICAL_CARD_HEIGHT, personSlotWidth: EXPORT_VERTICAL_PERSON_SLOT_WIDTH, personSlotHeight: EXPORT_VERTICAL_PERSON_SLOT_HEIGHT },
  },
};

export function normalizeCardOrientation(value) {
  return value === TREE_CARD_ORIENTATION.VERTICAL ? TREE_CARD_ORIENTATION.VERTICAL : TREE_CARD_ORIENTATION.HORIZONTAL;
}

export const isVerticalCard = (value) => normalizeCardOrientation(value) === TREE_CARD_ORIENTATION.VERTICAL;

// Kích thước thẻ vợ chồng (hai ô) và của một ô người.
export function cardMetrics(exportMode, cardOrientation) {
  return METRICS[exportMode ? "export" : "screen"][isVerticalCard(cardOrientation) ? "vertical" : "horizontal"];
}

export function nodeSize(type, exportMode, cardOrientation) {
  const metrics = cardMetrics(exportMode, cardOrientation);
  // Thẻ một người chỉ rộng một ô (trên màn hình); thẻ vợ chồng chiếm cả hai ô.
  if (type === DISPLAY_NODE_TYPE.SINGLE && !exportMode) {
    return { width: metrics.personSlotWidth, height: isVerticalCard(cardOrientation) ? WEB_CARD_HEIGHT : metrics.height };
  }
  return { width: metrics.width, height: metrics.height };
}

// Khoảng cách khi xếp lại thẻ theo hàng (xuất ảnh dạng tổng quan / chi tiết).
export function rowSpacing(options = {}) {
  const metrics = cardMetrics(Boolean(options.exportMode), options.cardOrientation);
  if (!options.exportMode) {
    return { cardHeight: metrics.height, siblingGap: SIBLING_GAP, generationGap: GENERATION_GAP };
  }
  const mode = options.exportModeName || options.mode;
  const config = mode === TREE_EXPORT_MODE.OVERVIEW ? TREE_EXPORT_OVERVIEW_CONFIG : TREE_EXPORT_DETAIL_CONFIG;
  return {
    cardHeight: metrics.height || config.cardHeight || EXPORT_CARD_HEIGHT,
    siblingGap: config.siblingGap || SIBLING_GAP,
    generationGap: config.generationGap || GENERATION_GAP,
  };
}
