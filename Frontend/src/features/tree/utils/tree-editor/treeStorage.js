import { CARD_HEIGHT, CARD_SIZE_STORAGE_PREFIX, CARD_WIDTH, LINE_ROUTE_STORAGE_PREFIX, MAX_CARD_HEIGHT, MAX_CARD_WIDTH, MIN_CARD_HEIGHT, MIN_CARD_WIDTH } from "../../model/config.js";
import { clamp, toInt } from "./treePersonUtils";

export function getLineRouteStorageKey(clanId) {
  return `${LINE_ROUTE_STORAGE_PREFIX}${clanId || "default"}`;
}

export function getCardSizeStorageKey(clanId) {
  return `${CARD_SIZE_STORAGE_PREFIX}${clanId || "default"}`;
}

export function normalizeLayoutObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function normalizeLayoutSettings(settings) {
  return {
    line_routes: normalizeLayoutObject(settings?.line_routes || settings?.lineRoutes),
    card_sizes: normalizeLayoutObject(settings?.card_sizes || settings?.cardSizes),
    tree_style: normalizeLayoutObject(settings?.tree_style || settings?.treeStyle),
  };
}

export function normalizeCardSize(size) {
  const width = clamp(toInt(size?.width, CARD_WIDTH), MIN_CARD_WIDTH, MAX_CARD_WIDTH);
  const height = clamp(toInt(size?.height, CARD_HEIGHT), MIN_CARD_HEIGHT, MAX_CARD_HEIGHT);
  return { width, height };
}

export function getCardSize(cardSizes, personId) {
  return normalizeCardSize(cardSizes?.[Number(personId)]);
}

export function clearCardSizes(clanId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getCardSizeStorageKey(clanId));
  } catch {
  }
}

export function clearLineRoutes(clanId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getLineRouteStorageKey(clanId));
  } catch {
  }
}
