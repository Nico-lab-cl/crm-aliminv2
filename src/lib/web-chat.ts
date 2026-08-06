import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import prisma from "./prisma";
import { createNotification } from "./notifications";

/**
 * Chat web de aliminspa.cl
 *
 * El sitio público no habla con la base de datos: llama a los endpoints de
 * /api/public/web-chat con una API key de servidor a servidor. Las
 * conversaciones se guardan en las mismas tablas Conversation/Message que
 * Meta, con platform "web", para que aparezcan en esta bandeja y en el CRM
 * web sin ninguna sincronización de por medio.
 */

export const WEB_CHAT_PLATFORM = "web";
export const WEB_CHAT_SENDER = "visitor";

/** Las conversaciones web reusan el campo psid, que es único, con este prefijo. */
export function webChatPsid(sessionId: string) {
  return `web:${sessionId}`;
}

function equalsSecret(a: string, b: string) {
  // Se comparan los hashes para que la comparación no filtre el largo del secreto.
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest()
  );
}

/**
 * Valida la API key del sitio público.
 * Devuelve una respuesta de error si la llamada no está autorizada, o null si lo está.
 */
export function checkWebChatKey(req: Request): NextResponse | null {
  const expected = process.env.WEB_CHAT_API_KEY;

  if (!expected) {
    console.error("[web-chat] Falta la variable de entorno WEB_CHAT_API_KEY.");
    return NextResponse.json({ error: "Chat web no configurado" }, { status: 503 });
  }

  const provided = req.headers.get("x-crm-api-key");
  if (!provided || !equalsSecret(provided, expected)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  return null;
}

/**
 * Límite de frecuencia en memoria. Alcanza para un despliegue de una sola
 * instancia como el actual; si algún día se corre replicado hay que moverlo a
 * la base de datos o a Redis.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= max) return false;

  bucket.count += 1;
  return true;
}

// Se limpian los contadores vencidos de vez en cuando para que el Map no crezca sin fin.
setInterval(() => {
  const now = Date.now();
  buckets.forEach((bucket, key) => {
    if (now > bucket.resetAt) buckets.delete(key);
  });
}, 5 * 60 * 1000).unref?.();

/**
 * Avisa por push a los asesores de un mensaje entrante del chat web.
 *
 * Si el lead ya tiene un asesor asignado, el aviso va sólo a esa persona,
 * porque el cliente ya es suyo. Si no tiene dueño, se avisa a todos y el
 * primero que responda se lo queda: /api/messages/send ya hace esa asignación.
 */
export async function notifyAdvisorsOfWebChat({
  leadId,
  visitorName,
  text,
}: {
  leadId?: string | null;
  visitorName: string;
  text: string;
}) {
  try {
    const lead = leadId
      ? await prisma.lead.findUnique({
          where: { id: leadId },
          select: { assignedToId: true },
        })
      : null;

    const targets = lead?.assignedToId
      ? [{ id: lead.assignedToId }]
      : await prisma.user.findMany({ select: { id: true } });

    const body = text.length > 120 ? `${text.slice(0, 117)}...` : text;

    await Promise.allSettled(
      targets.map((user) =>
        createNotification({
          userId: user.id,
          title: `💬 ${visitorName} escribió desde la web`,
          body,
          type: "WEB_CHAT",
          leadId: leadId || undefined,
        })
      )
    );
  } catch (error) {
    // Un fallo de notificación nunca debe hacer que se pierda el mensaje.
    console.error("[web-chat] No se pudo notificar a los asesores:", error);
  }
}
