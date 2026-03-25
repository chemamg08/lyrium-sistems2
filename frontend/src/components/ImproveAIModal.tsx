import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Brain, FolderPlus, Folder, Eye, Trash2, Upload, FileText, ChevronLeft, Loader2 } from 'lucide-react';
import { authFetch } from '../lib/authFetch';

const API_URL = import.meta.env.VITE_API_URL;

interface AIFile {
  id: string;
  originalName: string;
  size: number;
  uploadedAt: string;
  processed: boolean;
  fragmentCount: number;
}

interface AIFolder {
  id: string;
  name: string;
  parentFolder: string | null;
  createdAt: string;
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

export default function ImproveAIModal({ isOpen, onClose }: Props) {
  const { t } = useTranslation();
  const [folders, setFolders] = useState<AIFolder[]>([]);
  const [files, setFiles] = useState<AIFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<{ id: string | null; name: string }[]>([{ id: null, name: t('improveAI.root') }]);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [storageInfo, setStorageInfo] = useState({ usedBytes: 0, maxBytes: 600 * 1024 * 1024, fileCount: 0 });
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<string | null>(null);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const accountId = sessionStorage.getItem('accountId') || '';

  // Polling: reload files every 3s while any file is still processing
  const startPollingIfNeeded = useCallback((fileList: AIFile[]) => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    const hasProcessing = fileList.some(f => !f.processed);
    if (!hasProcessing) return;
    pollRef.current = setInterval(async () => {
      try {
        const fileParam = currentFolder ? `&folderId=${currentFolder}` : '';
        const res = await authFetch(`${API_URL}/improve-ai/files?accountId=${accountId}${fileParam}`);
        if (res.ok) {
          const updated: AIFile[] = await res.json();
          setFiles(updated);
          if (!updated.some(f => !f.processed)) {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            loadStorage();
          }
        }
      } catch {}
    }, 3000);
  }, [accountId, currentFolder]);

