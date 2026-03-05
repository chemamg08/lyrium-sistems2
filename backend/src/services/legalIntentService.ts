const LEGAL_TERMS = [
  'artículo', 'articulo', 'ley', 'norma', 'jurisprudencia', 'sentencia', 'tribunal', 'juzgado',
  'demanda', 'querella', 'denuncia', 'recurso', 'apelación', 'apelacion', 'casación', 'casacion',
  'contrato', 'cláusula', 'clausula', 'incumplimiento', 'responsabilidad', 'indemnización', 'indemnizacion',
  'delito', 'pena', 'fiscalía', 'fiscalia', 'impuesto', 'iva', 'irpf', 'hacienda', 'inspección', 'inspeccion',
  'despido', 'laboral', 'arrendamiento', 'hipoteca', 'herencia', 'sucesión', 'sucesion',
  'nulidad', 'procedente', 'improcedente', 'caducidad', 'prescripción', 'prescripcion'
];

const LEGAL_PATTERNS: RegExp[] = [
  /\b(art[íi]?\.?\s*\d+|art[íi]culo\s*\d+)\b/i,
  /\bley\s+\d+\/?\d*\b/i,
  /\b(código civil|c[oó]digo penal|ley de enjuiciamiento|estatuto de los trabajadores)\b/i,
  /\b(que dice la ley|base legal|fundamento jur[ií]dico|art[ií]culos aplicables?)\b/i
];

export function hasLegalIntent(query: string, specialties: string[] = []): boolean {
  const text = (query || '').toLowerCase().trim();
  if (!text) return false;

  if (LEGAL_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  const specialtyHints = specialties.map((value) => value.toLowerCase());
  const isMostlyLegalSpecialty = specialtyHints.some((value) =>
    ['penal', 'fiscal', 'tributario', 'laboral', 'mercantil', 'civil', 'administrativo', 'contencioso'].some((hint) =>
      value.includes(hint)
    )
  );

  const legalTermHits = LEGAL_TERMS.reduce((acc, term) => (text.includes(term) ? acc + 1 : acc), 0);

  if (legalTermHits >= 2) {
    return true;
  }

  if (isMostlyLegalSpecialty && legalTermHits >= 1) {
    return true;
  }

  return false;
}
