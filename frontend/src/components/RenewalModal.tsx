import { useState } from 'react';
import { X, Check, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/use-toast';
import { authFetch } from '../lib/authFetch';
import { formatPrice, getCurrencyForCountry } from '../i18n';

const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
const stripePromise = stripeKey ? loadStripe(stripeKey) : null;
const API_URL = import.meta.env.VITE_API_URL;

interface RenewalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  accountId: string;
  userEmail: string;
  userCountry?: string;
}

interface PlanConfig {
  id: 'starter' | 'advanced';
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  maxSubaccounts: number;
  features: string[];
}

// Componente de Formulario de Pago
interface PaymentFormProps {
  clientSecret: string;
  accountId: string;
  plan: 'starter' | 'advanced';
  interval: 'monthly' | 'annual';
  paymentIntentId?: string;
  setupIntentId?: string;
  subscriptionId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const PaymentForm = ({ clientSecret, accountId, plan, interval, paymentIntentId, setupIntentId, subscriptionId, onSuccess, onCancel }: PaymentFormProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setIsProcessing(false);
      return;
    }

    try {
      // Si hay setupIntentId, es renovación automática (guardar tarjeta, cobrar al fin del trial)
      if (setupIntentId) {
        const { error, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
          payment_method: {
            card: cardElement,
          },
        });

        if (error) {
          setErrorMessage(error.message || t('profile.errorSaveCard'));
        } else if (setupIntent?.status === 'succeeded') {
          // Confirmar en el backend
          const response = await authFetch(`${API_URL}/subscriptions/confirm-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountId,
              plan,
              interval,
              setupIntentId,
              subscriptionId,
            }),
          });

          if (response.ok) {
            onSuccess();
          } else {
            setErrorMessage(t('profile.errorConfirmSub'));
          }
        }
      } else if (paymentIntentId) {
        // Pago único sin renovación automática (cobro inmediato)
        const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
          payment_method: {
            card: cardElement,
          },
        });

        if (error) {
          setErrorMessage(error.message || t('profile.errorProcessPayment'));
        } else if (paymentIntent?.status === 'succeeded') {
          // Confirmar en el backend
          const response = await authFetch(`${API_URL}/subscriptions/confirm-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountId,
              plan,
              interval,
              paymentIntentId,
              subscriptionId,
            }),
          });

          if (response.ok) {
            onSuccess();
          } else {
            setErrorMessage(t('profile.errorConfirmPayment'));
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setErrorMessage(t('profile.errorProcessPayment'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-muted/30 p-4 rounded-lg">
        <label className="text-sm font-medium mb-2 block">{t('profile.paymentInfoLabel')}</label>
        <div className="bg-background border border-border rounded-md p-3">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#424770',
                  '::placeholder': {
                    color: '#aab7c4',
                  },
                },
                invalid: {
                  color: '#9e2146',
                },
              },
            }}
          />
        </div>
      </div>

      {errorMessage && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
          <p className="text-sm text-destructive">{errorMessage}</p>
        </div>
      )}

      <div className="flex gap-3">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1"
        >
          {t('common.cancel')}
        </Button>
        <Button 
          type="submit" 
          disabled={!stripe || isProcessing}
          className="flex-1"
        >
          {isProcessing ? t('profile.processing') : t('renewal.continueToPayment')}
        </Button>
      </div>
    </form>
  );
};

