import { useTranslation } from "react-i18next";
import { useState, useRef } from "react";
import { Send, Paperclip } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  file?: string;
}

interface ChatInterfaceProps {
  title: string;
  subtitle: string;
  placeholder?: string;
  showFileUpload?: boolean;
  systemPromptHint?: string;
}

const ChatInterface = ({
  title,
  subtitle,
  placeholder = "Escribe tu mensaje...",
  showFileUpload = false,
}: ChatInterfaceProps) => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const send = () => {
    if (!input.trim() && !fileName) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input || `Archivo subido: ${fileName}`,
      file: fileName || undefined,
    };

    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: t('chat.requiredCloud'),
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput("");
    setFileName(null);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setFileName(file.name);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-0px)]">
      {/* Header */}
      <div className="border-b border-border p-4 md:p-6">
        <h2 className="text-lg md:text-xl font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-muted-foreground text-sm">{t('chat.noMessages')}</p>
              <p className="text-muted-foreground/60 text-xs mt-1">{t('chat.startMessage')}</p>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] md:max-w-[70%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-chat-user text-chat-user-foreground"
                  : "bg-chat-ai text-chat-ai-foreground"
              }`}
            >
              {msg.file && (
                <div className="flex items-center gap-2 mb-2 text-xs opacity-70">
                  <Paperclip className="h-3 w-3" />
                  {msg.file}
                </div>
              )}
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-4">
        {fileName && (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground bg-accent rounded px-3 py-1.5 w-fit">
            <Paperclip className="h-3 w-3" />
            {fileName}
            <button onClick={() => setFileName(null)} className="ml-1 hover:text-foreground">×</button>
          </div>
        )}
        <div className="flex items-center gap-2">
          {showFileUpload && (
            <>
              <input type="file" ref={fileRef} onChange={handleFile} className="hidden" />
              <button
                onClick={() => fileRef.current?.click()}
                className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              >
                <Paperclip className="h-5 w-5" />
              </button>
            </>
          )}
          <textarea
            value={input}
            rows={1}
            style={{ height: input === '' ? '40px' : undefined }}
            onChange={(e) => {
              setInput(e.target.value);
              if (e.target.value) {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
              }
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={placeholder}
            className="flex-1 bg-accent/50 border border-border rounded-md px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none overflow-hidden"
          />
          <button
            onClick={send}
            disabled={!input.trim() && !fileName}
            className="p-2.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
