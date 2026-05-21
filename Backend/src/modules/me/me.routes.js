const express = require("express");
const router = express.Router();
const meController = require("./me.controller");
const { verifyToken, checkRole } = require("../../middleware/authMiddleware");

router.put(
  "/profile",
  verifyToken,
  checkRole(["admin", "manager", "member"]),
  meController.updateMyProfile
);

module.exports = router;
