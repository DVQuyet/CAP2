const express = require('express');
const router = express.Router();
const calendarController = require('./calendar.controller');
const { verifyToken, checkRole } = require('../../middleware/authMiddleware');
const schemas = require('../../shared/validation/schemas');

router.get('/events', verifyToken, checkRole(['admin', 'manager', 'member']), calendarController.listEvents);
router.post('/events', verifyToken, checkRole(['admin', 'manager', 'member']), schemas.createCalendarEvent, calendarController.createEvent);
router.put('/events/:id', verifyToken, checkRole(['admin', 'manager', 'member']), schemas.updateCalendarEvent, calendarController.updateEvent);
router.delete('/events/:id', verifyToken, checkRole(['admin', 'manager', 'member']), schemas.deleteCalendarEvent, calendarController.deleteEvent);
router.post('/reminders/run', verifyToken, checkRole(['admin', 'manager']), calendarController.runDueReminders);

module.exports = router;
