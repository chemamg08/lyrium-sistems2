import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Analytics } from "@vercel/analytics/react";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import DocumentSummaries from "./pages/DocumentSummaries";
import Contracts from "./pages/Contracts";
import AIAssistant from "./pages/AIAssistant";
import DefensePrep from "./pages/DefensePrep";
import WritingReview from "./pages/WritingReview";
import FiscalAdvisory from "./pages/FiscalAdvisory";
import TaxCompliance from "./pages/TaxCompliance";
import Automations from "./pages/Automations";
import Login from "./pages/Login";
import Landing from "./pages/Landing";
import LegalPage from "./pages/LegalPage";
import Signup from "./pages/Signup";
import Setup2FA from "./pages/Setup2FA";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import NotFound from "./pages/NotFound";
import AdminPanel from "./pages/AdminPanel";
import SignDocument from "./pages/SignDocument";
import CookieBanner from "./components/CookieBanner";
import GoogleAnalytics from "./components/GoogleAnalytics";
import ErrorBoundary from "./components/ErrorBoundary";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
      <BrowserRouter>
        <GoogleAnalytics />
        <CookieBanner />
        <Routes>
          <Route path="/landing" element={<Landing />} />
          <Route path="/terminos" element={<LegalPage />} />
          <Route path="/privacidad" element={<LegalPage />} />
          <Route path="/cookies" element={<LegalPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/setup-2fa" element={<Setup2FA />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/firmar/:token" element={<SignDocument />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/clientes" element={<Clients />} />
            <Route path="/resumenes" element={<DocumentSummaries />} />
            <Route path="/contratos" element={<Contracts />} />
            <Route path="/asistente" element={<AIAssistant />} />
            <Route path="/defensa" element={<DefensePrep />} />
            <Route path="/redaccion" element={<WritingReview />} />
            <Route path="/fiscal" element={<FiscalAdvisory />} />
            <Route path="/tax-compliance" element={<TaxCompliance />} />
            <Route path="/automatizaciones" element={<Automations />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      <Analytics />
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
  </ErrorBoundary>
);

export default App;
