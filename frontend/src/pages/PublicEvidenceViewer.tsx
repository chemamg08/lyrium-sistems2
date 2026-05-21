import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Maximize, Minimize, Download, AlertCircle } from 'lucide-react';

interface EvidenceMeta {
  fileName: string;
  mimeType: string;
  fileSize: number;
  description: string;
}

const PUBLIC_EVIDENCE_API_BASE = '/api/public/evidence';

const getPublicEvidenceApiUrl = (token?: string) => token ? `${PUBLIC_EVIDENCE_API_BASE}/${token}` : '';
const getPublicEvidenceMetadataUrl = (token?: string) => token ? `${PUBLIC_EVIDENCE_API_BASE}/${token}/metadata` : '';

export default function PublicEvidenceViewer() {
  const { token } = useParams<{ token: string }>();
  const [meta, setMeta] = useState<EvidenceMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    fetch(getPublicEvidenceMetadataUrl(token))
      .then(r => {
        if (!r.ok) throw new Error('No encontrado');
        return r.json();
      })
      .then(data => {
        setMeta(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Esta prueba no está disponible o ha sido eliminada.');
        setLoading(false);
      });
  }, [token]);

  useEffect(() => {
    if (!token || meta?.mimeType !== 'application/pdf') return;
    window.location.replace(getPublicEvidenceApiUrl(token));
  }, [meta, token]);

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Fallback: use webkit prefix for iOS Safari
      const anyEl = el as any;
      const anyDoc = document as any;
      if (!anyDoc.webkitFullscreenElement) {
        if (anyEl.webkitRequestFullscreen) {
          anyEl.webkitRequestFullscreen();
          setIsFullscreen(true);
        }
      } else {
        if (anyDoc.webkitExitFullscreen) {
          anyDoc.webkitExitFullscreen();
          setIsFullscreen(false);
        }
      }
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement || !!(document as any).webkitFullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
    };
  }, []);

  const fileUrl = getPublicEvidenceApiUrl(token);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-sm animate-pulse">Cargando...</div>
      </div>
    );
  }

  if (error || !meta) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <p className="text-white text-sm">{error || 'No disponible'}</p>
        </div>
      </div>
    );
  }

  const isImage = meta.mimeType?.startsWith('image/');
  const isVideo = meta.mimeType?.startsWith('video/');
  const isAudio = meta.mimeType?.startsWith('audio/');
  const isPdf = meta.mimeType === 'application/pdf';

  if (isPdf) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-sm animate-pulse">Abriendo PDF...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col" ref={containerRef}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/80 backdrop-blur">
        <div className="min-w-0">
          <p className="text-white text-sm font-medium truncate">{meta.description || meta.fileName}</p>
          <p className="text-white/50 text-xs">{(meta.fileSize / (1024 * 1024)).toFixed(2)} MB</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          <a
            href={fileUrl}
            download={meta.fileName}
            className="text-white/70 hover:text-white transition-colors"
            title="Descargar"
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            onClick={toggleFullscreen}
            className="text-white/70 hover:text-white transition-colors"
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
          <span className="text-white/40 text-xs tracking-wider select-none">Lyrium</span>
        </div>
      </div>

      {/* Viewer */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        {isImage && (
          <img
            src={fileUrl}
            alt={meta.fileName}
            className="max-w-full max-h-full object-contain"
            style={{ maxHeight: isFullscreen ? '100vh' : 'calc(100vh - 60px)' }}
          />
        )}
        {isVideo && (
          <video
            src={fileUrl}
            controls
            playsInline
            className="max-w-full max-h-full"
            style={{ maxHeight: isFullscreen ? '100vh' : 'calc(100vh - 60px)' }}
          />
        )}
        {isAudio && (
          <div className="flex flex-col items-center gap-4">
            <div className="h-24 w-24 rounded-full bg-white/10 flex items-center justify-center">
              <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
            </div>
            <audio src={fileUrl} controls className="w-72 max-w-full" />
          </div>
        )}
        {!isImage && !isVideo && !isAudio && !isPdf && (
          <div className="text-center p-6">
            <p className="text-white/60 text-sm mb-4">Vista previa no disponible</p>
            <a
              href={fileUrl}
              download={meta.fileName}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
            >
              <Download className="h-4 w-4" />
              Descargar archivo
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
