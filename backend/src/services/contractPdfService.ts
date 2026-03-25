import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, rgb, StandardFonts, PDFImage } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATES_DIR = path.join(__dirname, '../../templates');
const GENERATED_DIR = path.join(__dirname, '../../generated_contracts');
const LOGO_PATH = path.join(__dirname, '../../uploads/logo.png');

export interface EmptyField {
  placeholder: string;  // ej: "___", "[NOMBRE]", "........"
  context: string;      // contexto alrededor del campo vacío
  type?: string;        // tipo inferido: "nombre", "dni", "fecha", "direccion", etc.
}

interface ContractStructure {
  text: string;
  emptyFields: EmptyField[];  // campos vacíos detectados
  metadata: {
    analyzedAt: string;
    baseContractId: string;
    originalFileName: string;
  };
}

/**
 * Asegura que existan los directorios necesarios
 */
async function ensureDirectories() {
  await fs.mkdir(TEMPLATES_DIR, { recursive: true });
  await fs.mkdir(GENERATED_DIR, { recursive: true });
}

/**
 * Extrae texto de un PDF manteniendo estructura
 * @param pdfPath Ruta del archivo PDF
 * @returns Texto extraído con estructura preservada
 */
async function extractPdfText(pdfPath: string): Promise<string> {
  try {
    const pdfBuffer = await fs.readFile(pdfPath);
    
    // Importación dinámica para pdf-parse (módulo CommonJS con clase PDFParse)
    const pdfParseModule: any = await import('pdf-parse');
    const PDFParse = pdfParseModule.PDFParse;
    
    // Instanciar el parser con el buffer
    const parser = new PDFParse({ data: pdfBuffer });
    
    // Llamar al método getText para extraer el texto
    const result = await parser.getText();
    
    // pdf-parse v2 devuelve un objeto con el texto
    return result.text || 'No se pudo extraer texto del PDF';
  } catch (error) {
    console.error('Error extrayendo texto del PDF:', error);
    throw new Error('No se pudo extraer texto del PDF');
  }
}

/**
 * Detecta campos vacíos en el texto del contrato
 * @param text Texto del contrato
 * @returns Array de campos vacíos detectados
 */
function detectEmptyFields(text: string): EmptyField[] {
  const fields: EmptyField[] = [];
  
  // Patrones comunes de campos vacíos
  const patterns = [
    // Líneas de guiones bajos: ________
    { regex: /_{3,}/g, type: 'generico' },
    // Puntos suspensivos: ..........
    { regex: /\.{3,}/g, type: 'generico' },
    // Placeholders entre corchetes: [NOMBRE], [DNI], etc.
    { regex: /\[(.*?)\]/g, type: 'placeholder' },
    // Campos con formato: __________: o _________ ,
    { regex: /_{3,}[:;,\s]/g, type: 'campo' },
    // Espacios con guiones: - - - - -
    { regex: /-\s*-\s*-\s*-/g, type: 'generico' }
  ];

  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    for (const pattern of patterns) {
      const matches = [...line.matchAll(pattern.regex)];
      
      for (const match of matches) {
        const placeholder = match[0];
        
        // Obtener contexto (línea actual + anterior y siguiente)
        const prevLine = i > 0 ? lines[i - 1] : '';
        const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
        
        // Contexto: 50 chars antes y después del placeholder
        const startIndex = Math.max(0, match.index! - 50);
        const endIndex = Math.min(line.length, match.index! + placeholder.length + 50);
        const context = line.substring(startIndex, endIndex).trim();
        
        // Inferir tipo del campo según el contexto
        let inferredType = pattern.type;
        const contextLower = (prevLine + ' ' + context + ' ' + nextLine).toLowerCase();
        
        if (contextLower.includes('nombre') || contextLower.includes('denominado')) {
          inferredType = 'nombre';
        } else if (contextLower.includes('dni') || contextLower.includes('nif') || contextLower.includes('identificación')) {
          inferredType = 'dni';
        } else if (contextLower.includes('dirección') || contextLower.includes('domicilio') || contextLower.includes('calle')) {
          inferredType = 'direccion';
        } else if (contextLower.includes('fecha') || contextLower.includes('día')) {
          inferredType = 'fecha';
        } else if (contextLower.includes('renta') || contextLower.includes('precio') || contextLower.includes('euros')) {
          inferredType = 'cantidad';
        } else if (contextLower.includes('teléfono') || contextLower.includes('telefono') || contextLower.includes('móvil')) {
          inferredType = 'telefono';
        } else if (contextLower.includes('email') || contextLower.includes('correo')) {
          inferredType = 'email';
        }
        
        // Evitar duplicados con el mismo contexto
        const isDuplicate = fields.some(f => 
          f.context === context && f.placeholder === placeholder
        );
        
        if (!isDuplicate && placeholder.length >= 3) {
          fields.push({
            placeholder,
            context,
            type: inferredType
          });
        }
      }
    }
  }
  
  return fields;
}

