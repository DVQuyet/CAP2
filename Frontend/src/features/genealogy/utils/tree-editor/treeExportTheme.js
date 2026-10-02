// Vẽ cây gia phả khi xuất ảnh PNG theo cùng thiết kế với màn hình: chủ đề màu, dải giới tính,
// chữ cái đầu, nhãn "Đã mất", và khung trang trí tuỳ chọn.
import { TREE_CARD_ORIENTATION, TREE_THEME } from "./treeDisplayConfig";
import { fullName } from "./treePersonUtils";

// Bảng màu phải khớp với biến --t-* trong FamilyTreeEditor.v2.css.
export const TREE_THEME_PALETTES = {
  [TREE_THEME.TRADITIONAL]: {
    canvas: "#f6efe2", surface: "#fffaf1", surface2: "#f3e9d6", border: "#e2cfa6", ink: "#3b2a1a", muted: "#8a7458",
    accent: "#9c2f1c", line: "#a98458", lineStrong: "#8a5a2b", male: "#3d6a8a", female: "#b4566b", unknown: "#9c8b72",
    gold: "#c9a24a", titleFont: '"Noto Serif", Lora, Georgia, serif',
  },
  [TREE_THEME.MODERN]: {
    canvas: "#f5f7fa", surface: "#ffffff", surface2: "#eef2f7", border: "#e1e6ee", ink: "#1f2937", muted: "#6b7280",
    accent: "#2563eb", line: "#9aa8bd", lineStrong: "#64748b", male: "#2f6fd6", female: "#d0457f", unknown: "#94a3b8",
    gold: "#f59e0b", titleFont: 'Manrope, "Segoe UI", sans-serif',
  },
  [TREE_THEME.DARK]: {
    canvas: "#171a21", surface: "#232833", surface2: "#2c3240", border: "#3a4252", ink: "#e8eaf0", muted: "#9aa3b2",
    accent: "#f0b35a", line: "#6b7690", lineStrong: "#9aa6c0", male: "#6ea8fe", female: "#f08bb4", unknown: "#8892a6",
    gold: "#f0b35a", titleFont: 'Manrope, "Segoe UI", sans-serif',
  },
};

export const EXPORT_FRAME_PADDING = 56;
const BODY_FONT = 'Manrope, Inter, "Noto Sans", "Segoe UI", Arial, sans-serif';

export function paletteFor(theme) {
  return TREE_THEME_PALETTES[theme] || TREE_THEME_PALETTES[TREE_THEME.TRADITIONAL];
}

function hexToRgba(hex, alpha) {
  const value = String(hex || "").replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth, maxLines) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (!current || ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  const clipped = lines.slice(0, maxLines);
  let last = clipped[maxLines - 1];
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1).trim();
  clipped[maxLines - 1] = `${last}…`;
  return clipped;
}

function fitText(ctx, text, maxWidth) {
  let value = String(text || "");
  if (ctx.measureText(value).width <= maxWidth) return value;
  while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
  return `${value}…`;
}

function yearOf(value) {
  const match = String(value || "").match(/\d{4}/);
  return match ? match[0] : "";
}

function lifeYears(person) {
  const birth = yearOf(person?.birth_date);
  const death = Number(person?.is_living) === 0 ? yearOf(person?.death_date) : "";
  if (birth && death) return `${birth} – ${death}`;
  if (death) return `? – ${death}`;
  return birth;
}

function genderColor(person, palette) {
  const gender = Number(person?.gender);
  if (gender === 1) return palette.male;
  if (gender === 2) return palette.female;
  return palette.unknown;
}

function initialOf(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  return (words[words.length - 1] || "?").charAt(0).toUpperCase();
}

