"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowRightLeft, CalendarClock, GitBranch, Phone } from "lucide-react";
import GestionLead, { Modo } from "./GestionLead";
import { ORIGENES, TIPOS_SEGUIMIENTO, nombreEstado } from "@/lib/pipelineEtapas";

type Evento = {
  clase: "ETAPA" | "SEGUIMIENTO";
  fecha: string;
  usuario: string | null;
  de?: string | null;
  a?: string;
  origen?: string;
  motivo?: string | null;
  tipo?: string;
  resultado?: string | null;
  nota?: string | null;
  proximaAccion?: string | null;
  proximaAccionAt?: string | null;
};

const fecha = (iso: string) => format(new Date(iso), "d MMM yyyy, HH:mm", { locale: es });

type Props = {
  lead: { id: string; nombre: string; status: string; proximaAccion?: string | null; proximaAccionAt?: string | null };
  onCambio: (lead: any) => void;
};

/** Sección de la ficha: próxima acción, botones de gestión e historial completo. */
export default function HistorialLead({ lead, onCambio }: Props) {
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [modo, setModo] = useState<Modo | null>(null);
  const [verTodo, setVerTodo] = useState(false);

  const cargar = useCallback(() => {
    fetch(`/api/leads/${lead.id}/seguimientos`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setEventos)
      .catch(() => setEventos([]));
  }, [lead.id]);

  useEffect(cargar, [cargar]);

  const atrasada = lead.proximaAccionAt && new Date(lead.proximaAccionAt) < new Date();
  const visibles = verTodo ? eventos || [] : (eventos || []).slice(0, 5);

  return (
    <div className="px-4 py-3">
      <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-3 px-2 flex items-center gap-2">
        <GitBranch size={12} /> Seguimiento comercial
      </h3>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className={clsx("px-4 py-3 flex items-center gap-3", atrasada ? "bg-red-50" : "bg-slate-50")}>
          <CalendarClock size={18} className={atrasada ? "text-red-500" : "text-primary"} />
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Próxima acción</p>
            {lead.proximaAccion && lead.proximaAccionAt ? (
              <p className={clsx("text-sm font-bold", atrasada ? "text-red-600" : "text-slate-700")}>
                {lead.proximaAccion} · {fecha(lead.proximaAccionAt)}
                {atrasada && " (atrasada)"}
              </p>
            ) : (
              <p className="text-sm font-bold text-slate-400">Sin próxima acción</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 border-y border-slate-100">
          <button onClick={() => setModo("contacto")} className="flex items-center justify-center gap-1.5 py-3 text-[11px] font-black text-primary active:bg-primary/5">
            <Phone size={14} /> Registrar contacto
          </button>
          <button onClick={() => setModo("etapa")} className="flex items-center justify-center gap-1.5 py-3 text-[11px] font-black text-primary border-l border-slate-100 active:bg-primary/5">
            <ArrowRightLeft size={14} /> Cambiar etapa
          </button>
        </div>

        <ol className="px-4 py-3 space-y-3">
          {eventos === null && <li className="text-[11px] text-slate-400">Cargando…</li>}
          {eventos?.length === 0 && <li className="text-[11px] text-slate-400">Todavía no hay seguimientos registrados.</li>}
          {visibles.map((e, i) => (
            <li key={i} className="flex gap-3">
              <span className={clsx("mt-1.5 w-2 h-2 rounded-full shrink-0", e.clase === "ETAPA" ? "bg-primary" : "bg-amber-400")} />
              <div className="min-w-0 flex-1">
                {e.clase === "ETAPA" ? (
                  <p className="text-[12px] font-bold text-slate-700">
                    {e.de ? `${nombreEstado(e.de)} → ${nombreEstado(e.a)}` : `Ingresó como ${nombreEstado(e.a)}`}
                  </p>
                ) : (
                  <p className="text-[12px] font-bold text-slate-700">
                    {TIPOS_SEGUIMIENTO.find((t) => t.id === e.tipo)?.nombre || e.tipo}
                    {e.resultado && <span className="font-semibold text-slate-500"> · {e.resultado}</span>}
                  </p>
                )}
                {(e.motivo || e.nota) && <p className="text-[11px] text-slate-600 whitespace-pre-wrap">{e.motivo || e.nota}</p>}
                {e.proximaAccion && e.proximaAccionAt && (
                  <p className="text-[10px] text-slate-500">Próxima: {e.proximaAccion} · {fecha(e.proximaAccionAt)}</p>
                )}
                <p className="text-[10px] text-slate-400 font-semibold">
                  {fecha(e.fecha)} · {e.usuario || (e.origen ? ORIGENES[e.origen] || e.origen : "")}
                </p>
              </div>
            </li>
          ))}
          {(eventos?.length || 0) > 5 && (
            <li>
              <button onClick={() => setVerTodo(!verTodo)} className="text-[11px] font-black text-primary">
                {verTodo ? "Ver menos" : `Ver todo (${eventos!.length})`}
              </button>
            </li>
          )}
        </ol>
      </div>

      {modo && (
        <GestionLead
          lead={lead}
          modoInicial={modo}
          onClose={() => setModo(null)}
          onGuardado={(actualizado) => {
            setModo(null);
            onCambio(actualizado);
            cargar();
          }}
        />
      )}
    </div>
  );
}
