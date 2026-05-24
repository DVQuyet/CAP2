export const TREE_DISPLAY_MODE = {
  OVERVIEW: "overview",
  DETAIL: "detail",
};

export const TREE_CARD_ORIENTATION = {
  HORIZONTAL: "horizontal",
  VERTICAL: "vertical",
};

export const WEB_CARD_WIDTH = 420;
export const WEB_CARD_HEIGHT = 96;
export const WEB_PERSON_SLOT_WIDTH = 210;
export const WEB_PERSON_SLOT_HEIGHT = 96;
export const WEB_VERTICAL_CARD_WIDTH = 260;
export const WEB_VERTICAL_CARD_HEIGHT = 170;
export const WEB_VERTICAL_PERSON_SLOT_WIDTH = 260;
export const WEB_VERTICAL_PERSON_SLOT_HEIGHT = 85;

export const COUPLE_NAME_FONT_SIZE = 15;
export const SINGLE_NAME_FONT_SIZE = 17;
export const COUPLE_META_FONT_SIZE = 11;
export const SINGLE_META_FONT_SIZE = 12;
export const NAME_FONT_WEIGHT = 800;
export const META_FONT_WEIGHT = 500;
export const WEB_LINE_WIDTH = 2.4;

export const TREE_CARD_CONFIG = {
  width: WEB_CARD_WIDTH,
  height: WEB_CARD_HEIGHT,
  minWidth: WEB_CARD_WIDTH,
  minHeight: WEB_CARD_HEIGHT,
  maxWidth: WEB_CARD_WIDTH,
  maxHeight: WEB_CARD_HEIGHT,
  nameFontSize: SINGLE_NAME_FONT_SIZE,
  nameFontWeight: NAME_FONT_WEIGHT,
  metaFontSize: SINGLE_META_FONT_SIZE,
  metaFontWeight: META_FONT_WEIGHT,
};

export const TREE_LAYOUT_CONFIG = {
  generationGap: 150,
  siblingGap: 55,
  spouseGap: 0,
  branchGap: 100,
  canvasPadding: 180,
};

export const TREE_LINE_CONFIG = {
  lineWidth: WEB_LINE_WIDTH,
  mainLineWidth: 2.8,
  lineColor: "#6f927e",
  spouseLineColor: "#6f927e",
  childLineColor: "#6f927e",
};

export const TREE_DISPLAY_CONFIGS = {
  [TREE_DISPLAY_MODE.OVERVIEW]: {
    cardWidth: WEB_CARD_WIDTH,
    cardHeight: WEB_CARD_HEIGHT,
    nameFontSize: COUPLE_NAME_FONT_SIZE,
    singleNameFontSize: SINGLE_NAME_FONT_SIZE,
    metaFontSize: COUPLE_META_FONT_SIZE,
    coupleMetaFontSize: COUPLE_META_FONT_SIZE,
    singleMetaFontSize: SINGLE_META_FONT_SIZE,
    showMeta: false,
    showAvatar: false,
  },
  [TREE_DISPLAY_MODE.DETAIL]: {
    cardWidth: WEB_CARD_WIDTH,
    cardHeight: WEB_CARD_HEIGHT,
    nameFontSize: COUPLE_NAME_FONT_SIZE,
    singleNameFontSize: SINGLE_NAME_FONT_SIZE,
    metaFontSize: COUPLE_META_FONT_SIZE,
    coupleMetaFontSize: COUPLE_META_FONT_SIZE,
    singleMetaFontSize: SINGLE_META_FONT_SIZE,
    showMeta: true,
    showAvatar: false,
  },
};

export function getTreeDisplayConfig(mode) {
  return TREE_DISPLAY_CONFIGS[mode] || TREE_DISPLAY_CONFIGS[TREE_DISPLAY_MODE.DETAIL];
}