// Vẽ nội dung một người trong vùng (x, y, width, height): dải màu, ảnh chữ cái, tên, năm sinh/mất.
function drawPersonContent(ctx, person, box, style) {
  const { palette, t, overview, nameSize, direct } = style;
  const { x, y, width, height } = box;
  const deceased = Number(person?.is_living) === 0;
  const color = genderColor(person, palette);
  const name = fullName(person, t ? t("tree.card.fallbackName") : "Thành viên");

  ctx.save();
  // Nền nhạt cho người đã mất.
  if (deceased) {
    roundRectPath(ctx, x, y, width, height, 12);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = hexToRgba(palette.surface2, 0.6);
    ctx.fillRect(x, y, width, height);
    ctx.restore();
  }

  // Dải màu theo giới tính ở cạnh trái (dâu/rể nhạt hơn).
  ctx.save();
  roundRectPath(ctx, x, y, width, height, 12);
  ctx.clip();
  ctx.globalAlpha = direct ? 1 : 0.38;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 5, height);
  ctx.restore();

  const padLeft = 16;
  let textX = x + padLeft;
  const centerY = y + height / 2;

  if (!overview) {
    const radius = 23;
    const cx = x + padLeft + radius;
    ctx.beginPath();
    ctx.arc(cx, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(color, 0.14);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = deceased ? hexToRgba(palette.muted, 0.8) : color;
    ctx.stroke();
    ctx.fillStyle = deceased ? palette.muted : color;
    ctx.font = `800 19px ${palette.titleFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initialOf(name), cx, centerY + 1);
    textX = cx + radius + 10;
  }

  const textWidth = x + width - 12 - textX;
  const meta = [lifeYears(person), person?.generation ? (t ? t("tree.card.generation", { count: person.generation }) : `Đời ${person.generation}`) : ""]
    .filter(Boolean)
    .join(" · ");

  ctx.fillStyle = palette.ink;
  ctx.font = `800 ${nameSize}px ${BODY_FONT}`;
  ctx.textAlign = overview ? "center" : "left";
  ctx.textBaseline = "middle";
  const lines = wrapText(ctx, name, textWidth, 2);
  const lineHeight = Math.round(nameSize * 1.2);
  const metaHeight = overview || !meta ? 0 : 16;
  const blockHeight = lines.length * lineHeight + metaHeight;
  const firstY = centerY - blockHeight / 2 + lineHeight / 2;
  const anchorX = overview ? x + width / 2 : textX;
  lines.forEach((line, index) => ctx.fillText(line, anchorX, firstY + index * lineHeight));

  if (!overview && meta) {
    ctx.fillStyle = palette.muted;
    ctx.font = `600 12px ${BODY_FONT}`;
    ctx.fillText(fitText(ctx, meta, textWidth), anchorX, firstY + lines.length * lineHeight - lineHeight / 2 + 10);
  }

  if (!overview && deceased) {
    const label = t ? t("tree.card.deceased") : "Đã mất";
    ctx.font = `700 10px ${BODY_FONT}`;
    const tagWidth = ctx.measureText(label).width + 12;
    const tagX = x + width - tagWidth - 8;
    roundRectPath(ctx, tagX, y + 6, tagWidth, 16, 8);
    ctx.fillStyle = hexToRgba(palette.ink, 0.09);
    ctx.fill();
    ctx.fillStyle = palette.muted;
    ctx.textAlign = "center";
    ctx.fillText(label, tagX + tagWidth / 2, y + 14.5);
  }
  ctx.restore();
}

function drawCardShell(ctx, x, y, width, height, palette) {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.12)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  roundRectPath(ctx, x, y, width, height, 12);
  ctx.fillStyle = palette.surface;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = palette.border;
  ctx.stroke();
  ctx.restore();
}

export function drawThemedNode(ctx, node, { palette, t, overview, nameSize, directIds }) {
  const style = { palette, t, overview, nameSize };
  if (node.type === "couple") {
    const vertical = node.cardOrientation === TREE_CARD_ORIENTATION.VERTICAL;
    drawCardShell(ctx, node.x, node.y, node.width, node.height, palette);
    const halfW = vertical ? node.width : node.width / 2;
    const halfH = vertical ? node.height / 2 : node.height;
    const people = [node.husband, node.wife];
    people.forEach((person, index) => {
      const box = {
        x: vertical ? node.x : node.x + index * halfW,
        y: vertical ? node.y + index * halfH : node.y,
        width: halfW,
        height: halfH,
      };
      drawPersonContent(ctx, person, box, { ...style, direct: directIds.has(Number(person?.id)) });
    });

    // Vạch chia và nút nối vợ chồng.
    ctx.save();
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const knotX = vertical ? node.x + node.width / 2 : node.x + halfW;
    const knotY = vertical ? node.y + halfH : node.y + node.height / 2;
    if (vertical) {
      ctx.moveTo(node.x + 14, knotY);
      ctx.lineTo(node.x + node.width - 14, knotY);
    } else {
      ctx.moveTo(knotX, node.y + 12);
      ctx.lineTo(knotX, node.y + node.height - 12);
    }
    ctx.stroke();
    if (!overview) {
      ctx.beginPath();
      ctx.arc(knotX, knotY, 9, 0, Math.PI * 2);
      ctx.fillStyle = palette.surface;
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = palette.accent;
      ctx.font = `700 9px ${BODY_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("♥", knotX, knotY + 0.5);
    }
    ctx.restore();
    return;
  }

  drawCardShell(ctx, node.x, node.y, node.width, node.height, palette);
  drawPersonContent(ctx, node.person, node, { ...style, direct: directIds.has(Number(node.person?.id)) });
}

