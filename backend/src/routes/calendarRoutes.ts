import { Router } from 'express';
import {
  getAuthUrl,
  handleCallback,
  getCalendarStatus,
  getEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  disconnectCalendar,
  syncCalendar,
} from '../controllers/calendarController.js';

const router = Router();

router.get('/auth-url', getAuthUrl);
router.get('/status', getCalendarStatus);
router.get('/events', getEvents);
router.post('/events', createCalendarEvent);
router.put('/events/:eventId', updateCalendarEvent);
router.delete('/events/:eventId', deleteCalendarEvent);
router.post('/disconnect', disconnectCalendar);
router.post('/sync', syncCalendar);

export default router;
