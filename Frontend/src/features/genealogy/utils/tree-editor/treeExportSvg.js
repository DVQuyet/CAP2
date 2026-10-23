// Dựng SVG (vector) cho cây gia phả từ dữ liệu bố cục, giống thẻ và đường nối trên màn hình.
// PNG cũng được rasterize từ chính SVG này nên nét như nhau ở mọi tỉ lệ.
import { TREE_CARD_ORIENTATION } from "./treeDisplayConfig";
import { fullName } from "./treePersonUtils";
import { BODY_FONT, fitText, genderColor, hexToRgba, initialOf, lifeYears, paletteFor, wrapText } from "./treeExportTheme";

const CARD_RADIUS = 12;
const REFERENCE_RADIUS = 14;

export function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const num = (value) => Math.round(value * 100) / 100;

function lineDash(line) {
  if (line.variant === "ended" || line.variant === "adoptive") return "8 6";
  if (line.variant) return "2 6";
  return "";
}

function renderLine(line, palette, lineWidth) {
  if (!line?.d || line.type === "route-control") return "";
  const stroke = line.type === "spouse" || line.branchLevel === 0 ? palette.lineStrong : palette.line;
  const dash = lineDash(line);
  return `<path d="${escapeXml(line.d)}" fill="none" stroke="${stroke}" stroke-width="${lineWidth}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
}

function textEl(x, y, content, { size, weight, fill, anchor = "start", family = BODY_FONT }) {
  return `<text x="${num(x)}" y="${num(y)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="central" font-family="${escapeXml(family)}">${escapeXml(content)}</text>`;
}

