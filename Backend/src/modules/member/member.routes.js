const express = require("express");
const router = express.Router();
const memberController = require("./member.controller");
const { verifyToken, checkRole } = require("../../middleware/authMiddleware");

// Member dashboard: role 3 (member), 2 (manager), 1 (admin) khi có person_id.
router.get("/dashboard", verifyToken, checkRole(["admin", "manager", "member"]), memberController.getDashboard);
router.get("/notifications", verifyToken, checkRole(["admin", "manager", "member"]), memberController.getNotifications);
router.patch("/notifications/read-all", verifyToken, checkRole(["admin", "manager", "member"]), memberController.markAllNotificationsRead);
router.patch("/notifications/:id/read", verifyToken, checkRole(["admin", "manager", "member"]), memberController.markNotificationRead);
router.put("/profile", verifyToken, checkRole(["admin", "manager", "member"]), memberController.updateProfile);
router.put("/password", verifyToken, checkRole(["admin", "manager", "member"]), memberController.changePassword);
router.post("/tree-edit-session", verifyToken, checkRole(["admin", "manager", "member"]), memberController.verifyTreeEditSession);

router.get("/chat", verifyToken, checkRole(["admin", "manager", "member"]), memberController.getChatMessages);
router.post("/chat", verifyToken, checkRole(["admin", "manager", "member"]), memberController.sendChatMessage);

router.post("/reminders", verifyToken, checkRole(["manager", "member"]), memberController.createReminder);
router.get("/tasks", verifyToken, checkRole(["member"]), memberController.getAssignedTasks);
router.get("/events", verifyToken, checkRole(["member"]), memberController.getAssignedEvents);
router.patch("/tasks/:id/status", verifyToken, checkRole(["member"]), memberController.updateTaskStatus);

router.post("/content/profile", verifyToken, checkRole(["admin", "manager", "member"]), memberController.proposeProfileUpdate);
router.post("/content/post", verifyToken, checkRole(["admin", "manager", "member"]), memberController.submitMaterial);

// New Routes for General Posts & Submissions
router.get("/posts/general", verifyToken, checkRole(["admin", "manager", "member"]), memberController.getGeneralPosts);
router.get("/posts/:id/comments", verifyToken, checkRole(["admin", "manager", "member"]), memberController.getPostComments);
router.post("/posts/:id/comments", verifyToken, checkRole(["admin", "manager", "member"]), memberController.addPostComment);
router.post("/posts/:id/like", verifyToken, checkRole(["admin", "manager", "member"]), memberController.togglePostLike);
router.get("/submissions", verifyToken, checkRole(["admin", "manager", "member"]), memberController.getMySubmissions);
router.get("/memories", verifyToken, checkRole(["admin", "manager", "member"]), memberController.getFamilyMemories);
router.get("/memories/reader-options", verifyToken, checkRole(["admin", "manager", "member"]), memberController.getMemoryReaderOptions);
router.post("/memories", verifyToken, checkRole(["admin", "manager", "member"]), memberController.createFamilyMemory);
router.patch("/memories/:id", verifyToken, checkRole(["admin", "manager", "member"]), memberController.updateFamilyMemory);
router.delete("/memories/:id", verifyToken, checkRole(["admin", "manager", "member"]), memberController.deleteFamilyMemory);

router.delete("/posts/:id", verifyToken, checkRole(["admin", "manager", "member"]), memberController.deletePost);
router.patch("/posts/:id", verifyToken, checkRole(["admin", "manager", "member"]), memberController.updatePost);

// --- 💰 QUẢN LÝ QUỸ DÒNG HỌ (CLAN FUND) 💰 ---
const fundController = require("../fund/fund.controller");
router.get("/fund/campaigns", verifyToken, checkRole(["admin", "manager", "member"]), fundController.getCampaigns);
router.get("/fund/transactions", verifyToken, checkRole(["admin", "manager", "member"]), fundController.getTransactions);
router.get("/fund/campaigns/:id", verifyToken, checkRole(["admin", "manager", "member"]), fundController.getCampaignDetails);
router.post("/fund/report-payment", verifyToken, checkRole(["admin", "manager", "member"]), fundController.reportPayment);
router.get("/fund/stats", verifyToken, checkRole(["admin", "manager", "member"]), fundController.getFundStats);
router.post("/fund/income", verifyToken, checkRole(["admin", "manager", "member"]), fundController.addIncome);
router.post("/fund/expense", verifyToken, checkRole(["admin", "manager", "member"]), fundController.addExpense);

module.exports = router;
