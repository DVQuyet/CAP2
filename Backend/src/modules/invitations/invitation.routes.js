const express = require("express");
const router = express.Router();
const invitationController = require("./invitation.controller");
const { verifyToken, checkRole } = require("../../middleware/authMiddleware");

router.get("/verify", invitationController.verifyInvitation);
router.post("/accept", invitationController.acceptInvitation);

router.get(
  "/",
  verifyToken,
  checkRole(["admin", "manager"]),
  invitationController.listInvitations
);

router.post(
  "/",
  verifyToken,
  checkRole(["admin", "manager"]),
  invitationController.createInvitation
);

module.exports = router;
