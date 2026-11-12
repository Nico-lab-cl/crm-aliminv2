import { createHash } from "node:crypto";
import prisma from "./prisma";
import { enviarAlGrupo } from "./avisosWhatsappLeads";

/**
 * Token de la API de Instagram con inicio de sesión de Instagram (IGAA…).
 *
 * Meta no da tokens de Instagram que no venzan: duran 60 días. Pero se pueden
 * renovar sin intervención mientras sigan vigentes (y tengan al menos 24 h),
 * y cada renovación da otros 60 días. Este archivo lo renueva solo, así el
 * token en la práctica nunca vence (pedido de Nicolás, 11-11-2026).
 *
 * El token vigente se guarda en IntegrationToken (platform "instagram_login"),
 * porque una variable de entorno no se puede cambiar desde el CRM.
 * META_INSTAGRAM_ACCESS_TOKEN es solo el punto de partida: se usa hasta la
 * primera renovación, o si la base no tiene ninguno.
 *
 * Lo único que no se arregla solo: si alguien cambia la contraseña de
 * Instagram o quita los permisos, Meta invalida el token y hay que generar uno
 * nuevo a mano. En ese caso sale un aviso al grupo (uno por día como máximo).
 */

const PLATAFORMA = "instagram_login";
/** Se renueva cuando le quedan menos de estos días. */
const RENOVAR_SI_QUEDAN_DIAS = 50;
const CACHE_MS = 5 * 60 * 1000;

let cache: { token: string | null; vence: number } | null = null;
let ultimoAvisoDeFalla = 0;

/**
 * En refreshToken se guarda la huella del token de la variable de entorno del
 * que salió el renovado. Si alguien pone un token nuevo en la variable, la
 * huella no calza y manda el de la variable (el de la base ya no sirve).
 */
const huella = (t: string) => createHash("sha256").update(t).digest("hex");

async function vigente() {
  const fila = await prisma.integrationToken.findUnique({ where: { platform: PLATAFORMA } }).catch((error) => {
    console.error("[token-instagram] No se pudo leer el token de la base:", error);
    return null;
  });
  const deEntorno = process.env.META_INSTAGRAM_ACCESS_TOKEN || null;
  const entornoNuevo = Boolean(deEntorno && fila && fila.refreshToken !== huella(deEntorno));
  if (fila?.accessToken && !entornoNuevo) return { token: fila.accessToken, expiresAt: fila.expiresAt, deEntorno };
  return { token: deEntorno, expiresAt: null as Date | null, deEntorno };
}

/** Token vigente: el renovado de la base o, si no hay, el de la variable de entorno. */
export async function tokenInstagram(): Promise<string | null> {
  if (cache && Date.now() < cache.vence) return cache.token;
  const { token } = await vigente();
  cache = { token, vence: Date.now() + CACHE_MS };
  return token;
}

/** Renueva el token si le quedan menos de 50 días (o si no se sabe cuándo vence). */
export async function renovarTokenInstagram(): Promise<"renovado" | "vigente" | "sin_token" | "error"> {
  const { token: actual, expiresAt, deEntorno } = await vigente();
  if (!actual) return "sin_token";

  const diasRestantes = expiresAt ? (expiresAt.getTime() - Date.now()) / 86_400_000 : null;
  if (diasRestantes !== null && diasRestantes > RENOVAR_SI_QUEDAN_DIAS) return "vigente";

  try {
    const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(actual)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error || !d.access_token) {
      throw new Error(`Meta ${d?.error?.code ?? r.status}: ${d?.error?.message || "sin access_token"}`);
    }
    const expiresAt = new Date(Date.now() + Number(d.expires_in || 60 * 86_400) * 1000);
    const semilla = deEntorno ? huella(deEntorno) : null;
    await prisma.integrationToken.upsert({
      where: { platform: PLATAFORMA },
      create: { platform: PLATAFORMA, accessToken: d.access_token, expiresAt, refreshToken: semilla },
      update: { accessToken: d.access_token, expiresAt, refreshToken: semilla },
    });
    cache = null;
    console.log(`[token-instagram] Renovado: vence el ${expiresAt.toISOString().slice(0, 10)}.`);
    return "renovado";
  } catch (error) {
    console.error("[token-instagram] No se pudo renovar:", error);
    await avisarFalla(error instanceof Error ? error.message : String(error));
    return "error";
  }
}

/** Un aviso al grupo por día como máximo: el token hay que regenerarlo a mano. */
async function avisarFalla(detalle: string) {
  if (Date.now() - ultimoAvisoDeFalla < 24 * 3600_000) return;
  ultimoAvisoDeFalla = Date.now();
  const url = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  const grupo = process.env.LEADS_WHATSAPP_GROUP;
  if (!url || !apiKey || !grupo) return;
  const texto = [
    "⚠️ *El token de Instagram dejó de funcionar*",
    "",
    "Ali y las respuestas automáticas no pueden responder comentarios de Instagram hasta generar uno nuevo",
    "(Meta Developers → API de Instagram → Generar identificador) y ponerlo en META_INSTAGRAM_ACCESS_TOKEN del CRM.",
    "",
    `Detalle: ${detalle.slice(0, 200)}`,
  ].join("\n");
  await enviarAlGrupo(texto, {
    url,
    apiKey,
    instancia: process.env.EVOLUTION_INSTANCE || "nico",
    grupo,
    desde: new Date(),
  }).catch((e) => console.error("[token-instagram] No salió el aviso al grupo:", e));
}
