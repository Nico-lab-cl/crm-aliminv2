import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import axios from "axios";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

// TikTok Sync Engine v5.0.0
// Base URL for Business API: https://business-api.tiktok.com/open_api/v1.3/
// 1. DMs: /business/message/conversation/list/
// 2. Mesajes: /business/message/content/list/
// 3. Comentarios: /business/comment/list/

async function getTikTokToken() {
  return await (prisma as any).integrationToken.findUnique({
    where: { platform: "tiktok" }
  });
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions as any);
  if (!session || (session as any).user.role !== 'ADMIN') {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokenData = await getTikTokToken();
  if (!tokenData || !tokenData.accessToken) {
    return NextResponse.json({ error: "TikTok not connected. Please connect first." }, { status: 400 });
  }

  const accessToken = tokenData.accessToken;
  let summary = { dms: 0, comments: 0, videos_found: 0, errors: [] as string[] };

  // 1. Get business_id (open_id) from the standard API (v2/user/info)
  // This endpoint is reliable for getting the ID needed by Business API v1.3
  let businessId: string | null = null;
  try {
    const userInfoRes = await axios.get(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",
      { headers: { "Authorization": `Bearer ${accessToken}` } }
    );
    businessId = userInfoRes.data?.data?.user?.open_id;
    console.log("TikTok Business ID (open_id) retrieved:", businessId);
  } catch (userErr: any) {
    console.error("TikTok User Info Error:", userErr.response?.data || userErr.message);
    summary.errors.push("No se pudo obtener el ID de la cuenta");
    return NextResponse.json({ success: false, summary });
  }

  if (!businessId) {
    summary.errors.push("El ID de cuenta vino vacío");
    return NextResponse.json({ success: false, summary });
  }

  try {
    // A. SYNC DIRECT MESSAGES (DMs)
    console.log("TikTok: Sincronizando DMs desde v1.3...");
    try {
      // Correct endpoint for v1.3: /business/message/conversation/list/
      const convRes = await axios.get(
        "https://business-api.tiktok.com/open_api/v1.3/business/message/conversation/list/",
        {
          headers: { "Access-Token": accessToken },
          params: { business_id: businessId }
        }
      );
      
      const conversations = convRes.data?.data?.conversations || [];
      console.log(`TikTok: Se encontraron ${conversations.length} conversaciones.`);

      for (const conv of conversations) {
        const convId = conv.conversation_id;
        // Correct endpoint for v1.3: /business/message/content/list/
        const msgRes = await axios.get(
          "https://business-api.tiktok.com/open_api/v1.3/business/message/content/list/",
          {
            headers: { "Access-Token": accessToken },
            params: { 
                business_id: businessId,
                conversation_id: convId
            }
          }
        );

        const messages = msgRes.data?.data?.messages || [];
        for (const msg of messages) {
           const msgId = msg.message_id;
           // message_type: 1 = text, 2 = image, etc.
           const isFromUser = msg.sender_id !== businessId;
           
           const psid = `tiktok_dm_${convId}`;
           const userName = conv.participant?.nickname || conv.participant?.username || "Usuario TikTok";

           let localConv = await (prisma as any).conversation.findUnique({ where: { psid } });
           if (!localConv) {
             localConv = await (prisma as any).conversation.create({
               data: { psid, platform: "tiktok", metaName: userName }
             });
           }

           const existing = await (prisma as any).message.findFirst({ where: { sourceId: msgId } });
           if (!existing) {
             await (prisma as any).message.create({
               data: {
                 conversationId: localConv.id,
                 text: msg.content || (msg.message_type === 1 ? "" : "(Archivo adjunto)"),
                 senderType: isFromUser ? "meta" : "advisor",
                 sourceType: "DM",
                 sourceId: msgId,
                 createdAt: new Date(msg.create_time * 1000)
               }
             });
             summary.dms++;
           }
        }
      }
    } catch (dmErr: any) {
      const dmData = dmErr.response?.data;
      console.error("TikTok DM Error:", JSON.stringify(dmData || dmErr.message));
      summary.errors.push(`DMs: ${dmData?.message || "Error de acceso"}`);
    }

    // B. SYNC VIDEOS & COMMENTS
    console.log("TikTok: Sincronizando Comentarios...");
    let videos: any[] = [];
    try {
      const videoRes = await axios.post(
        `https://open.tiktokapis.com/v2/video/list/?fields=id,comment_count`,
        { max_count: 20 },
        {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      videos = videoRes.data?.data?.videos || [];
      summary.videos_found = videos.length;
    } catch (vErr) {}

    for (const video of videos) {
      if ((video.comment_count || 0) === 0) continue;
      
      try {
        // Correct endpoint for v1.3: /business/comment/list/
        const commRes = await axios.get(
          "https://business-api.tiktok.com/open_api/v1.3/business/comment/list/",
          {
            headers: { "Access-Token": accessToken },
            params: {
              business_id: businessId,
              video_id: video.id,
              max_count: 50
            }
          }
        );
        
        const comments = commRes.data?.data?.comments || [];
        for (const comm of comments) {
          const commentId = comm.comment_id || comm.id;
          const psid = `tiktok_comm_${commentId}`;
          const userName = comm.username || "Usuario TikTok";

          let localConv = await (prisma as any).conversation.findUnique({ where: { psid } });
          if (!localConv) {
            localConv = await (prisma as any).conversation.create({
              data: { psid, platform: "tiktok", metaName: userName }
            });
          }

          const existing = await (prisma as any).message.findFirst({ where: { sourceId: commentId } });
          if (!existing) {
            await (prisma as any).message.create({
              data: {
                conversationId: localConv.id,
                text: comm.text || "(Sin texto)",
                senderType: "meta",
                sourceType: "COMMENT",
                sourceId: commentId,
                postId: video.id,
                createdAt: new Date(comm.create_time * 1000)
              }
            });
            summary.comments++;
          }
        }
      } catch (cErr: any) {
        console.error(`TikTok Comment Error (${video.id}):`, cErr.response?.data || cErr.message);
      }
    }

    return NextResponse.json({ success: true, summary });

  } catch (globalErr: any) {
    return NextResponse.json({ error: globalErr.message }, { status: 500 });
  }
}
