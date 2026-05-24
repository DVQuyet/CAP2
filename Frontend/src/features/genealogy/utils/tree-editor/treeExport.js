import { CARD_HEIGHT, CARD_WIDTH, CHILD_LINE_COLOR, LINE_COLOR, MAIN_LINE_WIDTH, SPOUSE_LINE_COLOR } from "./treeConstants";
import { DEFAULT_TREE_EXPORT_OPTIONS, TREE_EXPORT_CONFIG, TREE_EXPORT_DETAIL_CONFIG, TREE_EXPORT_FORMAT, TREE_EXPORT_MODE, TREE_EXPORT_OVERVIEW_CONFIG } from "./treeExportConfig";
import { asArray, formatDisplayDate, fullName, toInt } from "./treePersonUtils";
import { getCardSize } from "./treeStorage";
import { numbersFromPath } from "./treeLines";
import { DISPLAY_NODE_TYPE, buildDisplayTree, buildDisplayTreeLines } from "./treeDisplayNodes";
import { TREE_CARD_ORIENTATION } from "./treeDisplayConfig";

const EXPORT_FONT_FAMILY = TREE_EXPORT_CONFIG.fontFamily;
const DEFAULT_EXPORT_TREE_STYLE = {
  cardOrientation: TREE_CARD_ORIENTATION.HORIZONTAL,
  backgroundColor: TREE_EXPORT_CONFIG.background,
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
    backgroundColor: normalizeHexColor(source.backgroundColor ?? source.background_color, DEFAULT_EXPORT_TREE_STYLE.backgroundColor),
    fontSize: Number.isFinite(fontSize) ? Math.max(10, Math.min(40, fontSize)) : DEFAULT_EXPORT_TREE_STYLE.fontSize,
  };
}

function withTreeStyleFont(config = TREE_EXPORT_DETAIL_CONFIG, treeStyle = DEFAULT_EXPORT_TREE_STYLE) {
  const fontSize = Number(treeStyle.fontSize);
  if (!Number.isFinite(fontSize)) return config;
  const metaFontSize = Math.max(9, Math.round(fontSize * 0.7));
  return {
    ...config,
    nameFontSize: fontSize,
    singleNameFontSize: fontSize,
    metaFontSize,
    singleMetaFontSize: metaFontSize,
  };
}

