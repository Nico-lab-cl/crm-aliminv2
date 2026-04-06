"use client";

import { useEffect, useState } from "react";
import { MessageSquare, User, Clock, ChevronRight, Facebook, Instagram, Search, ShieldCheck, MessageCircle, Phone, Calendar, RefreshCw } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { formatDistanceToNow, isToday, isYesterday, startOfWeek, endOfDay, isWithinInterval, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export default function InboxPage() {
  const { data: session } = useSession();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [propertyFilter, setPropertyFilter] = useState<"all" | "my_leads" | "unassigned">("all");
  const [channelFilter, setChannelFilter] = useState<"all" | "facebook" | "instagram" | "tiktok" | "comments">("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "yesterday" | "this_week" | "range">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [syncResult, setSyncResult] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [igSyncing, setIgSyncing] = useState(false);
  const [tkSyncing, setTkSyncing] = useState(false);

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const res = await fetch("/api/messages/conversations");
      const data = await res.json();
      setConversations(data);
    } catch (error) {
      console.error("Error loading conversations", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncProfiles = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/messages/sync-profiles");
      const data = await res.json();
      setSyncResult(data);
      fetchConversations();
    } catch (error) {
      console.error("Error syncing profiles", error);
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncInstagram = async () => {
    setIgSyncing(true);
    try {
      const res = await fetch("/api/messages/sync-instagram");
      const data = await res.json();
      
      if (!res.ok) {
          // Detectar errores comunes de Meta
          if (res.status === 403 || data.code === 3) {
            alert(`🚫 Bloqueo de Capacidad en Instagram:\n\n${data.message}\n\nPASO FINAL: Si tienes el código que empieza por 'IGAAV', asegúrate de haberlo puesto en Easy Panel como la variable: META_INSTAGRAM_ACCESS_TOKEN.`);
          } else if (data.code === 100 || data.message?.includes("permission")) {
            alert(`⚠️ Error de Permisos en Meta:\n\nTu Token de acceso no tiene los permisos suficientes.\n\nDebes renovar el token en el Panel de Meta Developers asegurándote de marcar 'instagram_manage_messages'.`);
          } else {
            alert(`Error de Meta: ${data.message || data.error}`);
          }
      } else {
          const method = data.method === "Master Key (IGAAV)" ? " (vía Master Key IGAAV) " : " (vía Token Primario) ";
          alert(`✅ Sincronización exitosa${method}:\n\n- Procesados: ${data.processed}\n- Nuevos chats: ${data.importedConversations}\n\nLos mensajes aparecerán ahora en tu bandeja.`);
          window.location.reload();
      }
    } catch (error: any) {
      console.error("Error syncing Instagram", error);
      alert("No se pudo conectar con el servidor de sincronización.");
    } finally {
      setIgSyncing(false);
    }
  };

  const handleSyncTikTok = async () => {
    setTkSyncing(true);
    try {
      const res = await fetch("/api/messages/sync-tiktok");
      const data = await res.json();
      
      if (!res.ok) {
          alert(`🚫 Error TikTok:\n\n${data.error || "Falla de conexión"}\n\nSi no te has conectado, dale primero a 'Conectar TikTok'.`);
      } else {
          const s = data.summary;
          const errText = s.errors?.length ? `\n\n⚠️ Errores:\n${s.errors.join('\n')}` : '';
          alert(`✅ Sincronización TikTok:\n\n📹 Videos: ${s.videos_found || 0}\n💬 Comentarios: ${s.comments}\n📩 DMs: ${s.dms}${errText}`);
          if (s.comments > 0) window.location.reload();
      }
    } catch (error: any) {
      alert("No se pudo conectar con el servidor de TikTok.");
    } finally {
      setTkSyncing(false);
    }
  };

  const handleConnectTikTok = () => {
    window.location.href = "/api/auth/tiktok";
  };

  const filteredConversations = conversations.filter(conv => {
    const leadName = conv.lead ? `${conv.lead.firstName} ${conv.lead.lastName}` : (conv.metaName || "Usuario Meta");
    const matchesSearch = leadName.toLowerCase().includes(search.toLowerCase()) || conv.psid.includes(search);
    
    if (!matchesSearch) return false;
    
    const lastMsgType = conv.messages[0]?.sourceType || "DIRECT";

    const matchesProperty = 
        propertyFilter === "all" ? true :
        propertyFilter === "my_leads" ? conv.lead?.assignedToId === (session?.user as any)?.id :
        propertyFilter === "unassigned" ? !conv.lead?.assignedToId : true;

    const matchesChannel = 
        channelFilter === "all" ? true :
        channelFilter === "facebook" ? conv.platform === "facebook" && lastMsgType === "DIRECT" :
        channelFilter === "instagram" ? conv.platform === "instagram" && lastMsgType === "DIRECT" :
        channelFilter === "tiktok" ? conv.platform === "tiktok" && lastMsgType === "DIRECT" :
        channelFilter === "comments" ? lastMsgType === "COMMENT" : true;

    const convDate = new Date(conv.updatedAt);
    let matchesDate = true;
    if (dateFilter === "today") matchesDate = isToday(convDate);
    else if (dateFilter === "yesterday") matchesDate = isYesterday(convDate);
    else if (dateFilter === "this_week") {
        matchesDate = isWithinInterval(convDate, { 
            start: startOfWeek(new Date(), { weekStartsOn: 1 }), 
            end: endOfDay(new Date()) 
        });
    } else if (dateFilter === "range") {
        if (startDate && endDate) {
            matchesDate = isWithinInterval(convDate, { 
                start: parseISO(startDate), 
                end: endOfDay(parseISO(endDate)) 
            });
        }
    }
    
    return matchesSearch && matchesProperty && matchesChannel && matchesDate;
  });

  return (
    <div className="flex flex-col h-screen bg-[#F5F7F9]">
      {/* Header */}
      <header className="bg-white px-6 pt-6 pb-2 border-b border-slate-100 flex flex-col gap-4 sticky top-0 z-20">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">Bandeja de Entrada</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse`}></div>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">En Vivo</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
                onClick={handleSyncProfiles}
                disabled={syncing}
                title="Sincronizar Nombres"
                className={`p-2 rounded-lg transition-all ${syncing ? "bg-slate-100 text-slate-400" : "bg-primary/10 text-primary hover:bg-primary/20"}`}
            >
                <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
            </button>
            { (session?.user as any)?.role === 'ADMIN' && (
                <button 
                    onClick={handleSyncInstagram}
                    disabled={igSyncing}
                    className={`
                    px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2
                    ${igSyncing ? "bg-slate-100 text-slate-400" : "bg-pink-50 text-pink-600 hover:bg-pink-100"}
                    `}
                >
                    <Instagram size={14} className={igSyncing ? "animate-spin" : ""} />
                    {igSyncing ? "Recuperando..." : "Traer Instagram"}
                </button>
            )}
            { (session?.user as any)?.role === 'ADMIN' && (
                <div className="flex items-center gap-1">
                  <button 
                      onClick={handleSyncTikTok}
                      disabled={tkSyncing}
                      className={`
                      px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2
                      ${tkSyncing ? "bg-slate-100 text-slate-400" : "bg-black text-white hover:bg-slate-800"}
                      `}
                  >
                      {tkSyncing ? "Recuperando..." : "Traer TikTok"}
                  </button>
                  <button 
                      onClick={handleConnectTikTok}
                      className="p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all text-[10px]"
                      title="Conectar Nueva Cuenta TikTok"
                  >
                      🔗
                  </button>
                </div>
            )}
          </div>
        </div>

        {syncResult && (
          <div className={`p-3 rounded-xl text-[11px] mb-2 shadow-sm border ${syncResult.updated > 0 ? "bg-green-50 border-green-100 text-green-700" : "bg-slate-50 border-slate-100 text-slate-600"}`}>
            <div className="flex justify-between items-center">
              <span>
                <b>Sincronización terminada:</b> {syncResult.updated} nombres arreglados de {syncResult.processed} pendientes.
              </span>
              <button onClick={() => setSyncResult(null)} className="font-bold opacity-50 px-2">X</button>
            </div>
            {syncResult.details.some((d: any) => d.status === "error") && (
              <div className="mt-2 text-[10px] opacity-70 p-2 bg-white/50 rounded-lg">
                <b>Nota:</b> Algunos nombres fallaron. Esto suele pasar si el app está en <b>Modo Desarrollo</b> o el token no tiene permisos de perfil.
              </div>
            )}
          </div>
        )}

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="Buscar..." 
            className="w-full bg-slate-100 border-none rounded-xl py-2 pl-9 pr-4 text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex gap-2">
          {/* Property Select */}
          <div className="flex-1 relative">
            <select 
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value as any)}
              className="w-full bg-slate-100 border-none rounded-xl py-2 px-3 text-[11px] font-black uppercase tracking-wider appearance-none outline-none focus:ring-2 focus:ring-primary/20 text-slate-600 pr-8"
            >
              <option value="all">Propiedad: Todos</option>
              <option value="my_leads">Asignados a Mí</option>
              { (session?.user as any)?.role === 'ADMIN' && (
                <option value="unassigned">Sin Asignar</option>
              )}
            </select>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
              <ShieldCheck size={14} />
            </div>
          </div>

          {/* Channel Select */}
          <div className="flex-1 relative">
            <select 
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value as any)}
              className="w-full bg-slate-100 border-none rounded-xl py-3 px-3 text-[10px] font-black uppercase tracking-wider appearance-none outline-none focus:ring-2 focus:ring-primary/20 text-slate-600 pr-8"
            >
              <option value="all">Canal: Todos</option>
              <option value="facebook">Messenger FB</option>
              <option value="instagram">Instagram Direct</option>
              <option value="tiktok">TikTok Direct</option>
              <option value="comments">Comentarios</option>
            </select>
          </div>

          {/* Date Select */}
          <div className="flex-1 relative">
            <select 
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="w-full bg-slate-100 border-none rounded-xl py-3 px-3 text-[10px] font-black uppercase tracking-wider appearance-none outline-none focus:ring-2 focus:ring-primary/20 text-slate-600 pr-8"
            >
              <option value="all">Fecha: Todas</option>
              <option value="today">Hoy</option>
              <option value="yesterday">Ayer</option>
              <option value="this_week">Esta Semana</option>
              <option value="range">Calendario</option>
            </select>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
               <Calendar size={12} />
            </div>
          </div>
        </div>

        {/* Custom Range Picks */}
        {dateFilter === "range" && (
          <div className="flex items-center gap-2 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
             <div className="flex-1">
               <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-50 border-none rounded-lg p-2 text-[10px] font-bold outline-none focus:ring-1 focus:ring-primary/30"
               />
             </div>
             <div className="text-slate-300 text-xs">→</div>
             <div className="flex-1">
               <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-slate-50 border-none rounded-lg p-2 text-[10px] font-bold outline-none focus:ring-1 focus:ring-primary/30"
               />
             </div>
          </div>
        )}
      </header>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto pb-24">
        {loading ? (
          <div className="p-8 text-center text-slate-400">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            Cargando conversaciones...
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-12 text-center opacity-40 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-3xl bg-slate-200 flex items-center justify-center">
              <MessageSquare size={32} />
            </div>
            <p className="font-medium">No hay conversaciones aún</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filteredConversations.map((conv) => (
              <Link 
                key={conv.id} 
                href={`/inbox/${conv.id}`}
                className={`
                  flex items-center gap-4 p-4 border-l-4 transition-all active:bg-slate-100
                  ${conv.messages[0]?.sourceType === "COMMENT" 
                    ? "bg-rose-50/30 border-rose-400 hover:bg-rose-50/50" 
                    : "bg-white border-transparent hover:bg-slate-50"}
                `}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 overflow-hidden shadow-inner font-black">
                    {conv.lead?.image || conv.metaImage ? (
                        <img src={conv.lead?.image || conv.metaImage} alt="Avatar" className="w-full h-full object-cover scale-110" />
                    ) : (
                        <div className="text-primary/20 scale-125"><User size={24} /></div>
                    )}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-white shadow-sm flex items-center justify-center ring-2 ring-white z-10">
                    {conv.platform === "facebook" ? (
                        <Facebook size={12} className="text-[#1877F2]" fill="currentColor" />
                    ) : conv.platform === "instagram" ? (
                        <Instagram size={12} className="text-[#E4405F]" />
                    ) : (
                        <div className="text-black font-black text-[8px] leading-none">TT</div>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <h3 className="font-bold text-slate-800 truncate text-[15px] flex items-center gap-2">
                      {conv.lead ? `${conv.lead.firstName} ${conv.lead.lastName}` : (conv.metaName || `Usuario Meta (${conv.psid.slice(-4)})`)}
                      {conv.messages[0]?.senderType === "advisor" && (
                        <span className="bg-slate-100 text-slate-400 text-[8px] px-1 rounded uppercase font-black">Tú</span>
                      )}
                    </h3>
                    <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
                      {conv.messages[0] ? formatDistanceToNow(new Date(conv.messages[0].createdAt), { addSuffix: true, locale: es }) : ""}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 truncate flex items-center gap-1">
                    {conv.messages[0]?.senderType === "meta" ? (
                      <span className={`font-black text-[9px] uppercase tracking-tighter opacity-70 flex-shrink-0 ${conv.messages[0]?.sourceType === 'COMMENT' ? 'text-rose-500' : 'text-primary'}`}>
                        {conv.messages[0]?.sourceType === 'COMMENT' ? 'Comentario:' : 'Mensaje:'}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-black text-[9px] uppercase tracking-tighter opacity-70 flex-shrink-0">Tú:</span>
                    )}
                    {conv.messages[0]?.mediaUrl ? (
                      <span className="flex items-center gap-1 italic text-slate-400">
                        📷 Imagen o adjunto
                      </span>
                    ) : (
                      conv.messages[0] ? conv.messages[0].text : "Sin mensajes"
                    )}
                  </p>
                  
                  {/* CRM Context Badges */}
                  <div className="mt-2 flex flex-wrap gap-2 items-center">
                    {conv.lead ? (
                      <>
                        <div className={`
                          px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border
                          ${conv.lead.assignedToId === (session?.user as any)?.id 
                            ? "bg-primary/5 border-primary/20 text-primary" 
                            : "bg-slate-50 border-slate-200 text-slate-400"}
                        `}>
                          {conv.lead.assignedToId === (session?.user as any)?.id ? "Tuyo" : (conv.lead.assignedTo?.name || "Sin Asignar")}
                        </div>
                        
                        {conv.lead.status && (
                          <div className="px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-500">
                             {conv.lead.status}
                          </div>
                        )}
                        
                        {conv.lead.phone && (
                          <div className="flex items-center gap-1 text-[#25D366] opacity-80">
                            <Phone size={10} fill="currentColor" />
                            <span className="text-[9px] font-black uppercase">WhatsApp</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className={`px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase tracking-widest ${conv.messages[0]?.sourceType === 'COMMENT' ? 'bg-rose-50 border-rose-100 text-rose-400' : 'bg-orange-50 border-orange-100 text-orange-400'}`}>
                        No en CRM
                      </div>
                    )}

                    {conv.messages[0]?.postContent && (
                      <div className="flex items-center gap-1.5 p-1 px-2 rounded-lg bg-slate-50 border border-slate-100/50">
                        {(() => {
                           try {
                             const content = JSON.parse(conv.messages[0].postContent);
                             return (
                               <>
                                 {content.image && (
                                   <div className="w-4 h-4 rounded-sm overflow-hidden flex-shrink-0 border border-slate-200">
                                     <img src={content.image} className="w-full h-full object-cover" />
                                   </div>
                                 )}
                                 <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tight truncate max-w-[80px]">
                                   {content.text || "Ver Post"}
                                 </span>
                               </>
                             )
                           } catch(e) {
                             return <MessageCircle size={10} className="text-slate-400" />
                           }
                        })()}
                      </div>
                    )}
                  </div>
                </div>

                <ChevronRight size={18} className="text-slate-300" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
