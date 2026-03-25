import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DesgloseLine {
  concepto: string;
  valor: number;
  params?: Record<string, string | number>;
  isSection?: boolean;
}

export interface CalcResult {
  total: number;
  desglose: DesgloseLine[];
  etiquetaTotal: string;
  currency: string;
}

interface TaxBracket {
  desde: number;
  hasta: number | null;
  tipo: number;
}

interface TaxRatesES {
  irpf: {
    tramoEstatales: TaxBracket[];
    tramoAutonomicos: TaxBracket[];
    minimoPersonal: number;
    reduccionRendimientoTrabajo: {
      hastaRendimiento: number;
      reduccionMaxima: number;
      reduccionBase: number;
      reduccionPorEuro: number;
      umbralSuperior: number;
    };
    limitePlanPensiones: number;
  };
  is: {
    tipoGeneral: number;
    tipoNuevaEmpresa: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadTaxRates(): TaxRatesES {
  const filePath = path.join(__dirname, '../config/taxRates/es.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TaxRatesES;
}

function n(val: string | number | undefined): number {
  if (val === undefined || val === null || val === '') return 0;
  const parsed = typeof val === 'string' ? parseFloat(val) : val;
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Applies progressive brackets to a base amount and returns the resulting tax.
 */
function applyBrackets(base: number, brackets: TaxBracket[]): number {
  if (base <= 0) return 0;
  let tax = 0;
  for (const bracket of brackets) {
    if (base <= bracket.desde) break;
    const upper = bracket.hasta !== null ? bracket.hasta : Infinity;
    const taxable = Math.min(base, upper) - bracket.desde;
    tax += taxable * (bracket.tipo / 100);
  }
  return Math.round(tax * 100) / 100;
}

/**
 * Calculates the reducción por rendimientos del trabajo (Spain 2026).
 */
function calcReduccionTrabajo(rendimientoNeto: number, rates: TaxRatesES): number {
  const r = rates.irpf.reduccionRendimientoTrabajo;
  if (rendimientoNeto <= r.hastaRendimiento) return r.reduccionMaxima;
  if (rendimientoNeto >= r.umbralSuperior) return r.reduccionBase;
  return Math.max(r.reduccionBase, r.reduccionMaxima - (rendimientoNeto - r.hastaRendimiento) * r.reduccionPorEuro);
}

// ── Calculators ───────────────────────────────────────────────────────────────

export function calcularAsalariado(data: Record<string, string>): CalcResult {
  const rates = loadTaxRates();
  const desglose: DesgloseLine[] = [];

  // --- Cálculo interno completo (no se muestran todos en desglose) ---

  // Ingresos totales
  const salarioBruto         = n(data.salarioBruto);
  const retribucionesEspecie = n(data.retribucionesEspecie);
  const pagasExtras          = n(data.pagasExtras);
  const ingresosTrabajo = salarioBruto + retribucionesEspecie + pagasExtras;

  // Cotizaciones SS (auto 6.35% si no se indica)
  const cotizacionesSS = n(data.cotizacionesSS) > 0
    ? n(data.cotizacionesSS)
    : Math.round(salarioBruto * 0.0635 * 100) / 100;
  const retencionesEmpresa = n(data.retencionesEmpresa);

  // Reducción rendimientos trabajo (necesaria para el cálculo IRPF)
  const rendimientoPrevio      = ingresosTrabajo - cotizacionesSS;
  const reduccionTrabajo       = calcReduccionTrabajo(rendimientoPrevio, rates);
  const rendimientoNetoTrabajo = Math.max(0, rendimientoPrevio - reduccionTrabajo);

  // Otros ingresos
  const capitalMobiliario   = n(data.capitalMobiliario);
  const capitalInmobiliario = n(data.capitalInmobiliario);
  const gananciaPatrimonial = n(data.gananciaPatrimonial);
  const pensiones           = n(data.pensiones);
  const otrosIngresos = capitalMobiliario + capitalInmobiliario + gananciaPatrimonial + pensiones;

  // Reducciones en base
  const planPensiones    = Math.min(n(data.planPensiones), rates.irpf.limitePlanPensiones);
  const cuotasSindicales = n(data.cuotasSindicales);
  const donaciones       = n(data.donaciones);
  const viviendaHabitual = n(data.viviendaHabitual);
  const totalReducciones = planPensiones + cuotasSindicales + donaciones + viviendaHabitual;

  // IRPF
  const minimoPersonal  = rates.irpf.minimoPersonal;
  const baseImponible   = rendimientoNetoTrabajo + otrosIngresos - totalReducciones;
  const baseLiquidable  = Math.max(0, baseImponible - minimoPersonal);
  const cuotaEstatal    = applyBrackets(baseLiquidable, rates.irpf.tramoEstatales);
  const cuotaAutonomica = applyBrackets(baseLiquidable, rates.irpf.tramoAutonomicos);
  const cuotaIntegra    = cuotaEstatal + cuotaAutonomica;
  const deduccionesAuto = n(data.deduccionesAuto);
  const cuotaLiquida    = Math.max(0, cuotaIntegra - deduccionesAuto);

  const retencionesTotales = n(data.retencionesTotales) > 0
    ? n(data.retencionesTotales)
    : retencionesEmpresa;

  const cuotaDiferencial = Math.round((cuotaLiquida - retencionesTotales) * 100) / 100;

  // --- Desglose simplificado ---
  // "Otras deducciones" = plan pensiones + sindicatos + donaciones + vivienda + deducciones autonómicas
  const otrasDeduccionesTotal = totalReducciones + deduccionesAuto;

  // Sueldo neto estimado (lo que "te queda" en mano contando las retenciones ya pagadas)
  const sueldoNeto = Math.round((ingresosTrabajo - cotizacionesSS - otrasDeduccionesTotal - cuotaLiquida) * 100) / 100;

  desglose.push({ concepto: 'calc.grossSalary', valor: ingresosTrabajo });
  desglose.push({ concepto: 'calc.ssContributions', valor: -cotizacionesSS });
  if (otrasDeduccionesTotal > 0) {
    desglose.push({ concepto: 'calc.otherDeductions', valor: -otrasDeduccionesTotal });
  }
  desglose.push({ concepto: 'calc.estimatedIncomeTax', valor: -cuotaLiquida });
  desglose.push({ concepto: 'calc.estimatedNetSalary', valor: sueldoNeto });

  // Separador para el resultado de la declaración
  desglose.push({ concepto: 'calc.sectionIncomeTaxReturn', valor: 0, isSection: true });
  desglose.push({ concepto: 'calc.annualIncomeTaxQuota', valor: cuotaLiquida });
  if (retencionesTotales > 0) {
    desglose.push({ concepto: 'calc.withholdingsPaid', valor: -retencionesTotales });
  }
  desglose.push({ concepto: cuotaDiferencial >= 0 ? 'calc.toPay' : 'calc.toRefund', valor: cuotaDiferencial });

  return {
    total: cuotaDiferencial,
    desglose,
    etiquetaTotal: cuotaDiferencial >= 0 ? 'calc.totalPayIncomeTax' : 'calc.totalRefundIncomeTax',
    currency: 'EUR',
  };
}

export function calcularAutonomo(data: Record<string, string>): CalcResult {
  const rates = loadTaxRates();
  const desglose: DesgloseLine[] = [];

  // ── IRPF (mod. 130) ──────────────────────────────────────────────────────

  const facturacionTotal      = n(data.facturacionTotal);
  const ingresosIntracom      = n(data.ingresosIntracom);
  const subvenciones          = n(data.subvenciones);
  const otrosIngresos         = n(data.otrosIngresos);
  const ingresosTotales = facturacionTotal + ingresosIntracom + subvenciones + otrosIngresos;
  desglose.push({ concepto: 'calc.totalActivityIncome', valor: ingresosTotales });

  const gastosActividad = n(data.gastosActividad);
  const cuotaRETA       = n(data.cuotaRETA);
  const amortizaciones  = n(data.amortizaciones);
  const gastosFinancieros = n(data.gastosFinancieros);
  const dietasDesplaz   = n(data.dietasDesplaz);
  const segurosPro      = n(data.segurosPro);
  // gastosDeducibles (campo simple) tiene prioridad sobre los campos individuales avanzados
  const gastosDeducibles = n(data.gastosDeducibles);
  const totalGastos = gastosDeducibles > 0
    ? gastosDeducibles
    : gastosActividad + cuotaRETA + amortizaciones + gastosFinancieros + dietasDesplaz + segurosPro;
  desglose.push({ concepto: 'calc.deductibleExpensesAll', valor: -totalGastos });

  const rendimientoNeto = Math.max(0, ingresosTotales - totalGastos);
  desglose.push({ concepto: 'calc.netIncome', valor: rendimientoNeto });

  // Mínimo personal
  const minimoPersonal = rates.irpf.minimoPersonal;
  desglose.push({ concepto: 'calc.personalAllowance', valor: -minimoPersonal });

  const baseLiquidable = Math.max(0, rendimientoNeto - minimoPersonal);
  desglose.push({ concepto: 'calc.taxableBase', valor: baseLiquidable });

  const cuotaEstatal    = applyBrackets(baseLiquidable, rates.irpf.tramoEstatales);
  const cuotaAutonomica = applyBrackets(baseLiquidable, rates.irpf.tramoAutonomicos);
  const cuotaIntegra    = cuotaEstatal + cuotaAutonomica;
  desglose.push({ concepto: 'calc.grossIncomeTaxQuota', valor: cuotaIntegra });

  const pagosFracc130         = n(data.pagosFracc130);
  const retencionesSoportadas = n(data.retencionesSoportadas);
  const totalAnticipo = pagosFracc130 + retencionesSoportadas;
  if (totalAnticipo > 0) {
    desglose.push({ concepto: 'calc.advancePaymentsWithholdings', valor: -totalAnticipo });
  }

  const cuotaIRPF = Math.round((cuotaIntegra - totalAnticipo) * 100) / 100;
  desglose.push({ concepto: cuotaIRPF >= 0 ? 'calc.incomeTaxToPay' : 'calc.incomeTaxToRefund', valor: cuotaIRPF });

  // ── IVA ─────────────────────────────────────────────────────────────────

  const ivaRepercutido  = n(data.ivaRepercutido);
  const ivaSoportado    = n(data.ivaSoportado);
  const ivaIntracom     = n(data.ivaIntracom);
  const ivaRegularizacion = n(data.ivaRegularizacion);

  if (ivaRepercutido > 0 || ivaSoportado > 0) {
    desglose.push({ concepto: 'calc.sectionVatSettlement', valor: 0, isSection: true });
    desglose.push({ concepto: 'calc.outputVatCharged', valor: ivaRepercutido });
    desglose.push({ concepto: 'calc.inputVatDeductible', valor: -ivaSoportado });
    if (ivaIntracom !== 0) desglose.push({ concepto: 'calc.intraCommunityVat', valor: -ivaIntracom });
    if (ivaRegularizacion !== 0) desglose.push({ concepto: 'calc.vatRegularizations', valor: -ivaRegularizacion });
  }

  const ivaLiquidar = Math.round((ivaRepercutido - ivaSoportado - ivaIntracom - ivaRegularizacion) * 100) / 100;
  if (ivaRepercutido > 0 || ivaSoportado > 0) {
    desglose.push({ concepto: ivaLiquidar >= 0 ? 'calc.vatToPay' : 'calc.vatToOffset', valor: ivaLiquidar });
  }

  const total = Math.round((cuotaIRPF + (ivaRepercutido > 0 || ivaSoportado > 0 ? ivaLiquidar : 0)) * 100) / 100;

  return {
    total,
    desglose,
    etiquetaTotal: 'calc.totalPayIncomeTaxVat',
    currency: 'EUR',
  };
}

export function calcularEmpresa(data: Record<string, string>): CalcResult {
  const rates = loadTaxRates();
  const desglose: DesgloseLine[] = [];

  // ── Impuesto sobre Sociedades ────────────────────────────────────────────

  // Si no se rellena resultadoAntesImp directamente, se calcula como ingresos - gastos
  const resultadoAntesImp = n(data.resultadoAntesImp) !== 0
    ? n(data.resultadoAntesImp)
    : n(data.ingresosTotal) - n(data.gastosTotal);
  desglose.push({ concepto: 'calc.profitBeforeTax', valor: resultadoAntesImp });

  // Ajustes extracontables
  const gastosNoDeducibles    = n(data.gastosNoDeducibles);
  const amortizFiscal         = n(data.amortizFiscal);
  const provisiones           = n(data.provisiones);
  const deterioros            = n(data.deterioros);
  const opVinculadas          = n(data.opVinculadas);
  const ajustesPositivos = gastosNoDeducibles + amortizFiscal + provisiones + deterioros + opVinculadas;
  if (ajustesPositivos > 0) {
    desglose.push({ concepto: 'calc.positiveExtraAccAdj', valor: ajustesPositivos });
  }

  const basesNegAnter          = n(data.basesNegAnter);
  const reservaCapitalizacion  = n(data.reservaCapitalizacion);
  const reservaNivelacion      = n(data.reservaNivelacion);
  const ajustesNegativos = basesNegAnter + reservaCapitalizacion + reservaNivelacion;
  if (ajustesNegativos > 0) {
    desglose.push({ concepto: 'calc.negativeExtraAccAdj', valor: -ajustesNegativos });
  }

  const baseImponible = Math.max(0, resultadoAntesImp + ajustesPositivos - ajustesNegativos);
  desglose.push({ concepto: 'calc.corporateTaxBase', valor: baseImponible });

  const tipoIS    = rates.is.tipoGeneral / 100;
  const cuotaIS   = Math.round(baseImponible * tipoIS * 100) / 100;
  desglose.push({ concepto: 'calc.grossCorporateTax', params: { rate: rates.is.tipoGeneral }, valor: cuotaIS });

  // Deducciones
  const deduccionID      = n(data.deduccionID);
  const deduccionEmpleo  = n(data.deduccionEmpleo);
  const dobleImposicion  = n(data.dobleImposicion);
  const deduccionDonac   = n(data.deduccionDonac);
  const incentivosAuto   = n(data.incentivosAuto);
  const totalDeducciones = deduccionID + deduccionEmpleo + dobleImposicion + deduccionDonac + incentivosAuto;
  if (totalDeducciones > 0) {
    desglose.push({ concepto: 'calc.corporateDeductions', valor: -totalDeducciones });
  }

  const cuotaLiquida = Math.max(0, cuotaIS - totalDeducciones);
  desglose.push({ concepto: 'calc.netCorporateTax', valor: cuotaLiquida });

  const pagosFracc202    = n(data.pagosFracc202);
  const retencionesSop   = n(data.retencionesSop);
  const totalAnticipo = pagosFracc202 + retencionesSop;
  if (totalAnticipo > 0) {
    desglose.push({ concepto: 'calc.advancePaymentsRetentions', valor: -totalAnticipo });
  }

  const cuotaIS_diferencial = Math.round((cuotaLiquida - totalAnticipo) * 100) / 100;
  desglose.push({ concepto: cuotaIS_diferencial >= 0 ? 'calc.corporateTaxToPay' : 'calc.corporateTaxToRefund', valor: cuotaIS_diferencial });

  // ── IVA ──────────────────────────────────────────────────────────────────

  const ivaRepercutido   = n(data.ivaRepercutidoEmp);
  const ivaSoportado     = n(data.ivaSoportadoEmp);
  const ivaRegulariz     = n(data.ivaRegularizEmp);

  if (ivaRepercutido > 0 || ivaSoportado > 0) {
    desglose.push({ concepto: 'calc.sectionVatSettlement', valor: 0, isSection: true });
    desglose.push({ concepto: 'calc.outputVat', valor: ivaRepercutido });
    desglose.push({ concepto: 'calc.inputVatDeductible', valor: -ivaSoportado });
    if (ivaRegulariz !== 0) desglose.push({ concepto: 'calc.regularizationsCompensations', valor: -ivaRegulariz });
  }

  const ivaLiquidar = Math.round((ivaRepercutido - ivaSoportado - ivaRegulariz) * 100) / 100;
  if (ivaRepercutido > 0 || ivaSoportado > 0) {
    desglose.push({ concepto: ivaLiquidar >= 0 ? 'calc.vatToPay' : 'calc.vatToOffset', valor: ivaLiquidar });
  }

  const total = Math.round((cuotaIS_diferencial + (ivaRepercutido > 0 || ivaSoportado > 0 ? ivaLiquidar : 0)) * 100) / 100;

  return {
    total,
    desglose,
    etiquetaTotal: 'calc.totalPayCorpTaxVat',
    currency: 'EUR',
  };
}


// ── Generic multi-country engine ──────────────────────────────────────────────

interface TaxBracketGeneric {
  from: number;
  to: number | null;
  rate: number;
}

interface TaxRatesGeneric {
  code: string;
  country: string;
  currency: string;
  incomeTax: {
    brackets: TaxBracketGeneric[];
    personalAllowance: number;
    notes?: string;
  };
  corporateTax: {
    standard: number;
    small: number;
    smallThreshold: number;
  };
  vat: {
    standard: number;
    reduced: number;
    superReduced: number;
  };
  socialSecurity: {
    employee: number;
    employer: number;
    selfEmployed: number;
  };
}

function loadTaxRatesGeneric(country: string): TaxRatesGeneric | null {
  try {
    const code = (country || 'es').toLowerCase().substring(0, 2);
    const filePath = path.join(__dirname, '../config/taxRates', `${code}.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TaxRatesGeneric;
  } catch {
    return null;
  }
}

function applyBracketsGeneric(base: number, brackets: TaxBracketGeneric[]): number {
  if (base <= 0) return 0;
  let tax = 0;
  for (const bracket of brackets) {
    if (base <= bracket.from) break;
    const upper = bracket.to !== null ? bracket.to : Infinity;
    const taxable = Math.min(base, upper) - bracket.from;
    tax += taxable * (bracket.rate / 100);
  }
  return Math.round(tax * 100) / 100;
}

export function calcularAsalariadoGenerico(data: Record<string, string>, rates: TaxRatesGeneric): CalcResult {
  const desglose: DesgloseLine[] = [];

  const salarioBruto     = n(data.salarioBruto);
  const pagasExtras      = n(data.pagasExtras);
  const retribEspecie    = n(data.retribucionesEspecie);
  const ingresosTrabajo  = salarioBruto + pagasExtras + retribEspecie;
  desglose.push({ concepto: 'calc.grossIncome', valor: ingresosTrabajo });

  // Social Security
  const cotizacionesSS = n(data.cotizacionesSS) > 0
    ? n(data.cotizacionesSS)
    : Math.round(salarioBruto * (rates.socialSecurity.employee / 100) * 100) / 100;
  desglose.push({ concepto: 'calc.socialSecurityEmployee', valor: -cotizacionesSS });

  // Other income
  const capitalMobiliario   = n(data.capitalMobiliario);
  const capitalInmobiliario = n(data.capitalInmobiliario);
  const gananciaPatrimonial = n(data.gananciaPatrimonial);
  const pensiones           = n(data.pensiones);
  const otrosIngresos       = capitalMobiliario + capitalInmobiliario + gananciaPatrimonial + pensiones;

  // Deductions
  const deduccionesPersonales = n(data.deduccionesAuto) + n(data.donaciones) + n(data.planPensiones) + n(data.cuotasSindicales) + n(data.viviendaHabitual);
  const personalAllowance = rates.incomeTax.personalAllowance;

  const rendimientoNeto = Math.max(0, ingresosTrabajo - cotizacionesSS + otrosIngresos);
  const baseImponible   = Math.max(0, rendimientoNeto - personalAllowance - deduccionesPersonales);
  desglose.push({ concepto: 'calc.taxBase', valor: baseImponible });

  const cuotaImpuesto = applyBracketsGeneric(baseImponible, rates.incomeTax.brackets);
  desglose.push({ concepto: 'calc.calculatedIncomeTax', valor: cuotaImpuesto });

  const retencionesTotales = n(data.retencionesTotales) > 0
    ? n(data.retencionesTotales)
    : n(data.retencionesEmpresa);

  if (retencionesTotales > 0) {
    desglose.push({ concepto: 'calc.withholdingsAdvancePaid', valor: -retencionesTotales });
  }

  const resultado = Math.round((cuotaImpuesto - retencionesTotales) * 100) / 100;
  desglose.push({ concepto: resultado >= 0 ? 'calc.toPay' : 'calc.toRefund', valor: resultado });

  return {
    total: resultado,
    desglose,
    etiquetaTotal: resultado >= 0 ? 'calc.totalPayIncomeTax' : 'calc.totalRefundIncomeTax',
    currency: rates.currency || 'EUR',
  };
}

export function calcularAutonomoGenerico(data: Record<string, string>, rates: TaxRatesGeneric): CalcResult {
  const desglose: DesgloseLine[] = [];

  const facturacionTotal = n(data.facturacionTotal) + n(data.ingresosIntracom) + n(data.subvenciones) + n(data.otrosIngresos);
  desglose.push({ concepto: 'calc.totalActivityIncome', valor: facturacionTotal });

  // Gastos deducibles (incl. SS)
  const gastosDeducibles = n(data.gastosDeducibles) > 0
    ? n(data.gastosDeducibles)
    : n(data.gastosActividad) + n(data.amortizaciones) + n(data.gastosFinancieros) + n(data.dietasDesplaz) + n(data.segurosPro);
  desglose.push({ concepto: 'calc.deductibleExpenses', valor: -gastosDeducibles });

  const rendimientoNeto = Math.max(0, facturacionTotal - gastosDeducibles);
  desglose.push({ concepto: 'calc.netIncome', valor: rendimientoNeto });

  const personalAllowance = rates.incomeTax.personalAllowance;
  const baseImponible = Math.max(0, rendimientoNeto - personalAllowance);
  desglose.push({ concepto: 'calc.taxBase', valor: baseImponible });

  const cuotaImpuesto = applyBracketsGeneric(baseImponible, rates.incomeTax.brackets);
  desglose.push({ concepto: 'calc.incomeTax', valor: cuotaImpuesto });

  const advance = n(data.pagosFracc130);
  if (advance > 0) {
    desglose.push({ concepto: 'calc.advancePayments', valor: -advance });
  }

  const impuestoNeto = Math.round((cuotaImpuesto - advance) * 100) / 100;
  desglose.push({ concepto: impuestoNeto >= 0 ? 'calc.incomeTaxToPay' : 'calc.incomeTaxToRefund', valor: impuestoNeto });

  // VAT / Indirect tax
  const ivaRepercutido  = n(data.ivaRepercutido);
  const ivaSoportado    = n(data.ivaSoportado);
  const ivaRegularizacion = n(data.ivaRegularizacion);

  if (ivaRepercutido > 0 || ivaSoportado > 0) {
    desglose.push({ concepto: 'calc.sectionIndirectTax', valor: 0, isSection: true });
    desglose.push({ concepto: 'calc.taxCharged', valor: ivaRepercutido });
    desglose.push({ concepto: 'calc.deductibleTaxPaid', valor: -ivaSoportado });
    if (ivaRegularizacion !== 0) desglose.push({ concepto: 'calc.regularizations', valor: -ivaRegularizacion });
  }

  const ivaLiquidar = Math.round((ivaRepercutido - ivaSoportado - ivaRegularizacion) * 100) / 100;
  if (ivaRepercutido > 0 || ivaSoportado > 0) {
    desglose.push({ concepto: ivaLiquidar >= 0 ? 'calc.indirectTaxToPay' : 'calc.indirectTaxToOffset', valor: ivaLiquidar });
  }

  const total = Math.round((impuestoNeto + (ivaRepercutido > 0 || ivaSoportado > 0 ? ivaLiquidar : 0)) * 100) / 100;
  return {
    total,
    desglose,
    etiquetaTotal: 'calc.totalPayIncomeIndirect',
    currency: rates.currency || 'EUR',
  };
}

export function calcularEmpresaGenerico(data: Record<string, string>, rates: TaxRatesGeneric): CalcResult {
  const desglose: DesgloseLine[] = [];

  const resultadoAntesImp = n(data.resultadoAntesImp) !== 0
    ? n(data.resultadoAntesImp)
    : n(data.ingresosTotal) - n(data.gastosTotal);
  desglose.push({ concepto: 'calc.profitBeforeTax', valor: resultadoAntesImp });

  const gastosNoDeducibles = n(data.gastosNoDeducibles);
  if (gastosNoDeducibles > 0) {
    desglose.push({ concepto: 'calc.positiveAdjNonDeductible', valor: gastosNoDeducibles });
  }

  const basesNegAnter = n(data.basesNegAnter);
  if (basesNegAnter > 0) {
    desglose.push({ concepto: 'calc.priorYearLosses', valor: -basesNegAnter });
  }

  const baseImponible = Math.max(0, resultadoAntesImp + gastosNoDeducibles - basesNegAnter);
  desglose.push({ concepto: 'calc.corporateTaxBase', valor: baseImponible });

  // Choose rate (small business vs standard)
  const corpRate = (rates.corporateTax.smallThreshold > 0 && baseImponible <= rates.corporateTax.smallThreshold)
    ? rates.corporateTax.small
    : rates.corporateTax.standard;
  const cuotaIS = Math.round(baseImponible * (corpRate / 100) * 100) / 100;
  desglose.push({ concepto: 'calc.corporateTaxCalcRate', params: { rate: corpRate }, valor: cuotaIS });

  const deducciones = n(data.deduccionID) + n(data.deduccionEmpleo);
  if (deducciones > 0) {
    desglose.push({ concepto: 'calc.taxDeductions', valor: -deducciones });
  }

  const cuotaLiquida = Math.max(0, cuotaIS - deducciones);
  desglose.push({ concepto: 'calc.netCorporateTax', valor: cuotaLiquida });

  const advance = n(data.pagosFracc202) + n(data.retencionesSop);
  if (advance > 0) {
    desglose.push({ concepto: 'calc.advancePayments', valor: -advance });
  }

  const cuotaDif = Math.round((cuotaLiquida - advance) * 100) / 100;
  desglose.push({ concepto: cuotaDif >= 0 ? 'calc.corporateTaxToPay' : 'calc.corporateTaxToRefund', valor: cuotaDif });

  // VAT
  const ivaRepercutido = n(data.ivaRepercutidoEmp);
  const ivaSoportado   = n(data.ivaSoportadoEmp);
  const ivaRegulariz   = n(data.ivaRegularizEmp);

  if (ivaRepercutido > 0 || ivaSoportado > 0) {
    desglose.push({ concepto: 'calc.sectionIndirectTax', valor: 0, isSection: true });
    desglose.push({ concepto: 'calc.taxCharged', valor: ivaRepercutido });
    desglose.push({ concepto: 'calc.deductibleTaxPaid', valor: -ivaSoportado });
    if (ivaRegulariz !== 0) desglose.push({ concepto: 'calc.regularizations', valor: -ivaRegulariz });
  }

  const ivaLiquidar = Math.round((ivaRepercutido - ivaSoportado - ivaRegulariz) * 100) / 100;
  if (ivaRepercutido > 0 || ivaSoportado > 0) {
    desglose.push({ concepto: ivaLiquidar >= 0 ? 'calc.indirectTaxToPay' : 'calc.indirectTaxToOffset', valor: ivaLiquidar });
  }

  const total = Math.round((cuotaDif + (ivaRepercutido > 0 || ivaSoportado > 0 ? ivaLiquidar : 0)) * 100) / 100;
  return {
    total,
    desglose,
    etiquetaTotal: 'calc.totalPayCorpIndirect',
    currency: rates.currency || 'EUR',
  };
}

// ── Main dispatcher ─────────────────────────────────────────────────────────────

export function calcular(clientType: string, data: Record<string, string>, country?: string): CalcResult {
  const countryCode = String(country || '').trim().toUpperCase().slice(0, 2);
  if (!countryCode) {
    throw new Error('Country is required');
  }

  // Spain: use the full Spain-specific engine
  if (countryCode === 'ES') {
    switch (clientType) {
      case 'asalariado': return calcularAsalariado(data);
      case 'autonomo':   return calcularAutonomo(data);
      case 'empresa':    return calcularEmpresa(data);
      default:           return calcularAsalariado(data);
    }
  }

  // Other countries: use the generic engine
  const rates = loadTaxRatesGeneric(countryCode);
  if (!rates) {
    throw new Error(`No tax config for country: ${countryCode}`);
  }

  switch (clientType) {
    case 'asalariado': return calcularAsalariadoGenerico(data, rates);
    case 'autonomo':   return calcularAutonomoGenerico(data, rates);
    case 'empresa':    return calcularEmpresaGenerico(data, rates);
    default:           return calcularAsalariadoGenerico(data, rates);
  }
}
