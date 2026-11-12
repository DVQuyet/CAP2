import { TREE_CARD_CONFIG, TREE_LAYOUT_CONFIG, TREE_LINE_CONFIG } from "./treeDisplayConfig";
import { TREE_EXPORT_CONFIG } from "./treeExportConfig";

export const CARD_WIDTH = TREE_CARD_CONFIG.width;
export const CARD_HEIGHT = TREE_CARD_CONFIG.height;
export const MIN_CARD_WIDTH = TREE_CARD_CONFIG.minWidth;
export const MIN_CARD_HEIGHT = TREE_CARD_CONFIG.minHeight;
export const MAX_CARD_WIDTH = TREE_CARD_CONFIG.maxWidth;
export const MAX_CARD_HEIGHT = TREE_CARD_CONFIG.maxHeight;
export const NAME_FONT_SIZE = TREE_CARD_CONFIG.nameFontSize;
export const NAME_FONT_WEIGHT = TREE_CARD_CONFIG.nameFontWeight;
export const META_FONT_SIZE = TREE_CARD_CONFIG.metaFontSize;
export const META_FONT_WEIGHT = TREE_CARD_CONFIG.metaFontWeight;
export const GENERATION_GAP = TREE_LAYOUT_CONFIG.generationGap;
export const SIBLING_GAP = TREE_LAYOUT_CONFIG.siblingGap;
export const SPOUSE_GAP = TREE_LAYOUT_CONFIG.spouseGap;
export const BRANCH_GAP = TREE_LAYOUT_CONFIG.branchGap;
export const HORIZONTAL_GAP = SIBLING_GAP;
export const VERTICAL_GAP = GENERATION_GAP;
export const LEVEL_HEIGHT = CARD_HEIGHT + VERTICAL_GAP;
export const X_GAP = HORIZONTAL_GAP;
export const FAMILY_GAP = BRANCH_GAP;
export const Y_GAP = LEVEL_HEIGHT;
export const CANVAS_PADDING = TREE_LAYOUT_CONFIG.canvasPadding;
export const SNAP_SIZE = 20;
export const LINE_SNAP_SIZE = 5;
export const LINE_WIDTH = TREE_LINE_CONFIG.lineWidth;
export const MAIN_LINE_WIDTH = TREE_LINE_CONFIG.mainLineWidth;
export const LINE_COLOR = TREE_LINE_CONFIG.lineColor;
export const SPOUSE_LINE_COLOR = TREE_LINE_CONFIG.spouseLineColor;
export const CHILD_LINE_COLOR = TREE_LINE_CONFIG.childLineColor;
export const EXPORT_BACKGROUND = TREE_EXPORT_CONFIG.background;
export const EXPORT_MAX_CANVAS_EDGE = TREE_EXPORT_CONFIG.maxCanvasEdge;
export const EXPORT_MAX_CANVAS_PIXELS = TREE_EXPORT_CONFIG.maxCanvasPixels;
export const EXPORT_TARGET_PIXEL_RATIO = TREE_EXPORT_CONFIG.scale;
export const SOURCE_BRANCH_STEP = 10;
export const BLOOD_LINE_COLORS = [
  "#6FAF8F",
  "#6E8FBF",
  "#C98A62",
  "#8B7CB6",
];
export const TRANSPARENT_IMAGE_DATA_URL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
export const LINE_ROUTE_STORAGE_PREFIX = "family-tree-line-routes:";
export const CARD_SIZE_STORAGE_PREFIX = "family-tree-card-sizes:";
