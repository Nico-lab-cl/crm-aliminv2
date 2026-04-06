"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { 
  Loader2, 
  Search, 
  MapPin, 
  User, 
  Phone, 
  Mail, 
  ExternalLink, 
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter
} from "lucide-react";
import clsx from "clsx";

interface Reservation {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  pipeline_stage: string;
  lot: string;
  advisor: string;
  source: string;
  utm_medium?: string;
  utm_campaign?: string;
  created_at: string;
  hasLeadMatch: boolean;
  matchedAd?: {
    platform: string;
    adName: string;
    campaign: string;
  } | null;
}

export default function ReservationsPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("TODOS");

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/auth/signin");
    } else if (session && (session as any).user?.role !== "ADMIN") {
      router.push("/dashboard");
    } else if (session) {
      fetchReservations();
    }
  }, [session, authStatus, router]);

  const fetchReservations = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/reservations");
      if (!res.ok) throw new Error("Error al obtener reservaciones");
      const data = await res.json();
      setReservations(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredReservations = reservations.filter(res => {
    const matchesSearch = 
      res.name.toLowerCase().includes(search.toLowerCase()) ||
      res.email.toLowerCase().includes(search.toLowerCase()) ||
      res.lot.toLowerCase().includes(search.toLowerCase());
    
    if (filterStatus === "TODOS") return matchesSearch;
    if (filterStatus === "PAID") return matchesSearch && res.status === "paid";
    if (filterStatus === "PENDING") return matchesSearch && res.status !== "paid";
    if (filterStatus === "UNASSIGNED") return matchesSearch && res.advisor === "Sin Asignar";
    
    return matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-slate-500 font-medium animate-pulse">Sincronizando con Lomas del Mar...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[480px] mx-auto px-4 pb-24 pt-4 min-h-screen bg-[#F5F7F9]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Reservaciones</h1>
          <p className="text-xs font-bold text-primary/70 uppercase tracking-widest">Lomas del Mar • Panel Admin</p>
        </div>
        <div className="bg-primary/10 p-2 rounded-xl">
          <TrendingUp className="text-primary w-6 h-6" />
        </div>
      </div>

      {/* Search and Filters */}
      <div className="space-y-3 mb-6">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nombre, email o lote..."
            className="w-full bg-white border-none rounded-2xl py-4 pl-12 pr-4 shadow-sm focus:ring-2 focus:ring-primary/20 text-slate-700 font-medium transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar scroll-smooth">
          {["TODOS", "PAID", "PENDING", "UNASSIGNED"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={clsx(
                "px-4 py-2 rounded-full text-xs font-black tracking-wider whitespace-nowrap transition-all border-2",
                filterStatus === s 
                  ? "bg-slate-800 border-slate-800 text-white shadow-lg scale-105" 
                  : "bg-white border-slate-100 text-slate-400"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="bg-red-50 border-2 border-red-100 rounded-3xl p-6 text-center space-y-3">
          <AlertCircle className="mx-auto text-red-500 w-10 h-10" />
          <p className="text-red-700 font-bold">{error}</p>
          <button 
            onClick={fetchReservations}
            className="bg-red-500 text-white px-6 py-2 rounded-xl font-bold text-sm shadow-lg shadow-red-200"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReservations.length === 0 ? (
            <div className="text-center py-20 opacity-40">
              <Clock className="mx-auto w-12 h-12 mb-3" />
              <p className="font-bold">No hay reservaciones que mostrar</p>
            </div>
          ) : (
            filteredReservations.map((res) => (
              <div 
                key={res.id}
                className="bg-white rounded-[32px] p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-50 relative overflow-hidden"
              >
                {/* Status Indicator */}
                <div className={clsx(
                  "absolute top-0 right-0 px-6 py-1.5 rounded-bl-3xl text-[10px] font-black tracking-widest uppercase",
                  res.status === 'paid' ? "bg-green-500 text-white" : "bg-amber-500 text-white"
                )}>
                  {res.status === 'paid' ? 'Pagada' : 'Pendiente'}
                </div>

                <div className="space-y-4">
                  <div className="flex items-start justify-between pr-12">
                    <div>
                      <h3 className="font-black text-slate-800 text-lg leading-tight uppercase">{res.name}</h3>
                      <div className="flex items-center gap-1.5 text-primary font-bold text-sm mt-1">
                        <MapPin size={14} strokeWidth={3} />
                        <span>{res.lot}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 border-y border-slate-50 py-4">
                    <div className="flex items-center gap-3 text-slate-500">
                      <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400">
                        <Phone size={16} />
                      </div>
                      <span className="text-sm font-bold">{res.phone}</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-500">
                      <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400">
                        <Mail size={16} />
                      </div>
                      <span className="text-sm font-bold truncate max-w-[240px] lowercase">{res.email}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {/* Stage Badge */}
                    <div className="px-3 py-1.5 bg-slate-100 rounded-xl text-[10px] font-black text-slate-600 tracking-wider">
                      {res.pipeline_stage.replace(/_/g, ' ')}
                    </div>
                    
                    {/* Advisor Badge */}
                    <div className={clsx(
                      "px-3 py-1.5 rounded-xl text-[10px] font-black tracking-wider flex items-center gap-1.5",
                      res.advisor === "Sin Asignar" ? "bg-red-50 text-red-500" : "bg-blue-50 text-blue-600"
                    )}>
                      <User size={12} strokeWidth={3} />
                      {res.advisor.toUpperCase()}
                    </div>

                    {/* Source Badge */}
                    <div className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black tracking-wider uppercase">
                      {res.source}
                    </div>
                  </div>

                  {/* Ad Match Section */}
                  {res.hasLeadMatch && (
                    <div className="mt-2 bg-gradient-to-r from-primary/5 to-transparent border-l-4 border-primary p-4 rounded-r-2xl">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="text-primary" size={16} strokeWidth={3} />
                        <span className="text-xs font-black text-primary tracking-widest uppercase">Lead Vinculado</span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-bold text-slate-700">
                          <span className="text-slate-400 uppercase mr-1">Plataforma:</span> 
                          {res.matchedAd?.platform}
                        </p>
                        <p className="text-[11px] font-bold text-slate-700">
                          <span className="text-slate-400 uppercase mr-1">Anuncio:</span> 
                          {res.matchedAd?.adName}
                        </p>
                        <p className="text-[11px] font-bold text-slate-700">
                          <span className="text-slate-400 uppercase mr-1">Campaña:</span> 
                          {res.matchedAd?.campaign}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
