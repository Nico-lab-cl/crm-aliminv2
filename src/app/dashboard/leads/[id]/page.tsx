"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { 
  ArrowLeft, MoreVertical, Phone, MessageSquare, 
  Mail, User as UserIcon, Smartphone, Map as MapIcon, 
  Edit3, Save, ChevronRight, Tent as Landscape,
  Meh, Smile, Laugh, Megaphone, ExternalLink, History,
  ChevronDown, UserCheck, PenTool, X
} from "lucide-react";
import { getAdVideoUrl } from "@/lib/adVideos";
import { getAdImages } from "@/lib/adImages";
import { useRouter } from "next/navigation";
import Image from "next/image";
import clsx from "clsx";

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  source: string;
  status: string;
  rating?: string;
  notes: string;
  interests: string;
  adId?: string;
  adName?: string;
  formId?: string;
  lastActivity?: string;
  assignedToId?: string;
  assignedTo?: { name: string; image?: string };
}

interface UserOption {
  id: string;
  name: string;
  role: string;
}

declare global {
  interface Window {
    AndroidBridge: {
      getFcmToken: () => string;
      sendEmail: (email: string) => void;
      openNotificationSettings: () => void;
    };
  }
}

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [updatingRating, setUpdatingRating] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [isAssignDropdownOpen, setIsAssignDropdownOpen] = useState(false);
  const [assigningLead, setAssigningLead] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isImagesModalOpen, setIsImagesModalOpen] = useState(false);

  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const videoUrl = getAdVideoUrl(lead?.adName);
  const adImages = getAdImages(lead?.adName);

  useEffect(() => {
    fetch(`/api/leads/${params.id}`)
      .then(res => res.json())
      .then(data => {
        setLead(data);
        setNote(data.notes || "");
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  // Fetch users for admin assignment
  useEffect(() => {
    if (isAdmin) {
      fetch("/api/users")
        .then(res => res.json())
        .then(data => setUsers(data))
        .catch(err => console.error("Failed to fetch users", err));
    }
  }, [isAdmin]);

  const handleAssignLead = async (userId: string) => {
    if (!lead || assigningLead) return;
    setAssigningLead(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId: userId }),
      });
      if (res.ok) {
        const user = users.find(u => u.id === userId);
        setLead({ ...lead, assignedToId: userId, assignedTo: user ? { name: user.name } : undefined });
      }
    } catch (error) {
      console.error("Error assigning lead:", error);
    } finally {
      setAssigningLead(false);
      setIsAssignDropdownOpen(false);
    }
  };

  const handleSaveNote = async () => {
    setSavingNote(true);
    try {
      const res = await fetch(`/api/leads/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: note }),
      });
      if (res.ok) {
        // Show success state if needed
      }
    } finally {
      setSavingNote(false);
    }
  };

  const handleRatingUpdate = async (newRating: string) => {
    if (!lead || updatingRating) return;
    setUpdatingRating(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: newRating }),
      });
      if (res.ok) {
        setLead({ ...lead, rating: newRating });
      }
    } catch (error) {
      console.error("Error updating rating:", error);
    } finally {
      setUpdatingRating(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  if (!lead) return <div>Lead not found</div>;

  const getStatusColor = (status: string, rating?: string) => {
    if (rating === "VENTA") return "bg-green-500 text-white shadow-green-100";
    if (rating === "INTERESADO") return "bg-orange-400 text-white shadow-orange-100";
    if (rating === "FRIO") return "bg-slate-400 text-white shadow-slate-100";
    
    switch (status) {
      case "NUEVO": return "bg-primary text-white shadow-primary/20";
      case "CONTACTADO": return "bg-blue-500 text-white shadow-blue-100";
      case "VISITA": return "bg-emerald-500 text-white shadow-emerald-100";
      default: return "bg-slate-400 text-white shadow-slate-100";
    }
  };

  const getStatusLabel = (status: string, rating?: string) => {
    if (rating === "VENTA") return "VENTA";
    if (rating === "INTERESADO") return "INTERESADO";
    if (rating === "FRIO") return "FRIO";
    return status === 'NUEVO' ? 'Nuevo Lead' : status;
  };

  const handleInteraction = async (type: "WHATSAPP" | "PHONE" | "EMAIL") => {
    if (!lead) return;

    const now = new Date();
    const timeStr = now.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }) + 
                  ' a las ' + 
                  now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    
    const activity = `${type === "WHATSAPP" ? "WhatsApp" : type === "PHONE" ? "Llamada" : "Correo"} el ${timeStr}`;

    // Update status to CONTACTADO if it was NUEVO
    const newStatus = lead.status === "NUEVO" ? "CONTACTADO" : lead.status;

    try {
      // Optimistic update
      setLead({ ...lead, status: newStatus });

      // Action first
      if (type === "WHATSAPP") {
        window.open(`https://wa.me/${lead.phone.replace(/\D/g,'')}`);
      } else if (type === "PHONE") {
        window.location.href = `tel:${lead.phone}`;
      } else {
        // Fallback Layer 1: Copy to Clipboard (Always do this first for safety)
        try {
          await navigator.clipboard.writeText(lead.email);
        } catch (e) {}

        // Fallback Layer 2: Web Share API (The most reliable native way on Android)
        if (typeof navigator !== 'undefined' && navigator.share) {
          try {
            await navigator.share({
              title: `Contactar a ${lead.firstName}`,
              text: `Correo del lead: ${lead.email}`,
              url: `mailto:${lead.email}`
            });
            return; // Success! Share menu opened.
          } catch (e) {
            console.log("Share failed or cancelled", e);
          }
        }
        
        // Fallback Layer 3: Direct Native Bridge (If they rebuilt the app)
        if (typeof window !== 'undefined' && window.AndroidBridge && typeof window.AndroidBridge.sendEmail === 'function') {
          window.AndroidBridge.sendEmail(lead.email);
          return;
        }

        // Fallback Layer 4: Last resort (Old school)
        window.location.href = `mailto:${lead.email}`;
      }

      // API call in background
      await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          status: newStatus,
          lastActivity: activity 
        }),
      });
    } catch (error) {
      console.error("Error tracking interaction:", error);
    }
  };

  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col bg-[#f6f8f8] overflow-x-hidden pb-24">
      {/* Header */}
      <div className="flex items-center bg-[#f6f8f8] p-4 border-b border-primary/10 justify-between sticky top-0 z-10">
        <button 
          onClick={() => router.back()}
          className="text-[#D4AF37] flex size-10 shrink-0 items-center justify-center rounded-full bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-slate-900 text-lg font-bold leading-tight tracking-tight flex-1 text-center">Detalle del Lead</h2>
        <div className="flex w-10 items-center justify-end">
          <button className="flex items-center justify-center rounded-full size-10 bg-transparent text-slate-900">
            <MoreVertical size={20} />
          </button>
        </div>
      </div>

      {/* Profile Section */}
      <div className="flex p-6">
        <div className="flex w-full flex-col gap-4 items-center">
          <div className="flex gap-4 flex-col items-center">
            <div className="relative w-32 h-32 rounded-full border-4 border-primary/20 shadow-lg overflow-hidden bg-white flex items-center justify-center">
              <UserIcon size={64} className="text-primary/20" />
            </div>
            <div className="flex flex-col items-center justify-center">
              <p className="text-slate-900 text-2xl font-bold leading-tight tracking-tight text-center">
                {lead.firstName} {lead.lastName}
              </p>
              <span className={clsx(
                "mt-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm",
                getStatusColor(lead.status, lead.rating)
              )}>
                {getStatusLabel(lead.status, lead.rating)}
              </span>
              <p className="text-slate-500 text-sm mt-2 font-medium text-center italic">
                {lead.source || "Sin origen definido"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Contact Actions */}
      <div className="grid grid-cols-1 gap-4 px-4 mb-6">
        <ContactButton 
          icon={Phone} 
          label="Llamar Ahora" 
          bgColor="bg-[#4CAF50]" 
          onClick={() => handleInteraction("PHONE")}
        />
        <ContactButton 
          icon={MessageSquare} 
          label="WhatsApp" 
          bgColor="bg-[#25D366]" 
          onClick={() => handleInteraction("WHATSAPP")}
        />
        <ContactButton 
          icon={Mail} 
          label="Enviar Correo" 
          bgColor="bg-[#D4AF37]" 
          onClick={() => handleInteraction("EMAIL")}
        />
      </div>

      {/* Interest Rating (Emojis) */}
      <div className="px-4 py-2 mb-4">
        <h3 className="text-slate-900 text-[10px] font-black uppercase tracking-widest px-1 pb-3 opacity-40">Nivel de Interés</h3>
        <div className="bg-white rounded-2xl p-4 border border-primary/5 shadow-sm flex justify-around items-center">
          {[
            { id: 'FRIO', icon: Meh, color: lead.rating === 'FRIO' ? 'text-slate-500 scale-125 bg-slate-100 shadow-md translate-y-[-2px]' : 'text-slate-400 bg-slate-50 opacity-60 hover:opacity-100', label: 'Frío' },
            { id: 'INTERESADO', icon: Smile, color: lead.rating === 'INTERESADO' ? 'text-orange-500 scale-125 bg-orange-100 shadow-md translate-y-[-2px]' : 'text-orange-300 bg-orange-50 opacity-60 hover:opacity-100', label: 'Interés' },
            { id: 'VENTA', icon: Laugh, color: lead.rating === 'VENTA' ? 'text-green-600 scale-125 bg-green-100 shadow-md translate-y-[-2px]' : 'text-green-300 bg-green-50 opacity-60 hover:opacity-100', label: 'Venta' }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => handleRatingUpdate(item.id)}
              disabled={updatingRating}
              className={clsx(
                "flex flex-col items-center gap-2 transition-all p-3 rounded-2xl min-w-[80px]",
                item.color
              )}
            >
              <item.icon size={32} strokeWidth={lead.rating === item.id ? 2.5 : 2} />
              <span className="text-[10px] font-black uppercase tracking-wider">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Form Information */}
      <div className="px-4 py-2">
        <h3 className="text-slate-900 text-[10px] font-black uppercase tracking-widest px-1 pb-3 opacity-40">Datos del Formulario</h3>
        <div className="bg-white rounded-2xl overflow-hidden border border-primary/5 shadow-sm">
          <InfoRow label="Nombre Completo" value={`${lead.firstName} ${lead.lastName}`} icon={UserIcon} />
          <InfoRow label="Teléfono" value={lead.phone} icon={Smartphone} />
          <InfoRow label="Correo Electrónico" value={lead.email} icon={Mail} />
          <InfoRow 
            label={lead.source?.toUpperCase() === "META" ? "Anuncio Meta" : "Proyecto de Interés"} 
            value={lead.source?.toUpperCase() === "META" ? (lead.adName || lead.adId || "General") : (lead.interests || "General")} 
            icon={Landscape} 
          />
          <InfoRow label="Última Interacción" value={lead.lastActivity || "Sin registros"} icon={History} border={false} />
          
          {(lead.adId || lead.adName) && (
            <div className="border-t border-primary/5 bg-slate-50/50 p-4 flex justify-between items-center group cursor-pointer hover:bg-slate-50 transition-colors"
                 onClick={() => {
                   if (adImages.length > 0) {
                     setIsImagesModalOpen(true);
                   } else if (videoUrl) {
                     setIsVideoModalOpen(true);
                   } else if (lead.adId) {
                     window.open(`https://www.facebook.com/ads/library/?id=${lead.adId}`);
                   }
                 }}>
              <div className="flex flex-col">
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Anuncio de Meta</p>
                <p className="text-slate-900 text-sm font-bold mt-0.5 truncate max-w-[200px]">
                  {lead.adName || `ID: ${lead.adId}`}
                </p>
              </div>
              <div className="flex items-center gap-2 text-primary font-black text-[10px] uppercase tracking-widest bg-primary/10 px-3 py-1.5 rounded-lg group-hover:bg-primary/20 transition-all">
                <Megaphone size={14} />
                <span>{adImages.length > 0 || !videoUrl ? "Ver Anuncio" : "Ver Video"}</span>
                {adImages.length > 0 ? <Landscape size={12} /> : videoUrl ? <Landscape size={12} /> : <ExternalLink size={12} />}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lead Owner / Assignment */}
      <div className="px-4 py-2 mb-2">
        <h3 className="text-slate-900 text-[10px] font-black uppercase tracking-widest px-1 pb-3 opacity-40">Propietario del Lead</h3>
        <div className="bg-white rounded-2xl overflow-hidden border border-primary/5 shadow-sm">
          {isAdmin ? (
            <div className="relative">
              <button
                onClick={() => setIsAssignDropdownOpen(!isAssignDropdownOpen)}
                className={clsx(
                  "w-full flex items-center justify-between p-4 transition-all",
                  isAssignDropdownOpen ? "bg-primary/5" : "hover:bg-slate-50"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    "w-10 h-10 rounded-full flex items-center justify-center border",
                    lead.assignedTo ? "bg-primary/10 border-primary/20" : "bg-red-50 border-red-200"
                  )}>
                    <UserCheck size={18} className={lead.assignedTo ? "text-primary" : "text-red-400"} />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                      {lead.assignedTo ? "Asignado a" : "Sin Asignar"}
                    </p>
                    <p className={clsx("text-sm font-bold mt-0.5", lead.assignedTo ? "text-slate-800" : "text-red-500")}>
                      {lead.assignedTo?.name || "Seleccionar asesor..."}
                    </p>
                  </div>
                </div>
                <ChevronDown size={18} className={clsx("text-slate-400 transition-transform", isAssignDropdownOpen && "rotate-180")} />
              </button>

              {isAssignDropdownOpen && (
                <div className="border-t border-primary/5 p-2 max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200">
                  {users.map(user => (
                    <button
                      key={user.id}
                      onClick={() => handleAssignLead(user.id)}
                      disabled={assigningLead}
                      className={clsx(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all text-sm",
                        lead.assignedToId === user.id ? "bg-primary/5 text-primary font-bold" : "text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      <div className={clsx(
                        "w-8 h-8 rounded-full flex items-center justify-center",
                        lead.assignedToId === user.id ? "bg-primary/10" : "bg-slate-100"
                      )}>
                        <UserIcon size={14} className={lead.assignedToId === user.id ? "text-primary" : "text-slate-400"} />
                      </div>
                      <div>
                        <p className="font-bold leading-tight">{user.name}</p>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-50">{user.role}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-primary/10 border border-primary/20">
                <UserCheck size={18} className="text-primary" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Asignado a</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">{lead.assignedTo?.name || "Mi cartera"}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notes Section */}
      <div className="px-4 py-6">
        <h3 className="text-slate-900 text-[10px] font-black uppercase tracking-widest px-1 pb-3 opacity-40 flex items-center gap-2">
          <Edit3 size={12} /> Notas de Seguimiento
        </h3>
        <div className="relative group">
          <textarea 
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full h-32 p-4 bg-white border border-primary/10 rounded-2xl text-slate-900 text-sm font-medium focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all placeholder:text-slate-300 shadow-sm"
            placeholder="Escribe aquí observaciones sobre la llamada o el interés del cliente..."
          />
          <div className="absolute bottom-3 right-3 opacity-0 group-focus-within:opacity-100 transition-opacity">
            <button 
              onClick={handleSaveNote}
              disabled={savingNote}
              className="bg-primary text-white text-[10px] font-black py-2 px-4 rounded-xl shadow-lg active:scale-95 transition-all uppercase tracking-widest flex items-center gap-2"
            >
              {savingNote ? <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
              Guardar Nota
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Actions for Visita & Firma */}
      <div className="px-4 pb-8 space-y-4">
         <button 
           onClick={() => router.push(`/dashboard/leads/${lead.id}/visit`)}
           className="w-full bg-primary text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
         >
           <MapIcon size={20} />
           Registrar Visita al Terreno
         </button>

         <button 
           onClick={() => router.push(`/dashboard/leads/${lead.id}/signing`)}
           className="w-full bg-[#D4AF37] text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-[#D4AF37]/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
         >
           <PenTool size={20} />
           Registrar Estado de Firma
         </button>
      </div>

      {/* Video Modal */}
      {isVideoModalOpen && videoUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-300">
          <div className="relative w-full max-w-lg aspect-[9/16] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="absolute top-0 inset-x-0 p-6 flex justify-between items-start z-10 bg-gradient-to-b from-black/60 to-transparent">
              <div className="flex flex-col">
                <p className="text-white/60 text-[10px] font-black uppercase tracking-widest">Previsualización de Anuncio</p>
                <h3 className="text-white text-sm font-bold leading-tight mt-1 truncate max-w-[250px]">{lead.adName}</h3>
              </div>
              <button 
                onClick={() => setIsVideoModalOpen(false)}
                className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-colors backdrop-blur-md"
              >
                <X size={24} />
              </button>
            </div>

            {/* Video Player */}
            <div className="flex-1 flex items-center justify-center relative bg-black">
              <video 
                src={videoUrl} 
                controls 
                autoPlay 
                className="w-full h-full object-contain"
              >
                Tu navegador no soporta el elemento de video.
              </video>
            </div>

            {/* Modal Footer (Ads Library Fallback) */}
            {lead.adId && (
              <div className="p-6 bg-slate-900 border-t border-white/10">
                <button 
                  onClick={() => window.open(`https://www.facebook.com/ads/library/?id=${lead.adId}`)}
                  className="w-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white py-3 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  <ExternalLink size={14} />
                  Ver en Biblioteca de Anuncios
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Images Modal */}
      {isImagesModalOpen && adImages.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-300">
          <div className="relative w-full max-w-lg bg-slate-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="absolute top-0 inset-x-0 p-6 flex justify-between items-start z-10 bg-gradient-to-b from-black/60 to-transparent">
              <div className="flex flex-col">
                <p className="text-white/60 text-[10px] font-black uppercase tracking-widest">Anuncio de Meta</p>
                <h3 className="text-white text-sm font-bold leading-tight mt-1 truncate max-w-[250px]">{lead.adName}</h3>
              </div>
              <button 
                onClick={() => setIsImagesModalOpen(false)}
                className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-colors backdrop-blur-md"
              >
                <X size={24} />
              </button>
            </div>

            {/* Images Container */}
            <div className="flex-1 overflow-y-auto p-4 pt-20 space-y-4 scrollbar-hide">
              {adImages.map((src, index) => (
                <div key={index} className="relative w-full rounded-2xl overflow-hidden shadow-lg">
                  <Image 
                    src={src} 
                    alt={`Ad image ${index + 1}`} 
                    width={800} 
                    height={1200} 
                    className="w-full h-auto object-contain"
                  />
                </div>
              ))}
            </div>

            {/* Modal Footer (Ads Library Fallback) */}
            {lead.adId && (
              <div className="p-6 bg-slate-900 border-t border-white/10">
                <button 
                  onClick={() => window.open(`https://www.facebook.com/ads/library/?id=${lead.adId}`)}
                  className="w-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white py-3 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  <ExternalLink size={14} />
                  Ver en Biblioteca de Anuncios
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface ContactButtonProps {
  icon: any;
  label: string;
  bgColor: string;
  onClick: () => void;
}

function ContactButton({ icon: Icon, label, bgColor, onClick }: ContactButtonProps) {
  return (
    <button 
      onClick={onClick}
      className={clsx(
        "flex items-center justify-between w-full p-5 text-white rounded-2xl shadow-lg active:scale-[0.98] transition-all",
        bgColor
      )}
    >
      <div className="flex items-center gap-4">
        <Icon size={24} />
        <span className="text-base font-black uppercase tracking-wider">{label}</span>
      </div>
      <ChevronRight size={20} />
    </button>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
  icon: any;
  border?: boolean;
}

function InfoRow({ label, value, icon: Icon, border = true }: InfoRowProps) {
  return (
    <div className={clsx(
      "flex justify-between items-center p-4",
      border && "border-b border-primary/5"
    )}>
      <div className="flex flex-col">
        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{label}</p>
        <p className="text-slate-900 text-sm font-bold mt-0.5">{value || "---"}</p>
      </div>
      <Icon size={18} className="text-primary/20" />
    </div>
  );
}
