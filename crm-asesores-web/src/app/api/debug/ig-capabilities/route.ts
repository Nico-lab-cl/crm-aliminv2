import { NextResponse } from "next/server";
import axios from "axios";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const META_PAGE_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
  if (!META_PAGE_TOKEN) {
    return NextResponse.json({ error: "No Meta Page Token found" }, { status: 500 });
  }

  try {
    const diag: any = {};

    // 1. Check Permissions
    try {
        const permRes = await axios.get(`https://graph.facebook.com/v21.0/me/permissions?access_token=${META_PAGE_TOKEN}`);
        diag.permissions = permRes.data.data;
    } catch (e: any) {
        diag.permissions_error = e.response?.data || e.message;
    }

    // 2. Check Token Info
    try {
        const debugRes = await axios.get(`https://graph.facebook.com/debug_token?input_token=${META_PAGE_TOKEN}&access_token=${META_PAGE_TOKEN}`);
        diag.token_info = debugRes.data.data;
    } catch (e: any) {
        diag.token_debug_error = "Could not debug token (Common for Page Tokens)";
    }

    // 3. Check Instagram Business Account & Capabilities
    try {
        const igRes = await axios.get(`https://graph.facebook.com/v21.0/me?fields=instagram_business_account,name,id&access_token=${META_PAGE_TOKEN}`);
        diag.page_info = igRes.data;
        
        const igId = igRes.data.instagram_business_account?.id;
        if (igId) {
            const capRes = await axios.get(`https://graph.facebook.com/v21.0/${igId}?fields=username,name,id,can_manage_messages&access_token=${META_PAGE_TOKEN}`);
            diag.ig_account = capRes.data;
        }
    } catch (e: any) {
        diag.ig_check_error = e.response?.data || e.message;
    }

    return NextResponse.json(diag);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
