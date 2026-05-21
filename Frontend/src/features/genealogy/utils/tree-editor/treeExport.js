import { EXPORT_MAX_CANVAS_EDGE } from "./treeConstants";
import { asArray, formatDisplayDate, fullName, toInt } from "./treePersonUtils";
import { getCardSize } from "./treeStorage";
import { numbersFromPath } from "./treeLines";

const EXPORT_PADDING = 180;
const EXPORT_FONT_FAMILY = '"Segoe UI", Arial, sans-serif';
const TITLE_BOX = { x: 42, y: 26, width: 300, height: 76 };

export function getTreeExportBounds(people, lines = [], cardSizes = {}) {
  if (!people.length) {
    return { x: 0, y: 0, width: 1200, height: 800 };
  }

  const xs = [TITLE_BOX.x, TITLE_BOX.x + TITLE_BOX.width];
  const ys = [TITLE_BOX.y, TITLE_BOX.y + TITLE_BOX.height];

  people.forEach((person) => {
    const size = getCardSize(cardSizes, person.id);
    xs.push(toInt(person.tree_x, 0), toInt(person.tree_x, 0) + size.width);
    ys.push(toInt(person.tree_y, 0), toInt(person.tree_y, 0) + size.height);
  });

  lines.forEach((line) => {
    if (line.type === "route-control") return;
    const nums = numbersFromPath(line.d);
    for (let index = 0; index < nums.length; index += 2) {
      if (Number.isFinite(nums[index])) xs.push(nums[index]);
      if (Number.isFinite(nums[index + 1])) ys.push(nums[index + 1]);
    }
  });

  const rawMinX = Math.min(...xs) - EXPORT_PADDING;
  const rawMinY = Math.min(...ys) - EXPORT_PADDING;
  const minX = Math.max(0, Math.floor(rawMinX));
  const minY = Math.max(0, Math.floor(rawMinY));
  const maxX = Math.ceil(Math.max(...xs) + EXPORT_PADDING);
  const maxY = Math.ceil(Math.max(...ys) + EXPORT_PADDING);

  return {
    x: minX,
    y: minY,
    width: Math.max(1000, maxX - minX),
    height: Math.max(720, maxY - minY),
  };
}

export function getExportPixelRatio(bounds) {
  const largestEdge = Math.max(bounds.width, bounds.height);
  if (!largestEdge) return 3;
  return Math.max(1, Math.min(3, EXPORT_MAX_CANVAS_EDGE / largestEdge));
}

export function exportFileName(name) {
  return `${String(name || "gia-pha")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "gia-pha"}.png`;
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
  const safeFileName = fileName || "gia-pha.png";

  if (typeof File !== "undefined" && typeof navigator !== "undefined" && navigator.canShare && navigator.share) {
    const file = new File([blob], safeFileName, { type: blob.type || "image/png" });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: safeFileName.replace(/\.png$/i, ""),
        });
        return "shared";
      } catch (error) {
        if (error?.name === "AbortError") return "cancelled";
      }
    }
  }

  downloadBlob(blob, safeFileName);
  return "downloaded";
}

export function canvasToBlob(canvas, t) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error(t ? t("tree.messages.exportError") : "Export failed"));
      }, "image/png", 0.95);
    } catch (error) {
      reject(error);
    }
  });
}

export function drawRoundRect(ctx, x, y, width, height, radius = 12) {
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

export function drawTextFit(ctx, text, x, y, maxWidth, options = {}) {
  const value = String(text || "").trim();
  if (!value) return;
  const fontSize = options.fontSize || 16;
  const minFontSize = options.minFontSize || 11;
  const weight = options.weight || "700";
  const family = options.family || EXPORT_FONT_FAMILY;
  let size = fontSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > minFontSize && ctx.measureText(value).width > maxWidth) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  ctx.fillText(value, x, y);
}

