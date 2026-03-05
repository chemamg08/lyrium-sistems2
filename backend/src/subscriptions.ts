import { Request, Response, Router } from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { Subscription } from './models/Subscription.js';
import { Account } from './models/Account.js';

// Cargar variables de entorno
dotenv.config();

// Configuración de Stripe (usar claves de test inicialmente)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_YOUR_SECRET_KEY', {
  apiVersion: '2026-02-25.clover',
});

interface PlanConfig {
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  stripePriceIdMonthly: string;
  stripePriceIdAnnual: string;
  maxSubaccounts: number;
}

// Configuración de planes
const PLANS: Record<'starter' | 'advanced', PlanConfig> = {
  starter: {
    name: 'Starter',
    monthlyPrice: 250,
    annualPrice: 2700,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || 'price_starter_monthly',
    stripePriceIdAnnual: process.env.STRIPE_PRICE_STARTER_ANNUAL || 'price_starter_annual',
    maxSubaccounts: 4,
  },
  advanced: {
    name: 'Avanzado',
    monthlyPrice: 350,
    annualPrice: 3700,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_ADVANCED_MONTHLY || 'price_advanced_monthly',
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ADVANCED_ANNUAL || 'price_advanced_annual',
    maxSubaccounts: 10,
  },
};

const calculateTrialEndDate = (): string => {
  const date = new Date();
  date.setDate(date.getDate() + 14); // 14 días de prueba
  return date.toISOString();
};

// ============= CONTROLLERS =============

// Crear suscripción inicial (automático al crear cuenta)
export const createTrialSubscription = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }

    // Verificar si ya existe una suscripción
    const existing = await Subscription.findOne({ accountId });
    if (existing) {
      return res.status(400).json({ error: 'La cuenta ya tiene una suscripción' });
    }

    const now = new Date().toISOString();
    const trialEndDate = calculateTrialEndDate();

    const newSubscription = await Subscription.create({
      _id: Date.now().toString(),
      accountId,
      plan: 'starter',
      interval: 'monthly',
      status: 'trial',
      trialEndDate,
      currentPeriodStart: now,
      currentPeriodEnd: trialEndDate,
      autoRenew: false,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePaymentMethodId: null,
      paymentMethod: null,
      createdAt: now,
      updatedAt: now,
    });

    res.json({ success: true, subscription: newSubscription.toJSON() });
  } catch (error) {
    console.error('Error al crear suscripción de prueba:', error);
    res.status(500).json({ error: 'Error al crear suscripción de prueba' });
  }
};

// Obtener suscripción por accountId
export const getSubscription = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }

    const subscription = await Subscription.findOne({ accountId: accountId as string });

    if (!subscription) {
      return res.status(404).json({ error: 'Suscripción no encontrada' });
    }

    res.json(subscription.toJSON());
  } catch (error) {
    console.error('Error al obtener suscripción:', error);
    res.status(500).json({ error: 'Error al obtener suscripción' });
  }
};

