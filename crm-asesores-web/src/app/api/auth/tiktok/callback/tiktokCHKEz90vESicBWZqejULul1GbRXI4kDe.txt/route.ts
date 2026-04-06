import { NextResponse } from "next/server";

export async function GET() {
  return new Response("tiktok-developers-site-verification=CHKEz90vESicBWZqejULul1GbRXI4kDe", {
    headers: { "Content-Type": "text/plain" },
  });
}
