import express from 'express';
import { 
  createAccount, 
  login, 
  createSubaccount, 
  getSubaccounts, 
  deleteSubaccount,
  assignClientToSubaccount,
  getClientsBySubaccount
} from '../controllers/accountsController.js';

const router = express.Router();

// Cuentas principales
router.post('/register', createAccount);
router.post('/login', login);

// Subcuentas
router.post('/subaccounts', createSubaccount);
router.get('/subaccounts', getSubaccounts);
router.delete('/subaccounts/:id', deleteSubaccount);

// Asignación de clientes
router.post('/clients/:clientId/assign', assignClientToSubaccount);
router.get('/subaccounts/:subaccountId/clients', getClientsBySubaccount);

export default router;
