"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import clsx from "clsx";
import { formatDistanceToNowStrict, format, differenceInCalendarDays } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarClock, ChevronRight, MessageCircle, Phone, AlertTriangle, ArrowRightLeft, Info } from "lucide-react";
import GestionLead, { Modo } from "@/components/pipeline/GestionLead";
import { ETAPAS, TIPOS_SEGUIMIENTO, nombreEstado } from "@/lib/pipelineEtapas";

type Tarjeta = {
  id: string;
  nombre: string;
  phone: string | null;
  status: string;
  columna: string;
  etapaDesde: string | null;
  proximaAccion: string | null;
  proximaAccionAt: string | null;
  ultimoSeguimiento: { tipo: string; resultado: string | null; fecha: string } | null;
  banda: string | null;
  score: number | null;
  asesor: string | null;
  visitDate: string | null;
};

type Datos = {
  conteos: Record<string, number>;
  tarjetas: Tarjeta[];
  total: number;
  porPestana: number;
  diasAbiertos: number;
};

const PESTANAS = [
  { id: "HOY", nombre: "Hoy", color: "bg-primary" },
  { id: "SIN_ACCION", nombre: "Sin acción", color: "bg-amber-500" },
  ...ETAPAS,
];

const PILL_BANDA: Record<string, string> = {
  CALIENTE: "bg-orange-100 text-orange-700",
  TIBIO: "bg-amber-100 text-amber-700",
  TEMPLADO: "bg-sky-100 text-sky-700",
  FRIO: "bg-slate-100 text-slate-600",
};

const VACIO: Record<string, string> = {
  HOY: "No tienes acciones para hoy. Revisa “Sin acción”.",
  SIN_ACCION: "Todos tus leads abiertos tienen una próxima acción.",
};