function getExportCardSize(cardSizes = {}, personId, config = TREE_EXPORT_DETAIL_CONFIG) {
  const raw = cardSizes?.[Number(personId)];
  if (raw && typeof raw === "object") {
    const width = Number(raw.width);
    const height = Number(raw.height);
    return {
      width: Number.isFinite(width) && width > 0 ? width : config.cardWidth || CARD_WIDTH,
      height: Number.isFinite(height) && height > 0 ? height : config.cardHeight || CARD_HEIGHT,
    };
  }
  if (cardSizes && Object.keys(cardSizes).length) return getCardSize(cardSizes, personId);
  return {
    width: config.cardWidth || CARD_WIDTH,
    height: config.cardHeight || CARD_HEIGHT,
  };
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slug(value, fallback = "gia-pha") {
  const normalized = String(value || fallback)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return normalized || fallback;
}

function timestampName(date = new Date()) {
  const yyyy = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}${MM}${dd}-${hh}${mm}`;
}

export function exportFileName(familyName, extension = "png") {
  return `gia-pha-${slug(familyName)}-${timestampName()}.${String(extension || "png").replace(/^\./, "")}`;
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

export async function saveCanvasImage(blob, fileName) {
  const safeFileName = fileName || exportFileName("gia-pha", "png");
  downloadBlob(blob, safeFileName);
  return "downloaded";
}

export function canvasToBlob(canvas, t, type = "image/png", quality = 0.96) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error(t ? t("tree.messages.exportError") : "Export failed"));
      }, type, quality);
    } catch (error) {
      reject(error);
    }
  });
}

export function drawRoundRect(ctx, x, y, width, height, radius = 8) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function splitTextToLines(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (!current || ctx.measureText(next).width <= maxWidth) {
      current = next;
      return;
    }
    lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;

  const clipped = lines.slice(0, maxLines);
  let last = clipped[maxLines - 1];
  while (last.length > 1 && ctx.measureText(`${last}...`).width > maxWidth) {
    last = last.slice(0, -1).trim();
  }
  clipped[maxLines - 1] = `${last || clipped[maxLines - 1].slice(0, 1)}...`;
  return clipped;
}

function splitSvgText(text, maxChars = 24, maxLines = 2) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) {
      current = next;
      return;
    }
    lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  const clipped = lines.slice(0, maxLines);
  clipped[maxLines - 1] = `${clipped[maxLines - 1].slice(0, Math.max(1, maxChars - 3)).trim()}...`;
  return clipped;
}

function yearOnly(value) {
  const match = String(value || "").match(/\d{4}/);
  return match ? match[0] : "";
}

export function drawSvgPathFallback(ctx, pathText) {
  const nums = numbersFromPath(pathText);
  if (nums.length < 4) return;
  ctx.beginPath();
  ctx.moveTo(nums[0], nums[1]);
  for (let index = 2; index < nums.length; index += 2) {
    if (Number.isFinite(nums[index]) && Number.isFinite(nums[index + 1])) {
      ctx.lineTo(nums[index], nums[index + 1]);
    }
  }
  ctx.stroke();
}

function strokeTreePath(ctx, pathText) {
  try {
    ctx.stroke(new Path2D(pathText));
  } catch {
    drawSvgPathFallback(ctx, pathText);
  }
}

export function drawTreeLine(ctx, line, exportConfig = TREE_EXPORT_DETAIL_CONFIG) {
  if (!line?.d || line.type === "route-control") return;
  ctx.save();
  ctx.fillStyle = "transparent";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = line.type === "spouse" ? SPOUSE_LINE_COLOR : line.color || CHILD_LINE_COLOR || LINE_COLOR;
  ctx.globalAlpha = line.type === "spouse" ? 0.9 : line.branchLevel === 0 ? 0.96 : 0.82;
  ctx.lineWidth = line.type === "spouse" ? exportConfig.lineWidth : line.branchLevel === 0 ? Math.max(exportConfig.lineWidth, MAIN_LINE_WIDTH) : exportConfig.lineWidth;
  strokeTreePath(ctx, line.d);
  ctx.restore();
}

function drawExportCard(ctx, person, cardSizes, config, t, options = {}) {
  const size = getExportCardSize(cardSizes, person.id, config);
  const x = toInt(person.tree_x, 0);
  const y = toInt(person.tree_y, 0);
  const width = size.width;
  const height = size.height;
  const name = fullName(person, t ? t("tree.card.fallbackName") : "Thanh vien");
  const birthText = yearOnly(person.birth_date || formatDisplayDate(person.birth_date));
  const deathText = yearOnly(person.death_date || formatDisplayDate(person.death_date));
  const deceased = Number(person.is_living) === 0;
  const lifeText = birthText && deceased && deathText ? `${birthText}-${deathText}` : birthText || (deceased ? deathText : "");
  const generationText = t ? t("tree.card.generation", { count: person.generation || 1 }) : `Doi ${person.generation || 1}`;
  const metaItems = [
    generationText,
    lifeText,
    person.branch ? `Chi ${person.branch}` : "",
    Number(person.role_id) === 2 ? (t ? t("tree.card.chief") : "Truong ho") : "",
  ].filter(Boolean);
  const isFounder = Number(person.generation) === 1 || Number(person.role_id) === 1;

  ctx.save();
  ctx.shadowColor = "rgba(71, 50, 32, 0.14)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  drawRoundRect(ctx, x, y, width, height, 8);
  const grad = ctx.createLinearGradient(x, y, x, y + height);
  grad.addColorStop(0, isFounder ? "#fff7ea" : "#ffffff");
  grad.addColorStop(1, isFounder ? "#ead6bd" : "#fffaf1");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = isFounder ? "#a85f39" : "#c97b4d";
  ctx.lineWidth = isFounder ? 2.2 : 1.8;
  ctx.stroke();

  if (options.directLineagePersonIds?.has?.(Number(person.id))) {
    ctx.fillStyle = "#8b1e13";
    ctx.font = `900 ${Math.max(12, Math.round(config.metaFontSize * 1.2))}px ${EXPORT_FONT_FAMILY}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText("◎", x + width - 10, y + 8);
  }

  const textLeft = x + 18;
  const textWidth = width - 36;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#2f241b";
  const nameFontSize = config.singleNameFontSize || config.nameFontSize;
  const metaFontSize = config.singleMetaFontSize || config.metaFontSize;
  ctx.font = `800 ${nameFontSize}px ${EXPORT_FONT_FAMILY}`;
  const nameLines = splitTextToLines(ctx, name, textWidth, 2);
  const nameLineHeight = Math.round(nameFontSize * 1.18);
  const nameCenterY = metaItems.length ? y + height * 0.38 : y + height * 0.5;
  const firstNameY = nameCenterY - ((nameLines.length - 1) * nameLineHeight) / 2;
  nameLines.forEach((line, index) => {
    ctx.fillText(line, textLeft + textWidth / 2, firstNameY + index * nameLineHeight);
  });

  if (metaItems.length) {
    ctx.fillStyle = "#6f6257";
    ctx.font = `500 ${metaFontSize}px ${EXPORT_FONT_FAMILY}`;
    ctx.fillText(metaItems.join(" · "), textLeft + textWidth / 2, y + height * 0.72);
  }
  ctx.restore();
}

