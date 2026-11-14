/**
 * Avisos a la Oficina IA (Miniverse en EasyPanel, repo oficina-ia-alimin)
 * para los traspasos que pasan en el CRM móvil: un lead que pasa a un
 * asesor, una visita marcada, un aviso de lead calificado. Nunca datos de
 * clientes: solo la acción. Sin OFICINA_IA_URL no hace nada.
 */

type Agente = "ali" | "calificador" | "cierre";
const NOMBRE: Record<Agente, string> = { ali: "Ali", calificador: "Calificador", cierre: "Cierre" };

function enviar(ruta: string, cuerpo: unknown) {
  const base = process.env.OFICINA_IA_URL?.replace(/\/+$/, "");
  const secreto = process.env.IA_SECRET;
  if (!base || !secreto) return;
  fetch(`${base}${ruta}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ia-secret": secreto },
    body: JSON.stringify(cuerpo),
    cache: "no-store",
    signal: AbortSignal.timeout(2000),
  }).catch(() => {});
}

/** El agente dice algo en la oficina y, unos segundos después, queda disponible. */
export function oficinaDice(agente: Agente, mensaje: string) {
  enviar("/api/act", { agent: agente, action: { type: "speak", message: mensaje.slice(0, 80) } });
  setTimeout(() => enviar("/api/heartbeat", { agent: agente, name: NOMBRE[agente], state: "idle", task: null }), 6000);
}
