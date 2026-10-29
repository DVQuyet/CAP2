import { io } from "socket.io-client";
import { API_BASE_URL } from "./api";

// Socket chạy trên cùng backend với API (local khi mở từ localhost, Render khi là bản thật).
const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || API_BASE_URL).replace(/\/$/, "");

let socket = null;
let currentAccountId = null;

// Token đăng nhập hiện hành: đọc lại mỗi lần (kết nối lại) để dùng token mới sau khi đổi mật khẩu.
const readCurrentToken = () => localStorage.getItem("auth_token") || localStorage.getItem("token") || "";

export function connectSocket(accountId, token) {
  if (!accountId || !token) {
    console.warn("Missing accountId or token. Socket not connected.");
    return null;
  }

  if (socket && String(currentAccountId) === String(accountId)) {
    return socket;
  }

  if (socket) {
    socket.disconnect();
    socket = null;
    currentAccountId = null;

    if (typeof window !== "undefined") {
      window.socket = null;
    }
  }

  socket = io(SOCKET_URL, {
    auth: (callback) => callback({ token: readCurrentToken() || token }),
    transports: ["polling", "websocket"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  currentAccountId = accountId;

  if (typeof window !== "undefined") {
    window.socket = socket;
  }

  socket.on("connect", () => {
    console.log("Socket connected:", socket.id);
    socket.emit("register_user");
    console.log("Registered socket for current account");
  });

  socket.on("connect_error", (error) => {
    console.error("Socket connection error:", error.message);
  });

  const thisSocket = socket;
  socket.on("disconnect", (reason) => {
    console.log("Socket disconnected:", reason);
    // Server chủ động ngắt (đổi mật khẩu, đổi vai trò, khóa tài khoản): client không tự nối lại.
    // Thử một lần với token hiện hành; token bị thu hồi hay tài khoản bị khóa thì server từ chối (connect_error) và dừng ở đây.
    if (reason === "io server disconnect") {
      setTimeout(() => {
        if (socket === thisSocket && readCurrentToken()) thisSocket.connect();
      }, 1000);
    }
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentAccountId = null;

    if (typeof window !== "undefined") {
      window.socket = null;
    }
  }
}

export function connectSocketFromStorage() {
  const token =
    localStorage.getItem("auth_token") ||
    localStorage.getItem("token");

  const rawUser =
    localStorage.getItem("auth_user") ||
    localStorage.getItem("user");

  if (!token || !rawUser) {
    console.warn("No auth data in localStorage. Socket not connected.");
    return null;
  }

  try {
    const user = JSON.parse(rawUser);

    const accountId =
      user?.account_id ||
      user?.accountId ||
      user?.id;

    if (!accountId) {
      console.warn("Cannot find account id in auth_user:", user);
      return null;
    }

    return connectSocket(accountId, token);
  } catch (error) {
    console.error("Cannot parse auth_user from localStorage:", error);
    return null;
  }
}

export function onSocketEvent(eventName, handler) {
  const activeSocket = socket || connectSocketFromStorage();

  if (!activeSocket || !eventName || typeof handler !== "function") {
    return () => {};
  }

  activeSocket.on(eventName, handler);

  return () => {
    activeSocket.off(eventName, handler);
  };
}

export function emitSocketEvent(eventName, payload = {}) {
  const activeSocket = socket || connectSocketFromStorage();
  if (!activeSocket || !eventName) return false;
  activeSocket.emit(eventName, payload);
  return true;
}
