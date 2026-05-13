import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const GUIDES: Record<string, { title: string; description: string }> = {
  dashboard: {
    title: "Panel Principal",
    description: "Bienvenido al panel principal. Aquí tienes una vista general de tu actividad, clientes y casos activos.",
  },
  clients: {
    title: "Clientes",
    description: "Gestiona tu cartera de clientes. Puedes añadir nuevos contactos, editar sus datos y asignarles casos.",
  },
  cases: {
    title: "Casos",
    description: "Organiza y da seguimiento a todos tus expedientes judiciales y administrativos.",
  },
  contracts: {
    title: "Contratos",
    description: "Crea, revisa y firma contratos electrónicamente de forma segura.",
  },
  automations: {
    title: "Automatizaciones",
    description: "Configura respuestas automáticas y flujos de trabajo para ahorrar tiempo.",
  },
  assistant: {
    title: "IA Asistente",
    description: "Chatea con nuestro asistente de inteligencia artificial para resolver dudas legales y fiscales.",
  },
  defense: {
    title: "Defensa Legal",
    description: "Prepara la defensa de tus casos con el apoyo de herramientas de IA especializadas.",
  },
  writing: {
    title: "Redacción y Revisión",
    description: "Redacta y revisa documentos jurídicos con ayuda de inteligencia artificial.",
  },
};

export default function ModuleGuide({ moduleId }: { moduleId: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(`lyrium_guide_seen_${moduleId}`);
    if (!seen && GUIDES[moduleId]) {
      setOpen(true);
    }
  }, [moduleId]);

  const handleClose = () => {
    localStorage.setItem(`lyrium_guide_seen_${moduleId}`, "true");
    setOpen(false);
  };

  const guide = GUIDES[moduleId];
  if (!guide) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{guide.title}</DialogTitle>
          <DialogDescription>{guide.description}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end mt-4">
          <Button onClick={handleClose}>Entendido</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
