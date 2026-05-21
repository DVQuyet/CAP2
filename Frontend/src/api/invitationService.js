import { apiRequest, buildApiUrl } from "../services/api";

async function parsePublicResponse(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || fallbackMessage);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function verifyInvitation(token) {
  const response = await fetch(
    buildApiUrl(`/api/invitations/verify?token=${encodeURIComponent(token || "")}`)
  );
  return parsePublicResponse(response, "Không thể kiểm tra lời mời.");
}

export async function acceptInvitation(payload) {
  const response = await fetch(buildApiUrl("/api/invitations/accept"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parsePublicResponse(response, "Không thể chấp nhận lời mời.");
}

export const listInvitations = () =>
  apiRequest("/api/invitations");

export const createInvitation = (payload) =>
  apiRequest("/api/invitations", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const completeMyProfile = (payload) =>
  apiRequest("/api/me/profile", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
