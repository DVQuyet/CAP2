const express = require('express');
const router = express.Router();

const aiController = require('./ai.controller');
const { verifyToken, checkRole } = require('../../middleware/authMiddleware');

router.post(
    '/event-form/generate',
    verifyToken,
    checkRole(['admin', 'manager']),
    aiController.generateEventFormAI
);

router.post(
    '/genealogy/extract',
    verifyToken,
    checkRole(['admin', 'manager', 'member']),
    aiController.extractGenealogyAI
);

module.exports = router;
