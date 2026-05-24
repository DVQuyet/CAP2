export const TREE_EXPORT_FORMAT = {
  PNG: "png",
  SVG: "svg",
  PDF: "pdf",
};

export const TREE_EXPORT_MODE = {
  OVERVIEW: "overview",
  DETAIL: "detail",
};

export const EXPORT_CARD_WIDTH = 560;
export const EXPORT_CARD_HEIGHT = 120;
export const EXPORT_PERSON_SLOT_WIDTH = 280;
export const EXPORT_PERSON_SLOT_HEIGHT = 120;
export const EXPORT_VERTICAL_CARD_WIDTH = 340;
export const EXPORT_VERTICAL_CARD_HEIGHT = 220;
export const EXPORT_VERTICAL_PERSON_SLOT_WIDTH = 340;
export const EXPORT_VERTICAL_PERSON_SLOT_HEIGHT = 110;

export const EXPORT_COUPLE_NAME_FONT_SIZE = 22;
export const EXPORT_SINGLE_NAME_FONT_SIZE = 25;
export const EXPORT_COUPLE_META_FONT_SIZE = 15;
export const EXPORT_SINGLE_META_FONT_SIZE = 16;
export const EXPORT_LINE_WIDTH_OVERVIEW = 3;
export const EXPORT_LINE_WIDTH_DETAIL = 3.6;

export const TREE_EXPORT_CONFIG = {
  scale: 3,
  padding: 160,
  background: "#f8f2e8",
  maxCanvasEdge: 24000,
  maxCanvasPixels: 180000000,
  fontFamily: 'Inter, Roboto, "Noto Sans", "Segoe UI", Arial, sans-serif',
};

export const TREE_EXPORT_DETAIL_CONFIG = {
  mode: TREE_EXPORT_MODE.DETAIL,
  cardWidth: EXPORT_CARD_WIDTH,
  cardHeight: EXPORT_CARD_HEIGHT,
  personSlotWidth: EXPORT_PERSON_SLOT_WIDTH,
  personSlotHeight: EXPORT_PERSON_SLOT_HEIGHT,
  coupleCardWidth: EXPORT_CARD_WIDTH,
  coupleCardHeight: EXPORT_CARD_HEIGHT,
  singleCardWidth: EXPORT_CARD_WIDTH,
  singleCardHeight: EXPORT_CARD_HEIGHT,
  nameFontSize: EXPORT_COUPLE_NAME_FONT_SIZE,
  singleNameFontSize: EXPORT_SINGLE_NAME_FONT_SIZE,
  metaFontSize: EXPORT_COUPLE_META_FONT_SIZE,
  singleMetaFontSize: EXPORT_SINGLE_META_FONT_SIZE,
  lineWidth: EXPORT_LINE_WIDTH_DETAIL,
  generationGap: 210,
  siblingGap: 80,
  branchGap: 150,
};

export const TREE_EXPORT_OVERVIEW_CONFIG = {
  mode: TREE_EXPORT_MODE.OVERVIEW,
  cardWidth: EXPORT_CARD_WIDTH,
  cardHeight: EXPORT_CARD_HEIGHT,
  personSlotWidth: EXPORT_PERSON_SLOT_WIDTH,
  personSlotHeight: EXPORT_PERSON_SLOT_HEIGHT,
  coupleCardWidth: EXPORT_CARD_WIDTH,
  coupleCardHeight: EXPORT_CARD_HEIGHT,
  singleCardWidth: EXPORT_CARD_WIDTH,
  singleCardHeight: EXPORT_CARD_HEIGHT,
  nameFontSize: EXPORT_COUPLE_NAME_FONT_SIZE,
  singleNameFontSize: EXPORT_SINGLE_NAME_FONT_SIZE,
  metaFontSize: EXPORT_COUPLE_META_FONT_SIZE,
  singleMetaFontSize: EXPORT_SINGLE_META_FONT_SIZE,
  lineWidth: EXPORT_LINE_WIDTH_OVERVIEW,
  generationGap: 170,
  siblingGap: 65,
  branchGap: 120,
};

export const DEFAULT_TREE_EXPORT_OPTIONS = {
  mode: TREE_EXPORT_MODE.DETAIL,
  format: TREE_EXPORT_FORMAT.PNG,
  quality: 3,
  includeBackground: true,
  includeTitle: true,
};
