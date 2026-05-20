const STORAGE_KEY = "member_tree_edit_session";

function getExpiryTime(expiresAt) {
  const time = Date.parse(expiresAt);
  return Number.isFinite(time) ? time : 0;
}

function canUseStorage() {
  try {
    return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
  } catch {
    return false;
  }
}

export function readTreeEditSession() {
  if (!canUseStorage()) return null;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const key = typeof parsed?.key === "string" ? parsed.key.trim() : "";
    const expiresAt = typeof parsed?.expiresAt === "string" ? parsed.expiresAt : "";
    if (!key || !expiresAt) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (getExpiryTime(expiresAt) <= Date.now()) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return { key, expiresAt };
  } catch {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage failures. The caller can continue in read-only mode.
    }
    return null;
  }
}

export function saveTreeEditSession(session) {
  if (!canUseStorage()) return;
  const key = typeof session?.key === "string" ? session.key.trim() : "";
  const expiresAt = typeof session?.expiresAt === "string" ? session.expiresAt : "";
  if (!key || !expiresAt || getExpiryTime(expiresAt) <= Date.now()) {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage failures. The caller can continue in read-only mode.
    }
    return;
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ key, expiresAt }));
  } catch {
    // Ignore storage failures. The current in-memory permission still works.
  }
}

export function clearTreeEditSession() {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function getTreeEditKeyHeader() {
  const session = readTreeEditSession();
  return session?.key ? { "x-tree-edit-key": session.key } : {};
}
