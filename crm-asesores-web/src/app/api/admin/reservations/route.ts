import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import externalPrisma from "@/lib/externalPrisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions as any);

  // Strictly Admin only
  if (!session || (session as any).user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Fetch reservations from external database including Lot info
    // We use a join or include if the external schema allows it.
    // Based on the 'db pull', Reservation has a relation to Lot.
    const externalReservations = await (externalPrisma as any).reservation.findMany({
      orderBy: { created_at: "desc" },
      include: {
        Lot: {
          select: {
            number: true,
            stage: true,
          },
        },
      },
    });

    // 2. Fetch all local leads to perform email matching (Historical + Recent)
    // For performance, we fetch only the necessary fields
    const localLeads = await (prisma as any).lead.findMany({
      select: {
        email: true,
        source: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        adName: true,
        adId: true,
      },
    });

    // Create a map for faster lookup
    const leadMap = new Map();
    localLeads.forEach((lead: any) => {
      if (lead.email) {
        leadMap.set(lead.email.toLowerCase(), lead);
      }
    });

    // 3. Process and merge data
    const enrichedReservations = externalReservations.map((res: any) => {
      const emailLower = res.email?.toLowerCase();
      const matchedLead = leadMap.get(emailLower);

      // Lot formatting
      const lotDisplay = res.Lot 
        ? `Lote ${res.Lot.number} - Etapa ${res.Lot.stage}`
        : `Lote ${res.lot_id}`;

      // Source mapping: "directo" -> "Búsqueda Orgánica"
      let sourceDisplay = res.utm_source || "Búsqueda Orgánica";
      if (sourceDisplay.toLowerCase() === "directo" || sourceDisplay.toLowerCase() === "direct") {
        sourceDisplay = "Búsqueda Orgánica";
      }

      return {
        id: res.id,
        name: res.name,
        email: res.email,
        phone: res.phone,
        status: res.status,
        pipeline_stage: res.pipeline_stage,
        lot: lotDisplay,
        advisor: res.advisor || "Sin Asignar",
        source: sourceDisplay,
        utm_medium: res.utm_medium,
        utm_campaign: res.utm_campaign,
        created_at: res.created_at,
        // Match data
        hasLeadMatch: !!matchedLead,
        matchedAd: matchedLead ? {
          platform: matchedLead.source, // TikTok / FB / META
          adName: matchedLead.adName || matchedLead.adId || "Sin nombre",
          campaign: matchedLead.utmCampaign || "Sin campaña",
        } : null
      };
    });

    return NextResponse.json(enrichedReservations);
  } catch (error: any) {
    console.error("External Reservations API Error:", error);
    return NextResponse.json({ 
      error: "Error al obtener las reservaciones externas",
      details: error.message 
    }, { status: 500 });
  }
}
