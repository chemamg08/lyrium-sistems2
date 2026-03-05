import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Share2, Eye, Trash2, Upload, FileText, Users, Check } from 'lucide-react';
import { authFetch } from '../lib/authFetch';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface SharedFile {
  id: string;
  filename: string;
  originalName: string;
  senderId: string;
  senderName: string;
  recipientIds: string[];
  size: number;
  uploadedAt: string;
}

interface Member {
  id: string;
  name: string;
  email: string;
  type: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function SharedFilesModal({ isOpen, onClose }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'shared' | 'received'>('shared');
  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([]);
  const [receivedFiles, setReceivedFiles] = useState<SharedFile[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Share sub-modal
  const [showShare, setShowShare] = useState(false);
  const [dropFiles, setDropFiles] = useState<File[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userId = sessionStorage.getItem('userId') || '';
  const userName = sessionStorage.getItem('userName') || '';
  const accountId = sessionStorage.getItem('accountId') || '';

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sharedRes, receivedRes, membersRes] = await Promise.all([
        authFetch(`${API_URL}/shared-files/shared?userId=${userId}`),
        authFetch(`${API_URL}/shared-files/received?userId=${userId}`),
        authFetch(`${API_URL}/shared-files/group-members?accountId=${accountId}&userId=${userId}`),
      ]);
      if (sharedRes.ok) setSharedFiles(await sharedRes.json());
      if (receivedRes.ok) setReceivedFiles(await receivedRes.json());
      if (membersRes.ok) setMembers(await membersRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (fileId: string) => {
    try {
      const res = await authFetch(`${API_URL}/shared-files/${fileId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) setSharedFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err) {
      console.error(err);
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const handleView = async (fileId: string) => {
    try {
      const res = await authFetch(`${API_URL}/shared-files/download/${fileId}?userId=${userId}`);
      if (!res.ok) throw new Error('Error');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      // error viewing file
    }
  };

  // Drop zone handlers
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    setDropFiles((prev) => [...prev, ...files]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setDropFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
      e.target.value = '';
    }
  };

  const toggleRecipient = (id: string) => {
    setSelectedRecipients((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const handleUpload = async () => {
    if (dropFiles.length === 0 || selectedRecipients.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      dropFiles.forEach((f) => formData.append('files', f));
      formData.append('senderId', userId);
      formData.append('senderName', userName);
      formData.append('recipientIds', JSON.stringify(selectedRecipients));

      const res = await authFetch(`${API_URL}/shared-files/upload`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setSharedFiles((prev) => [...prev, ...data.files]);
        setDropFiles([]);
        setSelectedRecipients([]);
        setShowShare(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const openShare = () => {
    setDropFiles([]);
    setSelectedRecipients([]);
    setShowShare(true);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">{t('shareFiles.title')}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {(['shared', 'received'] as const).map((t_) => (
            <button
              key={t_}
              onClick={() => setTab(t_)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === t_
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t_ === 'shared' ? t('shareFiles.tabShared') : t('shareFiles.tabReceived')}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              {t('shareFiles.loading')}
            </div>
          ) : tab === 'shared' ? (
            <>
              <div className="flex justify-end mb-4">
                <button
                  onClick={openShare}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-foreground text-background hover:opacity-90 transition-opacity"
                >
                  <Upload className="h-4 w-4" />
                  {t('shareFiles.share')}
                </button>
              </div>
              {sharedFiles.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-12">{t('shareFiles.noShared')}</p>
              ) : (
                <div className="space-y-3">
                  {sharedFiles.map((file) => (
                    <FileCard
                      key={file.id}
                      file={file}
                      members={members}
                      onDelete={() => setConfirmDeleteId(file.id)}
                      onView={() => handleView(file.id)}
                      showDelete
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {receivedFiles.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-12">{t('shareFiles.noReceived')}</p>
              ) : (
                <div className="space-y-3">
                  {receivedFiles.map((file) => (
                    <FileCard
                      key={file.id}
                      file={file}
                      members={members}
                      onView={() => handleView(file.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Confirm delete dialog */}
      {confirmDeleteId && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-xl">
          <div className="bg-card border border-border rounded-xl shadow-xl p-6 mx-4 w-full max-w-sm">
            <h3 className="text-sm font-semibold text-foreground mb-1">{t('shareFiles.deleteConfirmTitle')}</h3>
            <p className="text-sm text-muted-foreground mb-5">{t('shareFiles.deleteConfirm')}</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-sm font-medium rounded-md border border-border text-foreground hover:bg-muted/30 transition-colors"
              >
                {t('shareFiles.cancel')}
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="px-4 py-2 text-sm font-medium rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                {t('shareFiles.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share sub-modal */}
      {showShare && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Upload className="h-4 w-4" />
                {t('shareFiles.shareTitle')}
              </h3>
              <button onClick={() => setShowShare(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Drop zone */}
              <div>
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    isDragging
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-muted/30'
                  }`}
                >
                  <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t('shareFiles.dropFiles')}</p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
                {dropFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {dropFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-muted/40 rounded px-2 py-1">
                        <span className="truncate text-foreground">{f.name}</span>
                        <button
                          onClick={() => setDropFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          className="ml-2 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recipients */}
              <div>
                <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  {t('shareFiles.selectRecipients')}
                </p>
                {members.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('shareFiles.noRecipients')}</p>
                ) : (
                  <div className="space-y-2">
                    {members.map((m) => (
                      <div
                        key={m.id}
                        onClick={() => toggleRecipient(m.id)}
                        className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border hover:bg-muted/30 cursor-pointer transition-colors select-none"
                      >
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            selectedRecipients.includes(m.id)
                              ? 'bg-primary border-primary'
                              : 'border-border'
                          }`}
                        >
                          {selectedRecipients.includes(m.id) && (
                            <Check className="h-2.5 w-2.5 text-primary-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 p-5 border-t border-border shrink-0">
              <button
                onClick={handleUpload}
                disabled={uploading || dropFiles.length === 0 || selectedRecipients.length === 0}
                className="flex-1 py-2 text-sm font-medium rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {uploading ? t('shareFiles.uploading') : t('shareFiles.confirmShare')}
              </button>
              <button
                onClick={() => setShowShare(false)}
                className="px-4 py-2 text-sm font-medium rounded-md border border-border text-foreground hover:bg-muted/30 transition-colors"
              >
                {t('shareFiles.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface FileCardProps {
  file: SharedFile;
  members: Member[];
  onDelete?: () => void;
  onView: () => void;
  showDelete?: boolean;
}

function FileCard({ file, members, onDelete, onView, showDelete }: FileCardProps) {
  const { t } = useTranslation();

  const resolveNames = (ids: string[]) => {
    return ids
      .map((id) => members.find((m) => m.id === id)?.name || id)
      .join(', ');
  };

  return (
    <div className="flex items-start justify-between gap-3 p-4 border border-border rounded-lg bg-card hover:bg-muted/20 transition-colors">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{file.originalName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatSize(file.size)} · {formatDate(file.uploadedAt)}
          </p>
          {showDelete ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('shareFiles.to')} {resolveNames(file.recipientIds) || '—'}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('shareFiles.from')} {file.senderName}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onView}
          title={t('shareFiles.view')}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <Eye className="h-4 w-4" />
        </button>
        {showDelete && onDelete && (
          <button
            onClick={onDelete}
            title={t('shareFiles.delete')}
            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
