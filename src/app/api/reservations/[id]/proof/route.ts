import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/reservations/[id]/proof
 * Returns the proof file (comprobante) for a reservation
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions as any);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const reservation = await (prisma as any).reservation.findUnique({
      where: { id: params.id },
      select: {
        proofData: true,
        proofFileName: true,
        proofMimeType: true,
      },
    });

    if (!reservation || !reservation.proofData) {
      return NextResponse.json(
        { error: "Comprobante no encontrado" },
        { status: 404 }
      );
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(reservation.proofData, "base64");
    const mimeType = reservation.proofMimeType || "application/octet-stream";
    const fileName = reservation.proofFileName || "comprobante";

    return new Response(buffer, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error: any) {
    console.error("Proof GET Error:", error);
    return NextResponse.json(
      { error: "Error al obtener el comprobante", details: error.message },
      { status: 500 }
    );
  }
}
