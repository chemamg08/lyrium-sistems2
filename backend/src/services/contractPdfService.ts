import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, rgb, StandardFonts, PDFImage } from 'pdf-lib';
import { getAccountLogoPath } from '../utils/accountLogo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATES_DIR = path.join(__dirname, '../../templates');
const GENERATED_DIR = path.join(__dirname, '../../generated_contracts');

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
async function getLogoPath(accountId?: string): Promise<string | null> {
  if (!accountId) {
    return null;
  }

  try {
    const logoPath = getAccountLogoPath(accountId);
    await fs.access(logoPath);
    return logoPath;
  } catch {
    return null;
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
async function generateLegacyContractFromText(
  modifiedText: string,
  outputFileName: string,
  accountId?: string
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
    const logoPath = await getLogoPath(accountId);
    if (logoPath) {
      try {
        const logoBytes = await fs.readFile(logoPath);
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
    const clauseSize = 10;
    const compactSize = 9.25;
    const h1Size = 16;
    const h2Size = 13;
    const h3Size = 11.5;
    const lhBody = 16;
    const lhClause = 15;
    const lhCompact = 13.5;
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

    function splitTokenToFit(word: string, isBold: boolean, maxW: number, fs: number) {
      const targetFont = isBold ? boldFont : font;
      if (targetFont.widthOfTextAtSize(word, fs) <= maxW) return [word];

      const parts: string[] = [];
      let current = '';
      for (const char of word) {
        const next = current + char;
        if (current && targetFont.widthOfTextAtSize(next, fs) > maxW) {
          parts.push(`${current}-`);
          current = char;
        } else {
          current = next;
        }
      }
      if (current) parts.push(current);
      return parts;
    }

    // Wrap mixed inline segments to maxWidth → array of display lines (keeping **..** markers)
    function wrapInline(segs: { text: string; bold: boolean }[], maxW: number, fs: number): string[] {
      const spW = font.widthOfTextAtSize(' ', fs);
      type Word = { word: string; bold: boolean };
      const words: Word[] = [];
      for (const seg of segs) {
        const tokens = seg.text.split(/\s+/).filter(Boolean);
        for (const token of tokens) {
          const tokenParts = splitTokenToFit(token, seg.bold, maxW, fs);
          tokenParts.forEach((part) => words.push({ word: part, bold: seg.bold }));
        }
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

    function isClauseLine(src: string) {
      return /^(\d+([.)]|\.\d+)|[A-Z]\)|CL[AÁ]USULA|ANEXO|APARTADO)/i.test(src.trim());
    }

    function isCompactLine(src: string) {
      return /^(Firmado|Firma|DNI|NIF|Email|Correo|Tel[eé]fono|En\s+\w+|Lugar|Fecha)/i.test(src.trim());
    }

    // ── Main render loop ──────────────────────────────────────────────
    for (const rawLine of modifiedText.split('\n')) {
      const line = rawLine.trimEnd();

      // Blank line → small gap
      if (!line.trim()) { y -= lhBody * 0.55; continue; }

      // H1  # Title
      if (/^# /.test(line)) {
        const text = line.replace(/^# /, '').trim();
        y -= 8;
        const wrappedTitle = wrapInline([{ text, bold: true }], maxWidth, h1Size);
        for (const titleLine of wrappedTitle) {
          checkNewPage(lhH1 + 14);
          drawInlineLine(titleLine, marginX, y, h1Size);
          y -= lhH1;
        }
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
      const trimmedLine = line.trim();
      const paragraphSize = isCompactLine(trimmedLine)
        ? compactSize
        : isClauseLine(trimmedLine)
          ? clauseSize
          : bodySize;
      const paragraphLineHeight = isCompactLine(trimmedLine)
        ? lhCompact
        : isClauseLine(trimmedLine)
          ? lhClause
          : lhBody;
      const paragraphIndent = isClauseLine(trimmedLine) ? 14 : 0;
      const wrapped = wrapInline(parseInline(trimmedLine), maxWidth - paragraphIndent, paragraphSize);
      for (const wl of wrapped) {
        checkNewPage(paragraphLineHeight);
        drawInlineLine(wl, marginX + paragraphIndent, y, paragraphSize);
        y -= paragraphLineHeight;
      }
      y -= paragraphLineHeight * 0.18; // small gap after paragraph
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

export async function generateContractFromText(
  modifiedText: string,
  outputFileName: string,
  accountId?: string
): Promise<string> {
  await ensureDirectories();
  const sanitizedText = sanitizeForWinAnsi(modifiedText);

  try {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const generatedAt = new Date().toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    let logo: PDFImage | null = null;
    const logoPath = await getLogoPath(accountId);
    if (logoPath) {
      try {
        const logoBytes = await fs.readFile(logoPath);
        logo = await pdfDoc.embedPng(logoBytes);
      } catch {
        logo = null;
      }
    }

    const pageWidth = 595;
    const pageHeight = 842;
    const marginX = 58;
    const marginTop = 52;
    const marginBottom = 46;
    const headerHeight = 52;
    const footerHeight = 28;
    const logoHeight = 28;
    const maxWidth = pageWidth - marginX * 2;
    const contentTopY = pageHeight - marginTop - headerHeight;
    const minY = marginBottom + footerHeight;

    const palette = {
      text: rgb(0.12, 0.14, 0.18),
      muted: rgb(0.46, 0.49, 0.54),
      accent: rgb(0.18, 0.25, 0.42),
      divider: rgb(0.84, 0.87, 0.91),
      dividerStrong: rgb(0.72, 0.76, 0.81),
      sectionBg: rgb(0.962, 0.968, 0.98),
      sectionBorder: rgb(0.82, 0.85, 0.9)
    };

    const bodySize = 10.4;
    const clauseSize = 10;
    const compactSize = 9.25;
    const h1Size = 17;
    const h2Size = 12.8;
    const h3Size = 11.5;
    const lineBody = 15.8;
    const lineClause = 15;
    const lineCompact = 13.5;
    const lineH1 = 24;
    const lineH2 = 19;
    const lineH3 = 17;

    const allPages: Array<ReturnType<typeof pdfDoc.addPage>> = [];
    let currentPage = addNewPage();
    let y = contentTopY;

    function addNewPage() {
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      allPages.push(page);

      page.drawText('LYRIUM SYSTEMS', {
        x: marginX,
        y: pageHeight - marginTop + 8,
        size: 8,
        font: boldFont,
        color: palette.accent
      });
      page.drawText('Documento contractual generado', {
        x: marginX,
        y: pageHeight - marginTop - 4,
        size: 9,
        font,
        color: palette.muted
      });

      if (logo) {
        const scale = logoHeight / logo.height;
        const logoWidth = logo.width * scale;
        page.drawImage(logo, {
          x: pageWidth - marginX - logoWidth,
          y: pageHeight - marginTop - 2,
          width: logoWidth,
          height: logoHeight
        });
      }

      page.drawLine({
        start: { x: marginX, y: pageHeight - marginTop - 18 },
        end: { x: pageWidth - marginX, y: pageHeight - marginTop - 18 },
        thickness: 1,
        color: palette.dividerStrong
      });

      return page;
    }

    function ensureSpace(requiredHeight: number) {
      if (y - requiredHeight < minY) {
        currentPage = addNewPage();
        y = contentTopY;
      }
    }

    function parseInline(text: string) {
      const segments: Array<{ text: string; bold: boolean }> = [];
      const regex = /\*\*(.+?)\*\*/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          segments.push({ text: text.slice(lastIndex, match.index), bold: false });
        }
        segments.push({ text: match[1], bold: true });
        lastIndex = regex.lastIndex;
      }

      if (lastIndex < text.length) {
        segments.push({ text: text.slice(lastIndex), bold: false });
      }

      return segments.length > 0 ? segments : [{ text, bold: false }];
    }

    function measureInline(text: string, fontSize: number) {
      return parseInline(text).reduce((total, segment) => {
        const activeFont = segment.bold ? boldFont : font;
        return total + activeFont.widthOfTextAtSize(segment.text, fontSize);
      }, 0);
    }

    function splitTokenToFit(word: string, isBold: boolean, maxLineWidth: number, fontSize: number) {
      const activeFont = isBold ? boldFont : font;
      if (activeFont.widthOfTextAtSize(word, fontSize) <= maxLineWidth) {
        return [word];
      }

      const parts: string[] = [];
      let current = '';

      for (const char of word) {
        const candidate = current + char;
        if (current && activeFont.widthOfTextAtSize(candidate, fontSize) > maxLineWidth) {
          parts.push(`${current}-`);
          current = char;
        } else {
          current = candidate;
        }
      }

      if (current) {
        parts.push(current);
      }

      return parts;
    }

    function wrapInline(segments: Array<{ text: string; bold: boolean }>, maxLineWidth: number, fontSize: number) {
      const spaceWidth = font.widthOfTextAtSize(' ', fontSize);
      const words: Array<{ value: string; bold: boolean }> = [];

      segments.forEach((segment) => {
        segment.text.split(/\s+/).filter(Boolean).forEach((word) => {
          splitTokenToFit(word, segment.bold, maxLineWidth, fontSize).forEach((part) => {
            words.push({ value: part, bold: segment.bold });
          });
        });
      });

      const lines: string[] = [];
      let currentLine = '';
      let currentWidth = 0;

      words.forEach((word) => {
        const activeFont = word.bold ? boldFont : font;
        const wordWidth = activeFont.widthOfTextAtSize(word.value, fontSize);
        const gapWidth = currentLine ? spaceWidth : 0;

        if (currentLine && currentWidth + gapWidth + wordWidth > maxLineWidth) {
          lines.push(currentLine);
          currentLine = word.bold ? `**${word.value}**` : word.value;
          currentWidth = wordWidth;
          return;
        }

        currentLine += `${currentLine ? ' ' : ''}${word.bold ? `**${word.value}**` : word.value}`;
        currentWidth += gapWidth + wordWidth;
      });

      if (currentLine) {
        lines.push(currentLine);
      }

      return lines;
    }

    function drawInline(text: string, x: number, lineY: number, fontSize: number) {
      let cursorX = x;

      parseInline(text).forEach((segment) => {
        if (!segment.text) {
          return;
        }

        const activeFont = segment.bold ? boldFont : font;
        currentPage.drawText(segment.text, {
          x: cursorX,
          y: lineY,
          size: fontSize,
          font: activeFont,
          color: palette.text
        });
        cursorX += activeFont.widthOfTextAtSize(segment.text, fontSize);
      });
    }

    function drawDivider(lineY: number, thickness = 0.8, color = palette.divider) {
      currentPage.drawLine({
        start: { x: marginX, y: lineY },
        end: { x: pageWidth - marginX, y: lineY },
        thickness,
        color
      });
    }

    function isClauseLine(line: string) {
      return /^(\d+([.)]|\.\d+)|[A-Z]\)|CL[AÁ]USULA|ANEXO|APARTADO)/i.test(line.trim());
    }

    function isCompactLine(line: string) {
      return /^(Firmado|Firma|DNI|NIF|Email|Correo|Tel[eé]fono|En\s+\w+|Lugar|Fecha)/i.test(line.trim());
    }

    sanitizedText.split('\n').forEach((rawLine) => {
      const line = rawLine.trimEnd();

      if (!line.trim()) {
        y -= lineBody * 0.55;
        return;
      }

      if (/^[-*_]{3,}$/.test(line.trim())) {
        ensureSpace(14);
        drawDivider(y, 0.9, palette.dividerStrong);
        y -= 14;
        return;
      }

      if (/^# /.test(line)) {
        const title = line.replace(/^# /, '').trim();
        const wrappedTitle = wrapInline([{ text: title, bold: true }], maxWidth - 40, h1Size);
        y -= 2;

        wrappedTitle.forEach((titleLine) => {
          ensureSpace(lineH1 + 16);
          const centeredX = marginX + Math.max(0, (maxWidth - measureInline(titleLine, h1Size)) / 2);
          drawInline(titleLine, centeredX, y, h1Size);
          y -= lineH1;
        });

        drawDivider(y + 6, 1, palette.dividerStrong);
        y -= 12;
        return;
      }

      if (/^## /.test(line)) {
        const heading = line.replace(/^## /, '').trim();
        const wrappedHeading = wrapInline([{ text: heading, bold: true }], maxWidth - 24, h2Size);
        const boxHeight = wrappedHeading.length * lineH2 + 12;

        ensureSpace(boxHeight + 16);
        const boxTop = y + 6;
        currentPage.drawRectangle({
          x: marginX,
          y: boxTop - boxHeight,
          width: maxWidth,
          height: boxHeight,
          color: palette.sectionBg,
          borderColor: palette.sectionBorder,
          borderWidth: 0.8
        });

        let headingY = y - 8;
        wrappedHeading.forEach((headingLine) => {
          drawInline(headingLine, marginX + 12, headingY, h2Size);
          headingY -= lineH2;
        });

        y = boxTop - boxHeight - 10;
        return;
      }

      if (/^### /.test(line)) {
        const subheading = line.replace(/^### /, '').trim();
        ensureSpace(lineH3 + 8);
        currentPage.drawText(subheading, {
          x: marginX,
          y,
          size: h3Size,
          font: boldFont,
          color: palette.accent
        });
        y -= lineH3;
        drawDivider(y + 7, 0.6, palette.divider);
        y -= 3;
        return;
      }

      const uppercaseLine = line.replace(/\*\*/g, '').trim();
      if (
        uppercaseLine.length >= 3 &&
        uppercaseLine.length < 70 &&
        uppercaseLine === uppercaseLine.toUpperCase() &&
        /[A-ZÁÉÍÓÚÑ]/.test(uppercaseLine)
      ) {
        const wrappedHeading = wrapInline([{ text: uppercaseLine, bold: true }], maxWidth - 24, h2Size);
        const boxHeight = wrappedHeading.length * lineH2 + 12;

        ensureSpace(boxHeight + 16);
        const boxTop = y + 6;
        currentPage.drawRectangle({
          x: marginX,
          y: boxTop - boxHeight,
          width: maxWidth,
          height: boxHeight,
          color: palette.sectionBg,
          borderColor: palette.sectionBorder,
          borderWidth: 0.8
        });

        let headingY = y - 8;
        wrappedHeading.forEach((headingLine) => {
          drawInline(headingLine, marginX + 12, headingY, h2Size);
          headingY -= lineH2;
        });

        y = boxTop - boxHeight - 10;
        return;
      }

      const trimmedLine = line.trim();
      const isBulletLine = /^[-*]\s+/.test(trimmedLine);
      const normalizedLine = isBulletLine ? trimmedLine.replace(/^[-*]\s+/, '') : trimmedLine;
      const paragraphSize = isCompactLine(trimmedLine)
        ? compactSize
        : isClauseLine(trimmedLine)
          ? clauseSize
          : bodySize;
      const lineHeight = isCompactLine(trimmedLine)
        ? lineCompact
        : isClauseLine(trimmedLine)
          ? lineClause
          : lineBody;
      const indent = isBulletLine ? 18 : isClauseLine(trimmedLine) ? 14 : 0;
      const availableWidth = maxWidth - indent - (isBulletLine ? 10 : 0);
      const wrappedParagraph = wrapInline(parseInline(normalizedLine), availableWidth, paragraphSize);

      wrappedParagraph.forEach((wrappedLine, index) => {
        ensureSpace(lineHeight);
        if (isBulletLine && index === 0) {
          currentPage.drawText('•', {
            x: marginX,
            y,
            size: paragraphSize + 1,
            font: boldFont,
            color: palette.accent
          });
        }

        drawInline(wrappedLine, marginX + indent, y, paragraphSize);
        y -= lineHeight;
      });

      y -= lineHeight * 0.18;
    });

    const totalPages = allPages.length;
    allPages.forEach((page, index) => {
      const footerY = marginBottom - 8;
      const label = 'Documento contractual';
      const pageText = `Página ${index + 1} de ${totalPages}`;
      const pageTextWidth = font.widthOfTextAtSize(pageText, 8);
      const labelWidth = boldFont.widthOfTextAtSize(label, 8);

      page.drawLine({
        start: { x: marginX, y: footerY + 14 },
        end: { x: pageWidth - marginX, y: footerY + 14 },
        thickness: 0.7,
        color: palette.divider
      });
      page.drawText(label, {
        x: marginX,
        y: footerY,
        size: 8,
        font: boldFont,
        color: palette.muted
      });
      page.drawText(generatedAt, {
        x: marginX + labelWidth + 10,
        y: footerY,
        size: 8,
        font,
        color: palette.muted
      });
      page.drawText(pageText, {
        x: pageWidth - marginX - pageTextWidth,
        y: footerY,
        size: 8,
        font,
        color: palette.muted
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

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak, type FileChild } from 'docx';

/**
 * Generate a DOCX document from contract text (markdown-like format).
 * Supports: # H1, ## H2, ### H3, **bold**, blank lines as paragraph breaks.
 */
export async function generateContractDOCX(text: string, outputFileName: string): Promise<string> {
  const GENERATED_CONTRACTS_DIR = path.join(__dirname, '../../generated_contracts');
  await fs.mkdir(GENERATED_CONTRACTS_DIR, { recursive: true });

  const lines = text.split('\n');
  const children: (Paragraph | PageBreak)[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === '') {
      children.push(new Paragraph({ children: [], spacing: { after: 120 } }));
      continue;
    }

    if (line.startsWith('# ') && !line.startsWith('## ')) {
      const title = line.replace(/^#\s*/, '').replace(/\*\*/g, '');
      children.push(new Paragraph({
        children: [new TextRun({ text: title, bold: true, size: 52, font: 'Calibri' })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 },
        alignment: AlignmentType.CENTER,
      }));
      continue;
    }

    if (line.startsWith('## ') && !line.startsWith('### ')) {
      const section = line.replace(/^##\s*/, '').replace(/\*\*/g, '');
      children.push(new Paragraph({
        children: [new TextRun({ text: section, bold: true, size: 36, font: 'Calibri' })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 80 },
      }));
      continue;
    }

    if (line.startsWith('### ')) {
      const subsection = line.replace(/^###\s*/, '').replace(/\*\*/g, '');
      children.push(new Paragraph({
        children: [new TextRun({ text: subsection, bold: true, size: 30, font: 'Calibri' })],
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 160, after: 60 },
      }));
      continue;
    }

    if (/^(\d+([.)]|\.\d+)|[A-Z]\)|CL[AÁ]USULA|ANEXO|APARTADO)/i.test(line)) {
      const runs = parseInlineMarkdown(line, 22);
      children.push(new Paragraph({
        children: runs,
        spacing: { before: 80, after: 100 },
        indent: { left: 240 },
        alignment: AlignmentType.JUSTIFIED,
      }));
      continue;
    }

    if (/^(Firmado|Firma|DNI|NIF|Email|Correo|Tel[eé]fono|En\s+\w+|Lugar|Fecha)/i.test(line)) {
      const runs = parseInlineMarkdown(line, 20);
      children.push(new Paragraph({
        children: runs,
        spacing: { after: 90 },
        alignment: AlignmentType.JUSTIFIED,
      }));
      continue;
    }

    const runs = parseInlineMarkdown(line, 24);
    children.push(new Paragraph({
      children: runs,
      spacing: { after: 120 },
      alignment: AlignmentType.JUSTIFIED,
    }));
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: children as unknown as readonly FileChild[],
    }],
    styles: {
      paragraphStyles: [
        {
          id: 'Normal',
          name: 'Normal',
          run: { size: 24, font: 'Calibri' },
        },
      ],
    },
  });

  const docxBuffer = await Packer.toBuffer(doc);
  const outputPath = path.join(GENERATED_CONTRACTS_DIR, outputFileName.replace('.pdf', '.docx'));
  await fs.writeFile(outputPath, docxBuffer);

  return outputPath;
}

/**
 * Parse inline markdown: **bold** text becomes TextRun objects.
 */
function parseInlineMarkdown(text: string, size = 24): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.substring(lastIndex, match.index);
      if (before) runs.push(new TextRun({ text: before, size, font: 'Calibri' }));
    }
    runs.push(new TextRun({ text: match[1], bold: true, size, font: 'Calibri' }));
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    const remaining = text.substring(lastIndex);
    if (remaining) runs.push(new TextRun({ text: remaining, size, font: 'Calibri' }));
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text, size, font: 'Calibri' }));
  }

  return runs;
}
