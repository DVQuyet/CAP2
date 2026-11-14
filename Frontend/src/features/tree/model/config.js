// Kích thước và khoảng cách của cây, mỗi con số một tên. Giá trị gốc nằm ở treeDisplayConfig.js.
import { TREE_CARD_CONFIG, TREE_LAYOUT_CONFIG, TREE_LINE_CONFIG } from "../utils/tree-editor/treeDisplayConfig.js";

// Ô của một người trong thuật toán sắp xếp.
export const CARD_WIDTH = TREE_CARD_CONFIG.width;
export const CARD_HEIGHT = TREE_CARD_CONFIG.height;
export const MIN_CARD_WIDTH = TREE_CARD_CONFIG.minWidth;
export const MIN_CARD_HEIGHT = TREE_CARD_CONFIG.minHeight;
export const MAX_CARD_WIDTH = TREE_CARD_CONFIG.maxWidth;
export const MAX_CARD_HEIGHT = TREE_CARD_CONFIG.maxHeight;
export const NAME_FONT_SIZE = TREE_CARD_CONFIG.nameFontSize;

export const GENERATION_GAP = TREE_LAYOUT_CONFIG.generationGap;
export const SIBLING_GAP = TREE_LAYOUT_CONFIG.siblingGap;
export const SPOUSE_GAP = TREE_LAYOUT_CONFIG.spouseGap;
export const BRANCH_GAP = TREE_LAYOUT_CONFIG.branchGap;
// Khoảng cách từ mép trên của một đời tới mép trên của đời kế tiếp.
export const LEVEL_HEIGHT = CARD_HEIGHT + GENERATION_GAP;
export const CANVAS_PADDING = TREE_LAYOUT_CONFIG.canvasPadding;

// Lưới bắt dính khi kéo thẻ và khi kéo đường nối.
export const SNAP_SIZE = 20;
export const LINE_SNAP_SIZE = 5;

export const CHILD_LINE_COLOR = TREE_LINE_CONFIG.childLineColor;

// Khoảng cách giữa các thành viên trong cụm nhiều vợ/chồng (để thấy đường nối hôn nhân).
export const UNION_MEMBER_GAP = 56;
// Khoảng hạ đường nối hôn nhân xuống dưới thẻ khi hai vợ chồng không đứng cạnh nhau.
export const UNION_CONNECTOR_DROP = 22;
export const UNION_CONNECTOR_STEP = 12;

export const LINE_ROUTE_STORAGE_PREFIX = "family-tree-line-routes:";
export const CARD_SIZE_STORAGE_PREFIX = "family-tree-card-sizes:";
