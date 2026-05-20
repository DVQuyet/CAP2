import { io } from "socket.io-client";

const SOCKET_URL = (
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD && typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:3000")
).replace(/\/$/, "");

let socket = null;
let currentAccountId = null;

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
    auth: { token },
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

  socket.on("disconnect", (reason) => {
    console.log("Socket disconnected:", reason);
  });

  socket.onAny((eventName, ...args) => {
    console.log("[SOCKET EVENT]", eventName, args);
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
