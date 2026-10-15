const express = require('express');
const router = express.Router();

const paymentController = require('./payment.controller');
const { verifyToken, checkRole } = require('../../middleware/authMiddleware');


router.post(
  '/sepay/create',
  verifyToken,
  checkRole(['manager', 'admin']),
  paymentController.createSepayPayment
);

router.post(
  '/sepay/webhook',
  paymentController.handleSepayWebhook
);

router.get(
  '/status/:orderCode',
  verifyToken,
  checkRole(['manager', 'admin']),
  paymentController.getPaymentStatus
);

router.patch(
  '/:paymentId/cancel',
  verifyToken,
  checkRole(['manager', 'admin']),
  paymentController.cancelPendingPayment
);

module.exports = router;