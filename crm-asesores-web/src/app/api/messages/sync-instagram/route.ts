import { NextResponse } from "next/server";
// Sync Engine v1.0.6 - SUPER SYNC (DMs + Comments + Images)
import prisma from "@/lib/prisma";
import axios from "axios";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

async function fetchConversations(token: string, igId?: string) {
    // Traemos también attachments{media_url} para las imágenes
    const url = token.startsWith('IGAAV') 
        ? `https://graph.instagram.com/v21.0/me/conversations?fields=id,updated_time,participants,messages.limit(1){message,from,created_time,attachments{media_url,file_name}}&access_token=${token}`
        : `https://graph.facebook.com/v21.0/${igId}/conversations?platform=instagram&fields=id,updated_time,participants,messages.limit(1){message,from,created_time,attachments{media_url,file_name}}&access_token=${token}`;
    
    return await axios.get(url);
}

export async function GET(req: Request) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const PRIMARY_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
  const MASTER_KEY_TOKEN = process.env.META_INSTAGRAM_ACCESS_TOKEN;

  try {
    let igAccountId = null;
    let fallbackUsed = false;

    // 1. Obtener ID de la cuenta para filtrar nombres propios
    if (PRIMARY_TOKEN) {
        try {
            const pageRes = await axios.get(`https://graph.facebook.com/v21.0/me?fields=instagram_business_account,id&access_token=${PRIMARY_TOKEN}`);
            igAccountId = pageRes.data.instagram_business_account?.id;
        } catch (err) { console.log("Sync IG: Account check failed."); }
    }

    let conversations: any[] = [];
    let methodUsed = "Ninguno";

    // 2. DESCARGAR DMs (Mensajes Directos)
    try {
        if (igAccountId && PRIMARY_TOKEN) {
            try {
                const res = await fetchConversations(PRIMARY_TOKEN, igAccountId);
                conversations = res.data.data || [];
                methodUsed = "Token Primario";
            } catch (err: any) {
                if (err.response?.data?.error?.code === 3 && MASTER_KEY_TOKEN) {
                    const res = await fetchConversations(MASTER_KEY_TOKEN);
                    conversations = res.data.data || [];
                    methodUsed = "Master Key (IGAAV)";
                    fallbackUsed = true;
                } else throw err;
            }
        } else if (MASTER_KEY_TOKEN) {
            const res = await fetchConversations(MASTER_KEY_TOKEN);
            conversations = res.data.data || [];
            methodUsed = "Master Key (IGAAV)";
            fallbackUsed = true;
        }

        // Procesar DMs
        for (const remoteConv of conversations) {
            // FILTRAR NOMBRE: Buscar participante que NO sea la propia cuenta
            const realParticipant = remoteConv.participants?.data?.find((p: any) => p.id !== igAccountId) 
                                 || remoteConv.participants?.data?.[0];
            
            const psid = remoteConv.id;
            if (!psid) continue;

            let conversation = await (prisma as any).conversation.findUnique({ where: { psid } });
            if (!conversation) {
                conversation = await (prisma as any).conversation.create({
                    data: { 
                        psid, 
                        platform: "instagram", 
                        metaName: realParticipant?.username || realParticipant?.name || "Instagram User" 
                    }
                });
            }

            const lastMsg = remoteConv.messages?.data?.[0];
            if (lastMsg) {
                const existingMsg = await (prisma as any).message.findFirst({ where: { sourceId: lastMsg.id } });
                if (!existingMsg) {
                    // Extraer media_url si existe
                    const mediaUrl = lastMsg.attachments?.data?.[0]?.media_url || null;

                    await (prisma as any).message.create({
                        data: {
                            conversationId: conversation.id,
                            text: lastMsg.message || (mediaUrl ? "(Imagen)" : "(Adjunto)"),
                            mediaUrl: mediaUrl,
                            senderType: lastMsg.from?.id === igAccountId ? "advisor" : "meta",
                            sourceType: "DIRECT",
                            sourceId: lastMsg.id,
                            createdAt: new Date(lastMsg.created_time),
                        }
                    });
                    await (prisma as any).conversation.update({
                        where: { id: conversation.id },
                        data: { updatedAt: new Date(lastMsg.created_time), metaName: realParticipant?.username || realParticipant?.name }
                    });
                }
            }
        }
    } catch (err) { console.error("Error en DMs:", err); }

    // 3. DESCARGAR COMENTARIOS (Plan C - Feedback del usuario)
    let importedComments = 0;
    if (igAccountId && (PRIMARY_TOKEN || MASTER_KEY_TOKEN)) {
        try {
            const token = MASTER_KEY_TOKEN || PRIMARY_TOKEN;
            // Obtener últimos 5 posts
            const mediaRes = await axios.get(`https://graph.facebook.com/v21.0/${igAccountId}/media?limit=5&access_token=${token}`);
            const posts = mediaRes.data.data || [];

            for (const post of posts) {
                const commentsRes = await axios.get(`https://graph.facebook.com/v21.0/${post.id}/comments?fields=id,text,from,timestamp&access_token=${token}`);
                const comments = commentsRes.data.data || [];

                for (const comment of comments) {
                    // Cada comentario es como una conversación de "tipo comentario"
                    const psid = `comment_${comment.id}`;
                    let conversation = await (prisma as any).conversation.findUnique({ where: { psid } });
                    if (!conversation) {
                        conversation = await (prisma as any).conversation.create({
                            data: { 
                                psid, 
                                platform: "instagram", 
                                metaName: comment.from?.username || "Usuario de IG" 
                            }
                        });
                        importedComments++;
                    }

                    const existingMsg = await (prisma as any).message.findFirst({ where: { sourceId: comment.id } });
                    if (!existingMsg) {
                        await (prisma as any).message.create({
                            data: {
                                conversationId: conversation.id,
                                text: comment.text || "",
                                senderType: "meta",
                                sourceType: "COMMENT",
                                sourceId: comment.id,
                                postId: post.id,
                                createdAt: new Date(comment.timestamp),
                            }
                        });
                        await (prisma as any).conversation.update({
                            where: { id: conversation.id },
                            data: { updatedAt: new Date(comment.timestamp) }
                        });
                    }
                }
            }
        } catch (err) { console.error("Error en Comentarios:", err); }
    }

    return NextResponse.json({ 
        success: true, 
        processedDMs: conversations.length,
        processedComments: importedComments,
        method: methodUsed
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
