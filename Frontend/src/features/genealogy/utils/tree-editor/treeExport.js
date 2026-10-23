import { DEFAULT_TREE_EXPORT_OPTIONS, TREE_EXPORT_FORMAT, TREE_EXPORT_MODE } from "./treeExportConfig";
import { asArray } from "./treePersonUtils";
import { buildDisplayTree, buildDisplayTreeLines } from "./treeDisplayNodes";
import { TREE_CARD_ORIENTATION, TREE_THEME, TREE_THEMES } from "./treeDisplayConfig";
import { computeContentBounds, decideRasterScale, exportFileName, normalizeExportScale } from "./treeExportMath";
import { buildTreeSvg } from "./treeExportSvg";
import { loadEmbeddedFontCss, svgToPngBlob, waitForExportFonts } from "./treeExportRaster";

export { exportFileName };

const DEFAULT_EXPORT_TREE_STYLE = {
  cardOrientation: TREE_CARD_ORIENTATION.HORIZONTAL,
  theme: TREE_THEME.TRADITIONAL,
  // null = dùng màu nền của chủ đề.
  backgroundColor: null,
  fontSize: null,
};

function normalizeHexColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback;
}

function normalizeExportTreeStyle(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const fontSize = Number(source.fontSize ?? source.font_size);
  return {
    cardOrientation: source.cardOrientation === TREE_CARD_ORIENTATION.VERTICAL
      ? TREE_CARD_ORIENTATION.VERTICAL
      : TREE_CARD_ORIENTATION.HORIZONTAL,
    theme: TREE_THEMES.includes(source.theme) ? source.theme : DEFAULT_EXPORT_TREE_STYLE.theme,
    backgroundColor: normalizeHexColor(source.backgroundColor ?? source.background_color, DEFAULT_EXPORT_TREE_STYLE.backgroundColor),
    fontSize: Number.isFinite(fontSize) ? Math.max(10, Math.min(40, fontSize)) : DEFAULT_EXPORT_TREE_STYLE.fontSize,
  };
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = fileName;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeExportOptions(options = {}) {
  const format = Object.values(TREE_EXPORT_FORMAT).includes(options.format) ? options.format : DEFAULT_TREE_EXPORT_OPTIONS.format;
  return {
    ...DEFAULT_TREE_EXPORT_OPTIONS,
    format: format === TREE_EXPORT_FORMAT.PDF ? TREE_EXPORT_FORMAT.PNG : format,
    mode: options.mode === TREE_EXPORT_MODE.OVERVIEW ? TREE_EXPORT_MODE.OVERVIEW : TREE_EXPORT_MODE.DETAIL,
    quality: normalizeExportScale(options.quality),
    treeStyle: normalizeExportTreeStyle(options.treeStyle),
  };
}

// Lấy đúng các thẻ và đường nối đang hiển thị trên màn hình (nhánh đang thu gọn sẽ không có trong danh sách).
export function prepareTreeExportPayload({ people = [], families = [], childRows = [], nodePositions = {}, options = {}, t } = {}) {
  const exportOptions = normalizeExportOptions(options);
  const providedNodes = asArray(options.displayNodes);
  const providedLines = asArray(options.displayLines);
  const directLineagePersonIds = asArray(options.directLineagePersonIds).map(Number).filter(Number.isFinite);
  let nodes;
  let lines;
  if (providedNodes.length) {
    nodes = providedNodes;
    lines = providedLines;
  } else {
    const displayTree = buildDisplayTree(asArray(people), families, childRows, {
      exportMode: true,
      exportModeName: exportOptions.mode,
      cardOrientation: exportOptions.treeStyle.cardOrientation,
      nodePositions,
      packRows: true,
    });
    nodes = displayTree.nodes;
    lines = buildDisplayTreeLines(displayTree, families, childRows, options.lineRoutes || {});
  }
  return { nodes, lines, directLineagePersonIds, exportOptions, title: t ? t("tree.title") : "Gia phả" };
}

// Dựng SVG đầy đủ: chờ font, nhúng font, đo khung bao trọn thẻ + đường nối (không bị cắt mép).
export async function renderTreeSvg({ nodes, lines, directLineagePersonIds = [], exportOptions = {}, t, onProgress }) {
  const options = normalizeExportOptions(exportOptions);
  onProgress?.("fonts", 0.1);
  await waitForExportFonts();
  const fontCss = await loadEmbeddedFontCss();
  onProgress?.("render", 0.4);
  const drawable = asArray(nodes).filter((node) => node?.type);
  const drawLines = asArray(lines).filter((line) => line?.d && line.type !== "route-control");
  const bounds = computeContentBounds(drawable, drawLines.map((line) => line.d));
  const measureCtx = document.createElement("canvas").getContext("2d");
  return buildTreeSvg({
    nodes: drawable,
    lines: drawLines,
    bounds,
    treeStyle: options.treeStyle,
    overview: options.mode === TREE_EXPORT_MODE.OVERVIEW,
    directIds: new Set(asArray(directLineagePersonIds).map(Number)),
    t,
    fontCss,
    measureCtx,
  });
}

// Trả về { blob, extension, scaleInfo }. SVG là vector; PNG rasterize từ SVG, tự giảm tỉ lệ nếu vượt giới hạn canvas.
export async function exportPreparedTree(payload) {
  const options = normalizeExportOptions(payload?.exportOptions);
  const onProgress = payload?.onProgress;
  const { svg, width, height } = await renderTreeSvg(payload);
  if (options.format === TREE_EXPORT_FORMAT.SVG) {
    onProgress?.("encode", 0.95);
    return { blob: new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), extension: "svg", scaleInfo: null };
  }
  const scaleInfo = decideRasterScale({ width, height, scale: options.quality });
  onProgress?.("encode", 0.7);
  const blob = await svgToPngBlob(svg, scaleInfo);
  return { blob, extension: "png", scaleInfo };
}