// Crear Setup Intent o Subscription (para formulario embebido)
export const createPaymentIntent = async (req: Request, res: Response) => {
  try {
    const { accountId, plan, interval, autoRenew } = req.body;

    if (!accountId || !plan || !interval) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    const planConfig = PLANS[plan as 'starter' | 'advanced'];
    if (!planConfig) {
      return res.status(400).json({ error: 'Plan no válido' });
    }

    const amount = interval === 'monthly' ? planConfig.monthlyPrice : planConfig.annualPrice;

    let subscription = await Subscription.findOne({ accountId });

    // Crear o obtener Stripe Customer
    let customerId = subscription?.stripeCustomerId;
    
    // Leer email del usuario desde Account model
    let userEmail: string | undefined;
    try {
      const account = await Account.findById(accountId);
      userEmail = account?.email;
    } catch (error) {
      console.error('Error al leer email del usuario:', error);
    }
    
    if (!customerId) {
      // Crear nuevo customer con email
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { accountId },
      });
      customerId = customer.id;
      
      // Actualizar suscripción con customerId
      if (subscription) {
        await Subscription.updateOne(
          { accountId },
          { stripeCustomerId: customerId, updatedAt: new Date().toISOString() }
        );
        subscription.stripeCustomerId = customerId;
      }
    } else {
      // Verificar que el customer existe en Stripe, si no crear uno nuevo
      try {
        const existingCustomer = await stripe.customers.retrieve(customerId);
        if (existingCustomer && !existingCustomer.deleted && !existingCustomer.email && userEmail) {
          await stripe.customers.update(customerId, {
            email: userEmail,
          });
        }
      } catch (error: any) {
        if (error?.code === 'resource_missing' || error?.statusCode === 404) {
          console.log(`Customer ${customerId} no existe en Stripe, creando uno nuevo...`);
          const newCustomer = await stripe.customers.create({
            email: userEmail,
            metadata: { accountId },
          });
          customerId = newCustomer.id;
          if (subscription) {
            await Subscription.updateOne(
              { accountId },
              { stripeCustomerId: customerId, updatedAt: new Date().toISOString() }
            );
            subscription.stripeCustomerId = customerId;
          }
        } else {
          console.error('Error al verificar customer:', error);
        }
      }
    }

    if (autoRenew) {
      // Renovación automática: guardar tarjeta y cobrar al finalizar el trial
      const priceId = interval === 'monthly' 
        ? planConfig.stripePriceIdMonthly 
        : planConfig.stripePriceIdAnnual;

      // Si ya tiene una suscripción Stripe activa, cancelarla antes de crear una nueva
      if (subscription?.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
          subscription.stripeSubscriptionId = null;
          await subscription.save();
        } catch (cancelErr: any) {
          console.log('Error cancelando suscripción anterior:', cancelErr?.message);
        }
      }

      // Calcular fecha de fin del trial (desde la suscripción actual)
      // Solo dar trial si el usuario está actualmente en trial con fecha futura
      let trialEndTimestamp: number | undefined;
      const now = Math.floor(Date.now() / 1000);
      if (subscription && subscription.status === 'trial' && subscription.trialEndDate) {
        const trialEndDate = new Date(subscription.trialEndDate);
        const ts = Math.floor(trialEndDate.getTime() / 1000);
        // Solo usar trial_end si está en el futuro
        if (ts > now) {
          trialEndTimestamp = ts;
        }
      }
      // Si el usuario ya consumió su trial, trialEndTimestamp queda undefined
      // y Stripe cobrará de inmediato (sin periodo de prueba)

      // Crear suscripción con trial - Stripe cobrará automáticamente al finalizar
      const stripeSubscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        ...(trialEndTimestamp ? { trial_end: trialEndTimestamp } : { payment_behavior: 'default_incomplete' }),
        ...(trialEndTimestamp ? {} : { expand: ['latest_invoice.payment_intent'] }),
        payment_settings: { 
          payment_method_types: ['card'],
          save_default_payment_method: 'on_subscription' 
        },
        metadata: {
          accountId,
          plan,
          interval,
        },
      });

      if (trialEndTimestamp) {
        // Trial activo: crear SetupIntent para guardar la tarjeta sin cobrar
        const setupIntent = await stripe.setupIntents.create({
          customer: customerId,
          usage: 'off_session',
          metadata: {
            accountId,
            subscription_id: stripeSubscription.id,
          },
        });

        res.json({ 
          clientSecret: setupIntent.client_secret,
          setupIntentId: setupIntent.id,
          subscriptionId: stripeSubscription.id,
          customerId 
        });
      } else {
        // Trial expirado + autoRenew: usar SetupIntent (igual que trial activo)
        // Al vincular el PM a la suscripción, Stripe pagará la invoice pendiente automáticamente
        const setupIntent = await stripe.setupIntents.create({
          customer: customerId,
          usage: 'off_session',
          metadata: {
            accountId,
            subscription_id: stripeSubscription.id,
          },
        });

        res.json({ 
          clientSecret: setupIntent.client_secret,
          setupIntentId: setupIntent.id,
          subscriptionId: stripeSubscription.id,
          customerId 
        });
      }
    } else {
      // Pago único (sin renovación automática)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, // Convertir a centavos
        currency: 'eur',
        customer: customerId,
        setup_future_usage: undefined,
        metadata: {
          accountId,
          plan,
          interval,
          autoRenew: 'false',
        },
      });

      res.json({ 
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        customerId 
      });
    }
  } catch (error) {
    console.error('Error al crear payment intent:', error);
    res.status(500).json({ error: 'Error al crear payment intent' });
  }
};

