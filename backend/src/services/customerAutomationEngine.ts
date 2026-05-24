import OpenAI from 'openai';
import { AI_MODEL } from '../config/aiModel.js';
import { stripThinkTags } from './aiService.js';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.ATLAS_API_KEY,
      baseURL: 'https://api.atlascloud.ai/v1',
    });
  }
  return client;
}

export interface AutomationEngineMessage {
  fechaHora: string;
  autor: 'cliente' | 'asistente' | 'humano';
  canal: 'email' | 'whatsapp';
  texto: string;
}

export interface AutomationEngineInput {
  workspaceId: string;
  canalEntrada: 'email' | 'whatsapp';
  contactoConocido: boolean;
  responseAutomaticaActiva: boolean;
  toggles: {
    respondConsultasGenerales: boolean;
    respondSolicitudesServicio: boolean;
    soloContactosConocidos: boolean;
    autoAssignEnabled: boolean;
    sortByCarga: boolean;
  };
  restricciones: {
    soloResponderMismoCanal: true;
    whatsappVentana24hAbierta?: boolean;
  };
  especialidades: Array<{ id: string; nombre: string; descripcion: string }>;
  cuentasCandidatas: Array<{ id: string; nombre: string; email: string; cargaActual: number }>;
  carpetas: Array<{ id: string; nombre: string; descripcion: string }>;
  reglasOrganizacion: Array<{ id: string; nombre: string; descripcion: string; folderIds: string[] }>;
  correoConsultas: { destino: string[]; cuentaOperativa: string[] };
  documentos: Array<{ nombre: string; texto: string }>;
  ultimos20Mensajes: AutomationEngineMessage[];
}

export interface AutomationEngineDecision {
  plataforma: 'email' | 'whatsapp';
  folderIds: string[];
  createPendingCase: boolean;
  askAssignment: boolean;
  assignCase: boolean;
  specialtyId?: string;
  assignTo?: string;
  consultasMessage?: string;
  pauseAutoReply: boolean;
  noResponder: boolean;
  mensajeCliente?: string;
  motivoPausa?: string;
  bruto: string;
  valida: boolean;
  errores: string[];
}

interface ParsedDecision {
  decision: AutomationEngineDecision;
  parseErrors: string[];
}

const MAX_CORRECTION_RETRIES = 3;

function buildPrompt(input: AutomationEngineInput): string {
  const context = {
    workspaceId: input.workspaceId,
    workspace: {
      canalEntrada: input.canalEntrada,
      contactoConocido: input.contactoConocido,
      respuestaAutomaticaActiva: input.responseAutomaticaActiva,
      ...input.toggles,
    },
    restriccionesCanal: input.restricciones,
    especialidades: input.especialidades,
    cuentasCandidatas: input.cuentasCandidatas,
    carpetas: input.carpetas,
    reglasOrganizacion: input.reglasOrganizacion,
    correoConsultas: input.correoConsultas,
    documentos: input.documentos,
    ultimos20Mensajes: input.ultimos20Mensajes,
  };

  return `Eres la recepcionista IA de un despacho de abogados.

Debes decidir que hacer con el mensaje mas reciente del cliente usando solo los hechos reales del contexto.

Reglas de razonamiento:
- usa solo la informacion del prompt
- no inventes
- no devuelvas clasificaciones, etiquetas intermedias ni pistas semanticas
- razona a partir del historial real, los documentos, las reglas y las restricciones tecnicas
- responde en el idioma del cliente
- si el cliente parece querer avanzar con un servicio legal, usa acciones reales como crear caso, preguntar asignacion, asignar caso o derivar a consultas
- si no estas seguro, deriva a consultas

Restricciones tecnicas:
- responde solo por el mismo canal de entrada
- si soloContactosConocidos es true y contactoConocido es false, no debes responder automaticamente al cliente
- si autoAssignEnabled es false, no debes usar /preguntar_asignacion ni /asignar_caso
- si el canal es whatsapp y la ventana de 24 horas esta cerrada, no debes incluir //mensaje al cliente
- si decides /preguntar_consultas, no debes incluir //mensaje al cliente
- si decides /no_responder, no debes incluir //mensaje al cliente

Comandos disponibles:
- primera linea obligatoria: ///email o ///whatsapp
- opcional: /mover_a_carpeta folderIds=["id1","id2"]
- opcional: /crear_caso_pendiente especialidadId="id|null"
- opcional: /preguntar_asignacion especialidadId="id|null"
- opcional: /asignar_caso especialidadId="id|null" asignarA="id_cuenta"
- opcional: /preguntar_consultas especialidadId="id|null" mensaje="texto natural para el equipo interno"
- opcional: /pausar_auto_reply motivo="texto"
- opcional: /no_responder
- opcional: //texto exacto para el cliente

Compatibilidades importantes:
- puedes combinar /mover_a_carpeta con cualquier accion compatible
- puedes combinar /crear_caso_pendiente con /preguntar_asignacion
- puedes combinar /crear_caso_pendiente con /asignar_caso
- puedes combinar /crear_caso_pendiente con /preguntar_consultas
- /preguntar_asignacion requiere //mensaje al cliente
- /asignar_caso puede llevar //mensaje al cliente
- /pausar_auto_reply puede llevar //mensaje al cliente

Incompatibilidades importantes:
- no uses /no_responder junto con //mensaje al cliente
- no uses /preguntar_consultas junto con //mensaje al cliente
- no uses /preguntar_asignacion junto con /asignar_caso
- no uses /no_responder junto con /preguntar_asignacion
- no uses /no_responder junto con /asignar_caso

Devuelve solo comandos validos.
No escribas explicaciones.
No uses /clasificar.

Contexto JSON:
${JSON.stringify(context, null, 2)}

Decide que hacer con el bloque mas reciente del cliente y responde solo con comandos validos.`;
}

