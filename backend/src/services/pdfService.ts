import PDFDocument from 'pdfkit';
import type PDFKit from 'pdfkit';

interface SavedStrategy {
  id: string;
  title: string;
  date: string;
  content?: string;
  sections: {
    lineasDefensa: string[];
    argumentosJuridicos: string[];
    jurisprudencia: string[];
    puntosDebiles: string[];
    contraArgumentos: string[];
    recomendaciones: string[];
  };
  counterReplica?: {
    opponentArguments: string[];
    rebuttals: string[];
    strengthScore: number;
  };
}

interface DefenseEvidenceItem {
  fileName: string;
  publicToken: string;
}

function generateLegacyDefensePDF(strategies: SavedStrategy[], title: string, evidences?: DefenseEvidenceItem[], publicBaseUrl?: string): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: 50 });

  // Header
  doc.fontSize(24).fillColor('#1a1a1a').text(title, { align: 'center' });
  doc.moveDown();
  doc.fontSize(10).fillColor('#666666').text(`Generado por Lyrium Systems - ${new Date().toLocaleDateString('es-ES')}`, { align: 'center' });
  doc.moveDown(2);

  // Separador
  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
  doc.moveDown(1.5);

  if (strategies.length === 0) {
    doc.fontSize(14).fillColor('#cc0000').text('No hay estrategias guardadas', { align: 'center' });
    doc.end();
    return doc;
  }

  // Iterar sobre cada estrategia guardada
  strategies.forEach((strategy, strategyIndex) => {
    // Si no es la primera estrategia, agregar página nueva
    if (strategyIndex > 0) {
      doc.addPage();
    }

    // Título de la estrategia
    doc.fontSize(18).fillColor('#1a1a1a').text(strategy.title, { underline: true });
    doc.fontSize(10).fillColor('#999999').text(`Fecha: ${new Date(strategy.date).toLocaleDateString('es-ES')}`, { align: 'right' });
    doc.moveDown(1.5);

    const sections = strategy.sections || { lineasDefensa: [], argumentosJuridicos: [], jurisprudencia: [], puntosDebiles: [], contraArgumentos: [], recomendaciones: [] };

    // Sección: Líneas de Defensa
    if (sections.lineasDefensa.length > 0) {
      doc.fontSize(16).fillColor('#1a1a1a').text('Líneas de Defensa', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#333333');
      sections.lineasDefensa.forEach((linea, index) => {
        doc.text(`${index + 1}. ${linea}`, { indent: 20 });
        doc.moveDown(0.5);
      });
      doc.moveDown(1);
    }

    // Sección: Argumentos Jurídicos
    if (sections.argumentosJuridicos.length > 0) {
      doc.fontSize(16).fillColor('#1a1a1a').text('Argumentos Jurídicos', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#333333');
      sections.argumentosJuridicos.forEach((argumento, index) => {
        doc.text(`${index + 1}. ${argumento}`, { indent: 20 });
        doc.moveDown(0.5);
      });
      doc.moveDown(1);
    }

    // Sección: Jurisprudencia y Normativa
    if (sections.jurisprudencia.length > 0) {
      doc.fontSize(16).fillColor('#1a1a1a').text('Jurisprudencia y Normativa Aplicable', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#333333');
      sections.jurisprudencia.forEach((juris, index) => {
        doc.text(`• ${juris}`, { indent: 20 });
        doc.moveDown(0.4);
      });
      doc.moveDown(1);
    }

    // Sección: Puntos Débiles Identificados
    if (sections.puntosDebiles.length > 0) {
      doc.fontSize(16).fillColor('#cc0000').text('Puntos Débiles Identificados', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#333333');
      sections.puntosDebiles.forEach((punto, index) => {
        doc.fillColor('#cc0000').text(`⚠ ${punto}`, { indent: 20 });
        doc.fillColor('#333333');
        doc.moveDown(0.5);
      });
      doc.moveDown(1);
    }

    // Sección: Contra-argumentos Preparados
    if (sections.contraArgumentos.length > 0) {
      doc.fontSize(16).fillColor('#1a1a1a').text('Contra-argumentos Preparados', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#333333');
      sections.contraArgumentos.forEach((contra, index) => {
        doc.text(`${index + 1}. ${contra}`, { indent: 20 });
        doc.moveDown(0.5);
      });
      doc.moveDown(1);
    }

    // Sección: Recomendaciones Estratégicas
    if (sections.recomendaciones.length > 0) {
      doc.fontSize(16).fillColor('#0066cc').text('Recomendaciones Estratégicas', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#333333');
      sections.recomendaciones.forEach((rec, index) => {
        doc.fillColor('#0066cc').text(`✓ ${rec}`, { indent: 20 });
        doc.fillColor('#333333');
        doc.moveDown(0.5);
      });
      doc.moveDown(1);
    }

    if (strategy.counterReplica) {
      const counterReplica = strategy.counterReplica;
      doc.fontSize(16).fillColor('#5b21b6').text('Contrarréplica Provisional', { underline: true });
      doc.moveDown(0.5);

      if (counterReplica.opponentArguments?.length > 0) {
        doc.fontSize(12).fillColor('#1a1a1a').text('Argumentos de la contraparte');
        doc.moveDown(0.4);
        doc.fontSize(11).fillColor('#333333');
        counterReplica.opponentArguments.forEach((argumento, index) => {
          doc.text(`${index + 1}. ${argumento}`, { indent: 20 });
          doc.moveDown(0.4);
        });
        doc.moveDown(0.6);
      }

      if (counterReplica.rebuttals?.length > 0) {
        doc.fontSize(12).fillColor('#1a1a1a').text('Cómo rebatirlos');
        doc.moveDown(0.4);
        doc.fontSize(11).fillColor('#333333');
        counterReplica.rebuttals.forEach((rebuttal, index) => {
          doc.text(`${index + 1}. ${rebuttal}`, { indent: 20 });
          doc.moveDown(0.4);
        });
        doc.moveDown(0.6);
      }

      if (typeof counterReplica.strengthScore === 'number') {
        doc.fontSize(12).fillColor('#1a1a1a').text(`Fortaleza estimada de la defensa: ${counterReplica.strengthScore}/100`);
        doc.moveDown(1);
      }
    }

    if (strategy.content) {
      doc.fontSize(16).fillColor('#1a1a1a').text('Desarrollo completo de la estrategia', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10.5).fillColor('#333333').text(strategy.content, {
        align: 'justify',
        lineGap: 2,
      });
      doc.moveDown(1.2);
    }
  });

  // Evidence links
  if (evidences && evidences.length > 0 && publicBaseUrl) {
    doc.addPage();
    doc.fontSize(18).fillColor('#1a1a1a').text('Evidencias Adjuntas', { underline: true });
    doc.moveDown(1);
    evidences.forEach((ev, idx) => {
      doc.fontSize(11).fillColor('#333333');
      doc.text(`${idx + 1}. ${ev.fileName}`, { indent: 20 });
      doc.fontSize(9).fillColor('#0066cc');
      const url = `${publicBaseUrl}/public/evidence/${ev.publicToken}`;
      doc.text(url, { indent: 20, link: url, underline: true });
      doc.moveDown(0.8);
    });
  }

  // Footer
  doc.moveDown(2);
  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
  doc.moveDown(0.5);
  doc.fontSize(9).fillColor('#999999').text(
    'Este documento contiene estrategias de defensa generadas con asistencia de IA y debe ser revisado por un profesional legal.',
    { align: 'center' }
  );

  doc.end();
  return doc;
}

function sanitizeDefensePdfText(value?: string): string {
  if (!value) {
    return '';
  }

  return value
    .replace(/\r/g, '')
    .replace(/[•●▪◦]/g, '-')
    .replace(/[✓✔]/g, '[OK]')
    .replace(/[⚠]/g, '[!]')
    .replace(/\t/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
}

export function generateDefensePDF(strategies: SavedStrategy[], title: string, evidences?: DefenseEvidenceItem[], publicBaseUrl?: string): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: 56, size: 'A4', bufferPages: true });
  const colors = {
    ink: '#172033',
    text: '#334155',
    muted: '#6b7280',
    line: '#d8dee8',
    strongLine: '#b9c3d3',
    soft: '#f5f7fb',
    accent: '#243b67',
    danger: '#9f1239',
    success: '#0f766e',
    neutral: '#475569',
  };
  const generatedAt = new Date().toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  function drawPageChrome() {
    const topY = 32;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.accent).text('LYRIUM SYSTEMS', 56, topY, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor(colors.muted).text('Preparación de defensa', 56, topY + 12, { lineBreak: false });
    doc.moveTo(56, 72).lineTo(doc.page.width - 56, 72).lineWidth(1).strokeColor(colors.strongLine).stroke();
    if (doc.y < 90) {
      doc.y = 92;
    }
  }

  function ensureSpace(minHeight: number) {
    if (doc.y + minHeight > doc.page.height - 78) {
      doc.addPage();
    }
  }

  function drawSectionTitle(label: string, color: string) {
    ensureSpace(34);
    const top = doc.y;
    doc.roundedRect(56, top, doc.page.width - 112, 24, 6).fillAndStroke(color, color);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11).text(label, 70, top + 7, {
      width: doc.page.width - 140,
      lineBreak: false,
    });
    doc.y = top + 34;
  }

  function drawList(items: string[], options?: { accent?: string; ordered?: boolean }) {
    const accent = options?.accent ?? colors.text;
    const ordered = options?.ordered ?? false;

    items
      .map((item) => sanitizeDefensePdfText(item))
      .filter(Boolean)
      .forEach((item, index) => {
        ensureSpace(26);
        const marker = ordered ? `${index + 1}.` : '•';
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(accent).text(marker, 70, doc.y, { lineBreak: false });
        doc.font('Helvetica').fontSize(10.5).fillColor(colors.text).text(item, 88, doc.y - 1, {
          width: doc.page.width - 150,
          align: 'justify',
          lineGap: 2,
        });
        doc.moveDown(0.35);
      });
    doc.moveDown(0.5);
  }

  function drawParagraphBlock(text: string) {
    const cleanText = sanitizeDefensePdfText(text);
    if (!cleanText) {
      return;
    }

    ensureSpace(72);
    const startY = doc.y;
    const boxWidth = doc.page.width - 112;
    const estimatedHeight = Math.max(64, Math.ceil(cleanText.length / 105) * 14 + 26);
    doc.roundedRect(56, startY, boxWidth, estimatedHeight, 8).fillAndStroke(colors.soft, colors.line);
    doc.fillColor(colors.text).font('Helvetica').fontSize(10.5).text(cleanText, 72, startY + 14, {
      width: boxWidth - 32,
      align: 'justify',
      lineGap: 3,
    });
    doc.y = Math.max(doc.y, startY + estimatedHeight) + 4;
  }

  function drawStrengthScore(score: number) {
    ensureSpace(36);
    const normalized = Math.max(0, Math.min(100, score));
    const barWidth = doc.page.width - 176;
    const startY = doc.y;
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(colors.ink).text(`Fortaleza estimada de la defensa: ${normalized}/100`, 56, startY);
    doc.roundedRect(56, startY + 18, barWidth, 10, 5).fillAndStroke('#e5e7eb', '#e5e7eb');
    doc.roundedRect(56, startY + 18, Math.max(24, (barWidth * normalized) / 100), 10, 5).fillAndStroke(colors.accent, colors.accent);
    doc.y = startY + 40;
  }

  doc.on('pageAdded', drawPageChrome);
  drawPageChrome();

  doc.font('Helvetica-Bold').fontSize(24).fillColor(colors.ink).text(sanitizeDefensePdfText(title) || 'Preparación de defensa', {
    align: 'center',
  });
  doc.moveDown(0.35);
  doc.font('Helvetica').fontSize(10).fillColor(colors.muted).text(`Generado por Lyrium Systems · ${generatedAt}`, {
    align: 'center',
  });
  doc.moveDown(1.2);

  if (strategies.length === 0) {
    doc.font('Helvetica-Bold').fontSize(13).fillColor(colors.danger).text('No hay estrategias guardadas', {
      align: 'center',
    });
    const emptyRange = doc.bufferedPageRange();
    for (let i = emptyRange.start; i < emptyRange.start + emptyRange.count; i++) {
      doc.switchToPage(i);
      const footerY = doc.page.height - 38;
      doc.moveTo(56, footerY - 8).lineTo(doc.page.width - 56, footerY - 8).lineWidth(0.8).strokeColor(colors.line).stroke();
      doc.font('Helvetica').fontSize(8).fillColor(colors.muted).text(`Página ${i + 1} de ${emptyRange.count}`, doc.page.width - 116, footerY, {
        width: 60,
        align: 'right',
      });
    }
    doc.end();
    return doc;
  }

  strategies.forEach((strategy, index) => {
    if (index > 0) {
      doc.addPage();
    }

    const strategyTitle = sanitizeDefensePdfText(strategy.title) || `Estrategia ${index + 1}`;
    const strategyDate = new Date(strategy.date).toLocaleDateString('es-ES');
    const sections = strategy.sections || {
      lineasDefensa: [],
      argumentosJuridicos: [],
      jurisprudencia: [],
      puntosDebiles: [],
      contraArgumentos: [],
      recomendaciones: [],
    };

    doc.font('Helvetica-Bold').fontSize(18).fillColor(colors.ink).text(strategyTitle, { align: 'left' });
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9.5).fillColor(colors.muted).text(`Fecha de guardado: ${strategyDate}`, {
      align: 'left',
    });
    doc.moveDown(0.9);

    if (sections.lineasDefensa.length > 0) {
      drawSectionTitle('Líneas de defensa', colors.accent);
      drawList(sections.lineasDefensa, { ordered: true, accent: colors.accent });
    }

    if (sections.argumentosJuridicos.length > 0) {
      drawSectionTitle('Argumentos jurídicos', colors.neutral);
      drawList(sections.argumentosJuridicos, { ordered: true, accent: colors.neutral });
    }

    if (sections.jurisprudencia.length > 0) {
      drawSectionTitle('Jurisprudencia y normativa aplicable', colors.neutral);
      drawList(sections.jurisprudencia, { accent: colors.neutral });
    }

    if (sections.puntosDebiles.length > 0) {
      drawSectionTitle('Puntos débiles identificados', colors.danger);
      drawList(sections.puntosDebiles, { accent: colors.danger });
    }

    if (sections.contraArgumentos.length > 0) {
      drawSectionTitle('Contraargumentos preparados', colors.accent);
      drawList(sections.contraArgumentos, { ordered: true, accent: colors.accent });
    }

    if (sections.recomendaciones.length > 0) {
      drawSectionTitle('Recomendaciones estratégicas', colors.success);
      drawList(sections.recomendaciones, { accent: colors.success });
    }

    if (strategy.counterReplica) {
      drawSectionTitle('Contrarréplica provisional', '#5b21b6');

      if (strategy.counterReplica.opponentArguments?.length > 0) {
        doc.font('Helvetica-Bold').fontSize(11).fillColor(colors.ink).text('Argumentos de la contraparte');
        doc.moveDown(0.35);
        drawList(strategy.counterReplica.opponentArguments, { ordered: true, accent: '#5b21b6' });
      }

      if (strategy.counterReplica.rebuttals?.length > 0) {
        doc.font('Helvetica-Bold').fontSize(11).fillColor(colors.ink).text('Cómo rebatirlos');
        doc.moveDown(0.35);
        drawList(strategy.counterReplica.rebuttals, { ordered: true, accent: '#5b21b6' });
      }

      if (typeof strategy.counterReplica.strengthScore === 'number') {
        drawStrengthScore(strategy.counterReplica.strengthScore);
        doc.moveDown(0.4);
      }
    }

    if (strategy.content) {
      drawSectionTitle('Desarrollo completo de la estrategia', colors.neutral);
      drawParagraphBlock(strategy.content);
    }
  });

  if (evidences && evidences.length > 0 && publicBaseUrl) {
    doc.addPage();
    drawSectionTitle('Evidencias adjuntas', colors.accent);
    evidences.forEach((evidence, index) => {
      ensureSpace(34);
      const url = `${publicBaseUrl}/public/evidence/${evidence.publicToken}`;
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(colors.ink).text(`${index + 1}. ${sanitizeDefensePdfText(evidence.fileName)}`, 70, doc.y, {
        width: doc.page.width - 140,
      });
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(9.5).fillColor(colors.accent).text(url, 70, doc.y, {
        width: doc.page.width - 140,
        link: url,
        underline: true,
      });
      doc.moveDown(0.9);
    });
  }

  const pageRange = doc.bufferedPageRange();
  const totalPages = pageRange.count;
  for (let pageIndex = pageRange.start; pageIndex < pageRange.start + pageRange.count; pageIndex++) {
    doc.switchToPage(pageIndex);
    const footerY = doc.page.height - 38;
    doc.moveTo(56, footerY - 8).lineTo(doc.page.width - 56, footerY - 8).lineWidth(0.8).strokeColor(colors.line).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(colors.muted).text(
      'Documento generado con asistencia de IA. Revisión profesional recomendada.',
      56,
      footerY,
      {
        width: doc.page.width - 172,
      }
    );
    doc.text(`Página ${pageIndex + 1} de ${totalPages}`, doc.page.width - 116, footerY, {
      width: 60,
      align: 'right',
    });
  }

  doc.end();
  return doc;
}

// ============= FISCAL REPORT PDF =============

interface FiscalReportSection {
  title: string;
  items: { concept: string; base?: string; rate?: string; amount?: string; note?: string }[];
  subtotal?: string;
}

interface FiscalReportData {
  clientName?: string;
  clientType?: string;
  country?: string;
  countryCode?: string;
  fiscalYear?: string;
  summary?: string;
  sections: FiscalReportSection[];
  totalTaxes?: string;
  netResult?: string;
  recommendations?: string[];
  disclaimer?: string;
}

// PDF label translations per language
interface PdfLabels {
  title: string;
  fiscalYear: string;
  concept: string;
  base: string;
  rate: string;
  amount: string;
  subtotal: string;
  totalTaxes: string;
  netResult: string;
  recommendations: string;
  disclaimer: string;
  locale: string; // for date formatting
}

const PDF_LABELS: Record<string, PdfLabels> = {
  es: { title: 'Informe Fiscal', fiscalYear: 'Año fiscal', concept: 'Concepto', base: 'Base', rate: 'Tipo', amount: 'Importe', subtotal: 'Subtotal', totalTaxes: 'TOTAL IMPUESTOS', netResult: 'RESULTADO NETO', recommendations: 'Recomendaciones', disclaimer: 'Los cálculos presentados en este informe son estimaciones basadas en los datos proporcionados y la normativa vigente. Se recomienda verificarlos con un profesional fiscal antes de tomar decisiones. Lyrium Systems no se hace responsable de posibles errores en los cálculos ni de las decisiones tomadas en base a este documento.', locale: 'es-ES' },
  en: { title: 'Tax Report', fiscalYear: 'Fiscal year', concept: 'Concept', base: 'Base', rate: 'Rate', amount: 'Amount', subtotal: 'Subtotal', totalTaxes: 'TOTAL TAXES', netResult: 'NET RESULT', recommendations: 'Recommendations', disclaimer: 'The calculations presented in this report are estimates based on the data provided and current regulations. It is recommended to verify them with a tax professional before making decisions. Lyrium Systems is not responsible for possible calculation errors or decisions made based on this document.', locale: 'en-GB' },
  de: { title: 'Steuerbericht', fiscalYear: 'Steuerjahr', concept: 'Konzept', base: 'Bemessungsgrundlage', rate: 'Satz', amount: 'Betrag', subtotal: 'Zwischensumme', totalTaxes: 'GESAMTSTEUERN', netResult: 'NETTOERGEBNIS', recommendations: 'Empfehlungen', disclaimer: 'Die in diesem Bericht dargestellten Berechnungen sind Schätzungen auf Grundlage der bereitgestellten Daten und der geltenden Vorschriften. Es wird empfohlen, diese von einem Steuerberater überprüfen zu lassen. Lyrium Systems übernimmt keine Haftung für mögliche Berechnungsfehler oder auf Grundlage dieses Dokuments getroffene Entscheidungen.', locale: 'de-DE' },
  fr: { title: 'Rapport Fiscal', fiscalYear: 'Année fiscale', concept: 'Concept', base: 'Base', rate: 'Taux', amount: 'Montant', subtotal: 'Sous-total', totalTaxes: 'TOTAL IMPÔTS', netResult: 'RÉSULTAT NET', recommendations: 'Recommandations', disclaimer: 'Les calculs présentés dans ce rapport sont des estimations basées sur les données fournies et la réglementation en vigueur. Il est recommandé de les vérifier auprès d\'un professionnel fiscal avant de prendre des décisions. Lyrium Systems décline toute responsabilité en cas d\'erreurs de calcul ou de décisions prises sur la base de ce document.', locale: 'fr-FR' },
  it: { title: 'Rapporto Fiscale', fiscalYear: 'Anno fiscale', concept: 'Concetto', base: 'Base', rate: 'Aliquota', amount: 'Importo', subtotal: 'Subtotale', totalTaxes: 'TOTALE IMPOSTE', netResult: 'RISULTATO NETTO', recommendations: 'Raccomandazioni', disclaimer: 'I calcoli presentati in questo rapporto sono stime basate sui dati forniti e sulla normativa vigente. Si raccomanda di verificarli con un professionista fiscale prima di prendere decisioni. Lyrium Systems non è responsabile di eventuali errori di calcolo o decisioni prese sulla base di questo documento.', locale: 'it-IT' },
  pt: { title: 'Relatório Fiscal', fiscalYear: 'Ano fiscal', concept: 'Conceito', base: 'Base', rate: 'Taxa', amount: 'Valor', subtotal: 'Subtotal', totalTaxes: 'TOTAL IMPOSTOS', netResult: 'RESULTADO LÍQUIDO', recommendations: 'Recomendações', disclaimer: 'Os cálculos apresentados neste relatório são estimativas baseadas nos dados fornecidos e na legislação vigente. Recomenda-se verificá-los com um profissional fiscal antes de tomar decisões. Lyrium Systems não se responsabiliza por possíveis erros de cálculo ou decisões tomadas com base neste documento.', locale: 'pt-PT' },
  nl: { title: 'Belastingrapport', fiscalYear: 'Belastingjaar', concept: 'Concept', base: 'Grondslag', rate: 'Tarief', amount: 'Bedrag', subtotal: 'Subtotaal', totalTaxes: 'TOTAAL BELASTINGEN', netResult: 'NETTORESULTAAT', recommendations: 'Aanbevelingen', disclaimer: 'De berekeningen in dit rapport zijn schattingen op basis van de verstrekte gegevens en de geldende regelgeving. Het wordt aanbevolen deze te laten verifiëren door een belastingadviseur. Lyrium Systems is niet aansprakelijk voor mogelijke rekenfouten of beslissingen op basis van dit document.', locale: 'nl-NL' },
  pl: { title: 'Raport Podatkowy', fiscalYear: 'Rok podatkowy', concept: 'Pojęcie', base: 'Podstawa', rate: 'Stawka', amount: 'Kwota', subtotal: 'Suma częściowa', totalTaxes: 'ŁĄCZNE PODATKI', netResult: 'WYNIK NETTO', recommendations: 'Zalecenia', disclaimer: 'Obliczenia przedstawione w niniejszym raporcie są szacunkami opartymi na dostarczonych danych i obowiązujących przepisach. Zaleca się ich weryfikację u doradcy podatkowego. Lyrium Systems nie ponosi odpowiedzialności za ewentualne błędy w obliczeniach ani za decyzje podjęte na podstawie tego dokumentu.', locale: 'pl-PL' },
  ro: { title: 'Raport Fiscal', fiscalYear: 'An fiscal', concept: 'Concept', base: 'Baza', rate: 'Cotă', amount: 'Sumă', subtotal: 'Subtotal', totalTaxes: 'TOTAL IMPOZITE', netResult: 'REZULTAT NET', recommendations: 'Recomandări', disclaimer: 'Calculele prezentate în acest raport sunt estimări bazate pe datele furnizate și legislația în vigoare. Se recomandă verificarea lor de către un specialist fiscal. Lyrium Systems nu își asumă responsabilitatea pentru eventuale erori de calcul sau decizii luate pe baza acestui document.', locale: 'ro-RO' },
  hu: { title: 'Adójelentés', fiscalYear: 'Adóév', concept: 'Fogalom', base: 'Alap', rate: 'Kulcs', amount: 'Összeg', subtotal: 'Részösszeg', totalTaxes: 'ÖSSZES ADÓ', netResult: 'NETTÓ EREDMÉNY', recommendations: 'Javaslatok', disclaimer: 'A jelen jelentésben szereplő számítások a megadott adatokon és a hatályos jogszabályokon alapuló becslések. Javasolt adószakértővel történő ellenőrzésük. A Lyrium Systems nem vállal felelősséget az esetleges számítási hibákért vagy a dokumentum alapján hozott döntésekért.', locale: 'hu-HU' },
  hr: { title: 'Porezni Izvještaj', fiscalYear: 'Porezna godina', concept: 'Pojam', base: 'Osnovica', rate: 'Stopa', amount: 'Iznos', subtotal: 'Međuzbroj', totalTaxes: 'UKUPNI POREZI', netResult: 'NETO REZULTAT', recommendations: 'Preporuke', disclaimer: 'Izračuni prikazani u ovom izvještaju su procjene temeljene na dostavljenim podacima i važećim propisima. Preporučuje se provjera kod poreznog stručnjaka. Lyrium Systems ne odgovara za moguće pogreške u izračunima ili odluke donesene na temelju ovog dokumenta.', locale: 'hr-HR' },
  sv: { title: 'Skatterapport', fiscalYear: 'Beskattningsår', concept: 'Begrepp', base: 'Underlag', rate: 'Sats', amount: 'Belopp', subtotal: 'Delsumma', totalTaxes: 'TOTALA SKATTER', netResult: 'NETTORESULTAT', recommendations: 'Rekommendationer', disclaimer: 'Beräkningarna i denna rapport är uppskattningar baserade på tillhandahållna uppgifter och gällande regelverk. Det rekommenderas att verifiera dem med en skatterådgivare. Lyrium Systems ansvarar inte för eventuella beräkningsfel eller beslut fattade utifrån detta dokument.', locale: 'sv-SE' },
  no: { title: 'Skatterapport', fiscalYear: 'Skatteår', concept: 'Begrep', base: 'Grunnlag', rate: 'Sats', amount: 'Beløp', subtotal: 'Delsum', totalTaxes: 'TOTALE SKATTER', netResult: 'NETTORESULTAT', recommendations: 'Anbefalinger', disclaimer: 'Beregningene i denne rapporten er estimater basert på oppgitte data og gjeldende regelverk. Det anbefales å verifisere dem med en skatterådgiver. Lyrium Systems er ikke ansvarlig for eventuelle beregningsfeil eller beslutninger tatt på grunnlag av dette dokumentet.', locale: 'nb-NO' },
  fi: { title: 'Veroraportti', fiscalYear: 'Verovuosi', concept: 'Käsite', base: 'Peruste', rate: 'Veroprosentti', amount: 'Summa', subtotal: 'Välisumma', totalTaxes: 'VEROT YHTEENSÄ', netResult: 'NETTOTULOS', recommendations: 'Suositukset', disclaimer: 'Tässä raportissa esitetyt laskelmat ovat arvioita, jotka perustuvat annettuihin tietoihin ja voimassa olevaan lainsäädäntöön. Niiden tarkistaminen veroneuvojan kanssa on suositeltavaa. Lyrium Systems ei vastaa mahdollisista laskentavirheistä eikä tämän asiakirjan perusteella tehdyistä päätöksistä.', locale: 'fi-FI' },
  da: { title: 'Skatterapport', fiscalYear: 'Skatteår', concept: 'Begreb', base: 'Grundlag', rate: 'Sats', amount: 'Beløb', subtotal: 'Delsum', totalTaxes: 'SAMLEDE SKATTER', netResult: 'NETTORESULTAT', recommendations: 'Anbefalinger', disclaimer: 'Beregningerne i denne rapport er estimater baseret på de leverede data og gældende regler. Det anbefales at verificere dem hos en skatterådgiver. Lyrium Systems er ikke ansvarlig for eventuelle regnefejl eller beslutninger truffet på baggrund af dette dokument.', locale: 'da-DK' },
  el: { title: 'Φορολογική Αναφορά', fiscalYear: 'Φορολογικό έτος', concept: 'Έννοια', base: 'Βάση', rate: 'Συντελεστής', amount: 'Ποσό', subtotal: 'Υποσύνολο', totalTaxes: 'ΣΥΝΟΛΙΚΟΙ ΦΟΡΟΙ', netResult: 'ΚΑΘΑΡΟ ΑΠΟΤΕΛΕΣΜΑ', recommendations: 'Συστάσεις', disclaimer: 'Οι υπολογισμοί που παρουσιάζονται σε αυτήν την αναφορά είναι εκτιμήσεις βάσει των παρεχόμενων δεδομένων και της ισχύουσας νομοθεσίας. Συνιστάται η επαλήθευσή τους από φορολογικό σύμβουλο. Η Lyrium Systems δεν ευθύνεται για πιθανά σφάλματα υπολογισμού ή αποφάσεις που λαμβάνονται βάσει αυτού του εγγράφου.', locale: 'el-GR' },
  sk: { title: 'Daňový Výkaz', fiscalYear: 'Daňový rok', concept: 'Pojem', base: 'Základ', rate: 'Sadzba', amount: 'Suma', subtotal: 'Medzisúčet', totalTaxes: 'CELKOVÉ DANE', netResult: 'ČISTÝ VÝSLEDOK', recommendations: 'Odporúčania', disclaimer: 'Výpočty uvedené v tejto správe sú odhady založené na poskytnutých údajoch a platnej legislatíve. Odporúča sa ich overenie u daňového poradcu. Lyrium Systems nenesie zodpovednosť za prípadné chyby vo výpočtoch alebo rozhodnutia prijaté na základe tohto dokumentu.', locale: 'sk-SK' },
  sl: { title: 'Davčno Poročilo', fiscalYear: 'Davčno leto', concept: 'Pojem', base: 'Osnova', rate: 'Stopnja', amount: 'Znesek', subtotal: 'Vmesni seštevek', totalTaxes: 'SKUPNI DAVKI', netResult: 'NETO REZULTAT', recommendations: 'Priporočila', disclaimer: 'Izračuni v tem poročilu so ocene na podlagi predloženih podatkov in veljavne zakonodaje. Priporočljivo jih je preveriti pri davčnem svetovalcu. Lyrium Systems ne odgovarja za morebitne napake v izračunih ali odločitve, sprejete na podlagi tega dokumenta.', locale: 'sl-SI' },
  cs: { title: 'Daňová Zpráva', fiscalYear: 'Daňový rok', concept: 'Pojem', base: 'Základ', rate: 'Sazba', amount: 'Částka', subtotal: 'Mezisoučet', totalTaxes: 'CELKOVÉ DANĚ', netResult: 'ČISTÝ VÝSLEDEK', recommendations: 'Doporučení', disclaimer: 'Výpočty uvedené v této zprávě jsou odhady založené na poskytnutých údajích a platné legislativě. Doporučuje se je ověřit u daňového poradce. Lyrium Systems nenese odpovědnost za případné chyby ve výpočtech ani za rozhodnutí učiněná na základě tohoto dokumentu.', locale: 'cs-CZ' },
  lt: { title: 'Mokesčių Ataskaita', fiscalYear: 'Mokestiniai metai', concept: 'Sąvoka', base: 'Bazė', rate: 'Tarifas', amount: 'Suma', subtotal: 'Tarpinė suma', totalTaxes: 'VISO MOKESČIŲ', netResult: 'GRYNASIS REZULTATAS', recommendations: 'Rekomendacijos', disclaimer: 'Šioje ataskaitoje pateikti skaičiavimai yra įverčiai, pagrįsti pateiktais duomenimis ir galiojančiais teisės aktais. Rekomenduojama juos patikrinti su mokesčių konsultantu. Lyrium Systems neatsako už galimas skaičiavimo klaidas ar sprendimus, priimtus remiantis šiuo dokumentu.', locale: 'lt-LT' },
  lv: { title: 'Nodokļu Atskaite', fiscalYear: 'Taksācijas gads', concept: 'Jēdziens', base: 'Bāze', rate: 'Likme', amount: 'Summa', subtotal: 'Starpsumma', totalTaxes: 'KOPĒJIE NODOKĻI', netResult: 'NETO REZULTĀTS', recommendations: 'Ieteikumi', disclaimer: 'Šajā atskaitē iekļautie aprēķini ir aplēses, kas balstītas uz sniegtajiem datiem un spēkā esošajiem tiesību aktiem. Ieteicams tos pārbaudīt pie nodokļu konsultanta. Lyrium Systems neuzņemas atbildību par iespējamām aprēķinu kļūdām vai lēmumiem, kas pieņemti, pamatojoties uz šo dokumentu.', locale: 'lv-LV' },
  et: { title: 'Maksuaruanne', fiscalYear: 'Maksuaasta', concept: 'Mõiste', base: 'Alus', rate: 'Määr', amount: 'Summa', subtotal: 'Vahesumma', totalTaxes: 'MAKSUD KOKKU', netResult: 'PUHAS TULEMUS', recommendations: 'Soovitused', disclaimer: 'Käesolevas aruandes esitatud arvutused on hinnangud, mis põhinevad esitatud andmetel ja kehtival seadusandlusel. Soovitatav on need lasta üle kontrollida maksunõustajal. Lyrium Systems ei vastuta võimalike arvutusvigade ega selle dokumendi alusel tehtud otsuste eest.', locale: 'et-EE' },
  bg: { title: 'Данъчен Отчет', fiscalYear: 'Данъчна година', concept: 'Понятие', base: 'Основа', rate: 'Ставка', amount: 'Сума', subtotal: 'Междинна сума', totalTaxes: 'ОБЩО ДАНЪЦИ', netResult: 'НЕТЕН РЕЗУЛТАТ', recommendations: 'Препоръки', disclaimer: 'Изчисленията, представени в този доклад, са приблизителни оценки, базирани на предоставените данни и действащото законодателство. Препоръчва се проверка от данъчен консултант. Lyrium Systems не носи отговорност за евентуални грешки в изчисленията или решения, взети въз основа на този документ.', locale: 'bg-BG' },
};

// Map country codes to language codes
const COUNTRY_TO_LANG: Record<string, string> = {
  ES: 'es', DE: 'de', AT: 'de', CH: 'de', FR: 'fr', LU: 'fr', BE: 'fr',
  IT: 'it', PT: 'pt', NL: 'nl', PL: 'pl', CZ: 'cs', SK: 'sk', HU: 'hu',
  HR: 'hr', DK: 'da', SE: 'sv', NO: 'no', FI: 'fi', IE: 'en', GB: 'en',
  US: 'en', AU: 'en', CA: 'en', LV: 'lv', LT: 'lt', RO: 'ro', BG: 'bg',
  SI: 'sl', GR: 'el', EL: 'el', MT: 'en', EE: 'et', CY: 'en',
};

function getPdfLabels(countryCode?: string): PdfLabels {
  if (!countryCode) return PDF_LABELS.es;
  const lang = COUNTRY_TO_LANG[countryCode.toUpperCase()] || 'en';
  return PDF_LABELS[lang] || PDF_LABELS.en;
}

export function generateFiscalReportPDF(data: FiscalReportData): PDFKit.PDFDocument {
  const labels = getPdfLabels(data.countryCode);
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const pageW = doc.page.width;
  const marginL = 50;
  const marginR = pageW - 50;
  const contentW = marginR - marginL;

  // ── Header ──
  doc.fontSize(20).fillColor('#1a1a1a').text(labels.title, { align: 'center' });
  doc.moveDown(0.4);
  doc.fontSize(9).fillColor('#888888').text(new Date().toLocaleDateString(labels.locale, { day: 'numeric', month: 'long', year: 'numeric' }), { align: 'center' });
  doc.moveDown(0.8);

  // Client info block
  const hasClientInfo = data.clientName || data.clientType || data.country || data.fiscalYear;
  if (hasClientInfo) {
    const boxY = doc.y;
    doc.rect(marginL, boxY, contentW, 40).fill('#f5f5f5');
    doc.fillColor('#333333').fontSize(10);
    let infoX = marginL + 12;
    const infoY = boxY + 8;
    if (data.clientName) { doc.font('Helvetica-Bold').text(data.clientName, infoX, infoY); doc.font('Helvetica'); infoX = marginL + 12; }
    const detailParts: string[] = [];
    if (data.clientType) detailParts.push(data.clientType);
    if (data.country) detailParts.push(data.country);
    if (data.fiscalYear) detailParts.push(`${labels.fiscalYear}: ${data.fiscalYear}`);
    if (detailParts.length > 0) {
      doc.fontSize(9).fillColor('#555555').text(detailParts.join('  ·  '), infoX, infoY + 16);
    }
    doc.y = boxY + 48;
  }
  doc.moveDown(0.5);

  // Summary
  if (data.summary) {
    doc.fontSize(10).fillColor('#444444').text(data.summary, marginL, doc.y, { width: contentW });
    doc.moveDown(1);
  }

  // ── Sections ──
  const colX = { concept: marginL, base: marginL + 220, rate: marginL + 330, amount: marginL + 400 };
  const colW = { concept: 215, base: 105, rate: 65, amount: contentW - 400 };

  data.sections.forEach((section, sIdx) => {
    if (doc.y > doc.page.height - 160) doc.addPage();

    // Section title bar
    const titleY = doc.y;
    doc.rect(marginL, titleY, contentW, 22).fill('#2c3e50');
    doc.fontSize(11).fillColor('#ffffff').text(section.title, marginL + 10, titleY + 5, { width: contentW - 20 });
    doc.y = titleY + 28;

    const hasBase = section.items.some(i => i.base);
    const hasRate = section.items.some(i => i.rate);

    // Table header row
    const thY = doc.y;
    doc.rect(marginL, thY, contentW, 16).fill('#ecf0f1');
    doc.fontSize(8).fillColor('#555555').font('Helvetica-Bold');
    doc.text(labels.concept, colX.concept + 6, thY + 3, { width: colW.concept });
    if (hasBase) doc.text(labels.base, colX.base, thY + 3, { width: colW.base, align: 'right' });
    if (hasRate) doc.text(labels.rate, colX.rate, thY + 3, { width: colW.rate, align: 'right' });
    doc.text(labels.amount, colX.amount, thY + 3, { width: colW.amount, align: 'right' });
    doc.font('Helvetica');
    doc.y = thY + 20;

    // Data rows
    doc.fontSize(9).fillColor('#333333');
    section.items.forEach((item, rIdx) => {
      if (doc.y > doc.page.height - 70) doc.addPage();

      // Alternate row background
      const rowY = doc.y;
      if (rIdx % 2 === 1) doc.rect(marginL, rowY, contentW, 15).fill('#fafafa');

      doc.fillColor('#333333');
      doc.text(item.concept, colX.concept + 6, rowY + 2, { width: colW.concept });
      if (item.base) doc.text(item.base, colX.base, rowY + 2, { width: colW.base, align: 'right' });
      if (item.rate) doc.text(item.rate, colX.rate, rowY + 2, { width: colW.rate, align: 'right' });
      if (item.amount) doc.text(item.amount, colX.amount, rowY + 2, { width: colW.amount, align: 'right' });
      doc.y = rowY + 16;

      if (item.note) {
        doc.fontSize(7).fillColor('#999999').text(item.note, colX.concept + 12, doc.y, { width: colW.concept + 100 });
        doc.moveDown(0.2);
        doc.fontSize(9);
      }
    });

    // Subtotal
    if (section.subtotal) {
      const stY = doc.y + 2;
      doc.moveTo(colX.amount, stY).lineTo(marginR, stY).stroke('#999999');
      doc.y = stY + 4;
      doc.fontSize(10).fillColor('#1a1a1a').font('Helvetica-Bold');
      doc.text(`${labels.subtotal}: ${section.subtotal}`, colX.amount - 50, doc.y, { width: colW.amount + 50, align: 'right' });
      doc.font('Helvetica');
    }
    doc.moveDown(1.2);
  });

  // ── Totals box ──
  if (data.totalTaxes || data.netResult) {
    if (doc.y > doc.page.height - 100) doc.addPage();

    const boxH = (data.totalTaxes && data.netResult) ? 52 : 30;
    const boxY = doc.y + 4;
    doc.rect(marginL, boxY, contentW, boxH).lineWidth(1.5).stroke('#2c3e50');

    let textY = boxY + 8;
    doc.font('Helvetica-Bold');
    if (data.totalTaxes) {
      doc.fontSize(12).fillColor('#333333').text(`${labels.totalTaxes}:  ${data.totalTaxes}`, marginL + 10, textY, { width: contentW - 20, align: 'right' });
      textY += 22;
    }
    if (data.netResult) {
      doc.fontSize(13).fillColor('#1a6b3f').text(`${labels.netResult}:  ${data.netResult}`, marginL + 10, textY, { width: contentW - 20, align: 'right' });
    }
    doc.font('Helvetica');
    doc.y = boxY + boxH + 12;
  }

  // ── Recommendations ──
  if (data.recommendations && data.recommendations.length > 0) {
    if (doc.y > doc.page.height - 100) doc.addPage();
    doc.moveDown(0.5);
    const recTitleY = doc.y;
    doc.rect(marginL, recTitleY, contentW, 22).fill('#eaf4ea');
    doc.fontSize(11).fillColor('#1a6b3f').font('Helvetica-Bold').text(labels.recommendations, marginL + 10, recTitleY + 5);
    doc.font('Helvetica');
    doc.y = recTitleY + 28;

    doc.fontSize(9).fillColor('#333333');
    data.recommendations.forEach((rec, i) => {
      if (doc.y > doc.page.height - 50) doc.addPage();
      doc.text(`${i + 1}. ${rec}`, marginL + 12, doc.y, { width: contentW - 24 });
      doc.moveDown(0.5);
    });
    doc.moveDown(0.5);
  }

  // ── Footer ──
  doc.moveDown(1);
  doc.moveTo(marginL, doc.y).lineTo(marginR, doc.y).stroke('#dddddd');
  doc.moveDown(0.4);
  doc.fontSize(7).fillColor('#aaaaaa').text(
    data.disclaimer || labels.disclaimer,
    marginL, doc.y, { width: contentW, align: 'center' }
  );

  doc.end();
  return doc;
}
