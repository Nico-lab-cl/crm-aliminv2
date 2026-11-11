/**
 * Reporta al CRM web (módulo Agentes IA) cada llamada a Claude, para el
 * indicador de gasto. Nunca espera ni falla hacia afuera: si el CRM web no
 * está o faltan CRM_WEB_URL / IA_SECRET, solo se anota en la consola.
 */
export interface UsoClaude {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function reportarUsoIA(d: {
  agente: string;
  canal: string;
  conversacionId?: string | null;
  modelo: string;
  usage?: UsoClaude | null;
}) {
  const url = process.env.CRM_WEB_URL?.replace(/\/+$/, "");
  const secreto = process.env.IA_SECRET;
  if (!url || !secreto || !d.usage) return;
  fetch(`${url}/api/webhooks/ia/uso`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ia-secret": secreto },
    body: JSON.stringify({
      agente: d.agente,
      canal: d.canal,
      conversacion_id: d.conversacionId || null,
      modelo: d.modelo,
      input_tokens: d.usage.input_tokens ?? 0,
      output_tokens: d.usage.output_tokens ?? 0,
      cache_read_input_tokens: d.usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: d.usage.cache_creation_input_tokens ?? 0,
    }),
    signal: AbortSignal.timeout(5000),
  })
    .then((r) => {
      if (!r.ok) console.error(`[uso-ia] El CRM web respondió ${r.status} al registrar el uso.`);
    })
    .catch((error) => console.error("[uso-ia] No se pudo registrar el uso:", error?.message || error));
}