// Confirmar pago exitoso
export const confirmPayment = async (req: Request, res: Response) => {
  try {
    const { accountId, plan, interval, paymentIntentId, setupIntentId, subscriptionId } = req.body;

    if (!accountId || !plan || !interval) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    let subscription = await Subscription.findOne({ accountId });

    if (!subscription) {
      return res.status(404).json({ error: 'Suscripción no encontrada' });
    }

    const now = new Date().toISOString();
    let periodEnd: Date;

    // Obtener método de pago
    let paymentMethod = null;
    
    if (setupIntentId && subscriptionId) {
      // Renovación automática con SetupIntent: tarjeta guardada, cobro al final del trial
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      
      if (setupIntent.payment_method) {
        const paymentMethodId = setupIntent.payment_method as string;
        const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
        
        if (pm.card) {
          paymentMethod = {
            brand: pm.card.brand,
            last4: pm.card.last4,
          };
          subscription.stripePaymentMethodId = pm.id;
        }
        
        // Vincular el payment method a la suscripción
        await stripe.subscriptions.update(subscriptionId, {
          default_payment_method: paymentMethodId,
        });

        // Si el trial ya expiró, pagar la factura pendiente con la tarjeta recién guardada
        const trialEnd = subscription.trialEndDate ? new Date(subscription.trialEndDate) : null;
        if (!trialEnd || trialEnd <= new Date()) {
          const stripeSub = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ['latest_invoice'],
          });
          const latestInvoice = stripeSub.latest_invoice as Stripe.Invoice;
          if (latestInvoice && latestInvoice.status === 'open') {
            await stripe.invoices.pay(latestInvoice.id);
          }
        }
      }

      // Con autoRenew, calcular periodo según si el trial sigue activo o ya expiró
      if (subscription.trialEndDate) {
        const trialEnd = new Date(subscription.trialEndDate);
        if (trialEnd > new Date()) {
          // Trial activo: el periodo termina cuando expire el trial
          periodEnd = trialEnd;
        } else {
          // Trial expirado: el periodo empieza ahora + intervalo
          periodEnd = new Date();
          if (interval === 'monthly') {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
          } else {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
          }
        }
      } else {
        // Sin trialEndDate: usar el intervalo contratado
        periodEnd = new Date();
        if (interval === 'monthly') {
          periodEnd.setMonth(periodEnd.getMonth() + 1);
        } else {
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        }

        // Sumar días restantes del periodo activo anterior (para no perderlos)
        if (subscription.status === 'active' && subscription.currentPeriodEnd) {
          const prevPeriodEnd = new Date(subscription.currentPeriodEnd);
          const nowDate = new Date();
          if (prevPeriodEnd > nowDate) {
            const remainingDays = Math.ceil((prevPeriodEnd.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24));
            periodEnd.setDate(periodEnd.getDate() + remainingDays);
          }
        }
      }
    } else if (paymentIntentId) {
      // Pago con cobro inmediato (puede ser autoRenew con trial expirado o pago único)
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (subscriptionId) {
        // Con autoRenew: obtener el PM desde la Stripe Subscription
        // (save_default_payment_method: 'on_subscription' lo guarda automáticamente al pagar la invoice)
        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
        const defaultPm = stripeSub.default_payment_method;
        
        if (defaultPm) {
          const pmId = typeof defaultPm === 'string' ? defaultPm : defaultPm.id;
          const pm = await stripe.paymentMethods.retrieve(pmId);
          if (pm.card) {
            paymentMethod = {
              brand: pm.card.brand,
              last4: pm.card.last4,
            };
            subscription.stripePaymentMethodId = pm.id;
          }
        } else if (paymentIntent.payment_method) {
          // Fallback: adjuntar manualmente el PM del PaymentIntent
          const paymentMethodId = paymentIntent.payment_method as string;
          try {
            await stripe.paymentMethods.attach(paymentMethodId, {
              customer: subscription.stripeCustomerId!,
            });
          } catch (attachError: any) {
            console.log('PM attach skip:', attachError?.message);
          }
          await stripe.subscriptions.update(subscriptionId, {
            default_payment_method: paymentMethodId,
          });
          const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
          if (pm.card) {
            paymentMethod = {
              brand: pm.card.brand,
              last4: pm.card.last4,
            };
            subscription.stripePaymentMethodId = pm.id;
          }
        }
      } else if (paymentIntent.payment_method) {
        // Pago único sin autoRenew — solo guardar info de la tarjeta
        const paymentMethodId = paymentIntent.payment_method as string;
        const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
        if (pm.card) {
          paymentMethod = {
            brand: pm.card.brand,
            last4: pm.card.last4,
          };
          subscription.stripePaymentMethodId = pm.id;
        }
      }

      // Calcular periodo: fecha actual + intervalo + días de trial restantes
      periodEnd = new Date();
      if (interval === 'monthly') {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      } else {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      }

      // Sumar días de prueba restantes
      if (subscription.status === 'trial' && subscription.trialEndDate) {
        const trialEndDate = new Date(subscription.trialEndDate);
        const nowDate = new Date();
        if (trialEndDate > nowDate) {
          const remainingDays = Math.ceil((trialEndDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24));
          periodEnd.setDate(periodEnd.getDate() + remainingDays);
        }
      }

      // Sumar días restantes del plan activo anterior (cambio de plan sin auto-renovación)
      if (subscription.status === 'active' && subscription.currentPeriodEnd) {
        const prevPeriodEnd = new Date(subscription.currentPeriodEnd);
        const nowDate = new Date();
        if (prevPeriodEnd > nowDate) {
          const remainingDays = Math.ceil((prevPeriodEnd.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24));
          periodEnd.setDate(periodEnd.getDate() + remainingDays);
        }
      }
    } else {
      return res.status(400).json({ error: 'Se requiere paymentIntentId o setupIntentId' });
    }

    subscription.plan = plan as 'starter' | 'advanced';
    subscription.interval = interval as 'monthly' | 'annual';
    subscription.status = 'active';
    subscription.trialEndDate = null;
    subscription.currentPeriodStart = now;
    subscription.currentPeriodEnd = periodEnd.toISOString();
    subscription.autoRenew = !!subscriptionId;
    subscription.stripeSubscriptionId = subscriptionId || null;
    subscription.paymentMethod = paymentMethod;
    subscription.updatedAt = now;

    await subscription.save();

    res.json({ success: true, subscription: subscription.toJSON() });
  } catch (error) {
    console.error('Error al confirmar pago:', error);
    res.status(500).json({ error: 'Error al confirmar pago' });
  }
};