function splitTextToLines(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
      return;
    }
    lines.push(current);
    current = word;
  });
  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;
  const result = lines.slice(0, maxLines);
  let last = result[maxLines - 1];
  while (last.length > 1 && ctx.measureText(`${last}...`).width > maxWidth) {
    last = last.slice(0, -1).trim();
  }
  result[maxLines - 1] = `${last || result[maxLines - 1].slice(0, 1)}...`;
  return result;
}

export function drawTextFitLines(ctx, text, x, y, maxWidth, options = {}) {
  const value = String(text || "").trim();
  if (!value) return;
  const fontSize = options.fontSize || 16;
  const minFontSize = options.minFontSize || 11;
  const maxLines = options.maxLines || 2;
  const lineHeight = options.lineHeight || 1.18;
  const weight = options.weight || "700";
  const family = options.family || EXPORT_FONT_FAMILY;
  let size = fontSize;
  let lines = [];

  while (size >= minFontSize) {
    ctx.font = `${weight} ${size}px ${family}`;
    lines = splitTextToLines(ctx, value, maxWidth, maxLines);
    if (lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= maxWidth)) break;
    size -= 1;
  }

  const resolvedSize = Math.max(size, minFontSize);
  ctx.font = `${weight} ${resolvedSize}px ${family}`;
  const resolvedLines = lines.length ? lines : [value];
  const step = Math.max(minFontSize + 2, Math.round(resolvedSize * lineHeight));
  const startY = y - ((resolvedLines.length - 1) * step) / 2;
  resolvedLines.slice(0, maxLines).forEach((line, index) => {
    ctx.fillText(line, x, startY + index * step);
  });
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

export function drawTreeLine(ctx, line) {
  if (!line?.d || line.type === "route-control") return;
  ctx.save();
  ctx.fillStyle = "transparent";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.lineWidth = line.type === "spouse" ? 9 : 10;
  strokeTreePath(ctx, line.d);

  ctx.strokeStyle = line.type === "spouse" ? "#6f120b" : line.color || "#123f91";
  ctx.lineWidth = line.type === "spouse" ? 5.5 : 6.5;
  strokeTreePath(ctx, line.d);
  ctx.restore();
}

