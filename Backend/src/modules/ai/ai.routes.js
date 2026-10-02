const express = require('express');
const router = express.Router();

const aiController = require('./ai.controller');
const { verifyToken, checkRole } = require('../../middleware/authMiddleware');
const { createAuthRateLimit } = require('../../middleware/authRateLimit');

// Mỗi lần gọi tốn token LLM nên giới hạn theo tài khoản.
const aiRateLimit = createAuthRateLimit({
    name: 'ai',
    windowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 60 * 1000),
    max: Number(process.env.AI_RATE_LIMIT_MAX || 10),
    keyGenerator: (req) => req.user?.id || req.user?.account_id,
});

router.post(
    '/event-form/generate',
    verifyToken,
    checkRole(['admin', 'manager']),
    aiRateLimit,
    aiController.generateEventFormAI
);

router.post(
    '/genealogy/extract',
    verifyToken,
    checkRole(['admin', 'manager', 'member']),
    aiRateLimit,
    aiController.extractGenealogyAI
);

module.exports = router;
