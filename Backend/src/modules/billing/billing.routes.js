const express = require('express');
const router = express.Router();

const billingController = require('./billing.controller');
const { verifyToken, checkRole } = require('../../middleware/authMiddleware');

router.get(
  '/plans',
  verifyToken,
  billingController.getPlans
);

router.get(
  '/clans/:clanId',
  verifyToken,
  checkRole(['admin', 'manager']),
  billingController.getClanBilling
);

router.get(
  '/clans/:clanId/payments',
  verifyToken,
  checkRole(['admin', 'manager']),
  billingController.getClanPayments
);


router.post(
  '/admin/plans',
  verifyToken,
  checkRole(['admin']),
  billingController.createPlan
);

router.put(
  '/admin/plans/:planId',
  verifyToken,
  checkRole(['admin']),
  billingController.updatePlan
);

router.patch(
  '/admin/clans/:clanId/manual-upgrade',
  verifyToken,
  checkRole(['admin']),
  billingController.manualUpgradeClan
);

module.exports = router;