export function drawPersonCardOnCanvas(ctx, person, cardSizes = {}, t) {
  const size = getCardSize(cardSizes, person.id);
  const x = toInt(person.tree_x, 0);
  const y = toInt(person.tree_y, 0);
  const width = size.width;
  const height = size.height;
  const isFounder = Number(person.generation) === 1 || Number(person.role_id) === 1;
  const isChief = Number(person.role_id) === 2;
  const name = String(fullName(person, t ? t("tree.card.fallbackName") : "Thành viên"));
  const birthText = formatDisplayDate(person.birth_date);
  const deathText = formatDisplayDate(person.death_date);
  const deceased = Number(person.is_living) === 0;
  const lifeParts = [];

  if (birthText && t) lifeParts.push(t("tree.card.born", { date: birthText }));
  else if (birthText) lifeParts.push(`Sinh: ${birthText}`);

  if (deceased && deathText && t) lifeParts.push(t("tree.card.died", { date: deathText }));
  else if (deceased && deathText) lifeParts.push(`Mất: ${deathText}`);
  const lifeText = lifeParts.join(" - ");

  ctx.save();
  ctx.shadowColor = "rgba(69, 38, 8, 0.24)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  drawRoundRect(ctx, x, y, width, height, 12);
  const grad = ctx.createLinearGradient(x, y, x, y + height);
  if (isFounder) {
    grad.addColorStop(0, "#e3352c");
    grad.addColorStop(1, "#c42a22");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "#9f2a1c";
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    grad.addColorStop(0, "#fffbe0");
    grad.addColorStop(1, "#ffd568");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "#bd7d1f";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  if (isChief) {
    ctx.fillStyle = "#9b1c12";
    drawRoundRect(ctx, x + 12, y + 10, Math.min(width - 24, 92), 22, 10);
    ctx.fill();
    ctx.fillStyle = "#fff7ce";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 11px ${EXPORT_FONT_FAMILY}`;
    ctx.fillText(
      (t ? t("tree.card.chief") : "TỘC TRƯỞNG").toLocaleUpperCase("vi-VN"),
      x + 12 + Math.min(width - 24, 92) / 2,
      y + 21,
    );
  }

  const iconY = y + Math.max(24, Math.min(45, height * 0.17));
  const iconRadius = Math.max(12, Math.min(22, width * 0.12));
  const iconX = x + width / 2;
  ctx.beginPath();
  ctx.arc(iconX, iconY, iconRadius, 0, Math.PI * 2);
  ctx.fillStyle = isFounder ? "#ffe5a3" : "#fff7d2";
  ctx.fill();
  ctx.strokeStyle = isFounder ? "#fff2c3" : "#9f2a1c";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = isFounder ? "#d1352b" : "#9f2a1c";
  ctx.beginPath();
  ctx.arc(iconX, iconY - 4, iconRadius * 0.22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(iconX, iconY + 7, iconRadius * 0.36, Math.PI, 0);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = isFounder ? "#fffbe8" : "#8a2418";
  drawTextFitLines(ctx, name, iconX, y + height * 0.48, width - 24, {
    fontSize: Math.max(13, Math.min(20, width * 0.105)),
    minFontSize: 11,
    maxLines: 2,
    weight: "800",
  });
  const genText = (t ? t("tree.card.generation", { count: person.generation || "?" }) : `ĐỜI ${person.generation || "?"}`).toLocaleUpperCase("vi-VN");
  drawTextFit(ctx, genText, iconX, y + height * 0.64, width - 28, {
    fontSize: Math.max(12, Math.min(17, width * 0.09)),
    minFontSize: 11,
    weight: "800",
  });
  if (lifeText) {
    ctx.fillStyle = isFounder ? "#fff4c7" : "#9a4f20";
    drawTextFit(ctx, lifeText, iconX, y + height - 22, width - 18, {
      fontSize: Math.max(11, Math.min(13, width * 0.065)),
      minFontSize: 11,
      weight: "700",
    });
  }
  ctx.restore();
}

export async function renderFamilyTreePngBlob({ people, lines, cardSizes, clan, t }) {
  const bounds = getTreeExportBounds(people, lines, cardSizes);
  const pixelRatio = getExportPixelRatio(bounds);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(bounds.width * pixelRatio));
  canvas.height = Math.max(1, Math.ceil(bounds.height * pixelRatio));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t ? t("tree.messages.exportError") : "Export failed");

  ctx.save();
  ctx.scale(pixelRatio, pixelRatio);
  ctx.fillStyle = "#fff7dc";
  ctx.fillRect(0, 0, bounds.width, bounds.height);

  const bg = ctx.createLinearGradient(0, 0, bounds.width, bounds.height);
  bg.addColorStop(0, "#fff7c8");
  bg.addColorStop(0.48, "#f6da82");
  bg.addColorStop(1, "#dda046");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, bounds.width, bounds.height);

  ctx.translate(-bounds.x, -bounds.y);
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  drawRoundRect(ctx, TITLE_BOX.x, TITLE_BOX.y, TITLE_BOX.width, TITLE_BOX.height, 12);
  ctx.fill();
  ctx.fillStyle = "#7d1f13";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 15px ${EXPORT_FONT_FAMILY}`;
  ctx.fillText((t ? t("tree.title") : "GIA PHẢ").toLocaleUpperCase("vi-VN"), 58, 52);
  ctx.font = `900 32px ${EXPORT_FONT_FAMILY}`;
  ctx.fillText(String(clan?.clan_name || (t ? t("tree.card.fallbackName") : "Dòng họ")).toLocaleUpperCase("vi-VN"), 58, 88);

  asArray(lines).forEach((line) => drawTreeLine(ctx, line));
  asArray(people).forEach((person) => drawPersonCardOnCanvas(ctx, person, cardSizes, t));
  ctx.restore();

  return canvasToBlob(canvas, t);
}
