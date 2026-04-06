import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const psid = searchParams.get("psid");
  const platform = searchParams.get("platform") || "facebook";
  const token = process.env.META_PAGE_ACCESS_TOKEN;

  if (!psid) {
    return NextResponse.json({ error: "Falta el parámetro 'psid'" }, { status: 1 });
  }

  if (!token) {
    return NextResponse.json({ error: "META_PAGE_ACCESS_TOKEN no está configurado en el servidor" }, { status: 1 });
  }

  try {
    const fields = platform === "facebook" ? "first_name,last_name,profile_pic" : "name,profile_pic";
    const url = `https://graph.facebook.com/v21.0/${psid}?fields=${fields}&access_token=${token}`;
    
    console.log("Debug Meta URL:", url.replace(token, "TOK_HIDDEN"));
    
    const res = await fetch(url);
    const data = await res.json();

    return NextResponse.json({
      status: res.status,
      token_configured: true,
      token_preview: token.substring(0, 10) + "...",
      platform,
      psid,
      meta_response: data
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
