import OpenAI from 'openai';
import { AI_AUTOMATION_MODEL } from '../config/aiModel.js';
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

export type AutomationDecisionType =
  | 'reply'
  | 'ask_assignment'
  | 'assign_case'
  | 'preguntar_consultas'
  | 'pause_auto_reply'
  | 'no_responder';

export interface AutomationEngineMessage {
  fechaHora: string;
  autor: 'cliente' | 'asistente' | 'humano';
  canal: 'email' | 'whatsapp';
  texto: string;
}

export interface AutomationEngineDecision {
  plataforma: 'email' | 'whatsapp';
  clasificacion: {
    tipo: 'consulta_general' | 'solicitud_servicio' | 'otro';
    especialidadId?: string;
  };
  folderIds: string[];
  accion: AutomationDecisionType;
  asignarA?: string;
  mensajeConsultas?: string;
  mensajeCliente?: string;
  motivoPausa?: string;
  bruto: string;
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

function escapeMultilineText(text: string): string {
  return String(text || '').replace(/\r/g, ' ').replace(/\n/g, ' ').trim();
}

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

Tu trabajo es:
- responder preguntas simples usando solo la informacion recibida
- organizar conversaciones en carpetas si corresponde
- detectar solicitudes de servicio legal
- preguntar al cliente si quiere que se le asigne un abogado cuando corresponda
- asignar abogado si el cliente lo confirma y existe candidato valido
- preguntar al correo de consultas si no tienes base suficiente para decidir o responder

Reglas obligatorias:
- responde solo por el mismo canal de entrada
- usa solo la informacion que recibes en este prompt
- no inventes
- no uses plantillas
- no prometas resultados juridicos
- no des estrategia juridica compleja
- si dudas, usa /preguntar_consultas
- si soloContactosConocidos es true y contactoConocido es false, no debes responder automaticamente al cliente
- responde en el idioma del cliente
- tono cercano pero profesional
- ten en cuenta siempre los ultimos 20 mensajes con fecha y hora
- si los ultimos mensajes del cliente llegan en bloque, tienes que interpretar el bloque entero
- si decides /preguntar_consultas, no debes incluir //mensaje al cliente
- si el canal es whatsapp y la ventana de 24 horas esta cerrada, no debes intentar responder al cliente

Formato de salida:
- primera linea: ///email o ///whatsapp
- despues, una linea /clasificar tipo="consulta_general|solicitud_servicio|otro" especialidadId="id|null"
- puedes incluir cero o una linea /mover_a_carpeta folderIds=["id1","id2"]
- puedes incluir cero o una linea /preguntar_asignacion especialidadId="id|null"
- puedes incluir cero o una linea /asignar_caso especialidadId="id|null" asignarA="id_cuenta"
- puedes incluir cero o una linea /preguntar_consultas mensaje="texto natural para el correo de consultas"
- puedes incluir cero o una linea /pausar_auto_reply motivo="texto"
- puedes incluir cero o una linea /no_responder
- si respondes al cliente, la ultima linea debe ser //texto del mensaje al cliente
- no escribas nada fuera de ese formato

Prioridades:
1. no inventar
2. respetar canal y restricciones
3. usar especialidades, documentos y contexto real
4. si no sabes que hacer, usar /preguntar_consultas

Contexto JSON:
${JSON.stringify(context, null, 2)}

Decide que hacer con el bloque mas reciente del cliente y responde solo en el formato indicado.
/no_think`;
}

function parseQuotedValue(line: string, key: string): string | undefined {
  const match = line.match(new RegExp(`${key}="([\\s\\S]*)"$`));
  if (match) return match[1].trim();
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

export function parseAutomationDecision(rawOutput: string, fallbackChannel: 'email' | 'whatsapp'): AutomationEngineDecision {
  const cleaned = stripThinkTags(rawOutput || '').trim();
  const lines = cleaned.split('\n').map((line) => line.trim()).filter(Boolean);

  const decision: AutomationEngineDecision = {
    plataforma: fallbackChannel,
    clasificacion: { tipo: 'consulta_general' },
    folderIds: [],
    accion: 'preguntar_consultas',
    mensajeConsultas: 'Hola, no he podido determinar con seguridad que responder ni que hacer con esta conversacion. Dime que debo responder o que actuacion debo seguir.',
    bruto: cleaned,
  };

  for (const line of lines) {
    if (line.startsWith('///')) {
      decision.plataforma = line.slice(3).trim() === 'email' ? 'email' : 'whatsapp';
      continue;
    }

    if (line.startsWith('/clasificar')) {
      const tipo = parseQuotedValue(line, 'tipo');
      const especialidadId = parseQuotedValue(line, 'especialidadId');
      if (tipo === 'consulta_general' || tipo === 'solicitud_servicio' || tipo === 'otro') {
        decision.clasificacion.tipo = tipo;
      }
      if (especialidadId && especialidadId !== 'null') {
        decision.clasificacion.especialidadId = especialidadId;
      }
      continue;
    }

    if (line.startsWith('/mover_a_carpeta')) {
      decision.folderIds = parseFolderIds(line);
      continue;
    }

    if (line.startsWith('/preguntar_asignacion')) {
      decision.accion = 'ask_assignment';
      const especialidadId = parseQuotedValue(line, 'especialidadId');
      if (especialidadId && especialidadId !== 'null') {
        decision.clasificacion.especialidadId = especialidadId;
      }
      continue;
    }

    if (line.startsWith('/asignar_caso')) {
      decision.accion = 'assign_case';
      const especialidadId = parseQuotedValue(line, 'especialidadId');
      const asignarA = parseQuotedValue(line, 'asignarA');
      if (especialidadId && especialidadId !== 'null') {
        decision.clasificacion.especialidadId = especialidadId;
      }
      if (asignarA) {
        decision.asignarA = asignarA;
      }
      continue;
    }

    if (line.startsWith('/preguntar_consultas')) {
      decision.accion = 'preguntar_consultas';
      decision.mensajeConsultas = parseQuotedValue(line, 'mensaje') || decision.mensajeConsultas;
      decision.mensajeCliente = undefined;
      continue;
    }

    if (line.startsWith('/pausar_auto_reply')) {
      decision.accion = 'pause_auto_reply';
      decision.motivoPausa = parseQuotedValue(line, 'motivo') || 'Pausa solicitada por la IA recepcionista';
      continue;
    }

    if (line.startsWith('/no_responder')) {
      decision.accion = 'no_responder';
      decision.mensajeCliente = undefined;
      continue;
    }

    if (line.startsWith('//')) {
      decision.mensajeCliente = line.slice(2).trim();
      if (decision.accion === 'preguntar_consultas') {
        decision.mensajeCliente = undefined;
      } else if (decision.accion === 'no_responder') {
        decision.mensajeCliente = undefined;
      } else if (decision.accion !== 'ask_assignment' && decision.accion !== 'assign_case' && decision.accion !== 'pause_auto_reply') {
        decision.accion = 'reply';
      }
    }
  }

  if (!decision.mensajeCliente && decision.accion === 'reply') {
    decision.accion = 'preguntar_consultas';
  }

  if (decision.accion === 'assign_case' && !decision.asignarA) {
    decision.accion = 'preguntar_consultas';
    decision.mensajeConsultas = 'Hola, he detectado que la conversacion deberia asignarse, pero no he podido determinar con seguridad a que cuenta asignarla. Dime que debo hacer.';
  }

  return decision;
}

export async function runCustomerAutomationEngine(
  input: AutomationEngineInput,
): Promise<AutomationEngineDecision> {
  const prompt = buildPrompt(input);
  const completion = await getClient().chat.completions.create({
    model: AI_AUTOMATION_MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1200,
    temperature: 0.2,
  });

  const rawOutput = completion.choices?.[0]?.message?.content || '';
  return parseAutomationDecision(rawOutput, input.canalEntrada);
}
