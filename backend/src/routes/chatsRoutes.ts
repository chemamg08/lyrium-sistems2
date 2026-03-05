import { Router } from 'express';
import {
  getClientChats,
  createClientChat,
  sendClientMessage,
  streamClientMessage,
  deleteClientChat,
  deleteEmptyChats
} from '../controllers/chatsController.js';

const router = Router();

router.get('/', getClientChats);
router.post('/', createClientChat);
router.post('/message', sendClientMessage);
router.post('/message/stream', streamClientMessage);
router.delete('/empty/:clientId', deleteEmptyChats);
router.delete('/:id', deleteClientChat);

export default router;
