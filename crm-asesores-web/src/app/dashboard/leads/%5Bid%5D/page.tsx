"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useParams } from "next/navigation";
import { 
  ChevronLeft, Phone, MessageSquare, Mail, 
  MapPin, User, ChevronRight,
  MoreVertical, Edit2, CheckCircle2, AlertCircle,
  StickyNote, LayoutGrid, Globe, Compass, Target, Layers,
  Meh, Smile, Laugh
} from "lucide-react";
import clsx from "clsx";
import Image from "next/image";

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  status: string;
  source: string;
  notes: string;
  visited: boolean;
  interests: string;
  city?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  rating?: string;
  createdAt: string;
  assignedTo?: {
    name: string;
    image?: string;
  };
}

function LeadDetailContent() {
  const { id } = useParams();
  const router = useRouter();
  
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    async function fetchLead() {
      try {
        const res = await fetch(`/api/leads/${id}`);
        if (res.ok) {
          const data = await res.json();
          setLead(data);
        } else {
          setError("No se pudo encontrar la información del lead.");
        }
      } catch (err) {
        setError("Error al conectar con el servidor.");
      } finally {
        setLoading(false);
      }
    }
    if (id) fetchLead();
  }, [id]);

  const handleStatusUpdate = async (newStatus: string) => {
    if (!lead || isUpdating) return;
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setLead({ ...lead, status: newStatus });
      }
    } catch (err) {
      console.error("Error updating status");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRatingUpdate = async (newRating: string) => {
    if (!lead || isUpdating) return;
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: newRating }),
      });
      if (res.ok) {
        setLead({ ...lead, rating: newRating });
      }
    } catch (err) {
      console.error("Error updating rating");
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleVisited = async () => {
    if (!lead || isUpdating) return;
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visited: !lead.visited }),
      });
      if (res.ok) {
        setLead({ ...lead, visited: !lead.visited });
      }
    } catch (err) {
      console.error("Error updating visited status");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleNoteUpdate = async (note: string) => {
    if (!lead) return;
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: note }),
      });
      if (res.ok) {
        setLead({ ...lead, notes: note });
      }
    } catch (err) {
      console.error("Error updating notes");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle size={48} className="text-red-500 mb-4" />
        <h2 className="text-xl font-black text-slate-800 mb-2">¡Ups!</h2>
        <p className="text-slate-500 text-sm mb-6">{error || "Algo salió mal"}</p>
        <button 
          onClick={() => router.back()}
          className="bg-primary text-white font-bold py-3 px-8 rounded-2xl shadow-lg shadow-primary/20"
        >
          Volver al Dashboard
        </button>
      </div>
    );
  }

  const getStatusColor = (status: string, rating?: string) => {
    const currentStatus = rating || status;
    if (['VENTA', 'MUY INTERESADO', 'HOT'].includes(currentStatus)) return '#22C55E';
    if (['INTERESADO', 'INTERES', 'WARM'].includes(currentStatus)) return '#FB923C';
    return '#94A3B8';
  };

  const getStatusLabel = (status: string, rating?: string) => {
    const currentStatus = rating || status;
    if (['VENTA', 'MUY INTERESADO', 'HOT'].includes(currentStatus)) return 'VENTA';
    if (['INTERESADO', 'INTERES', 'WARM'].includes(currentStatus)) return 'INTERESADO';
    return 'FRIO';
  };

  return (
    <div className="min-h-screen bg-[#F5F7F9] flex flex-col pb-24">
      {/* Header */}
      <header className="bg-white px-6 pt-12 pb-6 border-b border-slate-100 sticky top-0 z-30 flex items-center justify-between">
        <button 
          onClick={() => router.back()}
          className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 active:scale-90 transition-all"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-sm font-black text-slate-800 uppercase tracking-widest">Ficha del Lead</h1>
        <button className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400">
          <MoreVertical size={20} />
        </button>
      </header>

      {/* Profile Section */}
      <div className="bg-white px-6 py-8 flex flex-col items-center text-center">
        <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-4 relative overflow-hidden ring-4 ring-primary/5">
          {lead.assignedTo?.image ? (
            <Image src={lead.assignedTo.image} alt="User" fill className="object-cover" />
          ) : (
            <div className="text-3xl font-black text-primary uppercase">
              {lead.firstName?.[0] || 'L'}{lead.lastName?.[0] || ''}
            </div>
          )}
        </div>
        <h2 className="text-2xl font-black text-slate-800 mb-1 uppercase italic">
          {lead.firstName} {lead.lastName}
        </h2>
        <div className="flex items-center gap-2 mb-4">
          <span 
            className="w-2.5 h-2.5 rounded-full animate-pulse" 
            style={{ backgroundColor: getStatusColor(lead.status, lead.rating) }} 
          />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {getStatusLabel(lead.status, lead.rating)} • {lead.source || 'WEB'}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 w-full justify-center">
          <ActionButton 
            icon={Phone} 
            color="bg-primary" 
            label="Llamar" 
            href={`tel:${lead.phone}`}
          />
          <ActionButton 
            icon={MessageSquare} 
            color="bg-[#25D366]" 
            label="WhatsApp" 
            href={`https://wa.me/${lead.phone?.replace('+', '')}`}
          />
          <ActionButton 
            icon={Mail} 
            color="bg-[#EA4335]" 
            label="Email" 
            href={`mailto:${lead.email}`}
          />
        </div>
      </div>

      {/* Info Sections */}
      <div className="px-6 py-6 space-y-6">
        {/* Contact info card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col gap-6">
          <InfoRow icon={User} label="Nombre Completo" value={`${lead.firstName} ${lead.lastName}`} />
          <InfoRow icon={Phone} label="Teléfono" value={lead.phone || 'No registrado'} />
          <InfoRow icon={Mail} label="Correo Electrónico" value={lead.email || 'No registrado'} />
          {lead.city && (
             <InfoRow icon={MapPin} label="Ciudad" value={lead.city} />
          )}
          <InfoRow icon={Globe} label="Proyecto de Interés" value={lead.source || 'General'} />
          <InfoRow 
            icon={CheckCircle2} 
            label="Estado" 
            value={getStatusLabel(lead.status, lead.rating)} 
            badge 
            badgeColor={getStatusColor(lead.status, lead.rating)} 
          />
        </div>

        {/* UTM Parameters Card (Only if they exist) */}
        {(lead.utmSource || lead.utmMedium || lead.utmCampaign) && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <Compass size={14} /> Atribución Marketing
            </h3>
            <div className="grid grid-cols-1 gap-4">
              {lead.utmSource && <UTMRow icon={Target} label="Source" value={lead.utmSource} />}
              {lead.utmMedium && <UTMRow icon={Layers} label="Medium" value={lead.utmMedium} />}
              {lead.utmCampaign && <UTMRow icon={Layers} label="Campaign" value={lead.utmCampaign} />}
              {lead.utmContent && <UTMRow icon={StickyNote} label="Content" value={lead.utmContent} />}
            </div>
          </div>
        )}

        {/* Notes Section */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <StickyNote size={14} /> Notas del Asesor
            </h3>
            <button className="text-primary font-black text-[10px] uppercase">Editar</button>
          </div>
          <textarea 
            className="w-full bg-slate-50 rounded-2xl p-4 text-xs font-medium text-slate-600 outline-none border-none h-32 resize-none"
            placeholder="Escribe tus observaciones aquí..."
            defaultValue={lead.notes}
            onBlur={(e) => handleNoteUpdate(e.target.value)}
          />
        </div>

        {/* Rating Section (Emoji picker) */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
             Calificar Interés
          </h3>
          <div className="flex justify-around items-center gap-4">
            <button 
              onClick={() => handleRatingUpdate('FRIO')}
              className={clsx(
                "flex flex-col items-center gap-2 transition-all p-3 rounded-2xl",
                lead.rating === 'FRIO' ? "bg-slate-50 scale-110" : "opacity-40"
              )}
            >
              <Meh size={32} className="text-[#94A3B8]" />
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">FRIO</span>
            </button>
            <button 
              onClick={() => handleRatingUpdate('INTERESADO')}
              className={clsx(
                "flex flex-col items-center gap-2 transition-all p-3 rounded-2xl",
                lead.rating === 'INTERESADO' ? "bg-orange-50 scale-110" : "opacity-40"
              )}
            >
              <Smile size={32} className="text-[#FB923C]" />
              <span className="text-[9px] font-black text-orange-600 uppercase tracking-widest">INTERESADO</span>
            </button>
            <button 
              onClick={() => handleRatingUpdate('VENTA')}
              className={clsx(
                "flex flex-col items-center gap-2 transition-all p-3 rounded-2xl",
                lead.rating === 'VENTA' ? "bg-green-50 scale-110" : "opacity-40"
              )}
            >
              <Laugh size={32} className="text-[#22C55E]" />
              <span className="text-[9px] font-black text-green-600 uppercase tracking-widest">VENTA</span>
            </button>
          </div>
        </div>

        {/* Visit Toggle */}
        <button 
          onClick={toggleVisited}
          disabled={isUpdating}
          className={clsx(
            "w-full py-5 rounded-3xl font-black flex items-center justify-center gap-3 transition-all",
            lead.visited 
              ? "bg-slate-100 text-slate-400" 
              : "bg-primary text-white shadow-xl shadow-primary/20 scale-100 active:scale-95"
          )}
        >
          {lead.visited ? <CheckCircle2 size={20} /> : <LayoutGrid size={20} />}
          {lead.visited ? "VISITA COMPLETADA" : "REGISTRAR VISITA A TERRENO"}
        </button>
      </div>

      {/* Bottom info */}
      <div className="text-center px-8 text-[9px] font-bold text-slate-300 uppercase tracking-widest">
        Ingresado el {new Date(lead.createdAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, color, label, href }: any) {
  return (
    <a 
      href={href}
      className="flex flex-col items-center gap-2 group"
      target="_blank"
      rel="noopener noreferrer"
    >
      <div className={clsx(
        "w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg active:scale-90 transition-all",
        color
      )}>
        <Icon size={20} />
      </div>
      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
    </a>
  );
}

function InfoRow({ icon: Icon, label, value, badge, badgeColor }: any) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
        <Icon size={18} />
      </div>
      <div className="flex flex-col">
        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">{label}</span>
        {badge ? (
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full" style={{ backgroundColor: badgeColor }} />
             <span className="text-xs font-black text-slate-800 uppercase italic">{value}</span>
           </div>
        ) : (
          <span className="text-xs font-black text-slate-800 uppercase italic">{value}</span>
        )}
      </div>
    </div>
  );
}

function UTMRow({ icon: Icon, label, value }: any) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
      <div className="flex items-center gap-3">
        <Icon size={12} className="text-primary/40" />
        <span className="text-[9px] font-bold text-slate-400 uppercase">{label}</span>
      </div>
      <span className="text-[10px] font-black text-slate-700 truncate max-w-[150px]">{value}</span>
    </div>
  );
}

export default function LeadDetailPage() {
  const { id } = useParams();
  
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    }>
      <LeadDetailContent />
    </Suspense>
  );
}
