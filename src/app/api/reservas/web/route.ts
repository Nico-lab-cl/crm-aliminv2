import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import prisma from "@/lib/prisma";
import { BARBARA_ID, MARCELA_ID, ORLANDO_ID, getNextAdvisorId } from "@/lib/assignment";
import { createNotification } from "@/lib/notifications";
import { avisarAlGrupo } from "@/lib/aliRedes";

export const dynamic = "force-dynamic";

/**
 * Reserva pagada con Webpay en aliminspa.cl/reservar (21-11-2026). La llama
 * el sitio (src/lib/reservas-avisos.ts) una vez por reserva, con la misma
 * cabecera x-crm-api-key que usa para los leads.
 *
 *   1. Busca el lead por correo o celular; si no existe, lo crea.
 *   2. Lo deja en RESERVA_PAGADA, con el lote y el proyecto.
 *   3. Si no tiene asesor (o lo tenía Ali), le asigna uno de la rueda; fuera
 *      del horario de la rueda, uno al azar (Nico: "que vaya rotando nomás").
 *   4. Push al asesor y mensaje grande al grupo de leads (sin teléfono ni
 *      correo: en el grupo están todos los asesores).
 *
 * Postventa recibe el correo con los datos directamente desde el sitio.
 */

const ASESORES = [MARCELA_ID, ORLANDO_ID, BARBARA_ID];

/** Misma regla que POST /api/leads: CRM_API_KEY, o la clave antigua si falta. */
function claveValida(recibida: string | null) {
  const esperada = process.env.CRM_API_KEY || "lomas_del_mar_secret_2026";
  if (!recibida) return false;
  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

const clp = (n: number) => "$" + Number(n || 0).toLocaleString("es-CL");

/** +56912345678 → variantes con que puede estar guardado el teléfono. */
function variantesTelefono(celular: string) {
  const d = celular.replace(/\D/g, "");
  const nueve = d.slice(-9);
  return Array.from(new Set([celular, `+${d}`, d, nueve, `+56${nueve}`, `56${nueve}`])).filter(Boolean);
}

const ORIGENES: Record<string, string> = {
  "ali-whatsapp": "WhatsApp con Ali",
  "ali-instagram": "Instagram con Ali",
  "ali-facebook": "Facebook con Ali",
  "ali-web": "Chat web con Ali",
  web: "Web (aliminspa.cl)",
};

export async function POST(req: Request) {
  if (!claveValida(req.headers.get("x-crm-api-key"))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let d: Record<string, unknown>;
  try {
    d = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const texto = (v: unknown, max = 120) => String(v ?? "").trim().slice(0, max);
  const proyecto = texto(d.proyecto, 60);
  const lote = texto(d.lote, 20);
  const nombre = texto(d.nombre);
  const email = texto(d.email).toLowerCase();
  const celular = texto(d.celular, 20);
  const folio = texto(d.folio, 30);
  const monto = Number(d.monto) || 0;
  const origenClave = texto(d.origen, 40) || "web";
  const origen = ORIGENES[origenClave] || origenClave;
  if (!proyecto || !lote || !nombre || (!email && !celular) || !folio) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }

  try {
    let lead =
      (email ? await prisma.lead.findFirst({ where: { email: { equals: email, mode: "insensitive" } } }) : null) ||
      (celular
        ? await prisma.lead.findFirst({ where: { phone: { in: variantesTelefono(celular) } }, orderBy: { createdAt: "desc" } })
        : null);

    const [firstName, ...resto] = nombre.split(" ");
    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          firstName,
          lastName: resto.join(" ") || null,
          email: email || null,
          phone: celular || null,
          source: "Reserva web",
          status: "RESERVA_PAGADA",
          interests: proyecto,
        },
      });
    }

    // Asesor: se respeta el que ya lo atiende; si no tiene o lo tenía Ali, rueda.
    let asesorId = lead.assignedToId && ASESORES.includes(lead.assignedToId) ? lead.assignedToId : null;
    if (!asesorId) {
      asesorId =
        (await getNextAdvisorId(ASESORES, "Reserva web").catch(() => null)) ||
        ASESORES[Math.floor(Math.random() * ASESORES.length)];
    }

    const actividad = `Reservó el lote ${lote} de ${proyecto} con Webpay (${clp(monto)}, folio ${folio})`;
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: "RESERVA_PAGADA",
        assignedToId: asesorId,
        lote,
        visitProject: lead.visitProject || proyecto,
        lastActivity: actividad.slice(0, 190),
        lastNoteAt: new Date(),
        notes: [lead.notes, `🎉 ${actividad}. Origen: ${origen}.`].filter(Boolean).join("\n").slice(0, 4000),
      },
    });

    const asesor = await prisma.user.findUnique({ where: { id: asesorId }, select: { name: true } });

    await createNotification({
      userId: asesorId,
      title: `🎉 Reserva pagada · ${proyecto} · ${lote}`,
      body: `${nombre} reservó con Webpay. Tiene 10 días para pie y promesa: coordina la visita y los siguientes pasos.`,
      leadId: lead.id,
      type: "NEW_LEAD",
    }).catch((e) => console.error("[reservas-web] No salió el push:", e));

    await avisarAlGrupo(
      [
        "🎉🎉🎉 *¡RESERVA PAGADA!* 🎉🎉🎉",
        "",
        `🏡 *Proyecto:* ${proyecto}`,
        `📍 *Lote:* ${lote}`,
        `💳 *Monto:* ${clp(monto)} (Webpay)`,
        `👤 *Cliente:* ${nombre}`,
        `🧭 *Origen:* ${origen}`,
        `🧑‍💼 *Asesor a cargo:* ${asesor?.name || "asesor de la rueda"}`,
        `🧾 *Folio:* ${folio}`,
        "",
        "⏳ Tiene 10 días corridos para pagar el pie y firmar la promesa. Postventa ya recibió los datos por correo.",
      ].join("\n")
    );

    console.log(`[reservas-web] ${folio}: lead ${lead.id} → ${asesor?.name || asesorId}`);
    return NextResponse.json({ ok: true, leadId: lead.id, asesor: asesor?.name || null });
  } catch (error) {
    console.error("[reservas-web] Error:", error);
    return NextResponse.json({ error: "No se pudo registrar la reserva" }, { status: 500 });
  }
}
