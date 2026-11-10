const express = require('express');
const controller = require('./siteContent.controller');
const schemas = require('../../shared/validation/schemas');
const { verifyToken, checkRole } = require('../../middleware/authMiddleware');

// Công khai: GET /api/public/landing?lang=vi|en
const publicRouter = express.Router();
publicRouter.get('/landing', controller.getPublicLanding);
publicRouter.get('/landing/news/:id', schemas.landingItemId, controller.getPublicNewsItem);

// Quản trị: /api/admin/landing/* (chỉ admin). Route cố định đặt trước route có :key.
const adminRouter = express.Router();
adminRouter.use(verifyToken, checkRole(['admin']));
adminRouter.get('/', controller.getAdminLanding);
adminRouter.post('/seed', schemas.landingSeed, controller.seed);
adminRouter.put('/sections/order', schemas.landingReorderSections, controller.reorderSections);
adminRouter.put('/sections/:key', schemas.landingSection, controller.updateSection);
adminRouter.delete('/sections/:key', schemas.landingSectionKey, controller.resetSection);
adminRouter.put('/sections/:key/items/order', schemas.landingReorderItems, controller.reorderItems);
adminRouter.post('/sections/:key/items', schemas.landingItemCreate, controller.createItem);
adminRouter.put('/items/:id', schemas.landingItemUpdate, controller.updateItem);
adminRouter.delete('/items/:id', schemas.landingItemId, controller.deleteItem);

module.exports = { publicRouter, adminRouter };
