import express from 'express';
import {
  // Profiles
  getAllProfiles,
  getProfileByClientId,
  createOrUpdateProfile,
  deleteProfile,
  // Alerts
  getAllAlerts,
  getAlertById,
  createAlert,
  updateAlert,
  deleteAlert,
  sendAlertNow,
  reviewTodayAlerts,
  // Email Config
  getEmailConfigHandler,
  saveEmailConfigHandler,
  // Chats (Account-level legacy)
  getAccountChat,
  sendAccountMessage,
  clearAccountChat,
  getChatByClientId,
  sendMessage,
  clearChat,
  // Chats (multi-chat system)
  listFiscalChats,
  createFiscalChat,
  getFiscalChatById,
  deleteFiscalChat,
  sendFiscalChatMessage,
  streamFiscalChatMessage,
  exportFiscalChatPDF,
} from '../controllers/fiscalController.js';

const router = express.Router();

// ============= PROFILES =============
router.get('/profiles', getAllProfiles);
router.get('/profiles/:clientId', getProfileByClientId);
router.post('/profiles', createOrUpdateProfile);
router.delete('/profiles/:id', deleteProfile);

// ============= ALERTS =============
router.get('/alerts', getAllAlerts);
router.get('/alerts/:id', getAlertById);
router.post('/alerts', createAlert);
router.put('/alerts/:id', updateAlert);
router.delete('/alerts/:id', deleteAlert);
router.post('/alerts/review-today', reviewTodayAlerts);
router.post('/alerts/:id/send', sendAlertNow);

// ============= EMAIL CONFIG =============
router.get('/email-config', getEmailConfigHandler);
router.post('/email-config', saveEmailConfigHandler);

// ============= CHATS (Account-level) =============
router.get('/chat', getAccountChat);
router.post('/chat/message', sendAccountMessage);
router.delete('/chat', clearAccountChat);

// ============= CHATS (legacy single-chat per client) =============
router.get('/chats/legacy/:clientId', getChatByClientId);
router.post('/chats/legacy/:clientId/message', sendMessage);
router.delete('/chats/legacy/:clientId', clearChat);

// ============= CHATS (multi-chat system) =============
router.get('/chats', listFiscalChats);
router.post('/chats', createFiscalChat);
router.get('/chats/:id', getFiscalChatById);
router.delete('/chats/:id', deleteFiscalChat);
router.post('/chats/:id/message', sendFiscalChatMessage);
router.post('/chats/:id/message/stream', streamFiscalChatMessage);
router.get('/chats/:id/export-pdf', exportFiscalChatPDF);

export default router;
