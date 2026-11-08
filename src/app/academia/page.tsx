"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, GraduationCap, Play, CheckCircle2, X, ChevronRight, Clock } from "lucide-react";
import { MODULOS_ACADEMIA, CAPSULAS, type Capsula } from "@/lib/academia";

/** Las cápsulas vistas se recuerdan solo en este teléfono: es una ayuda, no un registro. */
const CLAVE_VISTAS = "academia:vistas";
const archivo = (slug: string, ext: "mp4" | "jpg") => `/api/academia/${slug}.${ext}`;

function leerVistas(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_VISTAS) || "[]");
  } catch {
    return [];
  }
}

export default function AcademiaPage() {
  const router = useRouter();
  const { status } = useSession();
  const [vistas, setVistas] = useState<string[]>([]);
  const [abierta, setAbierta] = useState<Capsula | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => setVistas(leerVistas()), []);

  // Mientras el video está abierto, la página de atrás no se desplaza.
  useEffect(() => {
    if (!abierta) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [abierta]);

  const marcarVista = (slug: string) => {
    setVistas((prev) => {
      if (prev.includes(slug)) return prev;
      const nuevas = [...prev, slug];
      try {
        localStorage.setItem(CLAVE_VISTAS, JSON.stringify(nuevas));
      } catch {}
      return nuevas;
    });
  };

  // Cuenta como vista al pasar el 85% del video, no hace falta llegar al final.
  const alAvanzar = () => {
    const v = videoRef.current;
    if (abierta && v && v.duration && v.currentTime / v.duration >= 0.85) marcarVista(abierta.slug);
  };

  const indice = abierta ? CAPSULAS.findIndex((c) => c.slug === abierta.slug) : -1;
  const siguiente = indice >= 0 ? CAPSULAS[indice + 1] : undefined;
  const totalVistas = CAPSULAS.filter((c) => vistas.includes(c.slug)).length;

  return (
    <div className="min-h-screen bg-[#F5F7F9]">
      <header className="bg-white px-6 pt-8 pb-5 border-b border-slate-100 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            aria-label="Volver a Mis Leads"
            className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 active:scale-95 transition-all shrink-0"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-primary tracking-tight flex items-center gap-2">
              <GraduationCap size={24} strokeWidth={2.5} />
              Academia
            </h1>
            <p className="text-[11px] font-bold text-slate-400 mt-0.5">Cápsulas cortas para sacarle el jugo al CRM móvil</p>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
            <span>Tu avance</span>
            <span className="text-primary">
              {totalVistas} de {CAPSULAS.length} vistas
            </span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${(totalVistas / CAPSULAS.length) * 100}%` }}
            />
          </div>
        </div>
      </header>

      <div className="px-4 py-5 space-y-7">
        {MODULOS_ACADEMIA.map((modulo) => (
          <section key={modulo.titulo}>
            <h2 className="text-sm font-black text-slate-800 px-1">{modulo.titulo}</h2>
            <p className="text-[11px] text-slate-500 px-1 mt-0.5 mb-3">{modulo.descripcion}</p>
            <div className="space-y-3">
              {modulo.capsulas.map((c) => {
                const vista = vistas.includes(c.slug);
                const numero = CAPSULAS.findIndex((x) => x.slug === c.slug) + 1;
                return (
                  <button
                    key={c.slug}
                    onClick={() => setAbierta(c)}
                    className="w-full flex gap-3 bg-white rounded-2xl p-2.5 pr-3 border border-slate-100 shadow-sm text-left active:scale-[0.98] transition-all"
                  >
                    <div className="relative w-[72px] h-[104px] shrink-0 rounded-xl overflow-hidden bg-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={archivo(c.slug, "jpg")} alt="" loading="lazy" className="w-full h-full object-cover object-top" />
                      <div className="absolute inset-0 bg-slate-900/25 flex items-center justify-center">
                        <span className="w-8 h-8 rounded-full bg-white/95 flex items-center justify-center shadow">
                          <Play size={14} className="text-primary ml-0.5" fill="currentColor" />
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 py-1 flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-primary uppercase tracking-widest">Cápsula {numero}</span>
                        {vista && (
                          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                            <CheckCircle2 size={10} /> Vista
                          </span>
                        )}
                      </div>
                      <h3 className="text-[13px] font-black text-slate-800 leading-snug mt-1">{c.titulo}</h3>
                      <p className="text-[11px] text-slate-500 leading-snug mt-1 line-clamp-2">{c.descripcion}</p>
                      <span className="mt-auto pt-1 flex items-center gap-1 text-[10px] font-bold text-slate-400">
                        <Clock size={11} /> {c.duracion} min
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {abierta && (
        <div className="fixed inset-0 bg-slate-950 flex flex-col" style={{ zIndex: 100000 }} role="dialog" aria-modal="true">
          <div className="flex items-center justify-between gap-3 px-4 pt-6 pb-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Cápsula {indice + 1}</p>
              <h3 className="text-sm font-black text-white truncate">{abierta.titulo}</h3>
            </div>
            <button
              onClick={() => setAbierta(null)}
              aria-label="Cerrar video"
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0 active:scale-95"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 min-h-0 flex items-center justify-center px-2">
            <video
              key={abierta.slug}
              ref={videoRef}
              src={archivo(abierta.slug, "mp4")}
              poster={archivo(abierta.slug, "jpg")}
              controls
              autoPlay
              playsInline
              preload="metadata"
              onTimeUpdate={alAvanzar}
              onEnded={() => marcarVista(abierta.slug)}
              className="max-h-full max-w-full rounded-xl bg-black"
            />
          </div>

          <div className="px-4 pt-3 pb-8">
            {siguiente ? (
              <button
                onClick={() => setAbierta(siguiente)}
                className="w-full flex items-center justify-between gap-3 bg-white/10 rounded-2xl px-4 py-3 text-left active:scale-[0.98] transition-all"
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Siguiente cápsula</p>
                  <p className="text-[13px] font-bold text-white truncate">{siguiente.titulo}</p>
                </div>
                <ChevronRight size={18} className="text-white shrink-0" />
              </button>
            ) : (
              <button
                onClick={() => setAbierta(null)}
                className="w-full rounded-2xl px-4 py-3 text-[13px] font-black bg-primary text-white active:scale-[0.98] transition-all"
              >
                Terminaste las cápsulas · Volver a la Academia
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
