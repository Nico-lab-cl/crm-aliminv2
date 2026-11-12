"use client";

import { useEffect, useState } from "react";
import { MessageSquare, User, ChevronRight, Search, ShieldCheck, Phone, Calendar, Globe, Facebook, Instagram } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { formatDistanceToNow, isToday, isYesterday, startOfWeek, endOfDay, isWithinInterval, parseISO } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Bandeja de entrada: el chat web que atiende Ali y los chats de Instagram y
 * Facebook que Ali derivó a una persona.
 *
 * El resto de Messenger, Instagram y los comentarios salió de acá porque la
 * pantalla se ponía lenta. Qué conversaciones llegan lo decide el servidor
 * (filtroBandeja en lib/ali.ts): un asesor recibe solo las suyas y las que no
 * tienen dueño.
 */
export default function InboxPage() {
  const { data: session } = useSession();
  const miId = (session?.user as any)?.id;
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [propertyFilter, setPropertyFilter] = useState<"all" | "my_leads" | "unassigned">("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "yesterday" | "this_week" | "range">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const res = await fetch("/api/messages/conversations");
      const data = await res.json();
      setConversations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error loading conversations", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredConversations = conversations.filter(conv => {
    const leadName = conv.lead ? `${conv.lead.firstName} ${conv.lead.lastName || ""}` : (conv.metaName || "Visitante");
    const matchesSearch = leadName.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;

    const matchesProperty =
        propertyFilter === "all" ? true :
        propertyFilter === "my_leads" ? conv.lead?.assignedToId === miId :
        propertyFilter === "unassigned" ? !conv.lead?.assignedToId : true;

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

    return matchesProperty && matchesDate;
  });

  return (
    <div className="flex flex-col h-screen bg-[#F5F7F9]">
      {/* Header */}
      <header className="bg-white px-6 pt-6 pb-2 border-b border-slate-100 flex flex-col gap-4 sticky top-0 z-20">
        <div>
          <h1 className="text-xl font-black text-slate-800 tracking-tight">Bandeja de Entrada</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Globe size={10} className="text-emerald-600" />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Chat web y derivaciones de Ali</span>
          </div>
        </div>

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
              className="w-full bg-slate-100 border-none rounded-xl py-3 px-3 text-[10px] font-black uppercase tracking-wider appearance-none outline-none focus:ring-2 focus:ring-primary/20 text-slate-600 pr-8"
            >
              <option value="all">Propiedad: Todos</option>
              <option value="my_leads">Asignados a Mí</option>
              <option value="unassigned">Sin Asignar</option>
            </select>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
              <ShieldCheck size={14} />
            </div>
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
                className="flex items-center gap-4 p-4 border-l-4 border-transparent bg-white transition-all hover:bg-slate-50 active:bg-slate-100"
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 overflow-hidden shadow-inner font-black">
                    {conv.metaImage ? (
                      <img src={conv.metaImage} alt="Avatar" className="w-full h-full object-cover scale-110" />
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
                      <Globe size={12} className="text-emerald-600" />
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <h3 className="font-bold text-slate-800 truncate text-[15px] flex items-center gap-2">
                      {conv.lead ? `${conv.lead.firstName} ${conv.lead.lastName || ""}` : (conv.metaName || "Visitante")}
                      {conv.messages[0]?.senderType === "advisor" && (
                        <span className="bg-slate-100 text-slate-400 text-[8px] px-1 rounded uppercase font-black">Tú</span>
                      )}
                    </h3>
                    <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
                      {conv.messages[0] ? formatDistanceToNow(new Date(conv.messages[0].createdAt), { addSuffix: true, locale: es }) : ""}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 truncate flex items-center gap-1">
                    {conv.messages[0]?.senderType === "ali" ? (
                      <span className="text-violet-500 font-black text-[9px] uppercase tracking-tighter opacity-80 flex-shrink-0">
                        {conv.messages[0]?.sourceType === "HANDOFF" ? "Ali pide asesor:" : "Ali:"}
                      </span>
                    ) : conv.messages[0] && conv.messages[0].senderType !== "advisor" ? (
                      <span className={`font-black text-[9px] uppercase tracking-tighter opacity-70 flex-shrink-0 ${conv.messages[0]?.sourceType === "COMMENT" ? "text-rose-500" : "text-primary"}`}>
                        {conv.messages[0]?.sourceType === "COMMENT" ? "Comentario:" : conv.messages[0]?.sourceType === "EVENTO" ? "Nota:" : "Mensaje:"}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-black text-[9px] uppercase tracking-tighter opacity-70 flex-shrink-0">Tú:</span>
                    )}
                    {conv.messages[0]?.mediaUrl ? (
                      /* El texto del mensaje ya describe el adjunto ("🎤 Mensaje
                         de voz", "📷 Foto", "🎥 Video"), así que la vista previa
                         distingue un audio de una foto sin abrir la conversación. */
                      <span className="flex items-center gap-1 italic text-slate-400 truncate">
                        {conv.messages[0].text || "📎 Adjunto"}
                      </span>
                    ) : (
                      conv.messages[0] ? conv.messages[0].text : "Sin mensajes"
                    )}
                  </p>

                  {/* CRM Context Badges */}
                  {conv.lead && (
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                      <div className={`
                        px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border
                        ${conv.lead.assignedToId === miId
                          ? "bg-primary/5 border-primary/20 text-primary"
                          : "bg-slate-50 border-slate-200 text-slate-400"}
                      `}>
                        {conv.lead.assignedToId === miId ? "Tuyo" : (conv.lead.assignedTo?.name || "Sin Asignar")}
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
                    </div>
                  )}
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
