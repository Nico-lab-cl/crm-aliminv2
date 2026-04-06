import { NextResponse } from "next/server";
import axios from "axios";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const nextAuthUrl = process.env.NEXTAUTH_URL?.replace(/['"]+/g, '').trim();

  if (error || !code) {
    console.error("TikTok Auth Denied:", { error, errorDescription });
    return NextResponse.redirect(
      `${nextAuthUrl}/inbox?tiktok_error=${encodeURIComponent(error || 'no_code')}`
    );
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY?.replace(/['"]+/g, '').trim();
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.replace(/['"]+/g, '').trim();
  const redirectUri = `${nextAuthUrl}/api/auth/tiktok/callback`;

  try {
    // Exchange authorization code for access token (v2 endpoint)
    const res = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token/",
      new URLSearchParams({
        client_key: clientKey!,
        client_secret: clientSecret!,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache",
        },
      }
    );

    const data = res.data;
    console.log("TikTok Token Response (Full):", JSON.stringify(data, null, 2));

    const accessToken = data.access_token;
    const refreshToken = data.refresh_token;
    const expiresIn = data.expires_in || 86400;
    const openId = data.open_id;
    const scope = data.scope;

    console.log("TikTok Auth Identifiers:", { openId, scope, expiresIn });

    if (accessToken) {
      // Store token in database
      await (prisma as any).integrationToken.upsert({
        where: { platform: "tiktok" },
        update: {
          accessToken: accessToken,
          refreshToken: refreshToken || null,
          expiresAt: new Date(Date.now() + expiresIn * 1000),
        },
        create: {
          platform: "tiktok",
          accessToken: accessToken,
          refreshToken: refreshToken || null,
          expiresAt: new Date(Date.now() + expiresIn * 1000),
        },
      });

      console.log("TikTok connected successfully!", {
        openId,
        scope,
        expiresIn,
      });

      return NextResponse.redirect(`${nextAuthUrl}/inbox?tiktok_success=true`);
    } else {
      console.error("TikTok Auth Error - No access_token in response:", data);
      return NextResponse.redirect(
        `${nextAuthUrl}/inbox?tiktok_error=token_failed`
      );
    }
  } catch (err: any) {
    const errorData = err.response?.data;
    const errorStatus = err.response?.status;
    console.error("TikTok Callback Error:", {
      status: errorStatus,
      data: errorData,
      message: err.message,
    });
    return NextResponse.redirect(`${nextAuthUrl}/inbox?tiktok_error=fatal`);
  }
}

// Handle TikTok Webhook Events (POST requests)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("TikTok Webhook Event Received:", JSON.stringify(body, null, 2));

    // Return 200 OK to acknowledge receipt (TikTok requires this)
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    // If body isn't JSON, still return 200 (domain verification pings)
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
