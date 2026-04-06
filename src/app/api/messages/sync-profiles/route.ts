import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import axios from "axios";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const META_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
  if (!META_TOKEN) {
    return NextResponse.json({ error: "META_PAGE_ACCESS_TOKEN is missing" }, { status: 500 });
  }

  const results: any[] = [];
  try {
    const conversations = await (prisma as any).conversation.findMany({
      where: {
        metaName: null,
        psid: { not: "" }
      }
    });

    for (const conv of conversations) {
      try {
        const fields = "name,username,first_name,last_name,profile_pic";
        const url = `https://graph.facebook.com/v21.0/${conv.psid}?fields=${fields}&access_token=${META_TOKEN}`;
        
        const res = await axios.get(url);
        const data = res.data;

        const name = data.name || data.username || (data.first_name ? `${data.first_name} ${data.last_name}` : null);
        const image = data.profile_pic || data.profile_picture?.data?.url || null;

        if (name) {
          await (prisma as any).conversation.update({
            where: { id: conv.id },
            data: { metaName: name, metaImage: image }
          });
          results.push({ psid: conv.psid, status: "success", name });
        } else {
          results.push({ psid: conv.psid, status: "no_data", detail: "Meta returned no name fields" });
        }
      } catch (error: any) {
        const detail = error.response?.data?.error?.message || error.message;
        results.push({ psid: conv.psid, status: "error", detail });
      }
    }

    return NextResponse.json({ 
      processed: conversations.length,
      updated: results.filter(r => r.status === "success").length,
      details: results 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
