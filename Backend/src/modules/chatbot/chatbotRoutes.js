const express = require('express');
const router = express.Router();

const chatbotController = require('./chatbotController');
const { verifyToken, checkRole } = require('../../middleware/authMiddleware');
const { chatbotRateLimit } = require('./chatbotSecurity');

router.use(verifyToken, checkRole(['admin', 'manager', 'member']), chatbotRateLimit);

router.post('/ask', chatbotController.ask);
router.post('/voice', chatbotController.voice);
router.get('/history', chatbotController.history);
router.get('/suggestions', chatbotController.suggestions);
router.get('/relationship/:id', chatbotController.getRelationshipById);
router.get('/path', chatbotController.getPath);

module.exports = router;