function drawExportNode(ctx, node, config, t, options = {}) {
  if (node.type === DISPLAY_NODE_TYPE.COUPLE) {
    drawExportCoupleCard(ctx, node, config, t, options);
    return;
  }
  drawExportCard(ctx, {
    ...node.person,
    tree_x: node.x,
    tree_y: node.y,
  }, { [Number(node.person.id)]: { width: node.width, height: node.height } }, config, t, options);
}

function drawPersonSlot(ctx, person, x, y, width, height, config, t, options = {}) {
  const name = fullName(person, t ? t("tree.card.fallbackName") : "Thanh vien");
  const birthText = yearOnly(person?.birth_date || formatDisplayDate(person?.birth_date));
  const deathText = Number(person?.is_living) === 0 ? yearOnly(person?.death_date || formatDisplayDate(person?.death_date)) : "";
  const lifeText = [birthText, deathText].filter(Boolean).join(" - ");
  const generationText = person?.generation ? (t ? t("tree.card.generation", { count: person.generation }) : `Doi ${person.generation}`) : "";
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#2f241b";
  ctx.font = `800 ${config.nameFontSize}px ${EXPORT_FONT_FAMILY}`;
  const nameLines = splitTextToLines(ctx, name, width - 28, 2);
  const lineHeight = Math.round(config.nameFontSize * 1.18);
  const firstY = y + height * 0.37 - ((nameLines.length - 1) * lineHeight) / 2;
  nameLines.forEach((line, index) => ctx.fillText(line, x + width / 2, firstY + index * lineHeight));
  ctx.fillStyle = "#6f6257";
  ctx.font = `500 ${config.metaFontSize}px ${EXPORT_FONT_FAMILY}`;
  if (lifeText) ctx.fillText(lifeText, x + width / 2, y + height * 0.66);
  if (generationText) ctx.fillText(generationText, x + width / 2, y + height * 0.82);
  if (options.directLineagePersonIds?.has?.(Number(person?.id))) {
    ctx.fillStyle = "#8b1e13";
    ctx.font = `900 ${Math.max(12, Math.round(config.metaFontSize * 1.2))}px ${EXPORT_FONT_FAMILY}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText("◎", x + width - 8, y + 7);
  }
  ctx.restore();
}

function orderedCouplePeople(node, directLineagePersonIds, vertical = false) {
  const husbandDirect = directLineagePersonIds?.has?.(Number(node?.husband?.id));
  const wifeDirect = directLineagePersonIds?.has?.(Number(node?.wife?.id));
  if (vertical && wifeDirect && !husbandDirect) return [node.wife, node.husband];
  return [node.husband, node.wife];
}

function drawExportCoupleCard(ctx, node, config, t, options = {}) {
  const x = node.x;
  const y = node.y;
  const width = node.width;
  const height = node.height;
  const isVertical = node.cardOrientation === TREE_CARD_ORIENTATION.VERTICAL;
  const halfWidth = isVertical ? width : width / 2;
  const halfHeight = isVertical ? height / 2 : height;
  ctx.save();
  ctx.shadowColor = "rgba(71, 50, 32, 0.14)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  drawRoundRect(ctx, x, y, width, height, 10);
  ctx.fillStyle = "#fffaf0";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#b9825b";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = "rgba(185, 130, 91, 0.32)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  if (isVertical) {
    ctx.moveTo(x + 12, y + height / 2);
    ctx.lineTo(x + width - 12, y + height / 2);
  } else {
    ctx.moveTo(x + width / 2, y + 12);
    ctx.lineTo(x + width / 2, y + height - 12);
  }
  ctx.stroke();
  const [firstPerson, secondPerson] = orderedCouplePeople(node, options.directLineagePersonIds, isVertical);
  drawPersonSlot(ctx, firstPerson, x, y, halfWidth, halfHeight, config, t, options);
  drawPersonSlot(ctx, secondPerson, isVertical ? x : x + halfWidth, isVertical ? y + halfHeight : y, halfWidth, halfHeight, config, t, options);
  ctx.restore();
}

function exportConfigForMode(mode) {
  return mode === TREE_EXPORT_MODE.OVERVIEW ? TREE_EXPORT_OVERVIEW_CONFIG : TREE_EXPORT_DETAIL_CONFIG;
}

function shiftPathText(pathText, dx = 0, dy = 0) {
  let index = 0;
  return String(pathText || "").replace(/-?\d+(?:\.\d+)?/g, (match) => {
    const value = Number(match);
    if (!Number.isFinite(value)) return match;
    const shifted = index % 2 === 0 ? value + dx : value + dy;
    index += 1;
    return String(Math.round(shifted * 100) / 100);
  });
}

function normalizeExportOptions(options = {}) {
  const legacyScope = options.scope;
  const mode = options.mode || (legacyScope === "full-overview" || legacyScope === TREE_EXPORT_MODE.OVERVIEW
    ? TREE_EXPORT_MODE.OVERVIEW
    : TREE_EXPORT_MODE.DETAIL);
  return {
    ...DEFAULT_TREE_EXPORT_OPTIONS,
    ...options,
    mode,
    quality: Number(options.quality) || DEFAULT_TREE_EXPORT_OPTIONS.quality,
    treeStyle: normalizeExportTreeStyle(options.treeStyle),
  };
}

export function prepareTreeExportPayload({ people = [], families = [], childRows = [], nodePositions = {}, options = {}, t } = {}) {
  const exportOptions = normalizeExportOptions(options);
  const exportConfig = withTreeStyleFont(exportConfigForMode(exportOptions.mode), exportOptions.treeStyle);
  const allPeople = asArray(people);
  const sourcePeople = allPeople;
  const providedNodes = asArray(options.displayNodes);
  const providedLines = asArray(options.displayLines);
  const lineRoutes = options.lineRoutes || {};
  const directLineagePersonIds = asArray(options.directLineagePersonIds).map(Number).filter(Number.isFinite);
  const titleOffsetY = exportOptions.includeTitle ? 110 : 0;
  const displayTree = providedNodes.length
    ? (() => {
      const exportNodes = providedNodes.map((node) => ({
        ...node,
        y: node.y + titleOffsetY,
      }));
      const nodeByPersonId = new Map();
      const nodeByFamilyId = new Map();
      exportNodes.forEach((node) => {
        asArray(node.personIds).forEach((personId) => nodeByPersonId.set(Number(personId), node));
        if (node.familyId) nodeByFamilyId.set(Number(node.familyId), node);
      });
      return { nodes: exportNodes, nodeByPersonId, nodeByFamilyId };
    })()
    : buildDisplayTree(sourcePeople, families, childRows, {
      exportMode: true,
      exportModeName: exportOptions.mode,
      cardOrientation: exportOptions.treeStyle.cardOrientation,
      nodePositions,
      packRows: true,
    });
  const exportNodes = displayTree.nodes.map((node) => ({
    ...node,
    y: providedNodes.length ? node.y : node.y + titleOffsetY,
  }));
  const nodeByPersonId = new Map();
  const nodeByFamilyId = new Map();
  exportNodes.forEach((node) => {
    node.personIds.forEach((personId) => nodeByPersonId.set(Number(personId), node));
    if (node.familyId) nodeByFamilyId.set(Number(node.familyId), node);
  });
  const exportDisplayTree = { nodes: exportNodes, nodeByPersonId, nodeByFamilyId };
  const exportLines = providedNodes.length && providedLines.length
    ? providedLines.map((line) => ({
      ...line,
      d: shiftPathText(line.d, 0, titleOffsetY),
    }))
    : buildDisplayTreeLines(exportDisplayTree, families, childRows, lineRoutes);

  return {
    people: sourcePeople,
    nodes: exportNodes,
    families,
    childRows,
    lines: exportLines,
    cardSizes: {},
    directLineagePersonIds,
    exportOptions,
    exportConfig,
    title: t ? t("tree.title") : "Gia pha",
  };
}

export function getTreeExportBounds(items, lines = [], cardSizes = {}, padding = TREE_EXPORT_CONFIG.padding) {
  if (!asArray(items).length) {
    return { x: 0, y: 0, width: 1200, height: 800 };
  }

  const xs = [];
  const ys = [];
  asArray(items).forEach((item) => {
    if (item.type) {
      xs.push(item.x, item.x + item.width);
      ys.push(item.y, item.y + item.height);
      return;
    }
    const size = getExportCardSize(cardSizes, item.id);
    const x = toInt(item.tree_x, 0);
    const y = toInt(item.tree_y, 0);
    xs.push(x, x + size.width);
    ys.push(y, y + size.height);
  });
  asArray(lines).forEach((line) => {
    numbersFromPath(line.d).forEach((value, index) => {
      if (index % 2 === 0) xs.push(value);
      else ys.push(value);
    });
  });

  const minX = Math.floor(Math.min(...xs) - padding);
  const minY = Math.floor(Math.min(...ys) - padding);
  const maxX = Math.ceil(Math.max(...xs) + padding);
  const maxY = Math.ceil(Math.max(...ys) + padding);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function getExportPixelRatio(bounds, requestedScale = TREE_EXPORT_CONFIG.scale) {
  const largestEdge = Math.max(bounds.width, bounds.height);
  const area = Math.max(1, bounds.width * bounds.height);
  if (!largestEdge) return requestedScale;

  const edgeLimitedRatio = TREE_EXPORT_CONFIG.maxCanvasEdge / largestEdge;
  const areaLimitedRatio = Math.sqrt(TREE_EXPORT_CONFIG.maxCanvasPixels / area);
  const ratio = Math.min(requestedScale, edgeLimitedRatio, areaLimitedRatio);
  return Math.max(1, Math.floor(ratio * 100) / 100);
}

function drawExportTitle(ctx, bounds, clan, t) {
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#7b5338";
  ctx.font = `800 16px ${EXPORT_FONT_FAMILY}`;
  ctx.fillText((t ? t("tree.title") : "Gia pha").toLocaleUpperCase("vi-VN"), bounds.x + 42, bounds.y + 58);
  ctx.fillStyle = "#3a2b1f";
  ctx.font = `900 34px ${EXPORT_FONT_FAMILY}`;
  ctx.fillText(String(clan?.clan_name || "Dong ho").toLocaleUpperCase("vi-VN"), bounds.x + 42, bounds.y + 96);
  ctx.restore();
}

export async function renderFamilyTreePngBlob({ people, nodes, lines, cardSizes, clan, t, exportOptions = {}, exportConfig = TREE_EXPORT_DETAIL_CONFIG, directLineagePersonIds: rawDirectLineagePersonIds = [] }) {
  const options = normalizeExportOptions(exportOptions);
  const styledExportConfig = withTreeStyleFont(exportConfig, options.treeStyle);
  const directLineagePersonIds = new Set(asArray(rawDirectLineagePersonIds).map(Number).filter(Number.isFinite));
  const drawableNodes = asArray(nodes).length ? nodes : asArray(people);
  const bounds = getTreeExportBounds(drawableNodes, lines, cardSizes, TREE_EXPORT_CONFIG.padding);
  const pixelRatio = getExportPixelRatio(bounds, options.quality || TREE_EXPORT_CONFIG.scale);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(bounds.width * pixelRatio));
  canvas.height = Math.max(1, Math.ceil(bounds.height * pixelRatio));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t ? t("tree.messages.exportError") : "Export failed");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.save();
  ctx.scale(pixelRatio, pixelRatio);
  if (options.includeBackground) {
    ctx.fillStyle = options.treeStyle.backgroundColor || TREE_EXPORT_CONFIG.background;
    ctx.fillRect(0, 0, bounds.width, bounds.height);
  } else {
    ctx.clearRect(0, 0, bounds.width, bounds.height);
  }
  ctx.translate(-bounds.x, -bounds.y);
  if (options.includeTitle) drawExportTitle(ctx, bounds, clan, t);
  asArray(lines).forEach((line) => drawTreeLine(ctx, line, styledExportConfig));
  asArray(drawableNodes).forEach((node) => (node.type ? drawExportNode(ctx, node, styledExportConfig, t, {
    overview: options.mode === TREE_EXPORT_MODE.OVERVIEW,
    directLineagePersonIds,
  }) : drawExportCard(ctx, node, cardSizes, styledExportConfig, t, {
    overview: options.mode === TREE_EXPORT_MODE.OVERVIEW,
    directLineagePersonIds,
  })));
  ctx.restore();

  return canvasToBlob(canvas, t);
}

export function renderFamilyTreeSvgString({ people, nodes, lines, cardSizes, clan, t, exportOptions = {}, exportConfig = TREE_EXPORT_DETAIL_CONFIG, directLineagePersonIds: rawDirectLineagePersonIds = [] }) {
  const options = normalizeExportOptions(exportOptions);
  const styledExportConfig = withTreeStyleFont(exportConfig, options.treeStyle);
  const directLineagePersonIds = new Set(asArray(rawDirectLineagePersonIds).map(Number).filter(Number.isFinite));
  const drawableNodes = asArray(nodes).length ? nodes : asArray(people);
  const bounds = getTreeExportBounds(drawableNodes, lines, cardSizes, TREE_EXPORT_CONFIG.padding);
  const title = escapeXml(String(clan?.clan_name || "Dong ho").toLocaleUpperCase("vi-VN"));
  const background = options.includeBackground
    ? `<rect x="0" y="0" width="${bounds.width}" height="${bounds.height}" fill="${escapeXml(options.treeStyle.backgroundColor || TREE_EXPORT_CONFIG.background)}" />`
    : "";
  const titleSvg = options.includeTitle
    ? `<text x="${bounds.x + 42}" y="${bounds.y + 58}" font-family="${escapeXml(EXPORT_FONT_FAMILY)}" font-size="16" font-weight="800" fill="#7b5338">${escapeXml((t ? t("tree.title") : "Gia pha").toLocaleUpperCase("vi-VN"))}</text><text x="${bounds.x + 42}" y="${bounds.y + 96}" font-family="${escapeXml(EXPORT_FONT_FAMILY)}" font-size="34" font-weight="900" fill="#3a2b1f">${title}</text>`
    : "";
  const lineSvg = asArray(lines)
    .filter((line) => line?.d && line.type !== "route-control")
    .map((line) => `<path d="${escapeXml(line.d)}" fill="none" stroke="${line.type === "spouse" ? SPOUSE_LINE_COLOR : line.color || CHILD_LINE_COLOR}" stroke-width="${line.branchLevel === 0 ? Math.max(styledExportConfig.lineWidth, MAIN_LINE_WIDTH) : styledExportConfig.lineWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${line.type === "spouse" ? "0.9" : "0.86"}" />`)
    .join("");
  const cardSvg = asArray(drawableNodes).map((item) => {
    if (item.type === DISPLAY_NODE_TYPE.COUPLE) {
      const x = item.x;
      const y = item.y;
      const width = item.width;
      const height = item.height;
      const isVertical = item.cardOrientation === TREE_CARD_ORIENTATION.VERTICAL;
      const halfWidth = isVertical ? width : width / 2;
      const halfHeight = isVertical ? height / 2 : height;
      const husbandCenterX = x + halfWidth / 2;
      const husbandCenterY = y + halfHeight * 0.42;
      const wifeCenterX = isVertical ? husbandCenterX : x + halfWidth + halfWidth / 2;
      const wifeCenterY = isVertical ? y + halfHeight + halfHeight * 0.42 : husbandCenterY;
      const [firstPerson, secondPerson] = orderedCouplePeople(item, directLineagePersonIds, isVertical);
      const coupleChars = Math.max(10, Math.floor((halfWidth - 28) / (styledExportConfig.nameFontSize * 0.55)));
      const husbandName = splitSvgText(fullName(firstPerson, t ? t("tree.card.fallbackName") : "Thanh vien"), coupleChars, 2)
        .map((line, index) => `<text x="${husbandCenterX}" y="${husbandCenterY + index * styledExportConfig.nameFontSize * 1.12}" text-anchor="middle" dominant-baseline="middle" font-family="${escapeXml(EXPORT_FONT_FAMILY)}" font-size="${styledExportConfig.nameFontSize}" font-weight="800" fill="#2f241b">${escapeXml(line)}</text>`)
        .join("");
      const wifeName = splitSvgText(fullName(secondPerson, t ? t("tree.card.fallbackName") : "Thanh vien"), coupleChars, 2)
        .map((line, index) => `<text x="${wifeCenterX}" y="${wifeCenterY + index * styledExportConfig.nameFontSize * 1.12}" text-anchor="middle" dominant-baseline="middle" font-family="${escapeXml(EXPORT_FONT_FAMILY)}" font-size="${styledExportConfig.nameFontSize}" font-weight="800" fill="#2f241b">${escapeXml(line)}</text>`)
        .join("");
      const husbandMark = directLineagePersonIds.has(Number(firstPerson?.id))
        ? `<text x="${x + halfWidth - 10}" y="${y + 10}" text-anchor="end" font-family="${escapeXml(EXPORT_FONT_FAMILY)}" font-size="15" font-weight="900" fill="#8b1e13">◎</text>`
        : "";
      const wifeMark = directLineagePersonIds.has(Number(secondPerson?.id))
        ? `<text x="${x + width - 10}" y="${y + 10}" text-anchor="end" font-family="${escapeXml(EXPORT_FONT_FAMILY)}" font-size="15" font-weight="900" fill="#8b1e13">◎</text>`
        : "";
      const divider = isVertical
        ? `<line x1="${x + 12}" y1="${y + halfHeight}" x2="${x + width - 12}" y2="${y + halfHeight}" stroke="rgba(185, 130, 91, 0.32)" />`
        : `<line x1="${x + halfWidth}" y1="${y + 12}" x2="${x + halfWidth}" y2="${y + height - 12}" stroke="rgba(185, 130, 91, 0.32)" />`;
      return `<g transform="translate(${-bounds.x}, ${-bounds.y})"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" fill="#fffaf0" stroke="#b9825b" stroke-width="2" />${divider}${husbandMark}${wifeMark}${husbandName}${wifeName}</g>`;
    }
    const person = item.type === DISPLAY_NODE_TYPE.SINGLE ? { ...item.person, tree_x: item.x, tree_y: item.y } : item;
    const localCardSizes = item.type === DISPLAY_NODE_TYPE.SINGLE ? { [Number(item.person.id)]: { width: item.width, height: item.height } } : cardSizes;
    const size = getExportCardSize(localCardSizes, person.id, styledExportConfig);
    const x = toInt(person.tree_x, 0);
    const y = toInt(person.tree_y, 0);
    const width = size.width;
    const height = size.height;
    const name = fullName(person, t ? t("tree.card.fallbackName") : "Thanh vien");
    const generationText = t ? t("tree.card.generation", { count: person.generation || 1 }) : `Doi ${person.generation || 1}`;
    const isFounder = Number(person.generation) === 1 || Number(person.role_id) === 1;
    const textLeft = x + width / 2;
    const singleNameSize = styledExportConfig.singleNameFontSize || styledExportConfig.nameFontSize;
    const singleMetaSize = styledExportConfig.singleMetaFontSize || styledExportConfig.metaFontSize;
    const textWidthChars = Math.max(12, Math.floor((width - 36) / (singleNameSize * 0.55)));
    const nameLines = splitSvgText(name, textWidthChars, 2);
    const nameStartY = y + height * 0.36 - ((nameLines.length - 1) * singleNameSize * 1.15) / 2;
    const nameText = nameLines.map((line, index) => `<text x="${textLeft}" y="${nameStartY + index * singleNameSize * 1.15}" text-anchor="middle" dominant-baseline="middle" font-family="${escapeXml(EXPORT_FONT_FAMILY)}" font-size="${singleNameSize}" font-weight="800" fill="#2f241b">${escapeXml(line)}</text>`).join("");
    const directMark = directLineagePersonIds.has(Number(person.id))
      ? `<text x="${x + width - 10}" y="${y + 10}" text-anchor="end" font-family="${escapeXml(EXPORT_FONT_FAMILY)}" font-size="15" font-weight="900" fill="#8b1e13">◎</text>`
      : "";
    return `<g transform="translate(${-bounds.x}, ${-bounds.y})"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" fill="${isFounder ? "#fff1df" : "#fffaf1"}" stroke="${isFounder ? "#a85f39" : "#c97b4d"}" stroke-width="2" />${directMark}${nameText}<text x="${textLeft}" y="${y + height * 0.72}" text-anchor="middle" dominant-baseline="middle" font-family="${escapeXml(EXPORT_FONT_FAMILY)}" font-size="${singleMetaSize}" font-weight="500" fill="#8d5b3b">${escapeXml(generationText)}</text></g>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}">${background}<g transform="translate(${-bounds.x}, ${-bounds.y})">${titleSvg}${lineSvg}</g>${cardSvg}</svg>`;
}

export async function exportTreeSvg(options) {
  const svg = renderFamilyTreeSvgString(options);
  return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}

export async function exportTreePdf() {
  throw new Error("PDF export is not implemented in this build.");
}

export async function exportPreparedTree(payload) {
  const format = payload?.exportOptions?.format || TREE_EXPORT_FORMAT.PNG;
  if (format === TREE_EXPORT_FORMAT.SVG) return exportTreeSvg(payload);
  if (format === TREE_EXPORT_FORMAT.PDF) return exportTreePdf(payload);
  return renderFamilyTreePngBlob(payload);
}
