const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
const LEGACY_TOKEN_KEY = "token";
const LEGACY_USER_KEY = "user";

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY) || localStorage.getItem(LEGACY_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getCurrentUser() {
  return getStoredUser();
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY);
}

export function isAuthenticated() {
  return Boolean(getAuthToken() && getStoredUser());
}

export function persistAuthSession(result) {
  if (result?.token) {
    localStorage.setItem(TOKEN_KEY, result.token);
    localStorage.setItem(LEGACY_TOKEN_KEY, result.token);
  }

  if (result?.user) {
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    localStorage.setItem(LEGACY_USER_KEY, JSON.stringify(result.user));
  }
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
}
