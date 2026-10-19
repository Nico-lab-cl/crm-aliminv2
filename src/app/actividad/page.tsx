"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import clsx from "clsx";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import {
  Activity,
  Flame,
  Thermometer,
  CloudSun,
  Snowflake,
  Phone,
  MessageCircle,
  Globe,
  Clock,
  MousePointerClick,
  Mail,
  MessageSquare,
  FileText,
  ChevronRight,
  Info,
} from "lucide-react";

type Actividad = { tipo: string; texto: string; fecha: string };
type LeadActividad = {
  id: string;
  nombre: string;
  phone: string | null;
  status: string | null;
  contacted: boolean;
  score: number;
  banda: string;
  motivo: string | null;
  enVivo: { desde: string; pagina: string | null } | null;
  ultimaInteraccion: string | null;
  actividades: Actividad[];
};
type Datos =
  | { listo: false }
  | {
      listo: true;
      minutosEnVivo: number;
      bandas: { banda: string; leads: number }[];
      enVivo: LeadActividad[];
      leads: LeadActividad[];
      total: number;
    };

/** Las temperaturas las define el lead score del CRM web; una nueva cae en el estilo por defecto. */
const BANDA: Record<string, { nombre: string; plural: string; icono: any; pill: string; tab: string }> = {
  CALIENTE: { nombre: "Caliente", plural: "Calientes", icono: Flame, pill: "bg-orange-100 text-orange-700", tab: "bg-orange-500" },
  TIBIO: { nombre: "Tibio", plural: "Tibios", icono: Thermometer, pill: "bg-amber-100 text-amber-700", tab: "bg-amber-500" },
  TEMPLADO: { nombre: "Templado", plural: "Templados", icono: CloudSun, pill: "bg-sky-100 text-sky-700", tab: "bg-sky-500" },
  FRIO: { nombre: "Frío", plural: "Fríos", icono: Snowflake, pill: "bg-slate-100 text-slate-600", tab: "bg-slate-500" },
};
const estiloBanda = (b: string) =>
  BANDA[b] || { nombre: b, plural: b, icono: Activity, pill: "bg-slate-100 text-slate-600", tab: "bg-slate-500" };

const ICONO: Record<string, any> = {
  WEB: Globe,
  TIEMPO: Clock,
  INTERES: MousePointerClick,
  WHATSAPP: MessageCircle,
  CORREO: Mail,
  CHAT: MessageSquare,
  FORM: FileText,
};

const hace = (fecha: string) => formatDistanceToNowStrict(new Date(fecha), { locale: es, addSuffix: true });

const REFRESCO_MS = 20_000;