const AYUDA: Record<string, (dias: number) => string> = {
  NUEVO: (d) => `Leads nuevos de los últimos ${d} días. Al registrar el primer contacto pasan a Contactado solos.`,
  SIN_ACCION: (d) =>
    `Leads abiertos de los últimos ${d} días sin nada agendado, los de mayor puntaje primero. Ponles una próxima acción o márcalos como perdidos.`,
  CONTACTADO: (d) =>
    `Contactados en los últimos ${d} días o con algo agendado. Un lead más antiguo vuelve acá si le agendas una acción desde su ficha.`,
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
  const [pestana, setPestana] = useState("HOY");
  const [asesor, setAsesor] = useState("");
  const [asesores, setAsesores] = useState<{ id: string; name: string }[]>([]);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [gestion, setGestion] = useState<{ tarjeta: Tarjeta; modo: Modo; tipo?: string } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (!esAdmin) return;
    fetch("/api/users")
      .then((r) => r.json())
      .then((u) => setAsesores(Array.isArray(u) ? u : []))
      .catch(() => {});
  }, [esAdmin]);

  const cargar = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ pestana });
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
  }, [pestana, asesor]);

  useEffect(() => {
    if (status !== "authenticated") return;
    setCargando(true);
    cargar();
    const alVolver = () => document.visibilityState === "visible" && cargar();
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [cargar, status]);

  // Llamar o escribir abre la hoja para anotar cómo fue, que es lo que alimenta el pipeline.
  const contactar = (t: Tarjeta, via: "LLAMADA" | "WHATSAPP") => {
    if (!t.phone) return;
    if (via === "WHATSAPP") window.open(`https://wa.me/${t.phone.replace(/\D/g, "")}`);
    else window.location.href = `tel:${t.phone}`;
    setGestion({ tarjeta: t, modo: "contacto", tipo: via });
  };

  const atrasados = datos?.conteos?.ATRASADOS || 0;

  return (
    <div className="min-h-screen bg-[#F5F7F9] pb-28">
      <header className="bg-white px-6 pt-8 pb-4 border-b border-slate-100 sticky top-0 z-20">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight">Pipeline</h1>
            <p className="text-[11px] font-bold text-slate-400 mt-0.5">En qué va cada cliente y qué toca hacer</p>
          </div>
          {atrasados > 0 && (
            <span className="flex items-center gap-1 bg-red-50 border border-red-100 text-red-600 px-2.5 py-1 rounded-full text-[10px] font-black">
              <AlertTriangle size={12} /> {atrasados} atrasado{atrasados === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {esAdmin && (
          <select
            value={asesor}
            onChange={(e) => setAsesor(e.target.value)}
            className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-bold text-slate-600"
          >
            <option value="">Todos los asesores</option>
            {asesores.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        <div className="flex gap-2 overflow-x-auto pt-3 -mx-6 px-6" style={{ scrollbarWidth: "none" }}>
          {PESTANAS.map((p) => {
            const activa = p.id === pestana;
            const n = datos?.conteos?.[p.id];
            return (
              <button
                key={p.id}
                onClick={() => setPestana(p.id)}
                className={clsx(
                  "shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-black transition-all active:scale-95",
                  activa ? `${p.color} text-white shadow-md` : "bg-white text-slate-500 border border-slate-200"
                )}
              >
                {p.nombre}
                {n !== undefined && <span className={clsx("tabular-nums", activa ? "text-white/80" : "text-slate-400")}>{n}</span>}
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
        <div className="px-4 pt-4 space-y-3">
          {AYUDA[pestana] && (
            <p className="text-[10px] leading-snug text-slate-500 bg-white rounded-xl px-3 py-2 flex gap-1.5 border border-slate-100">
              <Info size={12} className="shrink-0 mt-px text-primary" />
              {AYUDA[pestana](datos.diasAbiertos)}
            </p>
          )}
          {datos.tarjetas.length === 0 ? (
            <p className="py-16 text-center text-[11px] text-slate-400 font-bold">
              {VACIO[pestana] || "No hay leads en esta etapa."}
            </p>
          ) : (
            datos.tarjetas.map((t) => (
              <TarjetaPipeline
                key={t.id}
                t={t}
                verAsesor={esAdmin && !asesor}
                onAbrir={() => router.push(`/dashboard/leads/${t.id}`)}
                onContactar={(via) => contactar(t, via)}
                onGestionar={() => setGestion({ tarjeta: t, modo: "etapa" })}
              />
            ))
          )}
          {datos.total > datos.tarjetas.length && (
            <p className="text-center text-[10px] text-slate-400 font-bold pt-1">
              Se muestran {datos.tarjetas.length} de {datos.total}.
            </p>
          )}
        </div>
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
  onGestionar,
}: {
  t: Tarjeta;
  verAsesor: boolean;
  onAbrir: () => void;
  onContactar: (via: "LLAMADA" | "WHATSAPP") => void;
  onGestionar: () => void;
}) {
  const atrasada = t.proximaAccionAt && new Date(t.proximaAccionAt) < new Date();
  const etapa = ETAPAS.find((e) => e.id === t.columna);
  const tipoUltimo = t.ultimoSeguimiento && TIPOS_SEGUIMIENTO.find((x) => x.id === t.ultimoSeguimiento!.tipo)?.nombre;

  return (
    <div className={clsx("bg-white rounded-2xl border shadow-sm overflow-hidden", atrasada ? "border-red-200" : "border-slate-100")}>
      <button onClick={onAbrir} className="w-full text-left px-4 pt-3.5 pb-2.5 active:bg-slate-50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-black text-slate-800 truncate">{t.nombre}</h3>
            <p className="text-[11px] font-semibold text-slate-400 truncate">
              <span className={clsx("inline-block px-1.5 rounded mr-1 font-black", etapa?.pill)}>{nombreEstado(t.status)}</span>
              {t.etapaDesde && `desde ${hace(t.etapaDesde)}`}
              {verAsesor && t.asesor && ` · ${t.asesor}`}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {t.banda && t.score !== null && (
              <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-black tabular-nums", PILL_BANDA[t.banda] || PILL_BANDA.FRIO)}>
                {t.score}
              </span>
            )}
            <ChevronRight size={16} className="text-slate-300" />
          </div>
        </div>

        {t.proximaAccion && t.proximaAccionAt ? (
          <p className={clsx("mt-2 flex items-center gap-1.5 text-[12px] font-bold", atrasada ? "text-red-600" : "text-slate-700")}>
            <CalendarClock size={13} /> {t.proximaAccion} · {cuando(t.proximaAccionAt)}
          </p>
        ) : t.columna !== "RESERVADO" && t.columna !== "PERDIDO" && t.columna !== "NUEVO" ? (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-amber-600">
            <AlertTriangle size={12} /> Sin próxima acción
          </p>
        ) : null}

        {t.columna === "VISITA" && t.visitDate && (
          <p className="text-[11px] text-green-700 font-semibold mt-1">Visita: {cuando(t.visitDate)}</p>
        )}
        {t.ultimoSeguimiento && (
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            Último: {tipoUltimo}
            {t.ultimoSeguimiento.resultado && ` · ${t.ultimoSeguimiento.resultado}`} · {hace(t.ultimoSeguimiento.fecha)}
          </p>
        )}
      </button>

      <div className="grid grid-cols-3 border-t border-slate-100">
        <button
          disabled={!t.phone}
          onClick={() => onContactar("LLAMADA")}
          className="flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-black text-primary active:bg-primary/5 disabled:opacity-30"
        >
          <Phone size={14} strokeWidth={2.5} /> Llamar
        </button>
        <button
          disabled={!t.phone}
          onClick={() => onContactar("WHATSAPP")}
          className="flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-black text-green-600 border-l border-slate-100 active:bg-green-50 disabled:opacity-30"
        >
          <MessageCircle size={14} strokeWidth={2.5} /> WhatsApp
        </button>
        <button
          onClick={onGestionar}
          className="flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-black text-slate-600 border-l border-slate-100 active:bg-slate-50"
        >
          <ArrowRightLeft size={14} strokeWidth={2.5} /> Etapa
        </button>
      </div>
    </div>
  );
}
