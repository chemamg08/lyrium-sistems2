import { Router } from 'express';
import {
  getAuthUrl,
  getCalendarStatus,
  getEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  disconnectCalendar,
} from '../controllers/calendarController.js';

const router = Router();

router.get('/auth-url', getAuthUrl);
router.get('/status', getCalendarStatus);
router.get('/events', getEvents);
router.post('/events', createCalendarEvent);
router.put('/events/:eventId', updateCalendarEvent);
router.delete('/events/:eventId', deleteCalendarEvent);
router.post('/disconnect', disconnectCalendar);

export default router;
