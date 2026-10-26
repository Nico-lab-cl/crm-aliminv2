"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import clsx from "clsx";
import { formatDistanceToNowStrict, format, differenceInCalendarDays } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarClock, MessageCircle, Phone, ArrowRightLeft } from "lucide-react";
import GestionLead, { Modo } from "@/components/pipeline/GestionLead";
import { ETAPAS, FECHA_MINIMA, hoyEnChile, nombreEstado } from "@/lib/pipelineEtapas";

type Tarjeta = {
  id: string;
  nombre: string;
  phone: string | null;
  status: string;
  columna: string;
  etapaDesde: string | null;
  proximaAccion: string | null;
  proximaAccionAt: string | null;
  banda: string | null;
  score: number | null;
  asesor: string | null;
  visitDate: string | null;
};

type Datos = {
  conteos: Record<string, number>;
  tarjetas: Tarjeta[];
  porColumna: number;
  desde: string;
  hasta: string;
  asesores: { id: string; name: string }[];
};

const PERIODOS = [7, 30, 90];
const fechaLarga = (f: string) => format(new Date(`${f}T12:00:00`), "d MMM yyyy", { locale: es });

const PILL_BANDA: Record<string, string> = {
  CALIENTE: "bg-orange-100 text-orange-700",
  TIBIO: "bg-amber-100 text-amber-700",
  TEMPLADO: "bg-sky-100 text-sky-700",
  FRIO: "bg-slate-100 text-slate-600",
};

const BORDE: Record<string, string> = {
  NUEVO: "border-t-blue-500",
  CONTACTADO: "border-t-orange-500",
  VISITA: "border-t-green-500",
  RESERVADO: "border-t-emerald-600",
  PERDIDO: "border-t-slate-400",
};

const hace = (iso: string) => formatDistanceToNowStrict(new Date(iso), { locale: es, addSuffix: true });

function cuando(iso: string) {
  const d = new Date(iso);
  const dias = differenceInCalendarDays(d, new Date());
  const hora = format(d, "HH:mm");
  if (dias === 0) return `Hoy ${hora}`;
  if (dias === 1) return `Mañana ${hora}`;
  if (dias === -1) return `Ayer ${hora}`;
  return format(d, "EEE d MMM, HH:mm", { locale: es });
}

