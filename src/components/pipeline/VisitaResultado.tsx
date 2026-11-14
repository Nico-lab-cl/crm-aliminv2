"use client";
import { useEffect, useState } from "react";
import { MapPin, CheckCircle2, XCircle } from "lucide-react";
import clsx from "clsx";

type Estado = "sin_visita" | "agendada" | "por_marcar" | "llego" | "no_llego";
interface Visita {
  estado: Estado;
  fecha: string | null;
  proyecto: string | null;
}

/**
 * "¿Llegó a la visita?" en la ficha del lead (lib/visitaRealizada.ts).
 * Aparece cuando ya pasó la hora de la visita. Con "Llegó" la IA de Cierre
 * toma el seguimiento; con "No llegó" sigue Ali, que intenta reagendar.
 */
export default function VisitaResultado({ leadId }: { leadId: string }) {
  const [visita, setVisita] = useState<Visita | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/leads/${leadId}/visita-resultado`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setVisita(d))
      .catch(() => {});
  }, [leadId]);

  if (!visita || visita.estado === "sin_visita" || visita.estado === "agendada") return null;

  const marcar = async (llego: boolean) => {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch(`/api/leads/${leadId}/visita-resultado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llego }),
      });
      const d = await r.json();
      if (r.ok) setVisita(d);
      else setError(d.error || "No se pudo guardar");
    } catch {
      setError("No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const cuando = visita.fecha
    ? new Date(visita.fecha).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";
  const marcada = visita.estado === "llego" || visita.estado === "no_llego";
  const titulo =
    visita.estado === "llego"
      ? "Llegó a la visita"
      : visita.estado === "no_llego"
        ? "No llegó a la visita"
        : "¿Llegó a la visita?";

  return (
    <div className="px-4 mb-6">
      <div
        className={clsx(
          "rounded-2xl p-4 border shadow-sm",
          visita.estado === "llego" ? "bg-emerald-50 border-emerald-200" : visita.estado === "no_llego" ? "bg-slate-50 border-slate-200" : "bg-white border-amber-200"
        )}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <MapPin size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 leading-tight">{titulo}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {[visita.proyecto, cuando].filter(Boolean).join(" · ")}
              {!marcada ? " · Sin esta marca la IA de Cierre no le hace seguimiento." : ""}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => marcar(true)}
            disabled={guardando || visita.estado === "llego"}
            className={clsx(
              "py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60",
              visita.estado === "llego" ? "bg-emerald-500 text-white" : "bg-white border border-emerald-300 text-emerald-700"
            )}
          >
            <CheckCircle2 size={16} /> Llegó
          </button>
          <button
            onClick={() => marcar(false)}
            disabled={guardando || visita.estado === "no_llego"}
            className={clsx(
              "py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60",
              visita.estado === "no_llego" ? "bg-slate-600 text-white" : "bg-white border border-slate-300 text-slate-700"
            )}
          >
            <XCircle size={16} /> No llegó
          </button>
        </div>
        {error && <p className="text-[11px] text-red-600 mt-2">{error}</p>}
      </div>
    </div>
  );
}
