"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Search,
  User,
  Phone,
  Mail,
  CreditCard,
  FileCheck,
  ArrowLeft,
  ChevronDown,
  Eye,
  Calendar,
  MapPin,
  Briefcase,
  Download,
  FileText,
  Image as ImageIcon,
  X,
  ExternalLink,
} from "lucide-react";
import clsx from "clsx";

interface CRMReservation {
  id: string;
  leadId: string;
  fullName: string;
  email: string;
  phone: string;
  rut: string;
  profession: string | null;
  civilStatus: string | null;
  nationality: string | null;
  street: string | null;
  streetNumber: string | null;
  region: string | null;
  commune: string | null;
  proofFileName: string | null;
  proofMimeType: string | null;
  createdAt: string;
  lead: {
    id: string;
    firstName: string;
    lastName: string;
    source: string;
    status: string;
    rating: string;
  };
  createdBy: {
    id: string;
    name: string;
  } | null;
}

export default function AdminCRMReservationsPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [reservations, setReservations] = useState<CRMReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedReservation, setSelectedReservation] =
    useState<CRMReservation | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/login");
    } else if (session && (session as any).user?.role !== "ADMIN") {
      router.push("/dashboard");
    }
  }, [session, authStatus, router]);

  const fetchReservations = useCallback(async () => {
    try {
      setLoading(true);
      let url = `/api/reservations?page=${page}&limit=15`;
      if (search) url += `&q=${encodeURIComponent(search)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Error al obtener reservaciones");
      const data = await res.json();
      setReservations(data.reservations);
      setTotalPages(data.pagination.pages);
      setTotal(data.pagination.total);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    if (session && (session as any).user?.role === "ADMIN") {
      const delay = setTimeout(() => fetchReservations(), 300);
      return () => clearTimeout(delay);
    }
  }, [session, fetchReservations]);

  // View proof
  const handleViewProof = async (reservation: CRMReservation) => {
    setSelectedReservation(reservation);
    setLoadingProof(true);
    setProofUrl(null);

    try {
      const res = await fetch(`/api/reservations/${reservation.id}/proof`);
      if (!res.ok) throw new Error("No se pudo cargar el comprobante");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setProofUrl(url);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingProof(false);
    }
  };

  const closeModal = () => {
    if (proofUrl) URL.revokeObjectURL(proofUrl);
    setProofUrl(null);
    setSelectedReservation(null);
  };

  if (authStatus === "loading" || (session && (session as any).user?.role !== "ADMIN")) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F5F7F9]">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-[480px] mx-auto min-h-screen bg-[#F5F7F9] pb-24">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-20">
        <div className="flex items-center gap-3 p-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary active:scale-95 transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-black text-slate-800 tracking-tight">
              Reservas CRM
            </h1>
            <p className="text-[10px] font-black text-primary uppercase tracking-widest">
              {total} Registros • Panel Admin
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center">
            <FileCheck size={24} className="text-green-600" />
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pb-4">
          <div className="relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              type="text"
              placeholder="Buscar por nombre, email o RUT..."
              className="w-full bg-slate-100 border-none rounded-2xl py-3 pl-11 pr-4 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>

      {/* Reservation List */}
      <div className="px-4 pt-4">
        {loading ? (
          <div className="flex flex-col items-center py-20 opacity-40">
            <Loader2 className="w-10 h-10 animate-spin mb-3" />
            <p className="text-[10px] font-black uppercase tracking-widest">
              Cargando reservaciones...
            </p>
          </div>
        ) : reservations.length === 0 ? (
          <div className="flex flex-col items-center py-20 opacity-40">
            <FileCheck size={48} className="mb-4" />
            <p className="text-sm font-bold">No hay reservaciones registradas</p>
            <p className="text-xs text-slate-400 mt-1">
              Las reservas aparecerán aquí cuando los asesores las registren
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reservations.map((res, idx) => (
              <div
                key={res.id}
                className="bg-white rounded-[28px] p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-50 relative overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                {/* Status Badge */}
                <div className="absolute top-0 right-0 px-5 py-1.5 rounded-bl-2xl bg-green-500 text-white text-[9px] font-black tracking-widest uppercase">
                  Reservado
                </div>

                <div className="space-y-3">
                  {/* Client Name & Lead */}
                  <div className="pr-20">
                    <h3 className="font-black text-slate-800 text-base leading-tight">
                      {res.fullName}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                      RUT: {res.rut}
                    </p>
                  </div>

                  {/* Contact Info */}
                  <div className="grid grid-cols-1 gap-1.5 border-y border-slate-50 py-3">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Phone size={12} className="text-slate-400" />
                      <span className="text-xs font-bold">{res.phone}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <Mail size={12} className="text-slate-400" />
                      <span className="text-xs font-bold truncate lowercase">
                        {res.email}
                      </span>
                    </div>
                    {res.profession && (
                      <div className="flex items-center gap-2 text-slate-500">
                        <Briefcase size={12} className="text-slate-400" />
                        <span className="text-xs font-bold">
                          {res.profession}
                        </span>
                      </div>
                    )}
                    {res.commune && res.region && (
                      <div className="flex items-center gap-2 text-slate-500">
                        <MapPin size={12} className="text-slate-400" />
                        <span className="text-xs font-bold">
                          {res.commune}, {res.region}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-2">
                    {/* Advisor Badge */}
                    <div className="px-2.5 py-1 rounded-xl bg-blue-50 text-blue-600 text-[9px] font-black tracking-wider flex items-center gap-1">
                      <User size={10} strokeWidth={3} />
                      {res.createdBy?.name || "Sin asesor"}
                    </div>

                    {/* Source Badge */}
                    <div className="px-2.5 py-1 rounded-xl bg-primary/5 text-primary text-[9px] font-black tracking-wider uppercase">
                      {res.lead?.source || "CRM"}
                    </div>

                    {/* Date Badge */}
                    <div className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-500 text-[9px] font-black tracking-wider flex items-center gap-1">
                      <Calendar size={10} />
                      {new Date(res.createdAt).toLocaleDateString("es-CL", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>

                    {/* Proof Badge */}
                    {res.proofFileName && (
                      <button
                        onClick={() => handleViewProof(res)}
                        className="px-2.5 py-1 rounded-xl bg-green-50 text-green-600 text-[9px] font-black tracking-wider flex items-center gap-1 active:scale-95 transition-all"
                      >
                        <Eye size={10} />
                        Ver Comprobante
                      </button>
                    )}
                  </div>

                  {/* Link to Lead */}
                  <button
                    onClick={() =>
                      router.push(`/dashboard/leads/${res.leadId}`)
                    }
                    className="w-full bg-slate-50 rounded-xl py-2.5 flex items-center justify-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest active:scale-[0.98] transition-all hover:bg-slate-100"
                  >
                    <ExternalLink size={12} />
                    Ver Lead: {res.lead?.firstName} {res.lead?.lastName}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className={clsx(
                "px-4 py-2 rounded-xl text-xs font-black transition-all",
                page === 1
                  ? "bg-slate-100 text-slate-300"
                  : "bg-primary/10 text-primary active:scale-95"
              )}
            >
              Anterior
            </button>
            <span className="text-xs font-black text-slate-400">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className={clsx(
                "px-4 py-2 rounded-xl text-xs font-black transition-all",
                page === totalPages
                  ? "bg-slate-100 text-slate-300"
                  : "bg-primary/10 text-primary active:scale-95"
              )}
            >
              Siguiente
            </button>
          </div>
        )}
      </div>

      {/* ===== PROOF VIEWER MODAL ===== */}
      {selectedReservation && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-300">
          <div className="relative w-full max-w-lg bg-slate-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 flex justify-between items-start border-b border-white/10">
              <div>
                <p className="text-white/60 text-[10px] font-black uppercase tracking-widest">
                  Comprobante de Reserva
                </p>
                <h3 className="text-white text-sm font-bold mt-1">
                  {selectedReservation.fullName}
                </h3>
                <p className="text-white/40 text-[10px] font-bold mt-0.5">
                  {selectedReservation.proofFileName}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-black/50">
              {loadingProof ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-white animate-spin" />
                  <p className="text-white/50 text-xs font-bold">
                    Cargando comprobante...
                  </p>
                </div>
              ) : proofUrl ? (
                selectedReservation.proofMimeType === "application/pdf" ? (
                  <div className="w-full flex flex-col items-center gap-4 p-6">
                    <FileText size={64} className="text-red-400" />
                    <p className="text-white/70 text-sm font-bold text-center">
                      Documento PDF
                    </p>
                    <a
                      href={proofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all"
                    >
                      <Download size={16} />
                      Abrir PDF
                    </a>
                  </div>
                ) : (
                  <img
                    src={proofUrl}
                    alt="Comprobante"
                    className="max-w-full max-h-[60vh] object-contain rounded-xl"
                  />
                )
              ) : (
                <p className="text-white/40 text-sm">
                  No se pudo cargar el comprobante
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 flex gap-2">
              {proofUrl && (
                <a
                  href={proofUrl}
                  download={selectedReservation.proofFileName || "comprobante"}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white/70 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                >
                  <Download size={14} />
                  Descargar
                </a>
              )}
              <button
                onClick={() =>
                  router.push(`/dashboard/leads/${selectedReservation.leadId}`)
                }
                className="flex-1 bg-primary/20 hover:bg-primary/30 text-primary py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
              >
                <ExternalLink size={14} />
                Ver Lead
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
