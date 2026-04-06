import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions as any);
  if (!session || (session as any).user.role !== 'ADMIN') {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY?.replace(/['"]+/g, '').trim();
  const nextAuthUrl = process.env.NEXTAUTH_URL?.replace(/['"]+/g, '').trim();
  const redirectUri = `${nextAuthUrl}/api/auth/tiktok/callback`;
  
  // Scopes fixed for TikTok v2 Authorization: 
  // 1. MUST use SPACE separator instead of commas.
  // 2. Only include approved/essential scopes for DMs and Comments.
  const scopes = [
    "user.info.basic",
    "user.info.profile",
    "video.list",
    "comment.list",
    "comment.list.manage",
    "business.messaging"
  ].join(" "); // Critical: space separator for v2 API

  const state = Math.random().toString(36).substring(7);

  // Note: encodeURIComponent will turn spaces into %20
  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&scope=${encodeURIComponent(scopes)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  console.log("TikTok Auth URL (Fixed v2):", authUrl);
  return NextResponse.redirect(authUrl);
}