export default function PipelinePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const esAdmin = (session?.user as any)?.role === "ADMIN";
  const [periodo, setPeriodo] = useState<number | "RANGO">(30);
  const [desde, setDesde] = useState(FECHA_MINIMA);
  const [hasta, setHasta] = useState(hoyEnChile);
  const [asesor, setAsesor] = useState("");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [gestion, setGestion] = useState<{ tarjeta: Tarjeta; modo: Modo; tipo?: string } | null>(null);
  const [columnaVisible, setColumnaVisible] = useState(ETAPAS[0].id as string);
  const tablero = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const cargar = useCallback(async () => {
    try {
      const qs = new URLSearchParams(periodo === "RANGO" ? { desde, hasta } : { dias: String(periodo) });
      if (asesor) qs.set("asesor", asesor);
      const res = await fetch(`/api/pipeline?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setDatos(await res.json());
      setError("");
    } catch {
      setError("No se pudo cargar el pipeline.");
    } finally {
      setCargando(false);
    }
  }, [periodo, desde, hasta, asesor]);

  useEffect(() => {
    if (status !== "authenticated") return;
    setCargando(true);
    cargar();
    const alVolver = () => document.visibilityState === "visible" && cargar();
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [cargar, status]);

  // Las pestañas de arriba llevan a su columna; al deslizar, se marca la que está a la vista.
  const irAColumna = (id: string) => {
    document.getElementById(`columna-${id}`)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  };
  const alDeslizar = () => {
    const t = tablero.current;
    if (!t) return;
    const ancho = t.firstElementChild?.clientWidth || t.clientWidth;
    const i = Math.round(t.scrollLeft / (ancho + 12));
    setColumnaVisible(ETAPAS[Math.min(Math.max(i, 0), ETAPAS.length - 1)].id);
  };

  // Llamar o escribir abre la hoja para anotar cómo fue.
  const contactar = (t: Tarjeta, via: "LLAMADA" | "WHATSAPP") => {
    if (!t.phone) return;
    if (via === "WHATSAPP") window.open(`https://wa.me/${t.phone.replace(/\D/g, "")}`);
    else window.location.href = `tel:${t.phone}`;
    setGestion({ tarjeta: t, modo: "contacto", tipo: via });
  };

  return (
    <div className="min-h-screen bg-[#F5F7F9] pb-28">
      <header className="bg-white px-6 pt-8 pb-3 border-b border-slate-100 sticky top-0 z-20">
        <h1 className="text-2xl font-black text-primary tracking-tight">Pipeline</h1>
        <p className="text-[11px] font-bold text-slate-400 mt-0.5">Ordena a tus clientes por etapa</p>

        {esAdmin && (
          <select
            value={asesor}
            onChange={(e) => setAsesor(e.target.value)}
            className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-bold text-slate-600"
          >
            <option value="">Todos los asesores</option>
            {(datos?.asesores || []).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        <div className="flex mt-2 rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
          {[...PERIODOS, "RANGO" as const].map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={clsx(
                "flex-1 px-2 py-2 text-[11px] font-black whitespace-nowrap",
                periodo === p ? "bg-primary text-white" : "text-slate-500"
              )}
            >
              {p === "RANGO" ? "Fechas" : `${p} días`}
            </button>
          ))}
        </div>
        {periodo === "RANGO" && (
          <div className="flex items-center gap-2 mt-2">
            <input
              type="date"
              value={desde}
              min={FECHA_MINIMA}
              max={hasta}
              onChange={(e) => e.target.value && setDesde(e.target.value)}
              className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-[12px] font-bold text-slate-600"
            />
            <span className="text-[11px] font-bold text-slate-400">a</span>
            <input
              type="date"
              value={hasta}
              min={desde}
              max={hoyEnChile()}
              onChange={(e) => e.target.value && setHasta(e.target.value)}
              className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-[12px] font-bold text-slate-600"
            />
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto pt-3 -mx-6 px-6" style={{ scrollbarWidth: "none" }}>
          {ETAPAS.map((e) => {
            const activa = e.id === columnaVisible;
            return (
              <button
                key={e.id}
                onClick={() => irAColumna(e.id)}
                className={clsx(
                  "shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-black transition-all active:scale-95",
                  activa ? `${e.color} text-white shadow-md` : "bg-white text-slate-500 border border-slate-200"
                )}
              >
                {e.nombre}
                <span className={clsx("tabular-nums", activa ? "text-white/80" : "text-slate-400")}>{datos?.conteos?.[e.id] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </header>

      {error && <p className="mx-4 mt-3 text-[11px] font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

      {cargando && !datos ? (
        <div className="flex justify-center py-24">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : datos ? (
        <>
          <p className="px-4 pt-3 text-[10px] text-slate-400 font-semibold">
            Clientes que llegaron entre el {fechaLarga(datos.desde)} y el {fechaLarga(datos.hasta)}. Desliza para ver las demás etapas.
          </p>
          <div
            ref={tablero}
            onScroll={alDeslizar}
            className={clsx("flex gap-3 overflow-x-auto snap-x snap-mandatory px-4 pt-3 pb-4", cargando && "opacity-60")}
            style={{ scrollbarWidth: "none" }}
          >
            {ETAPAS.map((e) => {
              const tarjetas = datos.tarjetas.filter((t) => t.columna === e.id);
              const total = datos.conteos?.[e.id] ?? 0;
              return (
                <section
                  key={e.id}
                  id={`columna-${e.id}`}
                  className={clsx("snap-start shrink-0 w-[85%] max-w-[380px] bg-slate-100/70 rounded-2xl border-t-4 p-2.5", BORDE[e.id])}
                >
                  <div className="flex items-baseline justify-between px-1.5 pb-2">
                    <h2 className="text-[13px] font-black text-slate-700">{e.nombre}</h2>
                    <span className="text-[11px] font-black text-slate-400 tabular-nums">{total}</span>
                  </div>
                  <div className="space-y-2.5">
                    {tarjetas.length === 0 && <p className="py-10 text-center text-[11px] text-slate-400 font-bold">Sin clientes</p>}
                    {tarjetas.map((t) => (
                      <TarjetaPipeline
                        key={t.id}
                        t={t}
                        verAsesor={esAdmin && !asesor}
                        onAbrir={() => router.push(`/dashboard/leads/${t.id}`)}
                        onContactar={(via) => contactar(t, via)}
                        onMover={() => setGestion({ tarjeta: t, modo: "etapa" })}
                      />
                    ))}
                    {total > tarjetas.length && (
                      <p className="text-center text-[10px] text-slate-400 font-bold pt-1">
                        Se muestran los {tarjetas.length} más recientes de {total}.
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : null}

      {gestion && (
        <GestionLead
          lead={{ id: gestion.tarjeta.id, nombre: gestion.tarjeta.nombre, status: gestion.tarjeta.status }}
          modoInicial={gestion.modo}
          tipoInicial={gestion.tipo}
          onClose={() => setGestion(null)}
          onGuardado={() => {
            setGestion(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function TarjetaPipeline({
  t,
  verAsesor,
  onAbrir,
  onContactar,
  onMover,
}: {
  t: Tarjeta;
  verAsesor: boolean;
  onAbrir: () => void;
  onContactar: (via: "LLAMADA" | "WHATSAPP") => void;
  onMover: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <button onClick={onAbrir} className="w-full text-left px-3.5 pt-3 pb-2 active:bg-slate-50">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[13px] font-black text-slate-800 truncate">{t.nombre}</h3>
          {t.banda && t.score !== null && (
            <span className={clsx("shrink-0 px-2 py-0.5 rounded-full text-[11px] font-black tabular-nums", PILL_BANDA[t.banda] || PILL_BANDA.FRIO)}>
              {t.score}
            </span>
          )}
        </div>
        <p className="text-[11px] font-semibold text-slate-400 truncate">
          {t.columna === "RESERVADO" && t.status !== "RESERVADO" && `${nombreEstado(t.status)} · `}
          {t.etapaDesde && `desde ${hace(t.etapaDesde)}`}
          {verAsesor && t.asesor && ` · ${t.asesor}`}
        </p>
        {t.columna === "VISITA" && t.visitDate && (
          <p className="text-[11px] text-green-700 font-semibold mt-1">Visita: {cuando(t.visitDate)}</p>
        )}
        {t.proximaAccion && t.proximaAccionAt && (
          <p className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
            <CalendarClock size={12} /> {t.proximaAccion} · {cuando(t.proximaAccionAt)}
          </p>
        )}
      </button>

      <div className="grid grid-cols-3 border-t border-slate-100">
        <button
          disabled={!t.phone}
          onClick={() => onContactar("LLAMADA")}
          className="flex items-center justify-center gap-1 py-2 text-[11px] font-black text-primary active:bg-primary/5 disabled:opacity-30"
        >
          <Phone size={13} strokeWidth={2.5} /> Llamar
        </button>
        <button
          disabled={!t.phone}
          onClick={() => onContactar("WHATSAPP")}
          className="flex items-center justify-center gap-1 py-2 text-[11px] font-black text-green-600 border-l border-slate-100 active:bg-green-50 disabled:opacity-30"
        >
          <MessageCircle size={13} strokeWidth={2.5} /> WhatsApp
        </button>
        <button
          onClick={onMover}
          className="flex items-center justify-center gap-1 py-2 text-[11px] font-black text-slate-600 border-l border-slate-100 active:bg-slate-50"
        >
          <ArrowRightLeft size={13} strokeWidth={2.5} /> Mover
        </button>
      </div>
    </div>
  );
}
