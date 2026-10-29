const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
const LEGACY_TOKEN_KEY = "token";
const LEGACY_USER_KEY = "user";
const MEDIA_TOKEN_KEY = "auth_media_token";

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

// Token chỉ-xem-media dùng trên URL ảnh/ghi âm (backend: GET /api/auth/media-token).
export function getMediaToken() {
  return localStorage.getItem(MEDIA_TOKEN_KEY);
}

export function setMediaToken(token) {
  if (token) localStorage.setItem(MEDIA_TOKEN_KEY, token);
  else localStorage.removeItem(MEDIA_TOKEN_KEY);
}

export function isAuthenticated() {
  return Boolean(getAuthToken() && getStoredUser());
}

export function persistAuthSession(result) {
  if (result?.token) {
    // Token đăng nhập mới (đăng nhập lại, đổi mật khẩu): token media cũ không còn dùng được, phải lấy lại.
    if (result.token !== localStorage.getItem(TOKEN_KEY)) localStorage.removeItem(MEDIA_TOKEN_KEY);
    localStorage.setItem(TOKEN_KEY, result.token);
    localStorage.setItem(LEGACY_TOKEN_KEY, result.token);
  }

  if (result?.user) {
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    localStorage.setItem(LEGACY_USER_KEY, JSON.stringify(result.user));
  }
}

export function logout() {
  localStorage.removeItem(MEDIA_TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
}