// Webhook de Stripe
export const handleWebhook = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const { accountId, plan, interval, autoRenew } = session.metadata || {};

        if (!accountId) break;

        const subscription = await Subscription.findOne({ accountId });
        const now = new Date().toISOString();

        // Calcular currentPeriodEnd
        let periodEnd = new Date();
        if (interval === 'monthly') {
          periodEnd.setMonth(periodEnd.getMonth() + 1);
        } else {
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        }

        // Si hay días de prueba restantes, sumarlos
        if (subscription?.status === 'trial' && subscription.trialEndDate) {
          const trialEndDate = new Date(subscription.trialEndDate);
          const nowDate = new Date();
          if (trialEndDate > nowDate) {
            const remainingDays = Math.ceil((trialEndDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24));
            periodEnd.setDate(periodEnd.getDate() + remainingDays);
          }
        }

        if (subscription) {
          subscription.plan = plan as 'starter' | 'advanced';
          subscription.interval = interval as 'monthly' | 'annual';
          subscription.status = 'active';
          subscription.trialEndDate = null;
          subscription.currentPeriodStart = now;
          subscription.currentPeriodEnd = periodEnd.toISOString();
          subscription.autoRenew = autoRenew === 'true';
          subscription.stripeCustomerId = session.customer as string;
          subscription.stripeSubscriptionId = session.subscription as string || null;
          subscription.updatedAt = now;
          await subscription.save();
        }
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const { accountId, plan, interval, autoRenew } = paymentIntent.metadata || {};

        if (!accountId || autoRenew === 'true') break; // Las suscripciones se manejan con invoice.paid

        const subscription = await Subscription.findOne({ accountId });
        if (subscription) {
          const now = new Date().toISOString();
          let periodEnd = new Date();

          if (interval === 'monthly') {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
          } else {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
          }

          // Si hay días de prueba restantes, sumarlos
          if (subscription.status === 'trial' && subscription.trialEndDate) {
            const trialEndDate = new Date(subscription.trialEndDate);
            const nowDate = new Date();
            if (trialEndDate > nowDate) {
              const remainingDays = Math.ceil((trialEndDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24));
              periodEnd.setDate(periodEnd.getDate() + remainingDays);
            }
          }

          subscription.plan = plan as 'starter' | 'advanced';
          subscription.interval = interval as 'monthly' | 'annual';
          subscription.status = 'active';
          subscription.trialEndDate = null;
          subscription.currentPeriodStart = now;
          subscription.currentPeriodEnd = periodEnd.toISOString();
          subscription.autoRenew = false;
          subscription.updatedAt = now;

          await subscription.save();
        }
        break;
      }

      case 'payment_method.attached': {
        const paymentMethod = event.data.object as Stripe.PaymentMethod;
        const customerId = paymentMethod.customer as string;

        const subscription = await Subscription.findOne({ stripeCustomerId: customerId });
        if (subscription && paymentMethod.card) {
          subscription.stripePaymentMethodId = paymentMethod.id;
          subscription.paymentMethod = {
            brand: paymentMethod.card.brand,
            last4: paymentMethod.card.last4,
          };
          subscription.updatedAt = new Date().toISOString();
          await subscription.save();
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Solo procesar facturas de renovación, no las prorrateadas de changePlan
        // Las facturas prorrateadas tienen billing_reason 'subscription_update'
        const billingReason = (invoice as any).billing_reason;
        if (billingReason === 'subscription_update') {
          // changePlan ya calculó la fecha correcta, no sobreescribir
          break;
        }

        const subscription = await Subscription.findOne({ stripeCustomerId: customerId });
        if (subscription) {
          const now = new Date().toISOString();
          let periodEnd = new Date();
          
          if (subscription.interval === 'monthly') {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
          } else {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
          }

          subscription.currentPeriodStart = now;
          subscription.currentPeriodEnd = periodEnd.toISOString();
          subscription.status = 'active';
          subscription.updatedAt = now;
          await subscription.save();
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const stripeSubscription = event.data.object as Stripe.Subscription;
        const subscription = await Subscription.findOne({ stripeSubscriptionId: stripeSubscription.id });
        
        if (subscription) {
          // Solo marcar como canceled si el periodo ya expiró
          // Si el usuario canceló auto-renew pero aún tiene tiempo pagado, mantener activo
          const periodEnd = new Date(subscription.currentPeriodEnd);
          if (periodEnd <= new Date()) {
            subscription.status = 'canceled';
          }
          // Siempre limpiar autoRenew y stripeSubscriptionId
          subscription.autoRenew = false;
          subscription.stripeSubscriptionId = null;
          subscription.updatedAt = new Date().toISOString();
          await subscription.save();
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Error processing webhook' });
  }
};

// Cambiar plan
export const changePlan = async (req: Request, res: Response) => {
  try {
    const { accountId, newPlan, newInterval } = req.body;

    if (!accountId || !newPlan || !newInterval) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    const subscription = await Subscription.findOne({ accountId });

    if (!subscription) {
      return res.status(404).json({ error: 'Suscripción no encontrada' });
    }

    if (subscription.status !== 'active') {
      return res.status(400).json({ error: 'Solo se puede cambiar plan en suscripciones activas' });
    }

    // El cambio aplica al próximo ciclo de facturación
    subscription.plan = newPlan;
    subscription.interval = newInterval;
    subscription.updatedAt = new Date().toISOString();

    // Si tiene Stripe subscription activa, actualizar en Stripe
    if (subscription.stripeSubscriptionId) {
      const planConfig = PLANS[newPlan as 'starter' | 'advanced'];
      const newPriceId = newInterval === 'monthly' 
        ? planConfig.stripePriceIdMonthly 
        : planConfig.stripePriceIdAnnual;

      // Obtener la suscripción actual para acceder al subscription item ID
      const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
      const subscriptionItemId = stripeSubscription.items.data[0].id;

      const updatedStripeSub = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        items: [{
          id: subscriptionItemId,
          price: newPriceId,
        }],
        proration_behavior: 'always_invoice',
      });

      // Mantener la fecha de renovación existente (no dar un ciclo completo nuevo)
      // Stripe compensa económicamente con proration, el periodo actual no cambia
      // Solo actualizar si no hay fecha válida
      if (!subscription.currentPeriodEnd || new Date(subscription.currentPeriodEnd) <= new Date()) {
        const newPeriodEnd = new Date();
        if (newInterval === 'monthly') {
          newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
        } else {
          newPeriodEnd.setFullYear(newPeriodEnd.getFullYear() + 1);
        }
        subscription.currentPeriodEnd = newPeriodEnd.toISOString();
      }
    }

    await subscription.save();
    res.json({ success: true, subscription: subscription.toJSON() });
  } catch (error) {
    console.error('Error al cambiar plan:', error);
    res.status(500).json({ error: 'Error al cambiar plan' });
  }
};

