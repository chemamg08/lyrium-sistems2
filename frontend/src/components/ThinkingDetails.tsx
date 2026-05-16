import { useEffect, useRef } from "react";
import { Brain } from "lucide-react";

interface ThinkingDetailsProps {
  content: string;
  open?: boolean;
  label?: string;
}

export default function ThinkingDetails({
  content,
  open = false,
  label = "Pensando...",
}: ThinkingDetailsProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [content]);

  return (
    <details className="mb-2 not-prose" open={open}>
      <summary className="text-xs text-muted-foreground cursor-pointer select-none flex items-center gap-1.5 list-none">
        <Brain className="h-3 w-3" />
        <span>{label}</span>
      </summary>
      <div
        ref={contentRef}
        className="mt-1.5 text-xs text-muted-foreground/80 font-mono whitespace-pre-wrap border-t border-border/40 pt-1.5"
        style={{ maxHeight: "4.5em", overflowY: "auto" }}
      >
        {content}
      </div>
    </details>
  );
}