export function buildTreeSvg({ nodes = [], lines = [], bounds, treeStyle = {}, overview = false, directIds = new Set(), t, fontCss = "", measureCtx }) {
  const palette = paletteFor(treeStyle.theme);
  const background = treeStyle.backgroundColor || palette.canvas;
  const nameSize = Math.round((Number(treeStyle.fontSize) || 17) * 0.88);
  const lineWidth = overview ? 2 : 2.4;
  const tr = (key, params, fallback) => (t ? t(key, params) : fallback);
  let uid = 0;
  const parts = [];
  const measure = (font, text, width, maxLines) => {
    measureCtx.font = font;
    return wrapText(measureCtx, text, width, maxLines);
  };
  const fit = (font, text, width) => {
    measureCtx.font = font;
    return fitText(measureCtx, text, width);
  };

  function personContent(person, box) {
    const { x, y, width, height } = box;
    const deceased = Number(person?.is_living) === 0;
    const color = genderColor(person, palette);
    const name = fullName(person, tr("tree.card.fallbackName", undefined, "Thành viên"));
    const direct = directIds.has(Number(person?.id));
    const clipId = `c${uid++}`;
    let out = `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${CARD_RADIUS}"/></clipPath>`;
    out += `<g clip-path="url(#${clipId})">`;
    if (deceased) out += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${hexToRgba(palette.surface2, 0.6)}"/>`;
    out += `<rect x="${x}" y="${y}" width="5" height="${height}" fill="${color}" opacity="${direct ? 1 : 0.38}"/></g>`;

    const padLeft = 16;
    const centerY = y + height / 2;
    let textX = x + padLeft;
    if (!overview) {
      const radius = 23;
      const cx = x + padLeft + radius;
      out += `<circle cx="${cx}" cy="${centerY}" r="${radius}" fill="${hexToRgba(color, 0.14)}" stroke="${deceased ? hexToRgba(palette.muted, 0.8) : color}" stroke-width="2"/>`;
      out += textEl(cx, centerY + 1, initialOf(name), { size: 19, weight: 800, fill: deceased ? palette.muted : color, anchor: "middle", family: palette.titleFont });
      textX = cx + radius + 10;
    }
    const textWidth = x + width - 12 - textX;
    const generation = person?.generation ? tr("tree.card.generation", { count: person.generation }, `Đời ${person.generation}`) : "";
    const meta = [lifeYears(person), generation].filter(Boolean).join(" · ");
    const lines2 = measure(`800 ${nameSize}px ${BODY_FONT}`, name, textWidth, 2);
    const lineHeight = Math.round(nameSize * 1.2);
    const metaHeight = overview || !meta ? 0 : 16;
    const blockHeight = lines2.length * lineHeight + metaHeight;
    const firstY = centerY - blockHeight / 2 + lineHeight / 2;
    const anchorX = overview ? x + width / 2 : textX;
    lines2.forEach((line, index) => {
      out += textEl(anchorX, firstY + index * lineHeight, line, { size: nameSize, weight: 800, fill: palette.ink, anchor: overview ? "middle" : "start" });
    });
    if (!overview && meta) {
      out += textEl(anchorX, firstY + lines2.length * lineHeight - lineHeight / 2 + 10, fit(`600 12px ${BODY_FONT}`, meta, textWidth), { size: 12, weight: 600, fill: palette.muted });
    }
    if (!overview && deceased) {
      const label = tr("tree.card.deceased", undefined, "Đã mất");
      measureCtx.font = `700 10px ${BODY_FONT}`;
      const tagWidth = measureCtx.measureText(label).width + 12;
      const tagX = x + width - tagWidth - 8;
      out += `<rect x="${num(tagX)}" y="${y + 6}" width="${num(tagWidth)}" height="16" rx="8" fill="${hexToRgba(palette.ink, 0.09)}"/>`;
      out += textEl(tagX + tagWidth / 2, y + 14.5, label, { size: 10, weight: 700, fill: palette.muted, anchor: "middle" });
    }
    return out;
  }

  function shell(node) {
    return `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${CARD_RADIUS}" fill="${palette.surface}" stroke="${palette.border}" stroke-width="1.2" filter="url(#sh)"/>`;
  }

  function referenceCard(node) {
    const { x, y, width, height } = node;
    const person = node.person;
    const name = fullName(person, tr("tree.card.fallbackName", undefined, "Thành viên"));
    const typeKey = ["adopted", "heir", "step", "foster"].includes(node.childType) ? node.childType : "elsewhere";
    const sub = tr(`tree.reference.types.${typeKey}`, undefined, "");
    const textX = x + 14 + 18 + 10;
    const textWidth = x + width - 14 - textX;
    const cy = y + height / 2;
    let out = `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${REFERENCE_RADIUS}" fill="${hexToRgba(palette.surface, 0.82)}" stroke="${palette.border}" stroke-width="1.5" stroke-dasharray="6 4"/>`;
    // Mũi tên chỉ xuống thay cho biểu tượng "move_down" trên màn hình.
    const ax = x + 14 + 9;
    out += `<path d="M${ax} ${cy - 7}V${cy + 6}M${ax - 5} ${cy + 1}L${ax} ${cy + 7}L${ax + 5} ${cy + 1}" fill="none" stroke="${palette.muted}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    out += textEl(textX, cy - (sub ? 9 : 0), fit(`700 ${nameSize}px ${BODY_FONT}`, name, textWidth), { size: nameSize, weight: 700, fill: palette.ink });
    if (sub) out += textEl(textX, cy + 11, fit(`500 12px ${BODY_FONT}`, sub, textWidth), { size: 12, weight: 500, fill: palette.muted });
    return out;
  }

  function coupleCard(node) {
    const vertical = node.cardOrientation === TREE_CARD_ORIENTATION.VERTICAL;
    const halfW = vertical ? node.width : node.width / 2;
    const halfH = vertical ? node.height / 2 : node.height;
    let out = shell(node);
    [node.husband, node.wife].forEach((person, index) => {
      out += personContent(person, {
        x: vertical ? node.x : node.x + index * halfW,
        y: vertical ? node.y + index * halfH : node.y,
        width: halfW,
        height: halfH,
      });
    });
    const knotX = vertical ? node.x + node.width / 2 : node.x + halfW;
    const knotY = vertical ? node.y + halfH : node.y + node.height / 2;
    const divider = vertical
      ? `M${node.x + 14} ${knotY}H${node.x + node.width - 14}`
      : `M${knotX} ${node.y + 12}V${node.y + node.height - 12}`;
    out += `<path d="${divider}" stroke="${palette.border}" stroke-width="1" fill="none"/>`;
    if (!overview) {
      out += `<circle cx="${knotX}" cy="${knotY}" r="9" fill="${palette.surface}" stroke="${palette.border}" stroke-width="1"/>`;
      out += textEl(knotX, knotY + 0.5, "♥", { size: 9, weight: 700, fill: palette.accent, anchor: "middle" });
    }
    return out;
  }

  const lineSvg = lines.map((line) => renderLine(line, palette, lineWidth)).join("");
  nodes.forEach((node) => {
    if (node.type === "couple") parts.push(coupleCard(node));
    else if (node.type === "reference") parts.push(referenceCard(node));
    else if (node.person) parts.push(shell(node) + personContent(node.person, node));
  });

  const { x, y, width, height } = bounds;
  const style = fontCss ? `<style><![CDATA[${fontCss}]]></style>` : "";
  const defs = `<defs>${style}<filter id="sh" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000" flood-opacity="0.12"/></filter></defs>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}" text-rendering="geometricPrecision" shape-rendering="geometricPrecision">${defs}<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${escapeXml(background)}"/>${lineSvg}${parts.join("")}</svg>`;
  return { svg, width, height };
}