export default function ActividadPage() {
  const router = useRouter();
  const { status } = useSession();
  const [banda, setBanda] = useState("CALIENTE");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/actividad?banda=${banda}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setDatos(await res.json());
      setError("");
    } catch {
      setError("No se pudo cargar la actividad. Reintentando…");
    } finally {
      setCargando(false);
    }
  }, [banda]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // En vivo: se refresca solo mientras la app está a la vista.
  useEffect(() => {
    if (status !== "authenticated") return;
    setCargando(true);
    cargar();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") cargar();
    }, REFRESCO_MS);
    const alVolver = () => document.visibilityState === "visible" && cargar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [cargar, status]);

  return (
    <div className="min-h-screen bg-[#F5F7F9]">
      <header className="bg-white px-6 pt-8 pb-4 border-b border-slate-100 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight">Actividad</h1>
            <p className="text-[11px] font-bold text-slate-400 mt-0.5">Tus leads con más interacción y qué están haciendo</p>
          </div>
          <div className="flex items-center gap-1.5 bg-green-50 border border-green-100 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[9px] font-black text-green-700 uppercase tracking-widest">En vivo</span>
          </div>
        </div>
        <p className="mt-3 text-[10px] leading-snug text-slate-500 bg-slate-50 rounded-xl px-3 py-2 flex gap-1.5">
          <Info size={12} className="shrink-0 mt-px text-primary" />
          Úsalo para elegir el momento y el tema de la llamada. No le digas al cliente qué páginas vio.
        </p>
      </header>

      {error && <p className="mx-4 mt-3 text-[11px] font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

      {cargando && !datos ? (
        <div className="flex justify-center py-24">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : datos && !datos.listo ? (
        <p className="px-6 py-20 text-center text-sm text-slate-400 font-bold">
          Todavía no hay puntajes calculados. Vuelve en unos minutos.
        </p>
      ) : datos && datos.listo ? (
        <div className="px-4 pt-4 space-y-6">
          {/* En la web ahora */}
          <section>
            <h2 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 px-1 mb-2">
              <span className="relative flex w-2.5 h-2.5">
                {datos.enVivo.length > 0 && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
                )}
                <span className={clsx("relative inline-flex w-2.5 h-2.5 rounded-full", datos.enVivo.length ? "bg-green-500" : "bg-slate-300")} />
              </span>
              En la web ahora
              {datos.enVivo.length > 0 && <span className="text-green-600">· {datos.enVivo.length}</span>}
            </h2>
            {datos.enVivo.length === 0 ? (
              <p className="text-[11px] text-slate-400 font-semibold px-1">
                Ninguno de tus leads está en la web en este momento (últimos {datos.minutosEnVivo} min).
              </p>
            ) : (
              <div className="space-y-3">
                {datos.enVivo.map((l) => (
                  <TarjetaLead key={l.id} lead={l} onAbrir={() => router.push(`/dashboard/leads/${l.id}`)} />
                ))}
              </div>
            )}
          </section>

          {/* Pestañas por temperatura */}
          <section>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollbarWidth: "none" }}>
              {datos.bandas.map((b) => {
                const e = estiloBanda(b.banda);
                const activa = b.banda === banda;
                return (
                  <button
                    key={b.banda}
                    onClick={() => setBanda(b.banda)}
                    className={clsx(
                      "shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-black transition-all active:scale-95",
                      activa ? `${e.tab} text-white shadow-md` : "bg-white text-slate-500 border border-slate-200"
                    )}
                  >
                    <e.icono size={13} strokeWidth={2.5} />
                    {e.plural}
                    <span className={clsx("tabular-nums", activa ? "text-white/80" : "text-slate-400")}>{b.leads}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-3 mt-3">
              {datos.leads.length === 0 ? (
                <p className="py-12 text-center text-[11px] text-slate-400 font-bold uppercase tracking-widest">
                  No tienes leads {estiloBanda(banda).plural.toLowerCase()} ahora
                </p>
              ) : (
                datos.leads.map((l) => (
                  <TarjetaLead key={l.id} lead={l} onAbrir={() => router.push(`/dashboard/leads/${l.id}`)} />
                ))
              )}
              {datos.total > datos.leads.length && (
                <p className="text-center text-[10px] text-slate-400 font-bold pt-1">
                  Se muestran los {datos.leads.length} de mayor puntaje de {datos.total}.
                </p>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function TarjetaLead({ lead, onAbrir }: { lead: LeadActividad; onAbrir: () => void }) {
  const e = estiloBanda(lead.banda);

  // Mismo registro que la ficha del lead: pasa a CONTACTADO si era NUEVO y
  // queda anotado el contacto.
  const contactar = (tipo: "WHATSAPP" | "PHONE") => {
    if (!lead.phone) return;
    if (tipo === "WHATSAPP") window.open(`https://wa.me/${lead.phone.replace(/\D/g, "")}`);
    else window.location.href = `tel:${lead.phone}`;

    const ahora = new Date();
    const cuando =
      ahora.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" }) +
      " a las " +
      ahora.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
    const status = (lead.status || "").trim().toUpperCase() === "NUEVO" ? "CONTACTADO" : lead.status;
    fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, lastActivity: `${tipo === "WHATSAPP" ? "WhatsApp" : "Llamada"} el ${cuando}` }),
    }).catch((err) => console.error("No se pudo registrar el contacto", err));
  };

  return (
    <div
      className={clsx(
        "bg-white rounded-2xl border shadow-sm overflow-hidden",
        lead.enVivo ? "border-green-200 ring-1 ring-green-100" : "border-slate-100"
      )}
    >
      <button onClick={onAbrir} className="w-full text-left px-4 pt-3.5 pb-2 active:bg-slate-50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-black text-slate-800 truncate">{lead.nombre}</h3>
            {lead.enVivo ? (
              <p className="text-[11px] font-bold text-green-600 truncate">
                En {lead.enVivo.pagina || "la web"} · {hace(lead.enVivo.desde)}
              </p>
            ) : (
              lead.motivo && <p className="text-[11px] font-semibold text-slate-400 truncate">{lead.motivo}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={clsx("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black tabular-nums", e.pill)}>
              <e.icono size={11} strokeWidth={2.5} />
              {lead.score}
            </span>
            <ChevronRight size={16} className="text-slate-300" />
          </div>
        </div>

        {!lead.contacted && (
          <span className="inline-flex items-center gap-1 mt-1.5 text-[9px] font-black uppercase tracking-tight text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
            <Clock size={9} />
            Sin contactar
          </span>
        )}

        {lead.actividades.length > 0 ? (
          <ul className="mt-2.5 space-y-1.5">
            {lead.actividades.map((a, i) => {
              const Icono = ICONO[a.tipo] || Activity;
              return (
                <li key={i} className="flex items-start gap-2 text-[11px] leading-snug">
                  <Icono size={12} className="shrink-0 mt-0.5 text-primary/70" />
                  <span className="flex-1 min-w-0 text-slate-600">{a.texto}</span>
                  <span className="shrink-0 text-[10px] text-slate-400 font-semibold">{hace(a.fecha)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-[11px] text-slate-400">Sin actividad en los últimos 30 días.</p>
        )}
      </button>

      {lead.phone && (
        <div className="grid grid-cols-2 border-t border-slate-100">
          <button
            onClick={() => contactar("PHONE")}
            className="flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-black text-primary active:bg-primary/5"
          >
            <Phone size={14} strokeWidth={2.5} />
            Llamar
          </button>
          <button
            onClick={() => contactar("WHATSAPP")}
            className="flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-black text-green-600 border-l border-slate-100 active:bg-green-50"
          >
            <MessageCircle size={14} strokeWidth={2.5} />
            WhatsApp
          </button>
        </div>
      )}
    </div>
  );
}