export function drawThemedLine(ctx, line, palette, lineWidth) {
  if (!line?.d || line.type === "route-control") return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = line.type === "spouse" || line.branchLevel === 0 ? palette.lineStrong : palette.line;
  ctx.lineWidth = lineWidth;
  try {
    ctx.stroke(new Path2D(line.d));
  } catch {
    // Path2D không khả dụng: bỏ qua đường này.
  }
  ctx.restore();
}

export function drawThemedTitle(ctx, bounds, clan, t, palette, { centered = false, inset = 0 } = {}) {
  ctx.save();
  const x = centered ? bounds.x + bounds.width / 2 : bounds.x + inset + 42;
  ctx.textAlign = centered ? "center" : "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = palette.muted;
  ctx.font = `700 15px ${palette.titleFont}`;
  ctx.fillText((t ? t("tree.title") : "Gia phả").toLocaleUpperCase("vi-VN"), x, bounds.y + inset + 54);
  ctx.fillStyle = palette.accent;
  ctx.font = `800 36px ${palette.titleFont}`;
  ctx.fillText(String(clan?.clan_name || "Dòng họ").toLocaleUpperCase("vi-VN"), x, bounds.y + inset + 96);
  ctx.restore();
}

// Khung viền đôi với hoa văn ở bốn góc.
export function drawDecorativeFrame(ctx, bounds, palette) {
  const outer = 18;
  const inner = 30;
  ctx.save();
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 3;
  roundRectPath(ctx, bounds.x + outer, bounds.y + outer, bounds.width - outer * 2, bounds.height - outer * 2, 18);
  ctx.stroke();
  ctx.strokeStyle = palette.gold;
  ctx.lineWidth = 1.2;
  roundRectPath(ctx, bounds.x + inner, bounds.y + inner, bounds.width - inner * 2, bounds.height - inner * 2, 12);
  ctx.stroke();

  const corners = [
    [bounds.x + inner, bounds.y + inner, 1, 1],
    [bounds.x + bounds.width - inner, bounds.y + inner, -1, 1],
    [bounds.x + inner, bounds.y + bounds.height - inner, 1, -1],
    [bounds.x + bounds.width - inner, bounds.y + bounds.height - inner, -1, -1],
  ];
  corners.forEach(([cx, cy, dx, dy]) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(dx, dy);
    ctx.strokeStyle = palette.gold;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI / 2);
    ctx.stroke();
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.lineTo(36, 6);
    ctx.lineTo(30, 12);
    ctx.lineTo(24, 6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 30);
    ctx.lineTo(6, 36);
    ctx.lineTo(12, 30);
    ctx.lineTo(6, 24);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();
}
