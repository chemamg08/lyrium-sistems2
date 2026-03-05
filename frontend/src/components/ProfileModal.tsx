import { useState, useEffect } from "react";
import { X, Plus, Trash2, CreditCard, Check, Calendar } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { authFetch } from '../lib/authFetch';

const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
const stripePromise = stripeKey ? loadStripe(stripeKey) : null;

interface Subaccount {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

interface Subscription {
  id: string;
  accountId: string;
  plan: 'starter' | 'advanced';
  interval: 'monthly' | 'annual';
  status: 'trial' | 'active' | 'expired' | 'canceled';
  trialEndDate: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  autoRenew: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePaymentMethodId: string | null;
  paymentMethod: {
    brand: string;
    last4: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface PlanConfig {
  id: 'starter' | 'advanced';
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  maxSubaccounts: number;
  features: string[];
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
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
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={!stripe || isProcessing} className="flex-1">
          {isProcessing ? t('profile.processing') : t('profile.pay')}
        </Button>
        <Button type="button" onClick={onCancel} variant="outline" disabled={isProcessing}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
};

const ProfileModal = ({ isOpen, onClose }: ProfileModalProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"billing" | "subaccounts">("subaccounts");
  const [subaccounts, setSubaccounts] = useState<Subaccount[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const [isLoading, setIsLoading] = useState(false);
  
  // Billing states
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'advanced'>('starter');
  const [selectedInterval, setSelectedInterval] = useState<'monthly' | 'annual'>('monthly');
  const [autoRenew, setAutoRenew] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [setupIntentId, setSetupIntentId] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);

  const PLANS: PlanConfig[] = [
    {
      id: 'starter',
      name: t('profile.planStarter'),
      monthlyPrice: 250,
      annualPrice: 2700,
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

  useEffect(() => {
    if (isOpen) {
      if (activeTab === "subaccounts") {
        loadSubaccounts();
      } else if (activeTab === "billing") {
        loadSubscription();
      }
    }
  }, [isOpen, activeTab]);

  const loadSubaccounts = async () => {
    try {
      const accountId = sessionStorage.getItem('accountId');
      if (!accountId) return;
      
      const response = await authFetch(`${API_URL}/accounts/subaccounts?accountId=${accountId}`);
      if (response.ok) {
        const data = await response.json();
        setSubaccounts(data);
      }
    } catch (error) {
      console.error('Error al cargar subcuentas:', error);
    }
  };

  const loadSubscription = async () => {
    try {
      const accountId = sessionStorage.getItem('accountId');
      if (!accountId) return;
      
      const response = await authFetch(`${API_URL}/subscriptions?accountId=${accountId}`);
      if (response.ok) {
        const data = await response.json();
        setSubscription(data);
      }
    } catch (error) {
      console.error('Error al cargar suscripción:', error);
    }
  };

  const handleSubscribe = async () => {
    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) {
      toast({ title: t('profile.errorNoAccount'), variant: 'destructive' });
      return;
    }

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
        toast({ title: t('profile.errorCreatePayment'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('profile.errorCreatePayment'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentSuccess = async () => {
    setShowPaymentModal(false);
    setClientSecret(null);
    setPaymentIntentId(null);
    setSetupIntentId(null);
    setSubscriptionId(null);
    await loadSubscription();
    toast({ title: t('profile.paymentSuccess') });
  };

  const handlePaymentCancel = () => {
    setShowPaymentModal(false);
    setClientSecret(null);
    setPaymentIntentId(null);
    setSetupIntentId(null);
    setSubscriptionId(null);
  };

  const handleChangePlan = async () => {
    if (!subscription) return;
    
    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) return;

    // Si no hay suscripción Stripe activa (ej: quitó la tarjeta), usar flujo de pago nuevo
    if (!subscription.stripeSubscriptionId) {
      if (confirm(t('profile.changePlanConfirm'))) {
        await handleSubscribe();
      }
      return;
    }

    if (confirm(t('profile.changePlanConfirm'))) {
      setIsLoading(true);
      try {
        const response = await authFetch(`${API_URL}/subscriptions/change-plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId,
            newPlan: selectedPlan,
            newInterval: selectedInterval,
          }),
        });

        if (response.ok) {
          await loadSubscription();
          toast({ title: t('profile.planChanged') });
        } else {
          toast({ title: t('profile.errorChangePlan'), variant: 'destructive' });
        }
      } catch (error) {
        console.error('Error:', error);
        toast({ title: t('profile.errorChangePlan'), variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleCancelAutoRenew = async () => {
    if (!confirm(t('profile.cancelAutoRenewConfirm'))) {
      return;
    }

    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) return;

    setIsLoading(true);
    try {
      const response = await authFetch(`${API_URL}/subscriptions/cancel-auto-renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });

      if (response.ok) {
        await loadSubscription();
        setShowCardModal(false);
        toast({ title: t('profile.autoRenewCancelled') });
      } else {
        toast({ title: t('profile.errorCancelRenew'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('profile.errorCancelRenew'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const handleCreateSubaccount = async () => {
    if (!formData.name || !formData.email || !formData.password) {
      toast({ title: t('profile.fillAllFields'), variant: 'destructive' });
      return;
    }

    const parentAccountId = sessionStorage.getItem('accountId');
    if (!parentAccountId) {
      toast({ title: t('profile.errorNoAccount'), variant: 'destructive' });
      return;
    }

    const currentPlan = PLANS.find(p => p.id === (subscription?.plan || 'starter'));
    const maxAllowed = currentPlan?.maxSubaccounts ?? 4;
    if (subaccounts.length >= maxAllowed) {
      toast({ title: t('profile.subaccountLimitReached', { max: maxAllowed, plan: currentPlan?.name ?? '' }), variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const response = await authFetch(`${API_URL}/accounts/subaccounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, parentAccountId }),
      });

      if (response.ok) {
        setFormData({ name: "", email: "", password: "" });
        setShowCreateForm(false);
        loadSubaccounts();
      } else {
        const error = await response.json();
        toast({ title: error.error || t('profile.errorCreateSub'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('profile.errorCreateSub'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSubaccount = async (id: string) => {
    if (!confirm(t('profile.deleteSubConfirm'))) return;

    try {
      const response = await authFetch(`${API_URL}/accounts/subaccounts/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        loadSubaccounts();
      } else {
        toast({ title: t('profile.errorDeleteSub'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('profile.errorDeleteSub'), variant: 'destructive' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 md:p-0">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-4xl h-[90vh] md:h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b">
          <h2 className="text-xl md:text-2xl font-bold">{t('profile.title')}</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Sidebar → horizontal tabs on mobile */}
          <div className="flex md:flex-col md:w-48 md:flex-none border-b md:border-b-0 md:border-r bg-muted/30 p-2 md:p-4 gap-1">
            <button
              onClick={() => setActiveTab("billing")}
              className={`flex-1 md:flex-none md:w-full text-center md:text-left px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === "billing"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {t('profile.billing')}
            </button>
            <button
              onClick={() => setActiveTab("subaccounts")}
              className={`flex-1 md:flex-none md:w-full text-center md:text-left px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === "subaccounts"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {t('profile.subaccounts')}
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 p-3 md:p-6 overflow-y-auto">
            {activeTab === "billing" && (
              <div>
                {/* Header con botón Tarjeta */}
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold">{t('profile.billing')}</h3>
                  {subscription?.autoRenew && subscription?.paymentMethod && (
                    <Button 
                      onClick={() => setShowCardModal(true)} 
                      variant="outline" 
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <CreditCard className="h-4 w-4" />
                      {t('profile.cardBtn')}
                    </Button>
                  )}
                </div>

                {/* Indicador de fecha */}
                {subscription && (
                  <div className="bg-muted/50 border border-border rounded-lg p-4 mb-6 flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium">
                        {subscription.status === 'trial' 
                          ? t('profile.trialUntil') 
                          : subscription.autoRenew 
                            ? t('profile.nextRenewal') 
                            : t('profile.expiresOn')}
                      </p>
                      <p className="text-lg font-semibold text-primary">
                        {formatDate(subscription.currentPeriodEnd)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Mostrar plan actual si existe */}
                {subscription && subscription.status !== 'trial' && (
                  <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
                    <p className="text-sm font-medium text-green-800 dark:text-green-200">
                      {t('profile.currentPlan')} {subscription.plan === 'starter' ? t('profile.planStarter') : t('profile.planAdvanced')} ({subscription.interval === 'monthly' ? t('profile.monthly') : t('profile.annual')})
                    </p>
                  </div>
                )}

                {/* Tarjetas de precios */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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
                        <p className="text-2xl font-bold mb-3">{plan.monthlyPrice}€<span className="text-sm font-normal text-muted-foreground">{t('profile.perMonth')}</span></p>
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
                        <p className="text-2xl font-bold mb-1">{plan.annualPrice}€<span className="text-sm font-normal text-muted-foreground">{t('profile.perYear')}</span></p>
                        <p className="text-xs text-green-600 dark:text-green-400 mb-3">
                          {t('profile.savePerYear', { amount: plan.monthlyPrice * 12 - plan.annualPrice })}
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

                {/* Switch de renovación automática */}
                <div className="bg-muted/50 border border-border rounded-lg p-4 mb-4">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <p className="font-medium">{t('profile.autoRenewLabel')}</p>
                      <p className="text-xs text-muted-foreground">{t('profile.autoRenewDesc')}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoRenew}
                      onChange={(e) => setAutoRenew(e.target.checked)}
                      className="w-5 h-5 rounded"
                    />
                  </label>
                </div>

                {/* Botones de acción */}
                <div className="flex gap-3">
                  {subscription && subscription.status === 'active' ? (
                    <Button onClick={handleChangePlan} disabled={isLoading} className="flex-1">
                      {t('profile.changePlan')}
                    </Button>
                  ) : (
                    <Button onClick={handleSubscribe} disabled={isLoading} className="flex-1">
                      {t('profile.subscribe')}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {activeTab === "subaccounts" && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold">{t('profile.subaccounts')}</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {subaccounts.length} / {PLANS.find(p => p.id === (subscription?.plan || 'starter'))?.maxSubaccounts ?? 4}
                    </span>
                    <Button
                      onClick={() => setShowCreateForm(!showCreateForm)}
                      size="sm"
                      disabled={subaccounts.length >= (PLANS.find(p => p.id === (subscription?.plan || 'starter'))?.maxSubaccounts ?? 4)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {t('profile.createSubaccount')}
                    </Button>
                  </div>
                </div>

                {showCreateForm && (
                  <div className="bg-muted/50 p-4 rounded-lg mb-6">
                    <h4 className="font-medium mb-4">{t('profile.newSubaccountTitle')}</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium">{t('profile.nameLabel')}</label>
                        <Input
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder={t('profile.namePlaceholder')}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">{t('profile.emailLabel')}</label>
                        <Input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder={t('profile.emailPlaceholder')}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">{t('profile.passwordLabel')}</label>
                        <Input
                          type="password"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          placeholder="••••••••"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleCreateSubaccount} disabled={isLoading}>
                          {t('profile.createBtn')}
                        </Button>
                        <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                          {t('common.cancel')}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid gap-4">
                  {subaccounts.length === 0 ? (
                    <div className="text-center text-muted-foreground py-12">
                        {t('profile.noSubaccounts')}
                    </div>
                  ) : (
                    subaccounts.map((subaccount) => (
                      <div
                        key={subaccount.id}
                        className="bg-card border rounded-lg p-4 flex items-center justify-between hover:shadow-md transition-shadow"
                      >
                        <div>
                          <h4 className="font-medium">{subaccount.name}</h4>
                          <p className="text-sm text-muted-foreground">{subaccount.email}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t('profile.createdAt')} {new Date(subaccount.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteSubaccount(subaccount.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Tarjeta */}
      {showCardModal && subscription?.paymentMethod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 md:p-0" onClick={() => setShowCardModal(false)}>
          <div className="bg-background rounded-lg shadow-xl w-[95vw] max-w-md p-4 md:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t('profile.paymentMethodTitle')}</h3>
              <button onClick={() => setShowCardModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-muted/50 border border-border rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-8 w-8 text-primary" />
                  <div>
                    <p className="font-medium capitalize">{subscription.paymentMethod.brand}</p>
                    <p className="text-sm text-muted-foreground">•••• {subscription.paymentMethod.last4}</p>
                  </div>
                </div>
              </div>
            </div>

            <Button 
              onClick={handleCancelAutoRenew} 
              disabled={isLoading}
              variant="destructive" 
              className="w-full flex items-center justify-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {t('profile.removeCardBtn')}
            </Button>
          </div>
        </div>
      )}

      {/* Modal de Pago */}
      {showPaymentModal && clientSecret && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2 md:p-0">
          <div className="bg-background rounded-lg shadow-xl w-[95vw] max-w-md p-4 md:p-6">
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
                  accountId={sessionStorage.getItem('accountId') || ''}
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
    </div>
  );
};

export default ProfileModal;