/**
 * Analiza un contrato PDF extrayendo su texto
 * @param contractBaseId ID del contrato base
 * @param pdfPath Ruta del archivo PDF
 * @param originalFileName Nombre original del archivo
 * @returns Estructura con el texto extraído
 */
export async function analyzeContractPdf(
  contractBaseId: string,
  pdfPath: string,
  originalFileName: string
): Promise<ContractStructure> {
  await ensureDirectories();

  try {
    const text = await extractPdfText(pdfPath);
    
    const emptyFields = detectEmptyFields(text);

    const structure: ContractStructure = {
      text,
      emptyFields,
      metadata: {
        analyzedAt: new Date().toISOString(),
        baseContractId: contractBaseId,
        originalFileName
      }
    };

    // Guardar estructura en archivo JSON
    const templateDir = path.join(TEMPLATES_DIR, contractBaseId);
    await fs.mkdir(templateDir, { recursive: true });

    const structurePath = path.join(templateDir, 'structure.json');
    await fs.writeFile(structurePath, JSON.stringify(structure, null, 2));

    return structure;
  } catch (error) {
    console.error('Error analizando contrato:', error);
    throw new Error('No se pudo analizar el contrato');
  }
}

/**
 * Carga la estructura previamente analizada de un contrato
 * @param contractBaseId ID del contrato base
 * @returns Estructura del contrato o null si no existe
 */
