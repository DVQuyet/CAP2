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

router.get(
  "/context",
  verifyToken,
  checkRole(["admin", "manager", "member"]),
  meController.getMyContext
);

router.get(
  "/context/people",
  verifyToken,
  checkRole(["admin", "manager", "member"]),
  meController.listContextPeople
);

router.post(
  "/context/person",
  verifyToken,
  checkRole(["admin", "manager", "member"]),
  meController.setCurrentPerson
);

module.exports = router;
