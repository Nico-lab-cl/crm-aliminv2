import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { WEB_CHAT_PLATFORM } from "@/lib/web-chat";
import { marcarContactado } from "@/lib/followups";
import { asignarAlQueResponde, puedeVerConversacion } from "@/lib/ali";
import { ErrorWhatsapp, WA_PLATFORM, enviarTextoWhatsapp, motivoRechazoWhatsapp, numeroDePsid, waIdDePsid } from "@/lib/whatsapp";
import { pausarSiCorresponde } from "@/lib/pausaAli";

/**
 * Explica en palabras del asesor por qué Meta no dejó enviar el mensaje y qué
 * hacer en cambio. El texto sale tal cual en la pantalla del chat.
 *
 * Códigos de la Graph API: 10/2018278 y 2534022 son la ventana de 24 h de
 * Messenger e Instagram; 551 y 100/2018001 son una persona que ya no recibe
 * mensajes de la página (cerró la cuenta, bloqueó o borró el chat).
 */
function motivoDelRechazoDeMeta(error: any, plataforma: string) {
  const red = plataforma === "instagram" ? "Instagram" : "Facebook";
  const code = Number(error?.code);
  const subcode = Number(error?.error_subcode);
  const mensaje = String(error?.message || "").toLowerCase();

  if (subcode === 2018278 || subcode === 2534022 || mensaje.includes("outside of allowed window")) {
    return (
      `${red} solo deja responder hasta 24 horas después del último mensaje del cliente, ` +
      `y ese plazo ya pasó. Llámalo o escríbele por WhatsApp desde su ficha; ` +
      `si vuelve a escribir por ${red}, se le puede responder de nuevo desde acá.`
    );
  }
  if (code === 551 || subcode === 2018001) {
    return (
      `Esta persona ya no recibe mensajes de la página en ${red} ` +
      `(puede haber bloqueado la cuenta o borrado el chat). Contáctalo por teléfono o WhatsApp desde su ficha.`
    );
  }
  if (code === 190 || code === 200 || code === 10) {
    return `${red} rechazó el envío por un permiso de la página. Avísale a Nicolás; mientras tanto contacta al cliente por teléfono o WhatsApp.`;
  }
  if (code === 4 || code === 613 || code === 32) {
    return `${red} está recibiendo demasiados mensajes de la página. Espera un par de minutos y vuelve a intentar.`;
  }
  return `${red} no aceptó el mensaje. Intenta de nuevo en un rato; si sigue fallando, contacta al cliente por teléfono o WhatsApp.`;
}

export async function POST(req: Request) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId, text, sourceType, sourceId } = await req.json();
  const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;

  try {
    // 1. Obtener la conversación y el PSID
    const conversation = await (prisma as any).conversation.findUnique({
      where: { id: conversationId },
      include: { lead: true }
    });

    // Solo se responde lo que se puede ver en la bandeja: un asesor no le
    // escribe a un chat asignado a otro (ver filtroBandeja en lib/ali.ts).
    if (!conversation || !(await puedeVerConversacion(conversation.id, session.user))) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // 2. Enviar respuesta por Meta (Messenger o Comentario)
    //    El chat web no pasa por Meta: el mensaje sólo se guarda y el widget de
    //    aliminspa.cl lo recoge en su siguiente consulta.
    const esChatWeb = conversation.platform === WEB_CHAT_PLATFORM;

    // WhatsApp (número de Ali, Cloud API): el asesor responde por el mismo número.
    let idWhatsapp: string | null = null;
    if (conversation.platform === WA_PLATFORM) {
      try {
        idWhatsapp = await enviarTextoWhatsapp(waIdDePsid(conversation.psid), text, numeroDePsid(conversation.psid));
      } catch (error) {
        const detalle = error instanceof ErrorWhatsapp ? error.detalle : null;
        console.error("Error de WhatsApp:", error);
        return NextResponse.json(
          { error: "Failed to send message via WhatsApp", motivo: motivoRechazoWhatsapp(detalle), details: detalle },
          { status: 502 }
        );
      }
    }

    let metaResponse;
    if (esChatWeb || conversation.platform === WA_PLATFORM) {
      // Sin transporte externo que llamar.
    } else if (sourceType === "DIRECT") {
      // API de Messenger
      const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
      metaResponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: conversation.psid },
          message: { text }
        })
      });
    } else if (sourceType === "COMMENT") {
      // Responder a un comentario específico
      if (!sourceId) return NextResponse.json({ error: "sourceId required for comments" }, { status: 400 });
      const url = `https://graph.facebook.com/v21.0/${sourceId}/comments?access_token=${PAGE_ACCESS_TOKEN}`;
      metaResponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
      });
    }

    let metaId: string | null = idWhatsapp;
    if (!esChatWeb && conversation.platform !== WA_PLATFORM) {
      const metaData = await metaResponse?.json();
      // Con el id de Meta guardado, el eco que devuelve el webhook se reconoce
      // como repetido y no aparece dos veces en la bandeja.
      metaId = metaData?.message_id || metaData?.id || null;
      if (!metaResponse?.ok) {
        console.error("Error de Meta API:", metaData);
        return NextResponse.json(
          {
            error: "Failed to send message via Meta",
            motivo: motivoDelRechazoDeMeta(metaData?.error, conversation.platform),
            details: metaData,
          },
          { status: 502 }
        );
      }
    }

    // 3. AUTO-ASIGNACIÓN: Si el Lead no tiene asesor, asignarlo al actual
    const senderId = (session.user as any).id;
    //    Si ya tiene asesor, sigue siendo suyo (ver lib/ali.ts).
    await asignarAlQueResponde(conversation, senderId);

    // 4. Guardar el mensaje del asesor en la base de datos
    const newMessage = await (prisma as any).message.create({
      data: {
        conversationId: conversation.id,
        text,
        senderId: (session.user as any).id,
        senderType: "advisor",
        sourceType,
        sourceId: metaId,
      }
    });

    // 5. Responderle al cliente es atenderlo: se apagan los recordatorios de
    //    seguimiento sin que el asesor tenga que acordarse del interruptor de
    //    la ficha. Es lo que hace que la marca de contactado sirva en la
    //    práctica: nadie toca un interruptor después de contestar.
    await marcarContactado(conversation.leadId, senderId);

    // En los chats de WhatsApp con "pausa hasta reactivar" (lib/pausaAli.ts),
    // responder una persona deja a Ali en pausa hasta que la reactiven.
    if (conversation.platform === WA_PLATFORM) {
      await pausarSiCorresponde(conversation.id, (session.user as any).name || "Un asesor", "respondió una persona");
    }

    // 6. Mover la conversación al tope de la bandeja: crear el mensaje por sí
    //    solo no toca updatedAt, que es el campo por el que se ordena.
    if (esChatWeb) {
      await (prisma as any).conversation.update({
        where: { id: conversation.id },
        data: { visitorNotifiedAt: null },
      });
    }

    return NextResponse.json(newMessage);
  } catch (error) {
    console.error("Error in messaging/send:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