  useEffect(() => {
    if (isOpen) {
      loadData();
      loadStorage();
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [isOpen, currentFolder]);

  const loadData = async () => {
    setLoading(true);
    try {
      const folderParam = currentFolder ? `&parentFolder=${currentFolder}` : '';
      const fileParam = currentFolder ? `&folderId=${currentFolder}` : '';
      const [foldersRes, filesRes] = await Promise.all([
        authFetch(`${API_URL}/improve-ai/folders?accountId=${accountId}${folderParam}`),
        authFetch(`${API_URL}/improve-ai/files?accountId=${accountId}${fileParam}`),
      ]);
      if (foldersRes.ok) setFolders(await foldersRes.json());
      if (filesRes.ok) {
        const fileList: AIFile[] = await filesRes.json();
        setFiles(fileList);
        startPollingIfNeeded(fileList);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadStorage = async () => {
    try {
      const res = await authFetch(`${API_URL}/improve-ai/storage?accountId=${accountId}`);
      if (res.ok) setStorageInfo(await res.json());
    } catch {}
  };

  const navigateToFolder = (folderId: string, folderName: string) => {
    setCurrentFolder(folderId);
    setFolderPath(prev => [...prev, { id: folderId, name: folderName }]);
  };

  const navigateBack = () => {
    if (folderPath.length <= 1) return;
    const newPath = folderPath.slice(0, -1);
    setFolderPath(newPath);
    setCurrentFolder(newPath[newPath.length - 1].id);
  };

  const navigateToPathIndex = (index: number) => {
    const newPath = folderPath.slice(0, index + 1);
    setFolderPath(newPath);
    setCurrentFolder(newPath[newPath.length - 1].id);
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await authFetch(`${API_URL}/improve-ai/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, name: newFolderName.trim(), parentFolder: currentFolder }),
      });
      if (res.ok) {
        setNewFolderName('');
        setShowNewFolder(false);
        loadData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('accountId', accountId);
      if (currentFolder) formData.append('folderId', currentFolder);
      formData.append('uploadedBy', sessionStorage.getItem('userId') || accountId);
      for (let i = 0; i < fileList.length; i++) {
        formData.append('files', fileList[i]);
      }
      const res = await authFetch(`${API_URL}/improve-ai/upload`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        loadData();
        loadStorage();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const viewFile = (fileId: string) => {
    window.open(`${API_URL}/improve-ai/view/${fileId}`, '_blank');
  };

  const deleteFile = async (fileId: string) => {
    try {
      const res = await authFetch(`${API_URL}/improve-ai/files/${fileId}`, { method: 'DELETE' });
      if (res.ok) {
        setFiles(prev => prev.filter(f => f.id !== fileId));
        loadStorage();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setConfirmDeleteFile(null);
    }
  };

  const deleteFolder = async (folderId: string) => {
    try {
      const res = await authFetch(`${API_URL}/improve-ai/folders/${folderId}`, { method: 'DELETE' });
      if (res.ok) {
        loadData();
        loadStorage();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setConfirmDeleteFolder(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleUpload(e.dataTransfer.files);
  };

  if (!isOpen) return null;

  const usedMB = (storageInfo.usedBytes / (1024 * 1024)).toFixed(1);
  const maxMB = (storageInfo.maxBytes / (1024 * 1024)).toFixed(0);
  const usagePercent = Math.min((storageInfo.usedBytes / storageInfo.maxBytes) * 100, 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">{t('improveAI.title')}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Description */}
        <div className="px-6 py-3 border-b border-border text-xs text-muted-foreground bg-accent/30 shrink-0">
          {t('improveAI.description')}
        </div>

        {/* Storage bar */}
        <div className="px-6 py-2 border-b border-border shrink-0">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>{usedMB} MB / {maxMB} MB</span>
            <span>{storageInfo.fileCount} {t('improveAI.filesCount')}</span>
          </div>
          <div className="w-full bg-accent rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${usagePercent > 90 ? 'bg-destructive' : 'bg-primary'}`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </div>

        {/* Breadcrumb + actions */}
        <div className="px-6 py-2 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1 text-sm overflow-x-auto">
            {folderPath.length > 1 && (
              <button onClick={navigateBack} className="p-1 hover:bg-accent rounded shrink-0">
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {folderPath.map((segment, idx) => (
              <span key={idx} className="flex items-center gap-1 shrink-0">
                {idx > 0 && <span className="text-muted-foreground">/</span>}
                <button
                  onClick={() => navigateToPathIndex(idx)}
                  className={`hover:underline ${idx === folderPath.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
                >
                  {segment.name}
                </button>
              </span>
            ))}
          </div>
          <button
            onClick={() => setShowNewFolder(!showNewFolder)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors shrink-0"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            {t('improveAI.newFolder')}
          </button>
        </div>

        {/* New folder input */}
        {showNewFolder && (
          <div className="px-6 py-2 border-b border-border flex items-center gap-2 shrink-0">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createFolder(); }}
              placeholder={t('improveAI.folderName')}
              className="flex-1 text-sm bg-accent/50 border border-border rounded px-3 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
            <button
              onClick={createFolder}
              disabled={!newFolderName.trim()}
              className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-40"
            >
              {t('improveAI.create')}
            </button>
            <button
              onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {t('improveAI.cancel')}
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden px-6 py-3 flex flex-col gap-1 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              {t('improveAI.loading')}
            </div>
          ) : (
            <>
              {/* Folders — max 4 visible, scroll if more */}
              {folders.length > 0 && (
                <div className="shrink-0 overflow-y-auto" style={{ maxHeight: '176px' }}>
                  {folders.map(folder => (
                    <div key={folder.id} className="flex items-center justify-between py-2 border-b border-border/50 group">
                      <button
                        onClick={() => navigateToFolder(folder.id, folder.name)}
                        className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
                      >
                        <Folder className="h-4 w-4 text-primary/70" />
                        <span className="font-medium">{folder.name}</span>
                      </button>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {confirmDeleteFolder === folder.id ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-destructive">{t('improveAI.confirmDelete')}</span>
                            <button onClick={() => deleteFolder(folder.id)} className="text-xs text-destructive font-medium hover:underline">{t('improveAI.yes')}</button>
                            <button onClick={() => setConfirmDeleteFolder(null)} className="text-xs text-muted-foreground hover:underline">{t('improveAI.no')}</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDeleteFolder(folder.id)} className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Files — max 4 visible, scroll if more */}
              {files.length > 0 && (
                <div className="shrink-0 overflow-y-auto" style={{ maxHeight: '192px' }}>
                  {files.map(file => (
                    <div key={file.id} className="flex items-center justify-between py-2 border-b border-border/50 group">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-foreground truncate">{file.originalName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatSize(file.size)} • {formatDate(file.uploadedAt)}
                            {!file.processed && <span className="ml-2 text-amber-500">{t('improveAI.processing')}</span>}
                            {file.processed && file.fragmentCount > 0 && (
                              <span className="ml-2 text-emerald-500">✓ {file.fragmentCount} {t('improveAI.fragments')}</span>
                            )}
                            {file.processed && file.fragmentCount === 0 && (
                              <span className="ml-2 text-destructive">{t('improveAI.noText')}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => viewFile(file.id)}
                          className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                          title={t('improveAI.view')}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {confirmDeleteFile === file.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => deleteFile(file.id)} className="text-xs text-destructive font-medium hover:underline">{t('improveAI.yes')}</button>
                            <button onClick={() => setConfirmDeleteFile(null)} className="text-xs text-muted-foreground hover:underline">{t('improveAI.no')}</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteFile(file.id)}
                            className="p-1.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors"
                            title={t('improveAI.delete')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {folders.length === 0 && files.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">{t('improveAI.empty')}</p>
              )}
            </>
          )}
        </div>

        {/* Drop zone */}
        <div className="px-6 py-4 border-t border-border shrink-0">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            }`}
          >
            {uploading ? (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('improveAI.uploading')}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('improveAI.dropzone')}</p>
                <p className="text-xs text-muted-foreground">{t('improveAI.pdfOnly')}</p>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            onChange={(e) => handleUpload(e.target.files)}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
}
