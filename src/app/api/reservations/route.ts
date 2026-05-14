import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * GET /api/reservations
 * - With ?leadId=xxx → returns reservations for that lead
 * - Without leadId (ADMIN only) → returns ALL reservations
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions as any);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("leadId");
  const search = searchParams.get("q");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const skip = (page - 1) * limit;

  try {
    let where: any = {};
    const userSession = session as any;

    if (leadId) {
      where.leadId = leadId;
    } else {
      // Only ADMIN can see all reservations without a leadId filter
      if (userSession.user?.role !== "ADMIN") {
        // Non-admin: only show reservations they created
        where.createdById = userSession.user?.id;
      }
    }

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { rut: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];
    }

    const [reservations, total] = await Promise.all([
      (prisma as any).reservation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          leadId: true,
          fullName: true,
          email: true,
          phone: true,
          rut: true,
          profession: true,
          civilStatus: true,
          nationality: true,
          project: true,
          lote: true,
          etapa: true,
          street: true,
          streetNumber: true,
          region: true,
          commune: true,
          proofFileName: true,
          proofMimeType: true,
          // NOTE: We do NOT include proofData here to avoid sending large base64 in list view
          createdById: true,
          createdAt: true,
          updatedAt: true,
          lead: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              source: true,
              status: true,
              rating: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      (prisma as any).reservation.count({ where }),
    ]);

    return NextResponse.json({
      reservations,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error: any) {
    console.error("Reservations GET Error:", error);
    return NextResponse.json(
      { error: "Error al obtener reservaciones", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reservations
 * Create a new reservation attached to a lead
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions as any);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await req.json();
    const userSession = session as any;

    // Validate required fields
    if (!data.leadId) {
      return NextResponse.json({ error: "leadId es requerido" }, { status: 400 });
    }
    if (!data.project || !data.lote) {
      return NextResponse.json(
        { error: "Proyecto y Lote son requeridos" },
        { status: 400 }
      );
    }
    // Etapa is required for libertad-alegria and lomas-del-mar
    const projectsWithEtapa = ["libertad-alegria", "lomas-del-mar"];
    if (projectsWithEtapa.includes(data.project) && !data.etapa) {
      return NextResponse.json(
        { error: "Etapa es requerida para este proyecto" },
        { status: 400 }
      );
    }
    if (!data.fullName || !data.email || !data.phone || !data.rut) {
      return NextResponse.json(
        { error: "Nombre, email, teléfono y RUT son requeridos" },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB base64 ≈ 6.67MB text)
    if (data.proofData && data.proofData.length > 7_000_000) {
      return NextResponse.json(
        { error: "El comprobante no puede superar los 5MB" },
        { status: 400 }
      );
    }

    // Verify the lead exists
    const lead = await (prisma as any).lead.findUnique({
      where: { id: data.leadId },
      select: { id: true, firstName: true, lastName: true, assignedToId: true },
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
    }

    // Create the reservation
    const reservation = await (prisma as any).reservation.create({
      data: {
        leadId: data.leadId,
        fullName: data.fullName,
        email: data.email.toLowerCase(),
        phone: data.phone,
        rut: data.rut,
        profession: data.profession || null,
        civilStatus: data.civilStatus || null,
        nationality: data.nationality || "Chilena",
        project: data.project || null,
        lote: data.lote || null,
        etapa: data.etapa || null,
        street: data.street || null,
        streetNumber: data.streetNumber || null,
        region: data.region || null,
        commune: data.commune || null,
        proofFileName: data.proofFileName || null,
        proofMimeType: data.proofMimeType || null,
        proofData: data.proofData || null,
        createdById: userSession.user?.id || null,
      },
    });

    // Update lead status to RESERVADO
    await (prisma as any).lead.update({
      where: { id: data.leadId },
      data: { status: "RESERVADO" },
    });

    // Notify all admins about the new reservation
    const admins = await (prisma as any).user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    });

    const advisorName = userSession.user?.name || "Un asesor";
    for (const admin of admins) {
      await createNotification({
        userId: admin.id,
        title: "Nueva Reserva Registrada 🏠",
        body: `${advisorName} registró una reserva para ${data.fullName}`,
        leadId: data.leadId,
        type: "RESERVATION",
      });
    }

    return NextResponse.json(reservation, { status: 201 });
  } catch (error: any) {
    console.error("Reservation POST Error:", error);
    return NextResponse.json(
      { error: "Error al crear la reservación", details: error.message },
      { status: 500 }
    );
  }
}
