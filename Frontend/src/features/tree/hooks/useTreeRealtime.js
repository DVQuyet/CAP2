import { useEffect, useMemo, useState } from "react";
import { emitSocketEvent, onSocketEvent } from "../../../services/socket";

const asArray = (value) => (Array.isArray(value) ? value : []);

function currentAccountId() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("auth_user") || window.localStorage.getItem("user");
    const user = raw ? JSON.parse(raw) : null;
    const id = Number(user?.account_id || user?.accountId || user?.id);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

export function useTreeRealtime({ clanId, enabled = true } = {}) {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [editingUsers, setEditingUsers] = useState([]);

  useEffect(() => {
    if (!enabled || !clanId) return undefined;
    emitSocketEvent("family_tree_join", { clan_id: clanId });
    const offOnline = onSocketEvent("family_tree_online_users", (payload) => {
      if (payload?.clan_id && Number(payload.clan_id) !== Number(clanId)) return;
      setOnlineUsers(asArray(payload?.users));
    });
    const offEditing = onSocketEvent("family_tree_editing_users", (payload) => {
      if (payload?.clan_id && Number(payload.clan_id) !== Number(clanId)) return;
      setEditingUsers(asArray(payload?.users));
    });
    return () => {
      emitSocketEvent("family_tree_leave", { clan_id: clanId });
      offOnline();
      offEditing();
    };
  }, [clanId, enabled]);

  const onlinePersonIds = useMemo(
    () => new Set(onlineUsers.map((item) => Number(item.person_id || item.personId)).filter(Number.isFinite)),
    [onlineUsers],
  );

  const editingPersonIds = useMemo(
    () => {
      const selfAccountId = currentAccountId();
      return new Set(
        editingUsers
          .filter((item) => Number(item.account_id || item.accountId) !== Number(selfAccountId))
          .map((item) => Number(item.person_id || item.personId))
          .filter(Number.isFinite),
      );
    },
    [editingUsers],
  );

  const startEditing = (personId) => {
    if (!enabled || !clanId || !personId) return;
    emitSocketEvent("person_editing_start", { clan_id: clanId, person_id: personId });
  };

  const stopEditing = (personId) => {
    if (!enabled || !clanId || !personId) return;
    emitSocketEvent("person_editing_stop", { clan_id: clanId, person_id: personId });
  };

  return { onlineUsers, onlinePersonIds, editingUsers, editingPersonIds, startEditing, stopEditing };
}
