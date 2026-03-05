import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Save,
  Search,
  Plus,
  Trash2,
  FileDown,
} from "lucide-react";
import html2pdf from "html2pdf.js";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { authFetch } from '../lib/authFetch';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface WritingText {
  id: string;
  accountId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface TextSuggestion {
  original: string;
  suggestion: string;
  reason: string;
}

interface SuggestionWithPosition extends TextSuggestion {
  start: number;
  end: number;
}

const WritingReview = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [texts, setTexts] = useState<WritingText[]>([]);
  const [currentTextId, setCurrentTextId] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionWithPosition[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<SuggestionWithPosition | null>(null);
  const [showSuggestionDialog, setShowSuggestionDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [, setEditorUpdate] = useState(0); // Para forzar re-render del componente
  const { toast } = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      Highlight.configure({
        multicolor: true,
      }),
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose max-w-none focus:outline-none min-h-[500px] p-4",
        style: "font-size: 16px;",
      },
    },
    onUpdate: ({ editor }) => {
      // Forzar re-render cuando el contenido cambie
      setEditorUpdate(prev => prev + 1);
      // Auto-save draft to localStorage
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const accountId = sessionStorage.getItem("accountId");
        if (!accountId) return;
        localStorage.setItem(`writing_draft_${accountId}`, editor.getHTML());
      }, 800);
    },
    onSelectionUpdate: () => {
      // Forzar re-render cuando la selecci\u00f3n cambie
      setEditorUpdate(prev => prev + 1);
    },
  });

  useEffect(() => {
    // Validar que el usuario esté autenticado
    const accountId = sessionStorage.getItem("accountId");
    if (!accountId) {
      toast({
        title: t('writing.sessionInvalid'),
        description: t('writing.sessionRequired'),
        variant: "destructive",
      });
      navigate("/login");
      return;
    }
    
    loadTexts();
  }, [navigate, toast]);

  useEffect(() => {
    if (!editor) return;
    const accountId = sessionStorage.getItem("accountId");
    if (!accountId) return;
    const draft = localStorage.getItem(`writing_draft_${accountId}`);
    if (draft) {
      editor.commands.setContent(draft);
    }
  }, [editor]);

  useEffect(() => {
    if (editor && suggestions.length === 0) {
      // Limpiar highlights cuando no hay sugerencias
      editor.commands.unsetHighlight();
    }
  }, [suggestions, editor]);

  const loadTexts = async () => {
    try {
      const accountId = sessionStorage.getItem("accountId");
      if (!accountId) return;

      const response = await authFetch(`${API_URL}/writing-texts?accountId=${accountId}`);
      if (response.ok) {
        const data = await response.json();
        setTexts(data);
      }
    } catch (error) {
      console.error("Error al cargar textos:", error);
      toast({
        title: t('common.error'),
        description: t('writing.errorLoadTexts'),
        variant: "destructive",
      });
    }
  };

  const loadText = async (textId: string) => {
    try {
      const accountId = sessionStorage.getItem("accountId");
      if (!accountId) return;

      const response = await authFetch(`${API_URL}/writing-texts/${textId}?accountId=${accountId}`);
      if (response.ok) {
        const data = await response.json();
        editor?.commands.setContent(data.content || "");
        setCurrentTextId(textId);
        setSuggestions([]);
      }
    } catch (error) {
      console.error("Error al cargar texto:", error);
      toast({
        title: "Error",
        description: "No se pudo cargar el texto",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    const accountId = sessionStorage.getItem("accountId");
    console.log("handleSave - accountId:", accountId);
    console.log("handleSave - currentTextId:", currentTextId);
    
    if (!accountId) {
      toast({
        title: "Error",
        description: t('writing.errorNoAccount'),
        variant: "destructive",
      });
      return;
    }

    const content = editor?.getHTML() || "";

    try {
      if (currentTextId) {
        // Actualizar texto existente
        console.log("Actualizando texto existente...");
        const response = await authFetch(`${API_URL}/writing-texts/${currentTextId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, content }),
        });

        if (response.ok) {
          toast({
            title: t('writing.saved'),
            description: t('writing.savedDesc'),
          });
          const accountId2 = sessionStorage.getItem("accountId");
          if (accountId2) localStorage.removeItem(`writing_draft_${accountId2}`);
          loadTexts();
        } else {
          const errorData = await response.json();
          console.error("Error en respuesta:", errorData);
          toast({
            title: "Error",
            description: errorData.message || "No se pudo guardar",
            variant: "destructive",
          });
        }
      } else {
        // Crear nuevo texto
        console.log("Abriendo diálogo para nuevo texto...");
        setShowSaveDialog(true);
      }
    } catch (error) {
      console.error("Error al guardar texto:", error);
      toast({
        title: "Error",
        description: "No se pudo guardar el texto",
        variant: "destructive",
      });
    }
  };

  const handleCreateNew = async () => {
    const accountId = sessionStorage.getItem("accountId");
    if (!accountId || !newTitle.trim()) return;

    const content = editor?.getHTML() || "";

    try {
      const response = await authFetch(`${API_URL}/writing-texts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, title: newTitle, content }),
      });

      if (response.ok) {
        const newText = await response.json();
        setCurrentTextId(newText.id);
        setNewTitle("");
        setShowSaveDialog(false);
        toast({
          title: t('writing.created'),
          description: t('writing.createdDesc'),
        });
        const accountId2 = sessionStorage.getItem("accountId");
        if (accountId2) localStorage.removeItem(`writing_draft_${accountId2}`);
        loadTexts();
      }
    } catch (error) {
      console.error("Error al crear texto:", error);
      toast({
        title: "Error",
        description: t('writing.errorCreate'),
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    const accountId = sessionStorage.getItem("accountId");
    if (!accountId || !currentTextId) return;

    try {
      const response = await authFetch(`${API_URL}/writing-texts/${currentTextId}?accountId=${accountId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setCurrentTextId(null);
        editor?.commands.setContent("");
        setSuggestions([]);
        setShowDeleteDialog(false);
        toast({
          title: t('writing.deleted'),
          description: t('writing.deletedDesc'),
        });
        const accountId2 = sessionStorage.getItem("accountId");
        if (accountId2) localStorage.removeItem(`writing_draft_${accountId2}`);
        loadTexts();
      }
    } catch (error) {
      console.error("Error al eliminar texto:", error);
      toast({
        title: "Error",
        description: t('writing.errorDelete'),
        variant: "destructive",
      });
    }
  };

  // Mapea cada carácter del texto a su posición ProseMirror exacta.
  const findPmRange = (searchText: string): { from: number; to: number } | null => {
    if (!editor) return null;
    const chars: { pmPos: number; char: string }[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        for (let i = 0; i < node.text.length; i++) {
          chars.push({ pmPos: pos + i, char: node.text[i] });
        }
      }
    });
    const plain = chars.map(c => c.char).join('');
    const idx = plain.indexOf(searchText);
    if (idx === -1) return null;
    return {
      from: chars[idx].pmPos,
      to: chars[idx + searchText.length - 1].pmPos + 1,
    };
  };

  const handleReview = async () => {
    const text = editor?.getText() || "";
    
    if (!text.trim()) {
      toast({
        title: t('writing.notice'),
        description: t('writing.noTextToReview'),
      });
      return;
    }

    setIsReviewing(true);
    setSuggestions([]);

    try {
      const response = await authFetch(`${API_URL}/writing-texts/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, accountId: sessionStorage.getItem('accountId') || undefined }),
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.suggestions && data.suggestions.length > 0) {
          const suggestionsWithPos: SuggestionWithPosition[] = [];
          
          for (const suggestion of data.suggestions) {
            const range = findPmRange(suggestion.original);
            if (range) {
              suggestionsWithPos.push({
                ...suggestion,
                start: range.from,
                end: range.to,
              });
            }
          }

          setSuggestions(suggestionsWithPos);
          
          // Marcar los textos con highlight usando posiciones PM directas
          suggestionsWithPos.forEach((sug) => {
            editor?.chain()
              .focus()
              .setTextSelection({ from: sug.start, to: sug.end })
              .setHighlight({ color: "#fef08a" })
              .run();
          });

          toast({
            title: t('writing.reviewComplete'),
            description: t('writing.suggestionsFound', { count: suggestionsWithPos.length }),
          });
        } else {
          toast({
            title: t('writing.reviewComplete'),
            description: t('writing.noSuggestionsFound'),
          });
        }
      }
    } catch (error) {
      console.error("Error al revisar texto:", error);
      toast({
        title: "Error",
        description: t('writing.errorReview'),
        variant: "destructive",
      });
    } finally {
      setIsReviewing(false);
    }
  };

  const applySuggestion = (suggestion: SuggestionWithPosition) => {
    if (!editor) return;

    // start/end son posiciones PM directas, sin +1
    editor.chain()
      .focus()
      .setTextSelection({ from: suggestion.start, to: suggestion.end })
      .insertContent(suggestion.suggestion)
      .setTextSelection({ from: suggestion.start, to: suggestion.start + suggestion.suggestion.length })
      .unsetHighlight()
      .run();

    // Recalcular posiciones PM del resto de sugerencias (el doc ha cambiado)
    setSuggestions((prev) => {
      const remaining = prev.filter((s) => s !== suggestion);
      return remaining.map((s) => {
        const range = findPmRange(s.original);
        if (!range) return s;
        return { ...s, start: range.from, end: range.to };
      });
    });
    setSelectedSuggestion(null);
    setShowSuggestionDialog(false);

    toast({
      title: t('writing.suggestionApplied'),
      description: "El texto se ha actualizado",
    });
  };

  const handleExport = () => {
    if (!editor) return;

    const currentText = texts.find((t) => t.id === currentTextId);
    const filename = currentText?.title || 'redaccion';

    const html = editor.getHTML();
    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.cssText = 'font-family: Georgia, serif; font-size: 14px; line-height: 1.8; color: #111; padding: 32px; max-width: 680px; margin: 0 auto;';

    // Aplicar estilos a headings y párrafos
    container.querySelectorAll('h1').forEach((el) => { (el as HTMLElement).style.cssText = 'font-size: 24px; font-weight: bold; margin: 24px 0 12px;'; });
    container.querySelectorAll('h2').forEach((el) => { (el as HTMLElement).style.cssText = 'font-size: 20px; font-weight: bold; margin: 20px 0 10px;'; });
    container.querySelectorAll('h3').forEach((el) => { (el as HTMLElement).style.cssText = 'font-size: 17px; font-weight: bold; margin: 16px 0 8px;'; });
    container.querySelectorAll('p').forEach((el) => { (el as HTMLElement).style.cssText = 'margin: 0 0 12px;'; });
    container.querySelectorAll('ul, ol').forEach((el) => { (el as HTMLElement).style.cssText = 'padding-left: 24px; margin: 0 0 12px;'; });
    container.querySelectorAll('mark').forEach((el) => { (el as HTMLElement).style.background = 'none'; });

    const opt = {
      margin: [15, 15, 15, 15],
      filename: `${filename}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };

    html2pdf().set(opt).from(container).save();
  };

  const handleNewDocument = () => {
    setCurrentTextId(null);
    editor?.commands.setContent("");
    setSuggestions([]);
    const accountId = sessionStorage.getItem("accountId");
    if (accountId) localStorage.removeItem(`writing_draft_${accountId}`);
    toast({
      title: t('writing.newDocument'),
      description: t('writing.startingNewDoc'),
    });
  };

  // Funciones para aplicar formato y forzar actualización
  const toggleBold = () => {
    editor?.chain().focus().toggleBold().run();
    setEditorUpdate(prev => prev + 1);
  };

  const toggleItalic = () => {
    editor?.chain().focus().toggleItalic().run();
    setEditorUpdate(prev => prev + 1);
  };

  const toggleUnderline = () => {
    editor?.chain().focus().toggleUnderline().run();
    setEditorUpdate(prev => prev + 1);
  };

  // Helper para obtener el estilo actual (Normal, Título 1, 2, 3)
  const getCurrentStyle = () => {
    if (!editor) return "0";
    if (editor.isActive("heading", { level: 1 })) return "1";
    if (editor.isActive("heading", { level: 2 })) return "2";
    if (editor.isActive("heading", { level: 3 })) return "3";
    return "0"; // Normal
  };

  // Helper para obtener el tamaño actual
  const getCurrentSize = () => {
    if (!editor) return "0";
    if (editor.isActive("heading", { level: 4 })) return "4";
    if (editor.isActive("heading", { level: 5 })) return "5";
    if (editor.isActive("heading", { level: 6 })) return "6";
    return "0"; // Normal
  };

  // Helper para obtener el label del estilo
  const getStyleLabel = () => {
    const style = getCurrentStyle();
    switch (style) {
      case "1": return t('writing.styleH1');
      case "2": return t('writing.styleH2');
      case "3": return t('writing.styleH3');
      default: return t('writing.styleNormal');
    }
  };

  // Helper para obtener el label del tamaño
  const getSizeLabel = () => {
    const size = getCurrentSize();
    switch (size) {
      case "4": return t('writing.sizeLarge');
      case "5": return t('writing.sizeMedium');
      case "6": return t('writing.sizeSmall');
      default: return t('writing.sizeNormal');
    }
  };

  if (!editor) {
    return <div>{t('writing.loadingEditor')}</div>;
  }

  return (
    <>
      <style>{`
        .ProseMirror h4 {
          font-size: 20px;
          font-weight: normal;
          margin: 0;
          line-height: 1.5;
        }
        .ProseMirror h5 {
          font-size: 18px;
          font-weight: normal;
          margin: 0;
          line-height: 1.5;
        }
        .ProseMirror h6 {
          font-size: 14px;
          font-weight: normal;
          margin: 0;
          line-height: 1.5;
        }
        .ProseMirror p {
          font-size: 16px;
          margin: 0.5em 0;
        }
      `}</style>
    <div className="h-full flex flex-col">
      {/* Barra de herramientas superior */}
      <div className="border-b border-border bg-card p-4 space-y-4">
        {/* Fila 1: Selector y acciones */}
        <div className="flex items-center gap-2">
          <Select
            value={currentTextId || ""}
            onValueChange={(value) => {
              if (value === "new") {
                handleNewDocument();
              } else {
                loadText(value);
              }
            }}
          >
            <SelectTrigger className="w-full sm:w-[300px]">
              <SelectValue placeholder={t('writing.selectText')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  <span>{t('writing.newDocument')}</span>
                </div>
              </SelectItem>
              {texts.map((text) => (
                <SelectItem key={text.id} value={text.id}>
                  {text.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={handleSave} variant="default">
            <Save className="h-4 w-4 mr-2" />
            {t('writing.saveBtn')}
          </Button>

          <Button onClick={handleReview} variant="secondary" disabled={isReviewing}>
            <Search className="h-4 w-4 mr-2" />
            {isReviewing ? t('writing.reviewing') : t('writing.reviewBtn')}
          </Button>

          {currentTextId && (
            <>
              <Button onClick={() => setShowDeleteDialog(true)} variant="destructive" size="icon">
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button onClick={handleExport} variant="outline" size="sm">
                <FileDown className="h-4 w-4 mr-2" />
                Extraer
              </Button>
            </>
          )}
        </div>

        {/* Fila 2: Herramientas de formato */}
        <div className="flex items-center gap-1 flex-wrap">
          <Button
            onClick={toggleBold}
            variant={editor?.isActive("bold") ? "default" : "outline"}
            size="sm"
            title={t('writing.bold')}
          >
            <Bold className="h-4 w-4" />
          </Button>

          <Button
            onClick={toggleItalic}
            variant={editor?.isActive("italic") ? "default" : "outline"}
            size="sm"
            title={t('writing.italic')}
          >
            <Italic className="h-4 w-4" />
          </Button>

          <Button
            onClick={toggleUnderline}
            variant={editor?.isActive("underline") ? "default" : "outline"}
            size="sm"
            title={t('writing.underline')}
          >
            <UnderlineIcon className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            variant={editor?.isActive("bulletList") ? "default" : "outline"}
            size="sm"
            title={t('writing.bulletList')}
          >
            <List className="h-4 w-4" />
          </Button>

          <Button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            variant={editor?.isActive("orderedList") ? "default" : "outline"}
            size="sm"
            title={t('writing.numberedList')}
          >
            <ListOrdered className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            variant={editor?.isActive({ textAlign: "left" }) ? "default" : "outline"}
            size="sm"
            title={t('writing.alignLeft')}
          >
            <AlignLeft className="h-4 w-4" />
          </Button>

          <Button
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            variant={editor?.isActive({ textAlign: "center" }) ? "default" : "outline"}
            size="sm"
            title={t('writing.alignCenter')}
          >
            <AlignCenter className="h-4 w-4" />
          </Button>

          <Button
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            variant={editor?.isActive({ textAlign: "right" }) ? "default" : "outline"}
            size="sm"
            title={t('writing.alignRight')}
          >
            <AlignRight className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Select
            value={getCurrentStyle()}
            onValueChange={(value) => {
              const level = parseInt(value);
              if (level === 0) {
                editor.chain().focus().setParagraph().run();
              } else if (level >= 1 && level <= 3) {
                editor.chain().focus().setHeading({ level: level as 1 | 2 | 3 }).run();
              }
            }}
          >
            <SelectTrigger className="w-[120px] h-8">
              <SelectValue>{getStyleLabel()}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">{t('writing.styleNormal')}</SelectItem>
              <SelectItem value="1">{t('writing.styleH1')}</SelectItem>
              <SelectItem value="2">{t('writing.styleH2')}</SelectItem>
              <SelectItem value="3">{t('writing.styleH3')}</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={getCurrentSize()}
            onValueChange={(value) => {
              const level = parseInt(value);
              if (level === 0) {
                editor.chain().focus().setParagraph().run();
              } else {
                editor.chain().focus().setHeading({ level: level as 4 | 5 | 6 }).run();
              }
            }}
          >
            <SelectTrigger className="w-[120px] h-8">
              <SelectValue>{getSizeLabel()}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">{t('writing.sizeNormal')}</SelectItem>
              <SelectItem value="6">{t('writing.sizeSmall')}</SelectItem>
              <SelectItem value="5">{t('writing.sizeMedium')}</SelectItem>
              <SelectItem value="4">{t('writing.sizeLarge')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto bg-background">
        <div className="max-w-full px-3 py-4 md:px-6 md:py-8">
          <div 
            className="bg-white min-h-[350px] md:min-h-[600px] shadow-lg rounded-lg border border-border"
            onMouseDown={(e) => {
              const target = e.target as HTMLElement;
              
              // TipTap usa la clase 'mark' para los highlights
              const highlight = target.closest('mark');
              
              if (highlight) {
                e.preventDefault(); // evita que TipTap entre en modo edición al pulsar
                const text = highlight.textContent || "";
                
                // Buscar la sugerencia que coincide con el texto marcado
                const suggestion = suggestions.find((s) => {
                  const normalized = s.original.trim();
                  const clickedText = text.trim();
                  return normalized === clickedText || s.original.includes(clickedText) || clickedText.includes(s.original);
                });
                
                if (suggestion) {
                  setSelectedSuggestion(suggestion);
                  setShowSuggestionDialog(true);
                }
              }
            }}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      {/* Dialog para mostrar sugerencias */}
      <Dialog open={showSuggestionDialog} onOpenChange={setShowSuggestionDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('writing.suggestionTitle')}</DialogTitle>
            <DialogDescription>
              {t('writing.suggestionDesc')}
            </DialogDescription>
          </DialogHeader>
          {selectedSuggestion && (
            <div className="space-y-4 py-4">
              <div>
                <h4 className="font-semibold text-sm mb-2">{t('writing.originalText')}</h4>
                <p className="text-sm bg-muted p-3 rounded">
                  {selectedSuggestion.original}
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-2">{t('writing.suggestedText')}</h4>
                <p className="text-sm bg-primary/10 p-3 rounded border border-primary/20">
                  {selectedSuggestion.suggestion}
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-2">{t('writing.reason')}</h4>
                <p className="text-xs text-muted-foreground">{selectedSuggestion.reason}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => {
                setShowSuggestionDialog(false);
                setSelectedSuggestion(null);
              }}
              variant="outline"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => selectedSuggestion && applySuggestion(selectedSuggestion)}
            >
              {t('writing.change')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para guardar nuevo texto */}
      <AlertDialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('writing.saveNewTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('writing.saveNewDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="title">{t('writing.titleLabel')}</Label>
            <Input
              id="title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t('writing.titlePlaceholder')}
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreateNew}>{t('common.save')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para eliminar */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('writing.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('writing.deleteDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  </>
  );
};

export default WritingReview;
