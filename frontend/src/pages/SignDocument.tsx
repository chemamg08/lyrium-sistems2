import { useState, useRef, useEffect, useCallback } from "react";
import { FileText, Check, AlertTriangle, Clock, Loader2, X, Pencil, RotateCcw } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;

type SigningStatus = 'loading' | 'ready' | 'signed' | 'expired' | 'error' | 'submitting' | 'done';

const SignDocument = () => {
  const token = window.location.pathname.split('/firmar/')[1];

  const [status, setStatus] = useState<SigningStatus>('loading');
  const [signerName, setSignerName] = useState('');
  const [contractName, setContractName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [signedAt, setSignedAt] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [showSignPad, setShowSignPad] = useState(false);

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!token) { setStatus('error'); setErrorMsg('Enlace no válido'); return; }
    fetchSigningInfo();
  }, []);

  const fetchSigningInfo = async () => {
    try {
      const res = await fetch(`${API_URL}/sign/${token}`);
      const data = await res.json();

      if (!res.ok) { setStatus('error'); setErrorMsg(data.error || 'Error'); return; }

      if (data.status === 'signed') {
        setStatus('signed');
        setSignerName(data.signerName);
        setSignedAt(data.signedAt);
        return;
      }

      if (data.status === 'expired') { setStatus('expired'); return; }

      setSignerName(data.signerName);
      setContractName(data.contractName);

      // Load PDF
      const pdfRes = await fetch(`${API_URL}/sign/${token}/pdf`);
      if (pdfRes.ok) {
        const blob = await pdfRes.blob();
        setPdfUrl(URL.createObjectURL(blob));
      }

      setStatus('ready');
    } catch {
      setStatus('error');
      setErrorMsg('Error de conexión');
    }
  };

  // Canvas drawing logic
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  useEffect(() => {
    if (showSignPad) {
      setTimeout(initCanvas, 50);
    }
  }, [showSignPad, initCanvas]);

  const getPosition = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDrawingRef.current = true;
    lastPosRef.current = getPosition(e);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const pos = getPosition(e);
    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPosRef.current = pos;
  };

  const stopDraw = () => {
    isDrawingRef.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  };

  const isCanvasEmpty = () => {
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const ctx = canvas.getContext('2d');
    if (!ctx) return true;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return !imageData.data.some((channel, i) => i % 4 === 3 && channel !== 0);
  };

  const handleSubmit = async () => {
    if (isCanvasEmpty()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    setStatus('submitting');

    try {
      const dpr = window.devicePixelRatio || 1;
      // Create a clean canvas at 1x for the signature data
      const exportCanvas = document.createElement('canvas');
      const rect = canvas.getBoundingClientRect();
      exportCanvas.width = rect.width;
      exportCanvas.height = rect.height;
      const exportCtx = exportCanvas.getContext('2d');
      if (exportCtx) {
        exportCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, rect.width, rect.height);
      }
      const signatureDataUrl = exportCanvas.toDataURL('image/png');

      const res = await fetch(`${API_URL}/sign/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureDataUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus('ready');
        setErrorMsg(data.error || 'Error al enviar firma');
        return;
      }

      setStatus('done');
      setSignedAt(data.signedAt);
    } catch {
      setStatus('ready');
      setErrorMsg('Error de conexión al enviar la firma');
    }
  };

  // Render different states
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Cargando documento...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="h-8 w-8 text-amber-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Enlace expirado</h1>
          <p className="text-gray-600">Este enlace de firma ha expirado. Contacte con su despacho para solicitar uno nuevo.</p>
        </div>
      </div>
    );
  }

  if (status === 'signed' || status === 'done') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            {status === 'done' ? '¡Documento firmado!' : 'Documento ya firmado'}
          </h1>
          <p className="text-gray-600 mb-2">
            {status === 'done'
              ? 'Su firma se ha registrado correctamente. Recibirá una copia del documento firmado por email.'
              : `Este documento fue firmado por ${signerName}.`
            }
          </p>
          {signedAt && (
            <p className="text-sm text-gray-400">
              {new Date(signedAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      </div>
    );
  }

  // status === 'ready' or 'submitting'
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <FileText className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{contractName}</h1>
              <p className="text-sm text-gray-500">Documento pendiente de firma</p>
            </div>
          </div>
          <button
            onClick={() => setShowSignPad(true)}
            disabled={status === 'submitting'}
            className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            <Pencil className="h-4 w-4" />
            Firmar documento
          </button>
        </div>
      </div>

      {/* PDF Viewer */}
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full border-0"
              style={{ height: 'calc(100vh - 140px)' }}
              title="Documento a firmar"
            />
          ) : (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Cargando PDF...
            </div>
          )}
        </div>
      </div>

      {/* Signature Pad Modal */}
      {showSignPad && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Firme aquí</h2>
              <button onClick={() => setShowSignPad(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5">
              <p className="text-sm text-gray-600 mb-4">
                Dibuje su firma con el ratón o con el dedo en el recuadro inferior.
              </p>

              {/* Signature canvas */}
              <div className="border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 relative" style={{ touchAction: 'none' }}>
                <canvas
                  ref={canvasRef}
                  className="w-full cursor-crosshair rounded-xl"
                  style={{ height: '200px', display: 'block' }}
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={stopDraw}
                  onMouseLeave={stopDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={stopDraw}
                />
                <button
                  onClick={clearCanvas}
                  className="absolute top-2 right-2 p-1.5 bg-white rounded-lg shadow-sm border border-gray-200 hover:bg-gray-50"
                  title="Borrar"
                >
                  <RotateCcw className="h-4 w-4 text-gray-500" />
                </button>
              </div>

              <p className="text-xs text-gray-400 mt-3 text-center">
                Al firmar, acepta que esta firma electrónica tiene la misma validez que una firma manuscrita.
              </p>

              {errorMsg && status === 'ready' && (
                <p className="text-sm text-red-600 mt-2 text-center">{errorMsg}</p>
              )}
            </div>

            <div className="flex gap-3 p-5 border-t border-gray-200">
              <button
                onClick={() => setShowSignPad(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={status === 'submitting'}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {status === 'submitting' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Firmando...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Confirmar firma
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SignDocument;
