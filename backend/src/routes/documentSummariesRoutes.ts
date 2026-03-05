import { Router } from 'express';
import {
  createSummaryChat,
  getSummaryChat,
  getAllSummaryChats,
  updateChatTitle,
  deleteSummaryChat,
  duplicateSummaryChat,
  stageUploadFiles,
  processStagedUploadFiles,
  uploadFiles,
  deleteFile,
  sendMessage,
  streamMessage
} from '../controllers/documentSummariesController.js';
import { uploadSummaries } from '../config/multerSummaries.js';

const router = Router();

// Orden importante: rutas específicas antes de rutas con parámetros
router.post('/create', createSummaryChat);
router.get('/', getAllSummaryChats);
router.get('/:chatId', getSummaryChat);
router.put('/:chatId/title', updateChatTitle);
router.delete('/:chatId', deleteSummaryChat);
router.post('/:chatId/duplicate', duplicateSummaryChat);
router.post('/:chatId/upload/stage', uploadSummaries.array('files', 4), stageUploadFiles);
router.post('/:chatId/upload/process', processStagedUploadFiles);
router.post('/:chatId/upload', uploadSummaries.array('files', 4), uploadFiles);
router.delete('/:chatId/file/:fileId', deleteFile);
router.post('/:chatId/message', sendMessage);
router.post('/:chatId/message/stream', streamMessage);

export default router;
