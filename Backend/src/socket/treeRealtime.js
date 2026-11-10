function emitTreeUpdated(req, clanId, payload = {}) {
  const io = req.app?.locals?.io;

  if (!io || !clanId) {
    console.warn(" Không thể emit tree_updated: thiếu io hoặc clanId", {
      hasIo: Boolean(io),
      clanId,
    });
    return;
  }

  const data = {
    clan_id: clanId,
    action: payload.action || "updated",
    person_id: payload.person_id || null,
    family_id: payload.family_id || null,
    actor_account_id: req.user?.id || req.user?.account_id || null,
    updated_at: new Date().toISOString(),
    ...payload,
  };

  io.to(`clan_${clanId}`).emit("tree_updated", data);

}

module.exports = {
  emitTreeUpdated,
};