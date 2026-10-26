"use client";

import { useState } from "react";
import clsx from "clsx";
import { X, Phone, ArrowRightLeft } from "lucide-react";
import {
  ETAPAS,
  ETAPAS_CERRADAS,
  ESTADOS_CLIENTE,
  MOTIVOS_PERDIDA,
  PROXIMAS_ACCIONES,
  RESULTADOS,
  TIPOS_SEGUIMIENTO,
  canonico,
  columnaDe,
} from "@/lib/pipelineEtapas";

export type Modo = "contacto" | "etapa";

type Props = {
  lead: { id: string; nombre: string; status: string };
  modoInicial?: Modo;
  tipoInicial?: string;
  onClose: () => void;
  onGuardado: (lead: any) => void;
};

/** Fechas rápidas para la próxima acción, en la hora del celular (Chile). */
function fechaRapida(dias: number, hora: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  d.setHours(hora, 0, 0, 0);
  return d;
}
const RAPIDAS = [
  { nombre: "Hoy", fecha: () => { const d = new Date(); d.setHours(d.getHours() + 2, 0, 0, 0); return d; } },
  { nombre: "Mañana", fecha: () => fechaRapida(1, 10) },
  { nombre: "En 3 días", fecha: () => fechaRapida(3, 10) },
  { nombre: "En 1 semana", fecha: () => fechaRapida(7, 10) },
];

/** Valor para <input type="datetime-local"> en hora local. */
const aInputLocal = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function GestionLead({ lead, modoInicial = "contacto", tipoInicial = "LLAMADA", onClose, onGuardado }: Props) {
  const esCliente = ESTADOS_CLIENTE.includes(canonico(lead.status));
  const [modo, setModo] = useState<Modo>(esCliente ? "contacto" : modoInicial);
  const [tipo, setTipo] = useState(tipoInicial);
  const [resultado, setResultado] = useState("");
  const [nota, setNota] = useState("");
  const [etapa, setEtapa] = useState(() => {
    const actual = columnaDe(lead.status);
    const i = ETAPAS.findIndex((e) => e.id === actual);
    return ETAPAS[Math.min(i + 1, ETAPAS.length - 2)].id;
  });
  const [motivoPerdida, setMotivoPerdida] = useState("");
  const [proximaAccion, setProximaAccion] = useState("");
  const [proximaFecha, setProximaFecha] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const etapaCerrada = ETAPAS_CERRADAS.includes(etapa);
  const pideProxima = modo === "contacto" || !etapaCerrada;

  const guardar = async () => {
    setError("");
    const proximaAccionAt = proximaFecha ? new Date(proximaFecha).toISOString() : null;
    const [url, body] =
      modo === "contacto"
        ? [`/api/leads/${lead.id}/seguimientos`, { tipo, resultado, nota, proximaAccion, proximaAccionAt }]
        : [`/api/leads/${lead.id}/etapa`, { etapa, comentario: nota, motivoPerdida, proximaAccion, proximaAccionAt }];

    setGuardando(true);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(datos.error || "No se pudo guardar");
      onGuardado(datos);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const chip = (activo: boolean) =>
    clsx(
      "px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all active:scale-95",
      activo ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200"
    );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center" style={{ zIndex: 100000 }} onClick={onClose}>
      <div
        className="w-full max-w-[480px] bg-white rounded-t-3xl max-h-[92vh] overflow-y-auto pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-5 pt-4 pb-3 border-b border-slate-100 z-10">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Gestionar lead</p>
              <h3 className="text-base font-black text-slate-800 truncate">{lead.nombre}</h3>
            </div>
            <button onClick={onClose} className="p-2 -mr-2 text-slate-400"><X size={20} /></button>
          </div>
          {!esCliente && (
            <div className="grid grid-cols-2 gap-1 mt-3 bg-slate-100 rounded-xl p-1">
              {([["contacto", "Registrar contacto", Phone], ["etapa", "Cambiar etapa", ArrowRightLeft]] as const).map(([m, nombre, Icono]) => (
                <button
                  key={m}
                  onClick={() => setModo(m)}
                  className={clsx(
                    "flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-black",
                    modo === m ? "bg-white text-primary shadow-sm" : "text-slate-500"
                  )}
                >
                  <Icono size={13} /> {nombre}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 pt-4 space-y-5">
          {modo === "contacto" ? (
            <>
              <Campo titulo="¿Cómo fue el contacto?">
                <div className="flex flex-wrap gap-2">
                  {TIPOS_SEGUIMIENTO.map((t) => (
                    <button key={t.id} onClick={() => setTipo(t.id)} className={chip(tipo === t.id)}>{t.nombre}</button>
                  ))}
                </div>
              </Campo>
              <Campo titulo="Resultado">
                <div className="flex flex-wrap gap-2">
                  {RESULTADOS.map((r) => (
                    <button key={r} onClick={() => setResultado(resultado === r ? "" : r)} className={chip(resultado === r)}>{r}</button>
                  ))}
                </div>
              </Campo>
            </>
          ) : (
            <>
              <Campo titulo="Nueva etapa">
                <div className="flex flex-wrap gap-2">
                  {ETAPAS.map((e) => (
                    <button
                      key={e.id}
                      disabled={e.id === canonico(lead.status)}
                      onClick={() => setEtapa(e.id)}
                      className={clsx(chip(etapa === e.id), e.id === canonico(lead.status) && "opacity-40")}
                    >
                      {e.nombre}
                    </button>
                  ))}
                </div>
              </Campo>
              {etapa === "PERDIDO" && (
                <Campo titulo="¿Por qué se perdió?">
                  <div className="flex flex-wrap gap-2">
                    {MOTIVOS_PERDIDA.map((m) => (
                      <button key={m} onClick={() => setMotivoPerdida(m)} className={chip(motivoPerdida === m)}>{m}</button>
                    ))}
                  </div>
                </Campo>
              )}
            </>
          )}

          <Campo titulo={modo === "contacto" ? "Nota" : "Comentario (opcional)"}>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={3}
              placeholder={modo === "contacto" ? "Qué conversaron, qué le interesa, objeciones…" : "Por qué cambia de etapa"}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Campo>

          {pideProxima && (
            <Campo titulo="Próxima acción (opcional)">
              <div className="flex flex-wrap gap-2">
                {PROXIMAS_ACCIONES.map((a) => (
                  <button key={a} onClick={() => setProximaAccion(proximaAccion === a ? "" : a)} className={chip(proximaAccion === a)}>{a}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {RAPIDAS.map((r) => {
                  const valor = aInputLocal(r.fecha());
                  return (
                    <button key={r.nombre} onClick={() => setProximaFecha(valor)} className={chip(proximaFecha === valor)}>{r.nombre}</button>
                  );
                })}
              </div>
              <input
                type="datetime-local"
                value={proximaFecha}
                onChange={(e) => setProximaFecha(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </Campo>
          )}

          {error && <p className="text-[12px] font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

          <button
            onClick={guardar}
            disabled={guardando}
            className="w-full py-3.5 rounded-2xl bg-primary text-white font-black text-sm shadow-lg active:scale-[0.98] disabled:opacity-60"
          >
            {guardando ? "Guardando…" : modo === "contacto" ? "Guardar contacto" : "Mover de etapa"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{titulo}</p>
      {children}
    </div>
  );
}