const RenewalModal = ({ isOpen, onClose, onSuccess, accountId, userEmail, userCountry = 'ES' }: RenewalModalProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const currency = getCurrencyForCountry(userCountry);
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'advanced'>('starter');
  const [selectedInterval, setSelectedInterval] = useState<'monthly' | 'annual'>('monthly');
  const [autoRenew, setAutoRenew] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [setupIntentId, setSetupIntentId] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);

  const PLANS: PlanConfig[] = [
    {
      id: 'starter',
      name: t('profile.planStarter'),
      monthlyPrice: 197,
      annualPrice: 2100,
      maxSubaccounts: 4,
      features: [t('profile.featureUpTo4'), t('profile.featureAllFeatures'), t('profile.featurePrioritySupport')]
    },
    {
      id: 'advanced',
      name: t('profile.planAdvanced'),
      monthlyPrice: 350,
      annualPrice: 3700,
      maxSubaccounts: 10,
      features: [t('profile.featureUpTo10'), t('profile.featureAllFeatures'), t('profile.featurePrioritySupport')]
    }
  ];

  const handleSubscribe = async () => {
    setIsLoading(true);
    try {
      const response = await authFetch(`${API_URL}/subscriptions/payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          plan: selectedPlan,
          interval: selectedInterval,
          autoRenew,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setClientSecret(data.clientSecret);
        setPaymentIntentId(data.paymentIntentId || null);
        setSetupIntentId(data.setupIntentId || null);
        setSubscriptionId(data.subscriptionId || null);
        setShowPaymentModal(true);
      } else {
        toast({ title: t('renewal.errorCreatePayment'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('renewal.errorCreatePayment'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentSuccess = () => {
    setShowPaymentModal(false);
    setClientSecret(null);
    setPaymentIntentId(null);
    setSetupIntentId(null);
    setSubscriptionId(null);
    toast({ title: t('renewal.paymentSuccess') });
    if (onSuccess) onSuccess();
    else onClose();
  };

  const handlePaymentCancel = () => {
    setShowPaymentModal(false);
    setClientSecret(null);
    setPaymentIntentId(null);
    setSetupIntentId(null);
    setSubscriptionId(null);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Modal Principal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-background rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <div>
              <h2 className="text-2xl font-bold">{t('renewal.title')}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t('renewal.account')} {userEmail}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            <p className="text-muted-foreground mb-6">
              {t('renewal.description')}
            </p>

            {/* Tarjetas de precios */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {PLANS.map((plan) => (
                <div key={plan.id}>
                  {/* Mensual */}
                  <div
                    onClick={() => {
                      setSelectedPlan(plan.id);
                      setSelectedInterval('monthly');
                    }}
                    className={`border-2 rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${
                      selectedPlan === plan.id && selectedInterval === 'monthly'
                        ? 'border-primary bg-primary/5'
                        : 'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-semibold">{plan.name}</h4>
                        <p className="text-xs text-muted-foreground">{t('profile.monthly')}</p>
                      </div>
                      {selectedPlan === plan.id && selectedInterval === 'monthly' && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <p className="text-2xl font-bold mb-3">
                      {formatPrice(plan.monthlyPrice, currency)}<span className="text-sm font-normal text-muted-foreground">{t('profile.perMonth')}</span>
                    </p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {plan.features.map((feature, idx) => (
                        <li key={idx}>• {feature}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Anual */}
                  <div
                    onClick={() => {
                      setSelectedPlan(plan.id);
                      setSelectedInterval('annual');
                    }}
                    className={`border-2 rounded-lg p-4 cursor-pointer transition-all hover:shadow-md mt-3 ${
                      selectedPlan === plan.id && selectedInterval === 'annual'
                        ? 'border-primary bg-primary/5'
                        : 'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-semibold">{plan.name}</h4>
                        <p className="text-xs text-muted-foreground">{t('profile.annual')}</p>
                      </div>
                      {selectedPlan === plan.id && selectedInterval === 'annual' && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <p className="text-2xl font-bold mb-1">
                      {formatPrice(plan.annualPrice, currency)}<span className="text-sm font-normal text-muted-foreground">{t('profile.perYear')}</span>
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mb-3">
                      {t('profile.savePerYear', { amount: formatPrice(plan.monthlyPrice * 12 - plan.annualPrice, currency) })}
                    </p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {plan.features.map((feature, idx) => (
                        <li key={idx}>• {feature}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>

            {/* Renovación Automática */}
            <div className="bg-muted/30 border border-border rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">{t('renewal.autoRenewTitle')}</p>
                    <p className="text-xs text-muted-foreground">
                      {autoRenew 
                        ? t('renewal.autoRenewOnDesc')
                        : t('renewal.autoRenewOffDesc')}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={autoRenew}
                  onCheckedChange={setAutoRenew}
                />
              </div>
            </div>

            {/* Botón de pago */}
            <Button 
              onClick={handleSubscribe} 
              disabled={isLoading}
              className="w-full"
              size="lg"
            >
              {isLoading ? t('renewal.processing') : t('renewal.continueToPayment')}
            </Button>
          </div>
        </div>
      </div>

      {/* Modal de Pago */}
      {showPaymentModal && clientSecret && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold">{t('profile.paymentInfoTitle')}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedPlan === 'starter' ? t('profile.planStarter') : t('profile.planAdvanced')} - {selectedInterval === 'monthly' ? t('profile.monthly') : t('profile.annual')}
                </p>
              </div>
            </div>

            {stripePromise ? (
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <PaymentForm 
                  clientSecret={clientSecret}
                  accountId={accountId}
                  plan={selectedPlan}
                  interval={selectedInterval}
                  paymentIntentId={paymentIntentId || undefined}
                  setupIntentId={setupIntentId || undefined}
                  subscriptionId={subscriptionId || undefined}
                  onSuccess={handlePaymentSuccess}
                  onCancel={handlePaymentCancel}
                />
              </Elements>
            ) : (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4 text-sm text-destructive">
                {t('profile.stripeConfigError', 'Stripe is not configured. Please set the VITE_STRIPE_PUBLISHABLE_KEY environment variable.')}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default RenewalModal;
