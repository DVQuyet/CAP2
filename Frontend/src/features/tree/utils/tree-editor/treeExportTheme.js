// Bảng màu và hàm phụ trợ để xuất ảnh cây giống màn hình (chủ đề màu, dải giới tính, chữ cái đầu).
import { TREE_THEME } from "./treeDisplayConfig";

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

export const BODY_FONT = 'Manrope, Inter, "Noto Sans", "Segoe UI", Arial, sans-serif';

export function paletteFor(theme) {
  return TREE_THEME_PALETTES[theme] || TREE_THEME_PALETTES[TREE_THEME.TRADITIONAL];
}

export function hexToRgba(hex, alpha) {
  const value = String(hex || "").replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function wrapText(ctx, text, maxWidth, maxLines) {
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

export function fitText(ctx, text, maxWidth) {
  let value = String(text || "");
  if (ctx.measureText(value).width <= maxWidth) return value;
  while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
  return `${value}…`;
}

function yearOf(value) {
  const match = String(value || "").match(/\d{4}/);
  return match ? match[0] : "";
}

export function lifeYears(person) {
  const birth = yearOf(person?.birth_date);
  const death = Number(person?.is_living) === 0 ? yearOf(person?.death_date) : "";
  if (birth && death) return `${birth} – ${death}`;
  if (death) return `? – ${death}`;
  return birth;
}

export function genderColor(person, palette) {
  const gender = Number(person?.gender);
  if (gender === 1) return palette.male;
  if (gender === 2) return palette.female;
  return palette.unknown;
}

export function initialOf(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  return (words[words.length - 1] || "?").charAt(0).toUpperCase();
}
