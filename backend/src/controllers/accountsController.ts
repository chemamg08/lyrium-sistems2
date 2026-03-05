import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { Account } from '../models/Account.js';
import { Subaccount } from '../models/Subaccount.js';
import { Client } from '../models/Client.js';
import { Subscription } from '../models/Subscription.js';
import { generateToken } from '../middleware/auth.js';

const SALT_ROUNDS = 10;

// Cuentas principales
export const createAccount = async (req: Request, res: Response) => {
  try {
    const { name, email, password, country } = req.body;

    // Verificar si el email ya existe
    const existsInAccounts = await Account.findOne({ email });
    const existsInSubs = await Subaccount.findOne({ email });

    if (existsInAccounts || existsInSubs) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const id = Date.now().toString();

    const newAccount = await Account.create({
      _id: id,
      name,
      email,
      password: hashedPassword,
      country: (country || 'ES').toUpperCase(),
      type: 'main',
      createdAt: new Date().toISOString(),
    });

    // Crear suscripción de prueba automáticamente
    try {
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 14);

      await Subscription.create({
        _id: Date.now().toString(),
        accountId: id,
        plan: 'starter',
        interval: 'monthly',
        status: 'trial',
        trialEndDate: trialEndDate.toISOString(),
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: trialEndDate.toISOString(),
        autoRenew: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripePaymentMethodId: null,
        paymentMethod: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error al crear suscripción de prueba:', error);
    }

    const accountObj = newAccount.toJSON();
    res.json({ success: true, account: { ...accountObj, password: undefined } });
  } catch (error) {
    console.error('Error al crear cuenta:', error);
    res.status(500).json({ error: 'Error al crear cuenta' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Buscar en cuentas principales
    const mainAccount = await Account.findOne({ email });
    if (mainAccount && await bcrypt.compare(password, mainAccount.password)) {
      // Validar suscripción
      const subscription = await Subscription.findOne({ accountId: mainAccount._id });
      if (!subscription) {
        return res.status(403).json({
          error: 'No se encontró suscripción',
          type: 'main',
          needsPayment: true,
          accountId: mainAccount._id,
          email: mainAccount.email,
        });
      }

      const now = new Date();
      const periodEnd = new Date(subscription.currentPeriodEnd);

      if (periodEnd < now) {
        return res.status(403).json({
          error: 'Tu suscripción ha caducado. Renueva tu plan para continuar.',
          type: 'main',
          needsPayment: true,
          accountId: mainAccount._id,
          email: mainAccount.email,
        });
      }

      const token = generateToken({
        userId: mainAccount._id,
        email: mainAccount.email,
        type: 'main',
      });

      return res.json({
        success: true,
        token,
        user: {
          id: mainAccount._id,
          name: mainAccount.name,
          email: mainAccount.email,
          country: mainAccount.country || 'ES',
          type: 'main',
        },
      });
    }

    // Buscar en subcuentas
    const subaccount = await Subaccount.findOne({ email });
    if (subaccount && await bcrypt.compare(password, subaccount.password)) {
      // Validar suscripción de la cuenta principal
      const subscription = await Subscription.findOne({ accountId: subaccount.parentAccountId });
      if (!subscription) {
        return res.status(403).json({
          error: 'No se encontró suscripción de la cuenta principal',
          type: 'subaccount',
          needsPayment: false,
        });
      }

      const now = new Date();
      const periodEnd = new Date(subscription.currentPeriodEnd);

      if (periodEnd < now) {
        return res.status(403).json({
          error: 'La suscripción de la cuenta principal ha caducado',
          type: 'subaccount',
          needsPayment: false,
        });
      }

      const parentAccount = await Account.findById(subaccount.parentAccountId);

      const token = generateToken({
        userId: subaccount._id,
        email: subaccount.email,
        type: 'subaccount',
        parentAccountId: subaccount.parentAccountId,
      });

      return res.json({
        success: true,
        token,
        user: {
          id: subaccount._id,
          name: subaccount.name,
          email: subaccount.email,
          country: parentAccount?.country || 'ES',
          type: 'subaccount',
          parentAccountId: subaccount.parentAccountId,
        },
      });
    }

    res.status(401).json({ error: 'Credenciales incorrectas' });
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
};

// Subcuentas
export const createSubaccount = async (req: Request, res: Response) => {
  try {
    const { name, email, password, parentAccountId } = req.body;

    if (!parentAccountId) {
      return res.status(400).json({ error: 'parentAccountId es requerido' });
    }

    // Verificar si el email ya existe
    const existsInAccounts = await Account.findOne({ email });
    const existsInSubs = await Subaccount.findOne({ email });

    if (existsInAccounts || existsInSubs) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const newSubaccount = await Subaccount.create({
      _id: Date.now().toString(),
      name,
      email,
      password: hashedPassword,
      type: 'subaccount',
      parentAccountId,
      createdAt: new Date().toISOString(),
    });

    const subObj = newSubaccount.toJSON();
    res.json({ success: true, subaccount: { ...subObj, password: undefined } });
  } catch (error) {
    console.error('Error al crear subcuenta:', error);
    res.status(500).json({ error: 'Error al crear subcuenta' });
  }
};

export const getSubaccounts = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }

    const subaccounts = await Subaccount.find({ parentAccountId: accountId as string });

    const safeSubaccounts = subaccounts.map((acc) => ({
      id: acc._id,
      name: acc.name,
      email: acc.email,
      createdAt: acc.createdAt,
    }));

    res.json(safeSubaccounts);
  } catch (error) {
    console.error('Error al obtener subcuentas:', error);
    res.status(500).json({ error: 'Error al obtener subcuentas' });
  }
};

export const deleteSubaccount = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await Subaccount.findByIdAndDelete(id);

    // Remover la asignación de clientes
    await Client.updateMany(
      { assignedSubaccountId: id },
      { $unset: { assignedSubaccountId: '' } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar subcuenta:', error);
    res.status(500).json({ error: 'Error al eliminar subcuenta' });
  }
};

export const assignClientToSubaccount = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const { subaccountId } = req.body;

    const client = await Client.findById(clientId);

    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    if (subaccountId) {
      client.assignedSubaccountId = subaccountId;
    } else {
      client.assignedSubaccountId = undefined as any;
    }

    await client.save();

    res.json({ success: true, client: client.toJSON() });
  } catch (error) {
    console.error('Error al asignar cliente:', error);
    res.status(500).json({ error: 'Error al asignar cliente' });
  }
};

export const getClientsBySubaccount = async (req: Request, res: Response) => {
  try {
    const { subaccountId } = req.params;

    const clients = await Client.find({ assignedSubaccountId: subaccountId });

    res.json(clients.map(c => c.toJSON()));
  } catch (error) {
    console.error('Error al obtener clientes:', error);
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
};