function parseQuotedValue(line: string, key: string): string | undefined {
  const generic = line.match(new RegExp(`${key}="([^"]*)"`));
  return generic?.[1]?.trim();
}

function parseFolderIds(line: string): string[] {
  const match = line.match(/folderIds=(\[[\s\S]*\])$/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function normalizeOptionalId(value?: string): string | undefined {
  if (!value || value === 'null') return undefined;
  return value;
}

function parseAutomationDecision(rawOutput: string, fallbackChannel: 'email' | 'whatsapp'): ParsedDecision {
  const cleaned = stripThinkTags(rawOutput || '').trim();
  const lines = cleaned.split('\n').map((line) => line.trim()).filter(Boolean);

  const decision: AutomationEngineDecision = {
    plataforma: fallbackChannel,
    folderIds: [],
    createPendingCase: false,
    askAssignment: false,
    assignCase: false,
    pauseAutoReply: false,
    noResponder: false,
    bruto: cleaned,
    valida: false,
    errores: [],
  };
  const parseErrors: string[] = [];

  let channelSeen = false;
  let askAssignmentSeen = false;
  let assignCaseSeen = false;
  let consultasSeen = false;
  let pauseSeen = false;
  let noResponderSeen = false;
  let createPendingSeen = false;
  let messageSeen = false;
  let folderSeen = false;

  for (const line of lines) {
    if (line.startsWith('///')) {
      if (channelSeen) {
        parseErrors.push('Se ha devuelto mas de una linea de plataforma.');
        continue;
      }
      channelSeen = true;
      const platform = line.slice(3).trim();
      if (platform !== 'email' && platform !== 'whatsapp') {
        parseErrors.push('La plataforma devuelta no es valida.');
        continue;
      }
      decision.plataforma = platform;
      continue;
    }

    if (line.startsWith('/mover_a_carpeta')) {
      if (folderSeen) {
        parseErrors.push('Se ha devuelto mas de una linea /mover_a_carpeta.');
        continue;
      }
      folderSeen = true;
      decision.folderIds = parseFolderIds(line);
      continue;
    }

    if (line.startsWith('/crear_caso_pendiente')) {
      if (createPendingSeen) {
        parseErrors.push('Se ha devuelto mas de una linea /crear_caso_pendiente.');
        continue;
      }
      createPendingSeen = true;
      decision.createPendingCase = true;
      decision.specialtyId = normalizeOptionalId(parseQuotedValue(line, 'especialidadId')) || decision.specialtyId;
      continue;
    }

    if (line.startsWith('/preguntar_asignacion')) {
      if (askAssignmentSeen) {
        parseErrors.push('Se ha devuelto mas de una linea /preguntar_asignacion.');
        continue;
      }
      askAssignmentSeen = true;
      decision.askAssignment = true;
      decision.specialtyId = normalizeOptionalId(parseQuotedValue(line, 'especialidadId')) || decision.specialtyId;
      continue;
    }

    if (line.startsWith('/asignar_caso')) {
      if (assignCaseSeen) {
        parseErrors.push('Se ha devuelto mas de una linea /asignar_caso.');
        continue;
      }
      assignCaseSeen = true;
      decision.assignCase = true;
      decision.specialtyId = normalizeOptionalId(parseQuotedValue(line, 'especialidadId')) || decision.specialtyId;
      decision.assignTo = normalizeOptionalId(parseQuotedValue(line, 'asignarA'));
      continue;
    }

    if (line.startsWith('/preguntar_consultas')) {
      if (consultasSeen) {
        parseErrors.push('Se ha devuelto mas de una linea /preguntar_consultas.');
        continue;
      }
      consultasSeen = true;
      decision.consultasMessage = parseQuotedValue(line, 'mensaje') || '';
      decision.specialtyId = normalizeOptionalId(parseQuotedValue(line, 'especialidadId')) || decision.specialtyId;
      continue;
    }

    if (line.startsWith('/pausar_auto_reply')) {
      if (pauseSeen) {
        parseErrors.push('Se ha devuelto mas de una linea /pausar_auto_reply.');
        continue;
      }
      pauseSeen = true;
      decision.pauseAutoReply = true;
      decision.motivoPausa = parseQuotedValue(line, 'motivo') || 'Pausa solicitada por la IA recepcionista';
      continue;
    }

    if (line.startsWith('/no_responder')) {
      if (noResponderSeen) {
        parseErrors.push('Se ha devuelto mas de una linea /no_responder.');
        continue;
      }
      noResponderSeen = true;
      decision.noResponder = true;
      continue;
    }

    if (line.startsWith('//')) {
      if (messageSeen) {
        parseErrors.push('Se ha devuelto mas de una linea de mensaje al cliente.');
        continue;
      }
      messageSeen = true;
      decision.mensajeCliente = line.slice(2).trim();
      continue;
    }

    if (line.startsWith('/')) {
      parseErrors.push(`Comando no valido: ${line}`);
      continue;
    }

    parseErrors.push(`Linea fuera del contrato: ${line}`);
  }

  if (!channelSeen) {
    parseErrors.push('Falta la linea inicial de plataforma.');
  }

  return { decision, parseErrors };
}

function validateAutomationDecision(
  decision: AutomationEngineDecision,
  parseErrors: string[],
  input: AutomationEngineInput,
): string[] {
  const errors = [...parseErrors];
  const validFolderIds = new Set((input.carpetas || []).map((item) => item.id));
  const validCandidateIds = new Set((input.cuentasCandidatas || []).map((item) => item.id));
  const validSpecialtyIds = new Set((input.especialidades || []).map((item) => item.id));

  if (decision.plataforma !== input.canalEntrada) {
    errors.push('La plataforma devuelta no coincide con el canal de entrada.');
  }

  if (decision.folderIds.some((folderId) => !validFolderIds.has(folderId))) {
    errors.push('Se ha intentado mover la conversacion a carpetas no validas.');
  }

  if (decision.specialtyId && !validSpecialtyIds.has(decision.specialtyId)) {
    errors.push('La especialidad indicada no es valida en este workspace.');
  }

  if (decision.assignTo && !validCandidateIds.has(decision.assignTo)) {
    errors.push('El destino de asignacion no es valido en este workspace.');
  }

  if (decision.assignCase && !decision.assignTo) {
    errors.push('El comando /asignar_caso requiere asignarA.');
  }

  if (decision.consultasMessage !== undefined && !decision.consultasMessage.trim()) {
    errors.push('El comando /preguntar_consultas requiere un mensaje interno no vacio.');
  }

  if (decision.askAssignment && decision.assignCase) {
    errors.push('No se puede preguntar asignacion y asignar caso en la misma salida.');
  }

  if (decision.noResponder && !!decision.mensajeCliente) {
    errors.push('No se puede combinar /no_responder con mensaje al cliente.');
  }

  if (decision.consultasMessage && !!decision.mensajeCliente) {
    errors.push('No se puede combinar /preguntar_consultas con mensaje al cliente.');
  }

  if (decision.noResponder && (decision.askAssignment || decision.assignCase || !!decision.consultasMessage)) {
    errors.push('No se puede combinar /no_responder con otras acciones excluyentes.');
  }

  if (decision.askAssignment && !decision.mensajeCliente) {
    errors.push('El comando /preguntar_asignacion requiere mensaje al cliente.');
  }

  if (!input.toggles.autoAssignEnabled && (decision.askAssignment || decision.assignCase)) {
    errors.push('No se puede usar asignacion cuando autoAssignEnabled es false.');
  }

  if (input.toggles.soloContactosConocidos && !input.contactoConocido && !!decision.mensajeCliente) {
    errors.push('No se puede responder automaticamente a un contacto desconocido cuando soloContactosConocidos es true.');
  }

  if (
    input.canalEntrada === 'whatsapp'
    && input.restricciones.whatsappVentana24hAbierta === false
    && !!decision.mensajeCliente
  ) {
    errors.push('No se puede responder al cliente por WhatsApp fuera de la ventana de 24 horas.');
  }

  if (
    !decision.noResponder
    && !decision.mensajeCliente
    && !decision.consultasMessage
    && !decision.pauseAutoReply
    && !decision.assignCase
    && !decision.askAssignment
    && !decision.createPendingCase
    && decision.folderIds.length === 0
  ) {
    errors.push('La salida no contiene ninguna accion ejecutable.');
  }

  return errors;
}

function formatValidationErrors(errors: string[]): string {
  return errors.map((error, index) => `${index + 1}. ${error}`).join('\n');
}

function buildInvalidDecision(rawOutput: string, fallbackChannel: 'email' | 'whatsapp', errors: string[]): AutomationEngineDecision {
  return {
    plataforma: fallbackChannel,
    folderIds: [],
    createPendingCase: false,
    askAssignment: false,
    assignCase: false,
    pauseAutoReply: false,
    noResponder: false,
    bruto: stripThinkTags(rawOutput || '').trim(),
    valida: false,
    errores: errors,
  };
}

export async function runCustomerAutomationEngine(
  input: AutomationEngineInput,
): Promise<AutomationEngineDecision> {
  const prompt = buildPrompt(input);
  let messages: Array<{ role: 'user' | 'assistant'; content: string }> = [{ role: 'user', content: prompt }];
  let lastRawOutput = '';
  let lastErrors = ['No se ha podido obtener una salida valida del motor.'];

  for (let attempt = 0; attempt <= MAX_CORRECTION_RETRIES; attempt += 1) {
    const completion = await getClient().chat.completions.create({
      model: AI_MODEL,
      messages,
      max_tokens: 1400,
      temperature: 0.2,
    });

    const rawOutput = completion.choices?.[0]?.message?.content || '';
    lastRawOutput = rawOutput;

    const { decision, parseErrors } = parseAutomationDecision(rawOutput, input.canalEntrada);
    const errors = validateAutomationDecision(decision, parseErrors, input);

    if (errors.length === 0) {
      decision.valida = true;
      decision.errores = [];
      return decision;
    }

    lastErrors = errors;
    if (attempt === MAX_CORRECTION_RETRIES) {
      break;
    }

    messages = [
      { role: 'user', content: prompt },
      { role: 'assistant', content: rawOutput },
      {
        role: 'user',
        content: `Tu salida anterior es invalida tecnicamente.\nCorrigela sin explicaciones y devuelve una salida nueva que cumpla el contrato.\nErrores:\n${formatValidationErrors(errors)}`,
      },
    ];
  }

  return buildInvalidDecision(lastRawOutput, input.canalEntrada, lastErrors);
}
