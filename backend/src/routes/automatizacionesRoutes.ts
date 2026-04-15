import { Router } from 'express';
import {
  getData,
  getSubcuentas,
  createEspecialidad,
  updateEspecialidad,
  deleteEspecialidad,
  createCuentaCorreo,
  deleteCuentaCorreo,
  createCorreoConsulta,
  deleteCorreoConsulta,
  uploadDocumento,
  deleteDocumento,
  viewDocumento,
  updateSwitch,
  updateSortByCarga,
  updateAutoAssignEnabled,
  updateEmailSelection,
  updateSubcuentaEspecialidad,
  uploadMiddleware,
  emailAttachmentMiddleware,
  getConversations,
  getPendingConsultasHandler,
  getPollingStatus,
  forceCheckEmails,
  markRead,
  deleteConversationHandler,
  toggleAutoReplyHandler,
  sendManualEmailHandler,
  getUnreadCount,
  createEmailFolder,
  deleteEmailFolder,
  assignConversationToFolder,
  removeConversationFromFolder,
  downloadEmailAttachment,
  getClassifyRules,
  createClassifyRule,
  deleteClassifyRule,
} from '../controllers/automatizacionesController.js';

const router = Router();

router.get('/', getData);
router.get('/subcuentas', getSubcuentas);

router.post('/especialidades', createEspecialidad);
router.put('/especialidades/:id', updateEspecialidad);
router.delete('/especialidades/:id', deleteEspecialidad);

router.post('/cuentas-correo', createCuentaCorreo);
router.delete('/cuentas-correo/:id', deleteCuentaCorreo);

router.post('/correos-consultas', createCorreoConsulta);
router.delete('/correos-consultas', deleteCorreoConsulta);

router.post('/documentos', uploadMiddleware.single('file'), uploadDocumento);
router.delete('/documentos/:id', deleteDocumento);
router.get('/documentos/:id/view', viewDocumento);

router.put('/switch', updateSwitch);
router.put('/sort-by-carga', updateSortByCarga);
router.put('/auto-assign-enabled', updateAutoAssignEnabled);
router.put('/email-selection', updateEmailSelection);
router.put('/subcuenta-especialidad', updateSubcuentaEspecialidad);

// Email automation endpoints
router.get('/conversations', getConversations);
router.get('/pending-consultas', getPendingConsultasHandler);
router.get('/polling-status', getPollingStatus);
router.post('/check-emails', forceCheckEmails);
router.put('/mark-read', markRead);
router.delete('/conversations/:id', deleteConversationHandler);
router.put('/conversations/:id/auto-reply', toggleAutoReplyHandler);
router.post('/conversations/:id/send', emailAttachmentMiddleware.array('files', 10), sendManualEmailHandler);

// Email attachments download
router.get('/email-attachments/:filename', downloadEmailAttachment);

// Email folders
router.get('/unread-count', getUnreadCount);
router.post('/email-folders', createEmailFolder);
router.delete('/email-folders/:id', deleteEmailFolder);
router.put('/email-folders/assign', assignConversationToFolder);
router.put('/email-folders/remove', removeConversationFromFolder);

// Email classify rules
router.get('/email-classify-rules', getClassifyRules);
router.post('/email-classify-rules', createClassifyRule);
router.delete('/email-classify-rules/:id', deleteClassifyRule);

export default router;
