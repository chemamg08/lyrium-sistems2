import { Plus, Pencil, Trash2, X } from "lucide-react";

interface SpecialityItem {
  id: string;
  nombre: string;
  descripcion?: string;
}

interface SpecialityFormState {
  nombre: string;
  descripcion: string;
}

interface SpecialtiesManagerModalProps {
  open: boolean;
  title: string;
  specialities: SpecialityItem[];
  showCreateForm: boolean;
  editingId: string | null;
  form: SpecialityFormState;
  createLabel: string;
  editLabel: string;
  namePlaceholder: string;
  descriptionPlaceholder: string;
  cancelLabel: string;
  saveLabel: string;
  emptyLabel: string;
  singularCountLabel: string;
  pluralCountLabel: string;
  onClose: () => void;
  onStartCreate: () => void;
  onCancelForm: () => void;
  onSave: () => void;
  onEdit: (speciality: SpecialityItem) => void;
  onDelete: (id: string) => void;
  onFormChange: (nextForm: SpecialityFormState) => void;
}

const modalWidthClass = "w-[95vw] md:w-[520px]";

export default function SpecialtiesManagerModal({
  open,
  title,
  specialities,
  showCreateForm,
  editingId,
  form,
  createLabel,
  editLabel,
  namePlaceholder,
  descriptionPlaceholder,
  cancelLabel,
  saveLabel,
  emptyLabel,
  singularCountLabel,
  pluralCountLabel,
  onClose,
  onStartCreate,
  onCancelForm,
  onSave,
  onEdit,
  onDelete,
  onFormChange,
}: SpecialtiesManagerModalProps) {
  if (!open) return null;

  const countLabel = specialities.length === 1 ? singularCountLabel : pluralCountLabel;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className={`bg-card border border-border rounded-lg shadow-xl flex flex-col max-h-[85vh] ${modalWidthClass}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent text-muted-foreground" type="button">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-5">
            <span className="text-xs text-muted-foreground">
              {specialities.length} {countLabel}
            </span>
            <button
              onClick={onStartCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90"
              type="button"
            >
              <Plus className="h-3.5 w-3.5" />
              {createLabel}
            </button>
          </div>

          {showCreateForm && (
            <div className="mb-5 p-4 border border-border rounded-lg bg-muted/20 space-y-3">
              <p className="text-xs font-medium text-foreground mb-1">
                {editingId ? editLabel : createLabel}
              </p>
              <input
                placeholder={namePlaceholder}
                value={form.nombre}
                onChange={(e) => onFormChange({ ...form, nombre: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <textarea
                placeholder={descriptionPlaceholder}
                value={form.descripcion}
                onChange={(e) => onFormChange({ ...form, descripcion: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={onCancelForm}
                  className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground"
                  type="button"
                >
                  {cancelLabel}
                </button>
                <button
                  onClick={onSave}
                  className="px-3 py-1.5 text-xs rounded-md bg-foreground text-background hover:opacity-90"
                  type="button"
                >
                  {saveLabel}
                </button>
              </div>
            </div>
          )}

          {specialities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{emptyLabel}</p>
          ) : (
            <div className="space-y-3">
              {specialities.map((speciality) => (
                <div key={speciality.id} className="flex items-start justify-between p-4 border border-border rounded-lg bg-muted/20">
                  <div>
                    <p className="text-sm font-medium text-foreground">{speciality.nombre}</p>
                    {speciality.descripcion && (
                      <p className="text-xs text-muted-foreground mt-0.5">{speciality.descripcion}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => onEdit(speciality)}
                      className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                      type="button"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete(speciality.id)}
                      className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
