import { useState, useEffect } from "react";
import { X, Plus, Trash2, CreditCard, Check, Calendar, Eye, EyeOff, Copy, Key, Webhook } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { authFetch } from '../lib/authFetch';
import { formatPrice, getCurrencyForCountry } from '../i18n';

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

const API_URL = import.meta.env.VITE_API_URL;

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
  const [activeTab, setActiveTab] = useState<"billing" | "subaccounts" | "information" | "integrations">("subaccounts");
  const [subaccounts, setSubaccounts] = useState<Subaccount[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const [isLoading, setIsLoading] = useState(false);

  // Integrations tab states
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [showNewKey, setShowNewKey] = useState<string | null>(null);
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>([]);
  const [newWebhookDesc, setNewWebhookDesc] = useState("");
  
  // Information tab states
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordCode, setPasswordCode] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Billing profile states
  const [billingProfile, setBillingProfile] = useState({
    companyName: '', companyAddress: '', companyPhone: '',
    companyEmail: '', companyCIF: '', invoiceNotes: '',
  });
  const [isSavingBilling, setIsSavingBilling] = useState(false);
  
  // Billing states
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'advanced'>('starter');
  const [selectedInterval, setSelectedInterval] = useState<'monthly' | 'annual'>('monthly');
  const [autoRenew, setAutoRenew] = useState(false);
  const currency = getCurrencyForCountry(sessionStorage.getItem('country') || 'ES');
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

  useEffect(() => {
    if (isOpen) {
      if (activeTab === "subaccounts") {
        loadSubaccounts();
      } else if (activeTab === "billing") {
        loadSubscription();
      } else if (activeTab === "integrations") {
        loadApiKeys();
        loadWebhooks();
      } else if (activeTab === "information") {
        loadBillingProfile();
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

  const loadBillingProfile = async () => {
    try {
      const res = await authFetch(`${API_URL}/accounts/billing-profile`);
      if (res.ok) {
        const data = await res.json();
        setBillingProfile(data);
      }
    } catch (error) {
      console.error('Error loading billing profile:', error);
    }
  };

  const handleSaveBillingProfile = async () => {
    setIsSavingBilling(true);
    try {
      const res = await authFetch(`${API_URL}/accounts/billing-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(billingProfile),
      });
      if (res.ok) {
        const data = await res.json();
        setBillingProfile(data);
        toast({ title: t('profile.billingProfileSaved') });
      } else {
        toast({ title: t('profile.errorSaveBillingProfile'), variant: 'destructive' });
      }
    } catch {
      toast({ title: t('profile.errorSaveBillingProfile'), variant: 'destructive' });
    } finally {
      setIsSavingBilling(false);
    }
  };

  const WEBHOOK_EVENT_OPTIONS = [
    'new_client', 'client_updated', 'client_deleted',
    'contract_generated', 'signature_completed', 'signature_expired',
    'calendar_event_created', 'calendar_event_updated', 'calendar_event_deleted',
    'file_uploaded', 'file_deleted',
    'invoice_created', 'invoice_updated',
  ];

  const loadApiKeys = async () => {
    try {
      const accountId = sessionStorage.getItem('accountId');
      if (!accountId) return;
      const res = await authFetch(`${API_URL}/integrations/keys?accountId=${accountId}`);
      if (res.ok) setApiKeys(await res.json());
    } catch { /* silent */ }
  };

  const loadWebhooks = async () => {
    try {
      const accountId = sessionStorage.getItem('accountId');
      if (!accountId) return;
      const res = await authFetch(`${API_URL}/integrations/webhooks?accountId=${accountId}`);
      if (res.ok) setWebhooks(await res.json());
    } catch { /* silent */ }
  };

  const createApiKey = async () => {
    if (!newKeyName.trim()) return;
    const accountId = sessionStorage.getItem('accountId');
    try {
      const res = await authFetch(`${API_URL}/integrations/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, name: newKeyName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowNewKey(data.key);
        setNewKeyName('');
        loadApiKeys();
        toast({ title: t('profile.intKeyCreated') });
      }
    } catch { toast({ title: t('common.error'), variant: 'destructive' }); }
  };

  const revokeApiKey = async (keyId: string) => {
    const accountId = sessionStorage.getItem('accountId');
    try {
      await authFetch(`${API_URL}/integrations/keys/${keyId}?accountId=${accountId}`, { method: 'DELETE' });
      loadApiKeys();
      toast({ title: t('profile.intKeyRevoked') });
    } catch { toast({ title: t('common.error'), variant: 'destructive' }); }
  };

  const createWebhook = async () => {
    if (!newWebhookUrl.trim() || newWebhookEvents.length === 0) return;
    const accountId = sessionStorage.getItem('accountId');
    try {
      const res = await authFetch(`${API_URL}/integrations/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, url: newWebhookUrl.trim(), events: newWebhookEvents, description: newWebhookDesc }),
      });
      if (res.ok) {
        setNewWebhookUrl('');
        setNewWebhookEvents([]);
        setNewWebhookDesc('');
        loadWebhooks();
        toast({ title: t('profile.intWebhookCreated') });
      } else {
        const d = await res.json();
        toast({ title: d.error || t('common.error'), variant: 'destructive' });
      }
    } catch { toast({ title: t('common.error'), variant: 'destructive' }); }
  };

  const deleteWebhook = async (whId: string) => {
    const accountId = sessionStorage.getItem('accountId');
    try {
      await authFetch(`${API_URL}/integrations/webhooks/${whId}?accountId=${accountId}`, { method: 'DELETE' });
      loadWebhooks();
      toast({ title: t('profile.intWebhookDeleted') });
    } catch { toast({ title: t('common.error'), variant: 'destructive' }); }
  };

  const toggleWebhook = async (wh: any) => {
    const accountId = sessionStorage.getItem('accountId');
    try {
      await authFetch(`${API_URL}/integrations/webhooks/${wh.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, isActive: !wh.isActive }),
      });
      loadWebhooks();
    } catch { /* silent */ }
  };

  const testWebhook = async (whId: string) => {
    const accountId = sessionStorage.getItem('accountId');
    try {
      const res = await authFetch(`${API_URL}/integrations/webhooks/${whId}/test?accountId=${accountId}`, { method: 'POST' });
      if (res.ok) {
        toast({ title: t('profile.intTestSent') });
      } else {
        toast({ title: t('profile.intTestFailed'), variant: 'destructive' });
      }
    } catch { toast({ title: t('profile.intTestFailed'), variant: 'destructive' }); }
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

  const handleChangeEmail = async () => {
    if (!newEmail || !emailPassword || !emailCode) {
      toast({ title: t('profile.fillAllFields'), variant: 'destructive' });
      return;
    }

    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) {
      toast({ title: t('profile.errorNoAccount'), variant: 'destructive' });
      return;
    }

    setIsChangingEmail(true);
    try {
      const body: any = { accountId, newEmail, password: emailPassword };
      // Detect if it's a TOTP code (6 digits) or recovery code
      if (/^\d{6}$/.test(emailCode)) {
        body.totpCode = emailCode;
      } else {
        body.recoveryCode = emailCode;
      }

      const response = await authFetch(`${API_URL}/accounts/change-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        toast({ title: t('profile.emailChanged') });
        setNewEmail("");
        setEmailPassword("");
        setEmailCode("");
      } else {
        const data = await response.json();
        toast({ title: data.error || t('profile.errorChangeEmail'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('profile.errorChangeEmail'), variant: 'destructive' });
    } finally {
      setIsChangingEmail(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword || !passwordCode) {
      toast({ title: t('profile.fillAllFields'), variant: 'destructive' });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({ title: t('profile.passwordsMismatch'), variant: 'destructive' });
      return;
    }

    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) {
      toast({ title: t('profile.errorNoAccount'), variant: 'destructive' });
      return;
    }

    setIsChangingPassword(true);
    try {
      const body: any = { accountId, newPassword };
      if (/^\d{6}$/.test(passwordCode)) {
        body.totpCode = passwordCode;
      } else {
        body.recoveryCode = passwordCode;
      }

      const response = await authFetch(`${API_URL}/accounts/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        toast({ title: t('profile.passwordChanged') });
        setNewPassword("");
        setConfirmPassword("");
        setPasswordCode("");
      } else {
        const data = await response.json();
        toast({ title: data.error || t('profile.errorChangePassword'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('profile.errorChangePassword'), variant: 'destructive' });
    } finally {
      setIsChangingPassword(false);
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
            <button
              onClick={() => setActiveTab("information")}
              className={`flex-1 md:flex-none md:w-full text-center md:text-left px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === "information"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {t('profile.information')}
            </button>
            <button
              onClick={() => setActiveTab("integrations")}
              className={`flex-1 md:flex-none md:w-full text-center md:text-left px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === "integrations"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {t('profile.integrations')}
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
                        <p className="text-2xl font-bold mb-3">{formatPrice(plan.monthlyPrice, currency)}<span className="text-sm font-normal text-muted-foreground">{t('profile.perMonth')}</span></p>
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
                        <p className="text-2xl font-bold mb-1">{formatPrice(plan.annualPrice, currency)}<span className="text-sm font-normal text-muted-foreground">{t('profile.perYear')}</span></p>
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

            {activeTab === "information" && (
              <div className="space-y-8">
                <h3 className="text-lg font-semibold">{t('profile.information')}</h3>

                {/* Billing Profile for Invoices */}
                <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium">{t('profile.billingProfileTitle')}</h4>
                  <p className="text-xs text-muted-foreground">{t('profile.billingProfileDesc')}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium">{t('profile.companyNameLabel')}</label>
                      <Input
                        value={billingProfile.companyName}
                        onChange={(e) => setBillingProfile({ ...billingProfile, companyName: e.target.value })}
                        placeholder={t('profile.companyNamePlaceholder')}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">{t('profile.companyCIFLabel')}</label>
                      <Input
                        value={billingProfile.companyCIF}
                        onChange={(e) => setBillingProfile({ ...billingProfile, companyCIF: e.target.value })}
                        placeholder={t('profile.companyCIFPlaceholder')}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-sm font-medium">{t('profile.companyAddressLabel')}</label>
                      <Input
                        value={billingProfile.companyAddress}
                        onChange={(e) => setBillingProfile({ ...billingProfile, companyAddress: e.target.value })}
                        placeholder={t('profile.companyAddressPlaceholder')}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">{t('profile.companyPhoneLabel')}</label>
                      <Input
                        value={billingProfile.companyPhone}
                        onChange={(e) => setBillingProfile({ ...billingProfile, companyPhone: e.target.value })}
                        placeholder={t('profile.companyPhonePlaceholder')}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">{t('profile.companyEmailLabel')}</label>
                      <Input
                        type="email"
                        value={billingProfile.companyEmail}
                        onChange={(e) => setBillingProfile({ ...billingProfile, companyEmail: e.target.value })}
                        placeholder={t('profile.companyEmailPlaceholder')}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-sm font-medium">{t('profile.invoiceNotesLabel')}</label>
                      <textarea
                        className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        value={billingProfile.invoiceNotes}
                        onChange={(e) => setBillingProfile({ ...billingProfile, invoiceNotes: e.target.value })}
                        placeholder={t('profile.invoiceNotesPlaceholder')}
                        rows={2}
                      />
                    </div>
                  </div>
                  <Button onClick={handleSaveBillingProfile} disabled={isSavingBilling}>
                    {isSavingBilling ? t('profile.processing') : t('profile.saveBillingProfile')}
                  </Button>
                </div>

                {/* Change Email */}
                <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium">{t('profile.changeEmail')}</h4>
                  <p className="text-xs text-muted-foreground">{t('profile.changeEmailDesc')}</p>
                  <div>
                    <label className="text-sm font-medium">{t('profile.newEmailLabel')}</label>
                    <Input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder={t('profile.emailPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t('profile.currentPasswordLabel')}</label>
                    <Input
                      type="password"
                      value={emailPassword}
                      onChange={(e) => setEmailPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t('profile.verificationCodeLabel')}</label>
                    <Input
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value)}
                      placeholder={t('profile.codePlaceholder')}
                    />
                  </div>
                  <Button onClick={handleChangeEmail} disabled={isChangingEmail}>
                    {isChangingEmail ? t('profile.processing') : t('profile.changeEmail')}
                  </Button>
                </div>

                {/* Change Password */}
                <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium">{t('profile.changePassword')}</h4>
                  <p className="text-xs text-muted-foreground">{t('profile.changePasswordDesc')}</p>
                  <div>
                    <label className="text-sm font-medium">{t('profile.newPasswordLabel')}</label>
                    <div className="relative">
                      <Input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t('profile.confirmPasswordLabel')}</label>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t('profile.verificationCodeLabel')}</label>
                    <Input
                      value={passwordCode}
                      onChange={(e) => setPasswordCode(e.target.value)}
                      placeholder={t('profile.codePlaceholder')}
                    />
                  </div>
                  <Button onClick={handleChangePassword} disabled={isChangingPassword}>
                    {isChangingPassword ? t('profile.processing') : t('profile.changePassword')}
                  </Button>
                </div>
              </div>
            )}

            {activeTab === "integrations" && (
              <div className="space-y-8">
                <h3 className="text-lg font-semibold">{t('profile.integrations')}</h3>

                {/* API Keys */}
                <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium flex items-center gap-2"><Key className="h-4 w-4" />{t('profile.intApiKeys')}</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('profile.intApiKeysDesc')}</p>

                  {showNewKey && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded p-3 space-y-2">
                      <p className="text-xs font-medium text-green-400">{t('profile.intKeyOnce')}</p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-background px-2 py-1 rounded flex-1 break-all">{showNewKey}</code>
                        <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(showNewKey); toast({ title: t('profile.intKeyCopied') }); }}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setShowNewKey('')}>{t('common.close')}</Button>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Input placeholder={t('profile.intKeyName')} value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} className="flex-1" />
                    <Button onClick={createApiKey} size="sm" disabled={!newKeyName.trim()}>{t('profile.intCreateKey')}</Button>
                  </div>

                  {apiKeys.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">{t('profile.intNoKeys')}</p>
                  ) : (
                    <div className="space-y-2">
                      {apiKeys.map((k: any) => (
                        <div key={k._id || k.id} className="flex items-center justify-between bg-background rounded p-2 text-sm">
                          <div>
                            <span className="font-medium">{k.name}</span>
                            <span className="text-muted-foreground ml-2 text-xs">{k.keyPrefix}••••••</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{new Date(k.createdAt).toLocaleDateString()}</span>
                            <Button size="sm" variant="ghost" className="text-destructive h-7 px-2" onClick={() => revokeApiKey(k._id || k.id)}><X className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Webhooks */}
                <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium flex items-center gap-2"><Webhook className="h-4 w-4" />{t('profile.intWebhooks')}</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('profile.intWebhooksDesc')}</p>

                  <div className="space-y-2">
                    <Input placeholder="https://hooks.zapier.com/..." value={newWebhookUrl} onChange={(e) => setNewWebhookUrl(e.target.value)} />
                    <Input placeholder={t('profile.intWebhookDescPlaceholder')} value={newWebhookDesc} onChange={(e) => setNewWebhookDesc(e.target.value)} />
                    <div className="flex flex-wrap gap-2">
                      {WEBHOOK_EVENT_OPTIONS.map(ev => (
                        <button
                          key={ev}
                          onClick={() => setNewWebhookEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev])}
                          className={`text-xs px-2 py-1 rounded border ${newWebhookEvents.includes(ev) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground'}`}
                        >
                          {ev.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                    <Button onClick={createWebhook} size="sm" disabled={!newWebhookUrl.trim() || newWebhookEvents.length === 0}>{t('profile.intCreateWebhook')}</Button>
                  </div>

                  {webhooks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">{t('profile.intNoWebhooks')}</p>
                  ) : (
                    <div className="space-y-2">
                      {webhooks.map((wh: any) => (
                        <div key={wh._id || wh.id} className="bg-background rounded p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{wh.url}</p>
                              {wh.description && <p className="text-xs text-muted-foreground">{wh.description}</p>}
                            </div>
                            <div className="flex items-center gap-1 ml-2">
                              <button
                                onClick={() => toggleWebhook(wh)}
                                className={`w-8 h-4 rounded-full transition-colors relative ${wh.isActive ? 'bg-green-500' : 'bg-muted-foreground/30'}`}
                              >
                                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${wh.isActive ? 'left-4' : 'left-0.5'}`} />
                              </button>
                              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => testWebhook(wh._id || wh.id)} title="Test">⚡</Button>
                              <Button size="sm" variant="ghost" className="text-destructive h-7 px-2" onClick={() => deleteWebhook(wh._id || wh.id)}><X className="h-3 w-3" /></Button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {wh.events?.map((ev: string) => (
                              <span key={ev} className="text-xs bg-muted px-1.5 py-0.5 rounded">{ev.replace(/_/g, ' ')}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
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