export async function loadContractStructure(
  contractBaseId: string
): Promise<ContractStructure | null> {
  try {
    const structurePath = path.join(TEMPLATES_DIR, contractBaseId, 'structure.json');
    const data = await fs.readFile(structurePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

/**
 * Verifica si existe un logo guardado
 */
async function hasLogo(): Promise<boolean> {
  try {
    await fs.access(LOGO_PATH);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize text for WinAnsi encoding (used by pdf-lib standard fonts).
 * Replaces unicode characters that cannot be encoded with ASCII equivalents.
 */
function sanitizeForWinAnsi(text: string): string {
  const replacements: Record<string, string> = {
    // Subscript / superscript numbers
    '\u2080': '0', '\u2081': '1', '\u2082': '2', '\u2083': '3', '\u2084': '4',
    '\u2085': '5', '\u2086': '6', '\u2087': '7', '\u2088': '8', '\u2089': '9',
    '\u00B2': '2', '\u00B3': '3', '\u00B9': '1',
    // Typographic quotes / dashes
    '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"',
    '\u2013': '-', '\u2014': '-', '\u2026': '...',
    // Misc symbols
    '\u2022': '-', '\u2023': '-', '\u25CF': '-', '\u25CB': 'o',
    '\u2192': '->', '\u2190': '<-',
    '\u20AC': 'EUR', '\u00A0': ' ',
  };
  let result = '';
  for (const ch of text) {
    if (replacements[ch]) {
      result += replacements[ch];
    } else {
      const code = ch.charCodeAt(0);
      // WinAnsi supports: 0x20-0x7E (basic ASCII) + 0xA0-0xFF (Latin-1 Supplement)
      if (code <= 0x7E || (code >= 0xA0 && code <= 0xFF)) {
        result += ch;
      } else {
        result += '?';
      }
    }
  }
  return result;
}

/**
 * Genera un nuevo PDF con el texto modificado, logo, estilos profesionales y números de página.
 * Soporta: # H1, ## H2, ### H3, **bold** inline, separadores, paginación.
 */
export async function generateContractFromText(
  modifiedText: string,
  outputFileName: string
): Promise<string> {
  await ensureDirectories();
  // Sanitize the entire text for WinAnsi encoding before processing
  modifiedText = sanitizeForWinAnsi(modifiedText);

  try {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Cargar logo si existe
    let logo: PDFImage | null = null;
    if (await hasLogo()) {
      try {
        const logoBytes = await fs.readFile(LOGO_PATH);
        logo = await pdfDoc.embedPng(logoBytes);
      } catch {
        // Logo optional — continue without it
      }
    }

    // Dimensiones A4
    const pageWidth = 595;
    const pageHeight = 842;
    const marginX = 60;
    const marginTop = 50;
    const marginBottom = 50;
    const footerZone = 22;
    const logoH = 40;
    const logoGap = 14;
    const maxWidth = pageWidth - 2 * marginX;

    // Tipografía
    const bodySize = 10.5;
    const h1Size = 16;
    const h2Size = 13;
    const h3Size = 11.5;
    const lhBody = 16;
    const lhH1 = 26;
    const lhH2 = 21;
    const lhH3 = 18;

    // Página activa y lista de todas las páginas (para números de pie)
    const allPages: ReturnType<typeof pdfDoc.addPage>[] = [];

    const contentTopY = pageHeight - marginTop - (logo ? logoH + logoGap : 0);
    const minY = marginBottom + footerZone;
    let currentPage = addNewPage();
    let y = contentTopY;

    function addNewPage() {
      const pg = pdfDoc.addPage([pageWidth, pageHeight]);
      allPages.push(pg);
      if (logo) {
        const scale = logoH / logo!.height;
        const lw = logo!.width * scale;
        pg.drawImage(logo!, {
          x: pageWidth - marginX - lw,
          y: pageHeight - marginTop - logoH,
          width: lw,
          height: logoH
        });
      }
      return pg;
    }

    function checkNewPage(needed: number) {
      if (y - needed < minY) {
        currentPage = addNewPage();
        y = contentTopY;
      }
    }

    function drawSep(lineY: number, r = 0.45, g = 0.45, b = 0.45, thick = 0.6) {
      currentPage.drawLine({
        start: { x: marginX, y: lineY },
        end: { x: pageWidth - marginX, y: lineY },
        thickness: thick,
        color: rgb(r, g, b)
      });
    }

    // Parsear inline **bold**  →  [{text, bold}]
    function parseInline(src: string) {
      const segs: { text: string; bold: boolean }[] = [];
      const re = /\*\*(.+?)\*\*/g;
      let last = 0, m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        if (m.index > last) segs.push({ text: src.slice(last, m.index), bold: false });
        segs.push({ text: m[1], bold: true });
        last = re.lastIndex;
      }
      if (last < src.length) segs.push({ text: src.slice(last), bold: false });
      return segs.length ? segs : [{ text: src, bold: false }];
    }

    // Wrap mixed inline segments to maxWidth → array of display lines (keeping **..** markers)
    function wrapInline(segs: { text: string; bold: boolean }[], maxW: number, fs: number): string[] {
      const spW = font.widthOfTextAtSize(' ', fs);
      type Word = { word: string; bold: boolean };
      const words: Word[] = [];
      for (const seg of segs) {
        const tokens = seg.text.split(/\s+/).filter(Boolean);
        for (const t of tokens) words.push({ word: t, bold: seg.bold });
      }
      const lines: string[] = [];
      let curLine = '';
      let curW = 0;
      for (const w of words) {
        const f = w.bold ? boldFont : font;
        const ww = f.widthOfTextAtSize(w.word, fs);
        const gap = curLine ? spW : 0;
        if (curLine && curW + gap + ww > maxW) {
          lines.push(curLine);
          curLine = w.bold ? `**${w.word}**` : w.word;
          curW = ww;
        } else {
          curLine += (curLine ? ' ' : '') + (w.bold ? `**${w.word}**` : w.word);
          curW += gap + ww;
        }
      }
      if (curLine) lines.push(curLine);
      return lines;
    }

    // Draw one display line (may contain **bold** spans) at (x, y)
    function drawInlineLine(src: string, x0: number, ly: number, fs: number) {
      const segs = parseInline(src);
      let x = x0;
      for (const seg of segs) {
        if (!seg.text) continue;
        const f = seg.bold ? boldFont : font;
        currentPage.drawText(seg.text, { x, y: ly, size: fs, font: f, color: rgb(0.05, 0.05, 0.05) });
        x += f.widthOfTextAtSize(seg.text, fs);
      }
    }

    // ── Main render loop ──────────────────────────────────────────────
    for (const rawLine of modifiedText.split('\n')) {
      const line = rawLine.trimEnd();

      // Blank line → small gap
      if (!line.trim()) { y -= lhBody * 0.55; continue; }

      // H1  # Title
      if (/^# /.test(line)) {
        const text = line.replace(/^# /, '').trim();
        checkNewPage(lhH1 + 14);
        y -= 8;
        currentPage.drawText(text, { x: marginX, y, size: h1Size, font: boldFont, color: rgb(0.06, 0.06, 0.06) });
        y -= lhH1;
        drawSep(y + 5, 0.25, 0.25, 0.25, 1);
        y -= 8;
        continue;
      }

      // H2  ## Subtitle
      if (/^## /.test(line)) {
        const text = line.replace(/^## /, '').trim();
        checkNewPage(lhH2 + 10);
        y -= 5;
        currentPage.drawText(text, { x: marginX, y, size: h2Size, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
        y -= lhH2;
        drawSep(y + 4, 0.5, 0.5, 0.5, 0.6);
        y -= 6;
        continue;
      }

      // H3  ### Section
      if (/^### /.test(line)) {
        const text = line.replace(/^### /, '').trim();
        checkNewPage(lhH3 + 6);
        y -= 3;
        currentPage.drawText(text, { x: marginX, y, size: h3Size, font: boldFont, color: rgb(0.15, 0.15, 0.15) });
        y -= lhH3;
        y -= 4;
        continue;
      }

      // ALL-CAPS line → treat as H2 (legacy format)
      const stripped = line.replace(/\*\*/g, '').trim();
      if (
        stripped.length >= 3 && stripped.length < 70 &&
        stripped === stripped.toUpperCase() &&
        /[A-ZÁÉÍÓÚÑ]/.test(stripped)
      ) {
        checkNewPage(lhH2 + 10);
        y -= 5;
        currentPage.drawText(stripped, { x: marginX, y, size: h2Size, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
        y -= lhH2;
        drawSep(y + 4, 0.5, 0.5, 0.5, 0.6);
        y -= 6;
        continue;
      }

      // Normal paragraph (with optional **bold** spans)
      const wrapped = wrapInline(parseInline(line.trim()), maxWidth, bodySize);
      for (const wl of wrapped) {
        checkNewPage(lhBody);
        drawInlineLine(wl, marginX, y, bodySize);
        y -= lhBody;
      }
      y -= lhBody * 0.18; // small gap after paragraph
    }

    // ── Page numbers ──────────────────────────────────────────────────
    const total = allPages.length;
    allPages.forEach((pg, i) => {
      const label = `Página ${i + 1} de ${total}`;
      const lw = font.widthOfTextAtSize(label, 8);
      pg.drawText(label, {
        x: (pageWidth - lw) / 2,
        y: marginBottom - 12,
        size: 8,
        font,
        color: rgb(0.55, 0.55, 0.55)
      });
    });

    const outputPath = path.join(GENERATED_DIR, outputFileName);
    await fs.writeFile(outputPath, await pdfDoc.save());
    return outputPath;
  } catch (error) {
    console.error('Error generando contrato:', error);
    throw new Error('No se pudo generar el contrato');
  }
}

/**
 * Genera un nuevo PDF basado en el template y los cambios especificados
 * @param contractBaseId ID del contrato base
 * @param variables Objeto con los campos variables a reemplazar
 * @param outputFileName Nombre del archivo de salida
 * @returns Ruta del PDF generado
 */
export async function generateContractFromTemplate(
  contractBaseId: string,
  variables: Record<string, string>,
  outputFileName: string
): Promise<string> {
  // Esta función ya no se usa con el nuevo sistema
  // La IA modifica el texto directamente y llama a generateContractFromText
  throw new Error('Usar generateContractFromText en lugar de esta función');
}

/**
 * Verifica si un contrato ya fue analizado
 * @param contractBaseId ID del contrato base
 * @returns true si ya existe la estructura analizada
 */
export async function isContractAnalyzed(contractBaseId: string): Promise<boolean> {
  const structure = await loadContractStructure(contractBaseId);
  return structure !== null;
}
