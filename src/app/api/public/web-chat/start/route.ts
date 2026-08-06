import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  WEB_CHAT_PLATFORM,
  checkWebChatKey,
  rateLimit,
  webChatPsid,
} from "@/lib/web-chat";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconocida";
}

/**
 * Abre (o recupera) la conversación del chat web de aliminspa.cl.
 *
 * El visitante ya entregó nombre, teléfono y correo en la puerta de entrada,
 * así que aquí se crea el lead en el CRM antes del primer mensaje. Si el correo
 * ya existe, la conversación se engancha al lead que ya está en la base en vez
 * de duplicar el contacto.
 */
export async function POST(req: Request) {
  const unauthorized = checkWebChatKey(req);
  if (unauthorized) return unauthorized;

  if (!rateLimit(`start:${clientIp(req)}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Demasiadas conversaciones nuevas desde esta conexión." },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const sessionId = String(body.sessionId || "").trim();
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim().toLowerCase();

  if (!sessionId || sessionId.length < 16 || sessionId.length > 128) {
    return NextResponse.json({ error: "Sesión inválida" }, { status: 400 });
  }
  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
  }
  if (phone.replace(/\D/g, "").length < 8 || phone.length > 25) {
    return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email) || email.length > 120) {
    return NextResponse.json({ error: "Correo inválido" }, { status: 400 });
  }

  const [firstName, ...rest] = name.split(/\s+/);
  const lastName = rest.join(" ") || null;

  try {
    const psid = webChatPsid(sessionId);

    // Si el visitante recarga la página o vuelve más tarde con la misma sesión,
    // se continúa la conversación que ya existe en lugar de abrir otra.
    const existing = await prisma.conversation.findUnique({
      where: { psid },
      select: { id: true, leadId: true },
    });

    if (existing) {
      return NextResponse.json({
        conversationId: existing.id,
        reanudada: true,
      });
    }

    // El correo es único en Lead: si el contacto ya existe se actualiza sin
    // tocar al asesor asignado ni el estado comercial que ya tenga.
    const lead = await prisma.lead.upsert({
      where: { email },
      create: {
        firstName,
        lastName,
        email,
        phone,
        source: "Chat web aliminspa.cl",
        status: "NUEVO",
        preferredChannel: "Chat web",
        utmSource: body.utm_source || null,
        utmMedium: body.utm_medium || null,
        utmCampaign: body.utm_campaign || null,
        utmContent: body.utm_content || null,
        utmTerm: body.utm_term || null,
      },
      update: {
        firstName,
        lastName,
        phone,
        preferredChannel: "Chat web",
        lastActivity: "Abrió el chat web",
      },
    });

    const conversation = await prisma.conversation.create({
      data: {
        psid,
        platform: WEB_CHAT_PLATFORM,
        metaName: name,
        leadId: lead.id,
        visitorLastSeenAt: new Date(),
      },
      select: { id: true },
    });

    return NextResponse.json({ conversationId: conversation.id, reanudada: false });
  } catch (error) {
    console.error("[web-chat/start] Error abriendo conversación:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
