/**
 * Etapas del pipeline comercial y listas de opciones.
 *
 * Archivo sin dependencias de servidor: lo usan las rutas y las pantallas.
 * "Lead".status lo comparten los dos CRM y el portal de pagos, y se guarda
 * siempre en MAYÚSCULAS (ver lib/lead_status.ts en crm-alimin-web).
 */

export const ETAPAS = [
  { id: "NUEVO", nombre: "Nuevo", color: "bg-blue-500", pill: "bg-blue-50 text-blue-700" },
  { id: "CONTACTADO", nombre: "Contactado", color: "bg-orange-500", pill: "bg-orange-50 text-orange-700" },
  { id: "VISITA", nombre: "Visita", color: "bg-green-500", pill: "bg-green-50 text-green-700" },
  { id: "RESERVADO", nombre: "Reservado", color: "bg-emerald-600", pill: "bg-emerald-50 text-emerald-700" },
  { id: "PERDIDO", nombre: "Perdido", color: "bg-slate-500", pill: "bg-slate-100 text-slate-600" },
] as const;

export type EtapaId = (typeof ETAPAS)[number]["id"];

/**
 * Estados que escribe el portal de pagos (syncReservationLeads). En el
 * pipeline se muestran dentro de "Reservado" y el asesor no puede moverlos:
 * la sincronización los reescribiría en la siguiente pasada.
 */
export const ESTADOS_CLIENTE = ["RESERVA_POR_FIRMAR", "RESERVA_PAGADA", "PIE_POR_PAGAR", "PAGO_CUOTAS", "VENTA_CERRADA"];

/** Etapas donde el lead ya no necesita próxima acción. */
export const ETAPAS_CERRADAS = ["RESERVADO", "PERDIDO", ...ESTADOS_CLIENTE];

export const ETAPAS_YA_CONTACTADO = ["CONTACTADO", "VISITA", "RESERVADO", ...ESTADOS_CLIENTE];

export const canonico = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim().toUpperCase() : "NUEVO");

/** Columna del pipeline a la que pertenece un estado. */
export function columnaDe(status: unknown): EtapaId {
  const s = canonico(status);
  if (ESTADOS_CLIENTE.includes(s)) return "RESERVADO";
  return (ETAPAS.find((e) => e.id === s)?.id ?? "NUEVO") as EtapaId;
}

export function nombreEstado(status: unknown): string {
  const s = canonico(status);
  const e = ETAPAS.find((x) => x.id === s);
  if (e) return e.nombre;
  return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
}

/** El tablero no permite fechas anteriores a esta: antes no hay leads propios que mirar. */
export const FECHA_MINIMA = "2026-05-01";

export const hoyEnChile = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

export const MOTIVOS_PERDIDA = [
  "No califica / sin presupuesto",
  "Compró en otro lugar",
  "No contesta",
  "No le interesa",
  "Lo deja para más adelante",
  "Datos falsos o equivocados",
  "Otro",
];

export const TIPOS_SEGUIMIENTO = [
  { id: "LLAMADA", nombre: "Llamada" },
  { id: "WHATSAPP", nombre: "WhatsApp" },
  { id: "CORREO", nombre: "Correo" },
  { id: "VISITA", nombre: "Visita" },
  { id: "REUNION", nombre: "Reunión" },
  { id: "NOTA", nombre: "Nota" },
] as const;

export const RESULTADOS = [
  "Contestó",
  "No contestó",
  "Interesado",
  "Pidió más información",
  "Agendó visita",
  "Lo va a pensar",
  "No le interesa",
];

export const PROXIMAS_ACCIONES = [
  "Llamar",
  "Enviar WhatsApp",
  "Enviar información",
  "Confirmar visita",
  "Seguimiento post visita",
  "Cerrar reserva",
];

/** Nombre legible del origen de un cambio de etapa. */
export const ORIGENES: Record<string, string> = {
  ASESOR: "Asesor",
  CRM_WEB: "CRM web",
  VISITA_WEB: "Visita agendada en la web",
  PORTAL_PAGOS: "Portal de pagos",
  INGRESO: "Ingreso del lead",
  SISTEMA: "Automático",
  RECONSTRUIDO: "Registro anterior",
};