// Cancelar renovación automática
export const cancelAutoRenew = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }

    const subscription = await Subscription.findOne({ accountId });

    if (!subscription) {
      return res.status(404).json({ error: 'Suscripción no encontrada' });
    }

    // Cancelar en Stripe si existe
    if (subscription.stripeSubscriptionId) {
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
    }

    // Eliminar método de pago
    if (subscription.stripePaymentMethodId) {
      try {
        await stripe.paymentMethods.detach(subscription.stripePaymentMethodId);
      } catch (err) {
        console.error('Error al eliminar método de pago:', err);
      }
    }

    subscription.autoRenew = false;
    subscription.stripeSubscriptionId = null;
    subscription.stripePaymentMethodId = null;
    subscription.paymentMethod = null;
    subscription.updatedAt = new Date().toISOString();

    await subscription.save();
    res.json({ success: true, subscription: subscription.toJSON() });
  } catch (error) {
    console.error('Error al cancelar renovación:', error);
    res.status(500).json({ error: 'Error al cancelar renovación' });
  }
};

// Validar si la suscripción está activa
export const validateSubscription = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }

    const subscription = await Subscription.findOne({ accountId: accountId as string });

    if (!subscription) {
      return res.json({ valid: false, reason: 'no_subscription' });
    }

    const now = new Date();
    const periodEnd = new Date(subscription.currentPeriodEnd);

    if (periodEnd < now) {
      // Suscripción expirada
      if (subscription.status !== 'expired') {
        subscription.status = 'expired';
        subscription.updatedAt = new Date().toISOString();
        await subscription.save();
      }
      return res.json({ valid: false, reason: 'expired' });
    }

    res.json({ valid: true, subscription: subscription.toJSON() });
  } catch (error) {
    console.error('Error al validar suscripción:', error);
    res.status(500).json({ error: 'Error al validar suscripción' });
  }
};

// ============= ROUTER =============

const router = Router();

router.post('/trial', createTrialSubscription);
router.get('/', getSubscription);
router.post('/payment-intent', createPaymentIntent);
router.post('/confirm-payment', confirmPayment);
router.post('/webhook', handleWebhook);
router.post('/change-plan', changePlan);
router.post('/cancel-auto-renew', cancelAutoRenew);
router.get('/validate', validateSubscription);

export default router;
