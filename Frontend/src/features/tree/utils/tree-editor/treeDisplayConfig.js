export const TREE_DISPLAY_MODE = {
  OVERVIEW: "overview",
  DETAIL: "detail",
};

export const TREE_CARD_ORIENTATION = {
  HORIZONTAL: "horizontal",
  VERTICAL: "vertical",
};

// Mỗi người chiếm một ô rộng WEB_PERSON_SLOT_WIDTH; thẻ vợ chồng gồm hai ô liền nhau.
export const WEB_PERSON_SLOT_WIDTH = 240;
export const WEB_PERSON_SLOT_HEIGHT = 100;
export const WEB_CARD_WIDTH = WEB_PERSON_SLOT_WIDTH * 2;
export const WEB_CARD_HEIGHT = WEB_PERSON_SLOT_HEIGHT;
export const WEB_VERTICAL_CARD_WIDTH = WEB_PERSON_SLOT_WIDTH;
export const WEB_VERTICAL_CARD_HEIGHT = 176;
export const WEB_VERTICAL_PERSON_SLOT_WIDTH = WEB_PERSON_SLOT_WIDTH;
export const WEB_VERTICAL_PERSON_SLOT_HEIGHT = 88;

export const COUPLE_NAME_FONT_SIZE = 15;
export const SINGLE_NAME_FONT_SIZE = 17;
export const COUPLE_META_FONT_SIZE = 11;
export const SINGLE_META_FONT_SIZE = 12;
export const NAME_FONT_WEIGHT = 800;
export const META_FONT_WEIGHT = 500;
export const WEB_LINE_WIDTH = 2.4;

// Kích thước ô của một người, dùng cho thuật toán tự sắp xếp.
export const TREE_CARD_CONFIG = {
  width: WEB_PERSON_SLOT_WIDTH,
  height: WEB_PERSON_SLOT_HEIGHT,
  minWidth: WEB_PERSON_SLOT_WIDTH,
  minHeight: WEB_PERSON_SLOT_HEIGHT,
  maxWidth: WEB_PERSON_SLOT_WIDTH,
  maxHeight: WEB_PERSON_SLOT_HEIGHT,
  nameFontSize: SINGLE_NAME_FONT_SIZE,
  nameFontWeight: NAME_FONT_WEIGHT,
  metaFontSize: SINGLE_META_FONT_SIZE,
  metaFontWeight: META_FONT_WEIGHT,
};

export const TREE_LAYOUT_CONFIG = {
  generationGap: 120,
  siblingGap: 40,
  spouseGap: 0,
  branchGap: 80,
  canvasPadding: 140,
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

// Chủ đề màu của cây; màu cụ thể nằm trong FamilyTreeEditor.theme.css.
export const TREE_THEME = {
  TRADITIONAL: "traditional",
  MODERN: "modern",
  DARK: "dark",
};
export const TREE_THEMES = [TREE_THEME.TRADITIONAL, TREE_THEME.MODERN, TREE_THEME.DARK];
// Màu nền mặc định của từng chủ đề (dùng khi xuất ảnh và khi chưa chọn màu nền riêng).
export const TREE_THEME_BACKGROUNDS = {
  [TREE_THEME.TRADITIONAL]: "#f6efe2",
  [TREE_THEME.MODERN]: "#f5f7fa",
  [TREE_THEME.DARK]: "#171a21",
};
