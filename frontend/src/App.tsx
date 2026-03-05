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
import Automations from "./pages/Automations";
import Login from "./pages/Login";
import Landing from "./pages/Landing";
import LegalPage from "./pages/LegalPage";
import Signup from "./pages/Signup";
import NotFound from "./pages/NotFound";
import CookieBanner from "./components/CookieBanner";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
      <BrowserRouter>
        <CookieBanner />
        <Routes>
          <Route path="/landing" element={<Landing />} />
          <Route path="/terminos" element={<LegalPage />} />
          <Route path="/privacidad" element={<LegalPage />} />
          <Route path="/cookies" element={<LegalPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/clientes" element={<Clients />} />
            <Route path="/resumenes" element={<DocumentSummaries />} />
            <Route path="/contratos" element={<Contracts />} />
            <Route path="/asistente" element={<AIAssistant />} />
            <Route path="/defensa" element={<DefensePrep />} />
            <Route path="/redaccion" element={<WritingReview />} />
            <Route path="/fiscal" element={<FiscalAdvisory />} />
            <Route path="/automatizaciones" element={<Automations />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      <Analytics />
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
