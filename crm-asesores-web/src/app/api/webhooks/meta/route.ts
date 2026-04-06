import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Configuración de Meta Webhook (Configura estas en tu .env)
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

/**
 * GET: Verificación del Webhook por parte de Meta
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook Meta verificado correctamente ✅");
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

/**
 * POST: Recepción de mensajes en tiempo real
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.object === "page" || body.object === "instagram") {
      for (const entry of body.entry) {
        // --- 1. PROCESAR MENSAJES DIRECTOS (Messenger / IG DM) ---
        if (entry.messaging) {
          for (const webhookEvent of entry.messaging) {
            const isEcho = webhookEvent.message?.is_echo;
            const psid = isEcho ? webhookEvent.recipient.id : webhookEvent.sender.id;
            const senderType = isEcho ? "advisor" : "meta";
            // Si el objeto es 'instagram' o el ID de entrada coincide con Instagram
            const platform = body.object === "instagram" ? "instagram" : "facebook";
            
            if (webhookEvent.message && webhookEvent.message.text) {
              console.log(`[DIRECT] Full PSID from ${platform}: ${psid}, type: ${senderType}`);
              await handleIncomingMessage(psid, webhookEvent.message.text, platform, "DIRECT", webhookEvent.message.mid, undefined, undefined, undefined, senderType as "meta" | "advisor");
            }
          }
        }

        // --- 2. PROCESAR COMENTARIOS (Feed FB / IG Comments) ---
        if (entry.changes) {
          for (const change of entry.changes) {
            // Comentarios de Facebook
            if (change.field === "feed" && change.value.item === "comment" && change.value.verb === "add") {
              const psid = change.value.from?.id;
              const text = change.value.message || "";
              const platform = "facebook";
              const commentId = change.value.comment_id;
              const postId = change.value.post_id;
              const parentId = change.value.parent_id;
              const providedName = change.value.from?.name; // <--- Meta suele enviar el nombre en el Feed de FB!
              
              if (!psid) continue;

              const isPageReply = psid === entry.id;
              const postContent = await fetchPostContent(postId, "facebook");

              if (isPageReply) {
                if (parentId) {
                  const parentMsg = await (prisma as any).message.findFirst({ where: { sourceId: parentId } });
                  if (parentMsg) {
                    await handleIncomingMessage(psid, text, platform, "COMMENT", commentId, postId, postContent, undefined, "advisor", parentMsg.conversationId);
                  }
                }
              } else {
                console.log(`[COMMENT] FB Post ID: ${postId}, Full PSID: ${psid}, Provided Name: ${providedName}`);
                await handleIncomingMessage(psid, text, platform, "COMMENT", commentId, postId, postContent, providedName, "meta");
              }
            }
            
            // Comentarios de Instagram
            if (change.field === "comments") {
              const psid = change.value.from?.id;
              const text = change.value.text || "";
              const platform = "instagram";
              const commentId = change.value.id;
              const parentId = change.value.parent_id;
              const mediaId = change.value.media?.id;
              const providedName = change.value.from?.username; // En IG suele venir el username
              
              if (!psid) continue;

              const isPageReply = psid === entry.id;
              const postContent = await fetchPostContent(mediaId, "instagram");

              if (isPageReply) {
                if (parentId) {
                  const parentMsg = await (prisma as any).message.findFirst({ where: { sourceId: parentId } });
                  if (parentMsg) {
                    await handleIncomingMessage(psid, text, platform, "COMMENT", commentId, mediaId, postContent, undefined, "advisor", parentMsg.conversationId);
                  }
                }
              } else {
                console.log(`[COMMENT] IG Media ID: ${mediaId}, Full PSID: ${psid}, Provided Name: ${providedName}`);
                await handleIncomingMessage(psid, text, platform, "COMMENT", commentId, mediaId, postContent, providedName, "meta");
              }
            }
          }
        }
      }
      return new Response("EVENT_RECEIVED", { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
  } catch (error) {
    console.error("Error en Webhook Meta:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

async function fetchMetaProfile(psid: string, platform: string) {
  try {
    const fields = platform === "facebook" ? "first_name,last_name,profile_pic" : "name,profile_pic";
    const res = await fetch(`https://graph.facebook.com/v21.0/${psid}?fields=${fields}&access_token=${process.env.META_PAGE_ACCESS_TOKEN}`);
    const data = await res.json();
    
    if (data.error) {
      console.error("Meta API error detail:", JSON.stringify(data.error, null, 2));
      return null;
    }

    return {
      name: platform === "facebook" ? `${data.first_name || ""} ${data.last_name || ""}`.trim() : data.name,
      image: data.profile_pic
    };
  } catch (error) {
    console.error("Error fetching Meta profile:", error);
    return null;
  }
}

async function fetchPostContent(id: string, platform: string) {
  if (!id) return null;
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  try {
    const fields = platform === "facebook" ? "message,full_picture" : "caption,media_url";
    const res = await fetch(`https://graph.facebook.com/v21.0/${id}?fields=${fields}&access_token=${token}`);
    const data = await res.json();
    
    if (data.error) return null;

    return JSON.stringify({
      text: platform === "facebook" ? data.message : data.caption,
      image: platform === "facebook" ? data.full_picture : data.media_url
    });
  } catch (error) {
    return null;
  }
}

async function handleIncomingMessage(
  psid: string, 
  text: string, 
  platform: string, 
  sourceType: string, 
  sourceId: string, 
  postId?: string, 
  postContent?: string | null, 
  providedName?: string,
  senderType: "meta" | "advisor" = "meta",
  overrideConversationId?: string
) {
  let conversationId = overrideConversationId;

  // 1. Buscar o crear la conversación por PSID
  if (!conversationId) {
    let conversation = await (prisma as any).conversation.findUnique({
      where: { psid }
    });

    if (!conversation) {
      console.log(`Buscando perfil para PSID nuevo: ${psid} (Nombre proveído: ${providedName || "Ninguno"})`);
      let metaName = providedName;
      let metaImage = null;

      // Si no tenemos nombre, intentamos traerlo de la API
      if (!metaName) {
        const profile = await fetchMetaProfile(psid, platform);
        if (profile) {
          metaName = profile.name;
          metaImage = profile.image;
        }
      }

      conversation = await (prisma as any).conversation.create({
        data: {
          psid,
          platform,
          metaName: metaName || null,
          metaImage: metaImage || null,
        }
      });
    } else if (!conversation.metaName) {
      // Si ya existe pero le falta el nombre, intentamos actualizarlo
      console.log(`Actualizando perfil para PSID existente: ${psid}`);
      let metaName = providedName;
      let metaImage = null;

      if (!metaName) {
        const profile = await fetchMetaProfile(psid, platform);
        if (profile) {
          metaName = profile.name;
          metaImage = profile.image;
        }
      }

      if (metaName) {
        conversation = await (prisma as any).conversation.update({
          where: { id: conversation.id },
          data: { metaName, metaImage: metaImage || conversation.metaImage }
        });
      }
    }
    conversationId = conversation.id;
  }

  // 2. Guardar el mensaje/comentario
  await (prisma as any).message.create({
    data: {
      conversationId: conversationId,
      text: text || "", // Fallback extra
      senderType: senderType,
      sourceType,
      sourceId,
      postId,
      postContent,
    }
  });

  // 3. Actualizar el timestamp de la conversación para que suba en la lista
  await (prisma as any).conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() }
  });

  console.log(`[${sourceType}] Guardado Mje (Type: ${senderType}): ${text}`);
}
