'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { 
  MessageSquare, 
  Search, 
  RefreshCcw, 
  UserPlus, 
  Link2,
  X,
  Phone,
  AlertCircle
} from 'lucide-react';

interface DBLead {
  id: string;
  FirstName?: string;
  firstName?: string;
  LastName?: string;
  lastName?: string;
  Email?: string;
  email?: string;
  Phone?: string;
  phone?: string;
}

interface Chat {
  id: number;
  message_id: string;
  lead_id: string | null;
  remote_jid: string;
  phone: string;
  lead_name: string;
  email: string | null;
  body: string;
  timestamp: string;
  from_me: boolean;
  advisor_name: string;
  is_crm_contact: boolean;
}

interface Message {
  id: number;
  message_id: string;
  lead_id: string | null;
  remote_jid: string;
  from_me: boolean;
  body: string;
  timestamp: string;
  instance_id?: string;
  advisor_name?: string;
}

interface LeadSearchResult {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export default function WhatsAppInboxPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [chatsSearch, setChatsSearch] = useState('');
  
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesSearch, setMessagesSearch] = useState('');
  const [syncingChat, setSyncingChat] = useState(false);

  // Filtros
  const [selectedAdvisor, setSelectedAdvisor] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [advisors, setAdvisors] = useState<Array<{ id: string; name: string }>>([]);

  // Modales
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  
  // Formulario Crear Contacto
  const [createFormData, setCreateFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    status: 'Nuevo',
    source: 'WhatsApp',
    project: '',
    phone: '',
  });

  const handleOpenCreateModal = () => {
    if (!selectedChat) return;
    setCreateFormData({
      firstName: '',
      lastName: '',
      email: '',
      status: 'Nuevo',
      source: 'WhatsApp',
      project: '',
      phone: `+${selectedChat.phone}`
    });
    setIsCreateModalOpen(true);
  };
  const [createLoading, setCreateLoading] = useState(false);

  // Búsqueda para Vincular Contacto
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [linkSearchResults, setLinkSearchResults] = useState<LeadSearchResult[]>([]);
  const [searchingLeads, setSearchingLeads] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);

  const activeChatRef = useRef<HTMLDivElement>(null);

  // Cargar lista de conversaciones
  const fetchChats = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoadingChats(true);
    try {
      const res = await fetch('/api/contacts/whatsapp/chats');
      if (res.ok) {
        const data = await res.json();
        setChats(data.chats || []);
      }
    } catch (e) {
      console.error('Error fetching chats:', e);
    } finally {
      if (showSpinner) setLoadingChats(false);
    }
  }, []);

  // Cargar mensajes de la conversación activa
  const fetchMessages = useCallback(async (jid: string, showSpinner = true) => {
    if (showSpinner) setLoadingMessages(true);
    try {
      const res = await fetch(`/api/contacts/whatsapp/messages?jid=${encodeURIComponent(jid)}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (e) {
      console.error('Error fetching messages:', e);
    } finally {
      if (showSpinner) setLoadingMessages(false);
    }
  }, []);

  // Cargar asesores al iniciar
  useEffect(() => {
    async function loadAdvisors() {
      try {
        const res = await fetch('/api/advisors');
        if (res.ok) {
          const data = await res.json();
          setAdvisors(data.advisors || []);
        }
      } catch (e) {
        console.error('Error loading advisors:', e);
      }
    }
    loadAdvisors();
  }, []);

  // Cargar chats al iniciar
  useEffect(() => {
    fetchChats();
    
    // Polling automático de chats cada 15 segundos
    const timer = setInterval(() => {
      fetchChats(false);
    }, 15000);

    return () => clearInterval(timer);
  }, [fetchChats]);

  // Cargar mensajes al seleccionar una conversación
  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat.remote_jid);
      setMessagesSearch('');
    } else {
      setMessages([]);
    }
  }, [selectedChat, fetchMessages]);

  // Scroll al final del chat al cargar nuevos mensajes
  useEffect(() => {
    if (activeChatRef.current) {
      activeChatRef.current.scrollTop = activeChatRef.current.scrollHeight;
    }
  }, [messages]);

  // Sincronizar chat seleccionado por demanda
  const handleSyncActiveChat = async () => {
    if (!selectedChat) return;
    setSyncingChat(true);
    try {
      await fetchMessages(selectedChat.remote_jid, false);
      // Recargar lista de chats también para actualizar el último mensaje
      await fetchChats(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSyncingChat(false);
    }
  };

  // Buscar leads para vincular
  const handleSearchLeads = async () => {
    if (!linkSearchQuery.trim()) return;
    setSearchingLeads(true);
    try {
      const res = await fetch(`/api/leads?search=${encodeURIComponent(linkSearchQuery)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        // Mapear resultados
        const mapped = (data.leads || []).map((l: DBLead) => {
          const first = l.FirstName || l.firstName || '';
          const last = l.LastName || l.lastName || '';
          return {
            id: l.id,
            name: `${first} ${last}`.trim() || 'Sin Nombre',
            email: l.Email || l.email || 'Sin Email',
            phone: l.Phone || l.phone || 'Sin Teléfono'
          };
        });
        setLinkSearchResults(mapped);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSearchingLeads(false);
    }
  };

  // Crear y vincular contacto
  const handleCreateContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChat) return;
    setCreateLoading(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createFormData)
      });

      if (res.ok) {
        const data = await res.json();

        // Vincular el JID al lead recién creado
        await fetch('/api/contacts/whatsapp/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            remote_jid: selectedChat.remote_jid,
            lead_id: data.lead.id
          })
        });

        alert('Contacto creado y chat vinculado con éxito.');
        setIsCreateModalOpen(false);
        // Actualizar chat activo y lista
        const updatedChat = { 
          ...selectedChat, 
          lead_id: data.lead.id,
          lead_name: `${data.lead.FirstName || data.lead.firstName || ''} ${data.lead.LastName || data.lead.lastName || ''}`.trim() || selectedChat.lead_name,
          email: data.lead.Email || data.lead.email || null,
          phone: createFormData.phone.replace(/\D/g, '') || selectedChat.phone,
          is_crm_contact: true
        };
        setSelectedChat(updatedChat);
        fetchChats(false);
      } else {
        const err = await res.json();
        alert(`Error al crear contacto: ${err.message}`);
      }
    } catch (err) {
      console.error(err);
      alert('Error de red al crear el contacto.');
    } finally {
      setCreateLoading(false);
    }
  };

  // Vincular a lead existente
  const handleLinkLead = async (leadId: string) => {
    if (!selectedChat) return;
    if (!confirm('¿Estás seguro de vincular este chat de WhatsApp a este contacto?')) return;
    
    setLinkLoading(true);
    try {
      // Vincular el JID al lead en la tabla whatsapp_messages
      const res = await fetch('/api/contacts/whatsapp/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remote_jid: selectedChat.remote_jid,
          lead_id: leadId
        })
      });

      if (res.ok) {
        alert('WhatsApp vinculado con éxito.');
        setIsLinkModalOpen(false);

        // Obtener datos actualizados del lead para mostrar el nombre real en el chat
        const leadRes = await fetch(`/api/leads/${leadId}`);
        let leadData = null;
        if (leadRes.ok) {
          const data = await leadRes.json();
          leadData = data.lead;
        }

        // Actualizar chat activo y lista
        const updatedChat = { 
          ...selectedChat, 
          lead_id: leadId,
          lead_name: leadData ? `${leadData.FirstName || leadData.firstName || ''} ${leadData.LastName || leadData.lastName || ''}`.trim() : selectedChat.lead_name,
          email: leadData ? (leadData.Email || leadData.email || null) : null,
          phone: leadData ? (leadData.Phone || leadData.phone || selectedChat.phone).replace(/\D/g, '') : selectedChat.phone,
          is_crm_contact: true
        };
        setSelectedChat(updatedChat);
        fetchChats(false);
      } else {
        const err = await res.json();
        alert(`Error al vincular: ${err.message}`);
      }
    } catch (err) {
      console.error(err);
      alert('Error de red al vincular.');
    } finally {
      setLinkLoading(false);
    }
  };

  // Obtener lista única de asesores presentes en los chats de Evolution
  const advisorsList = Array.from(new Set(
    chats.map(c => c.advisor_name).filter(Boolean)
  ));

  // Filtrar conversaciones de la izquierda
  const filteredChats = chats.filter(c => {
    // 1. Buscador por texto
    const q = chatsSearch.toLowerCase();
    const matchesSearch = c.lead_name.toLowerCase().includes(q) || c.phone.includes(q) || (c.body && c.body.toLowerCase().includes(q));
    
    // 2. Filtro por asesor
    const matchesAdvisor = !selectedAdvisor || c.advisor_name === selectedAdvisor;
    
    // 3. Filtro por estado
    const matchesStatus = !selectedStatus 
      ? true 
      : selectedStatus === 'linked' 
        ? c.is_crm_contact 
        : !c.is_crm_contact;
        
    // 4. Filtro por fecha
    let matchesDate = true;
    if (startDate || endDate) {
      const chatDate = new Date(c.timestamp);
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0,0,0,0);
        if (chatDate < start) matchesDate = false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23,59,59,999);
        if (chatDate > end) matchesDate = false;
      }
    }
    
    return matchesSearch && matchesAdvisor && matchesStatus && matchesDate;
  });

  // Filtrar mensajes del chat activo
  const filteredMessages = messages.filter(m => 
    !messagesSearch || (m.body && m.body.toLowerCase().includes(messagesSearch.toLowerCase()))
  );

  return (
    <div className="p-8 space-y-6 max-w-[1600px] mx-auto text-[#33475b]">
      
      {/* Cabecera */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#2d544c] text-white rounded-xl shadow-md">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-[#2d544c]">Bandeja de Entrada de WhatsApp</h1>
              <p className="text-[#516f90] mt-1 text-sm">Monitorea y gestiona en tiempo real los chats de WhatsApp de Marcela, Orlando y Barbara.</p>
            </div>
          </div>
        </div>
        <button 
          onClick={() => fetchChats(true)}
          className="flex items-center gap-2 px-4 py-2 border border-[#cbd6e2] bg-white text-[#33475b] hover:text-[#2d544c] hover:bg-[#f5f8fa] rounded-xl font-bold transition-all shadow-sm text-sm"
        >
          <RefreshCcw className="w-4 h-4" />
          Recargar Bandeja
        </button>
      </div>
      
      {/* Barra de Filtros */}
      <div className="bg-white border border-[#cbd6e2] rounded-2xl p-4 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Asesor */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-[#516f90] uppercase tracking-wide">Asesor</span>
            <select
              value={selectedAdvisor}
              onChange={(e) => setSelectedAdvisor(e.target.value)}
              className="bg-[#f5f8fa] border border-[#cbd6e2] rounded-xl px-3 py-2 text-xs font-semibold text-[#33475b] focus:ring-2 focus:ring-[#2d544c]/20 outline-none min-w-[160px]"
            >
              <option value="">Todos los Asesores</option>
              {advisorsList.map(adv => (
                <option key={adv} value={adv}>{adv}</option>
              ))}
            </select>
          </div>

          {/* Estado CRM */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-[#516f90] uppercase tracking-wide">Estado CRM</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-[#f5f8fa] border border-[#cbd6e2] rounded-xl px-3 py-2 text-xs font-semibold text-[#33475b] focus:ring-2 focus:ring-[#2d544c]/20 outline-none min-w-[160px]"
            >
              <option value="">Todos los Estados</option>
              <option value="linked">Sincronizados (CRM)</option>
              <option value="unlinked">No Sincronizados (Desconocidos)</option>
            </select>
          </div>

          {/* Fecha Desde */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-[#516f90] uppercase tracking-wide">Fecha Desde</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-[#f5f8fa] border border-[#cbd6e2] rounded-xl px-3 py-2 text-xs font-semibold text-[#33475b] focus:ring-2 focus:ring-[#2d544c]/20 outline-none"
            />
          </div>

          {/* Fecha Hasta */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-[#516f90] uppercase tracking-wide">Fecha Hasta</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-[#f5f8fa] border border-[#cbd6e2] rounded-xl px-3 py-2 text-xs font-semibold text-[#33475b] focus:ring-2 focus:ring-[#2d544c]/20 outline-none"
            />
          </div>
        </div>

        {/* Botón Limpiar */}
        {(selectedAdvisor || selectedStatus || startDate || endDate) && (
          <button
            onClick={() => {
              setSelectedAdvisor('');
              setSelectedStatus('');
              setStartDate('');
              setEndDate('');
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#f5f8fa] hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all shadow-sm border border-[#cbd6e2] mt-4 sm:mt-0"
          >
            <X className="w-3.5 h-3.5" />
            Limpiar Filtros
          </button>
        )}
      </div>

      {/* Grid Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[72vh] items-stretch">
        
        {/* Panel Izquierdo (4/12) - Listado de Conversaciones */}
        <div className="lg:col-span-4 bg-white border border-[#cbd6e2] rounded-2xl flex flex-col overflow-hidden shadow-sm">
          {/* Buscador */}
          <div className="p-4 border-b border-[#cbd6e2]/60">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#516f90]" />
              <input 
                type="text" 
                placeholder="Buscar conversación o teléfono..."
                value={chatsSearch}
                onChange={(e) => setChatsSearch(e.target.value)}
                className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded-xl pl-10 pr-4 py-2.5 text-xs focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white transition-all font-medium"
              />
            </div>
          </div>

          {/* Listado */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 pr-1">
            {loadingChats ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2 text-xs font-semibold">
                <RefreshCcw className="w-6 h-6 animate-spin text-[#2d544c] mb-1" />
                <span>Cargando conversaciones...</span>
              </div>
            ) : filteredChats.length === 0 ? (
              <div className="text-center py-20 text-slate-400 space-y-1.5">
                <MessageSquare className="w-8 h-8 text-zinc-300 mx-auto" />
                <p className="text-xs font-bold text-slate-500">No hay chats de WhatsApp registrados</p>
                <p className="text-[10px] max-w-xs mx-auto">Cuando tus asesores reciban o envíen mensajes a través de Evolution API, aparecerán aquí.</p>
              </div>
            ) : (
              filteredChats.map((c) => {
                const isActive = selectedChat?.remote_jid === c.remote_jid;
                return (
                  <div
                    key={c.remote_jid}
                    onClick={() => setSelectedChat(c)}
                    className={`p-4 transition-all cursor-pointer flex gap-3 items-start select-none relative ${
                      isActive 
                        ? 'bg-[#eaf0f6]/60 border-l-4 border-l-[#2d544c]' 
                        : 'hover:bg-[#f5f8fa]/60 border-l-4 border-l-transparent bg-white'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-[#eaf0f6] text-[#2d544c] border border-[#2d544c]/10 flex items-center justify-center font-bold uppercase shrink-0">
                      {c.lead_name.charAt(0) === '+' ? <Phone className="w-4 h-4 text-[#2d544c]" /> : c.lead_name.substring(0, 2)}
                    </div>

                    {/* Información */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-bold text-slate-800 text-xs truncate">{c.lead_name}</h4>
                        <span className="text-[9px] text-slate-400 font-medium shrink-0">
                          {new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      
                      {/* Teléfono */}
                      <div className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                        <Phone className="w-2.5 h-2.5 text-[#516f90]" />
                        <span>+{c.phone}</span>
                      </div>
                      
                      {/* Estado CRM / Badge */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                          c.is_crm_contact 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}>
                          {c.is_crm_contact ? 'CRM Contacto' : 'Desconocido'}
                        </span>
                        <span className="text-[8.5px] bg-slate-100 text-slate-500 font-semibold px-1 rounded truncate max-w-[120px]">
                          Asesor: {c.advisor_name}
                        </span>
                      </div>

                      {/* Último Mensaje */}
                      <p className="text-[11px] text-slate-500 truncate mt-1">
                        {c.from_me ? <span className="font-bold text-slate-400 mr-0.5">Tú:</span> : ''}
                        {c.body || '[Mensaje multimedia]'}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Panel Derecho (8/12) - Conversación Activa */}
        <div className="lg:col-span-8 bg-white border border-[#cbd6e2] rounded-2xl flex flex-col overflow-hidden shadow-sm">
          {selectedChat ? (
            <>
              {/* Cabecera del Chat Activo */}
              <div className="p-4 border-b border-[#cbd6e2]/60 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#eaf0f6] text-[#2d544c] border border-[#2d544c]/10 flex items-center justify-center font-bold uppercase">
                    {selectedChat.lead_name.charAt(0) === '+' ? <Phone className="w-4 h-4 text-[#2d544c]" /> : selectedChat.lead_name.substring(0, 2)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">{selectedChat.lead_name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-500 font-medium">+{selectedChat.phone}</span>
                      <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded uppercase ${
                        selectedChat.is_crm_contact 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                          : 'bg-amber-50 text-amber-800 border border-amber-100'
                      }`}>
                        {selectedChat.is_crm_contact ? '✓ Vinculado' : '⚠ No Vinculado'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Acciones de vinculación / sincronización */}
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  {/* Buscador de mensajes interno */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#516f90]" />
                    <input 
                      type="text" 
                      placeholder="Buscar mensajes..."
                      value={messagesSearch}
                      onChange={(e) => setMessagesSearch(e.target.value)}
                      className="bg-[#f5f8fa] border border-[#cbd6e2] rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none focus:bg-white focus:ring-1 focus:ring-[#2d544c]/20 text-[#33475b] w-40 transition-all"
                    />
                  </div>

                  {!selectedChat.is_crm_contact && (
                    <>
                      <button
                        onClick={handleOpenCreateModal}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2d544c] hover:bg-[#1f3a35] text-white text-xs font-bold rounded-lg transition-all shadow-sm"
                        title="Crear un nuevo contacto en el CRM con este teléfono"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Crear Lead
                      </button>
                      <button
                        onClick={() => {
                          setLinkSearchQuery('');
                          setLinkSearchResults([]);
                          setIsLinkModalOpen(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-[#cbd6e2] bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg transition-all shadow-sm"
                        title="Vincular este chat de WhatsApp a un lead ya existente en el CRM"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        Vincular
                      </button>
                    </>
                  )}

                  <button
                    onClick={handleSyncActiveChat}
                    disabled={syncingChat || loadingMessages}
                    className="p-2 border border-[#cbd6e2] bg-white hover:bg-slate-50 text-slate-600 rounded-lg transition-all disabled:opacity-50"
                    title="Sincronizar mensajes recientes"
                  >
                    <RefreshCcw className={`w-3.5 h-3.5 ${syncingChat || loadingMessages ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Mensajes del Chat */}
              <div 
                ref={activeChatRef}
                className="flex-1 bg-[#efeae2] p-4 overflow-y-auto space-y-4 shadow-inner custom-scrollbar"
              >
                {loadingMessages ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2 text-xs font-semibold animate-pulse">
                    <RefreshCcw className="w-5 h-5 animate-spin text-[#2d544c]" />
                    <span>Cargando conversación...</span>
                  </div>
                ) : filteredMessages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-400 text-xs font-semibold">
                    No se encontraron mensajes en esta conversación.
                  </div>
                ) : (
                  filteredMessages.map((msg) => {
                    const isMe = msg.from_me;
                    return (
                      <div 
                        key={msg.id || msg.message_id} 
                        className={`flex flex-col max-w-[70%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}
                      >
                        {/* Nombre del Asesor */}
                        {isMe && (
                          <span className="text-[9px] font-bold text-slate-500 mb-0.5 mr-1 block">
                            {msg.advisor_name || 'Asesor'}
                          </span>
                        )}
                        
                        {/* Globo de Chat */}
                        <div className={`p-3 rounded-2xl shadow-sm text-xs leading-relaxed ${
                          isMe 
                            ? 'bg-[#2d544c] text-white rounded-tr-none' 
                            : 'bg-white text-slate-800 rounded-tl-none border border-slate-200/45'
                        }`}>
                          <p className="whitespace-pre-wrap font-medium">{msg.body}</p>
                          
                          {/* Hora y fecha */}
                          <span className={`text-[8px] mt-1.5 block text-right font-semibold ${
                            isMe ? 'text-emerald-200' : 'text-slate-400'
                          }`}>
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {' - '}
                            {new Date(msg.timestamp).toLocaleDateString([], { day: '2-digit', month: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            /* Estado de Placeholder */
            <div className="flex-1 flex flex-col items-center justify-center bg-[#f5f8fa]/50 text-slate-400 space-y-4 p-8 text-center">
              <div className="w-16 h-16 bg-white border border-[#cbd6e2] rounded-full flex items-center justify-center shadow-md">
                <MessageSquare className="w-8 h-8 text-[#2d544c]" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h3 className="font-bold text-slate-700 text-sm">Bandeja Unificada de WhatsApp</h3>
                <p className="text-xs text-[#516f90] leading-relaxed">
                  Selecciona una conversación del listado izquierdo para revisar los chats y ver qué asesor los atendió.
                </p>
                <p className="text-[10px] text-slate-400 italic mt-2">
                  Los chats de números desconocidos se guardan para que puedas convertirlos en Leads y enlazarlos al CRM en un clic.
                </p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* MODAL 1: CREAR LEAD */}
      {isCreateModalOpen && selectedChat && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white border border-[#cbd6e2] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-up">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-[#cbd6e2] flex justify-between items-center text-[#2d544c] bg-[#eaf0f6]/30">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                <h3 className="font-bold text-sm">Crear Nuevo Contacto en CRM</h3>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateContactSubmit} className="p-5 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-[#516f90] uppercase tracking-wide block mb-1">Número de Teléfono</label>
                <input 
                  type="text" 
                  required 
                  value={createFormData.phone}
                  onChange={(e) => setCreateFormData({ ...createFormData, phone: e.target.value })}
                  className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded px-3 py-1.5 text-xs text-[#33475b] focus:ring-1 focus:ring-[#2d544c]/20 outline-none font-bold font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#516f90] uppercase block">Nombre *</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="Ej: Juan"
                    value={createFormData.firstName}
                    onChange={(e) => setCreateFormData({ ...createFormData, firstName: e.target.value })}
                    className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded px-3 py-1.5 text-xs text-[#33475b] focus:ring-1 focus:ring-[#2d544c]/20 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#516f90] uppercase block">Apellido</label>
                  <input 
                    type="text" 
                    placeholder="Ej: Silva"
                    value={createFormData.lastName}
                    onChange={(e) => setCreateFormData({ ...createFormData, lastName: e.target.value })}
                    className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded px-3 py-1.5 text-xs text-[#33475b] focus:ring-1 focus:ring-[#2d544c]/20 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#516f90] uppercase block">Correo Electrónico *</label>
                <input 
                  type="email" 
                  required 
                  placeholder="juan@gmail.com"
                  value={createFormData.email}
                  onChange={(e) => setCreateFormData({ ...createFormData, email: e.target.value })}
                  className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded px-3 py-1.5 text-xs text-[#33475b] focus:ring-1 focus:ring-[#2d544c]/20 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#516f90] uppercase block">Proyecto de Interés</label>
                  <select 
                    value={createFormData.project}
                    onChange={(e) => setCreateFormData({ ...createFormData, project: e.target.value })}
                    className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded px-2.5 py-1.5 text-xs text-[#33475b] focus:ring-1 focus:ring-[#2d544c]/20 outline-none font-semibold"
                  >
                    <option value="">Ninguno</option>
                    <option value="Lomas del Mar">Lomas del Mar</option>
                    <option value="Arena y Sol">Arena y Sol</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#516f90] uppercase block">Estado del Lead</label>
                  <select 
                    value={createFormData.status}
                    onChange={(e) => setCreateFormData({ ...createFormData, status: e.target.value })}
                    className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded px-2.5 py-1.5 text-xs text-[#33475b] focus:ring-1 focus:ring-[#2d544c]/20 outline-none font-semibold"
                  >
                    <option value="Nuevo">Nuevo</option>
                    <option value="Contactado">Contactado</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-[#eaf0f6] border border-[#2d544c]/10 rounded-xl flex gap-2 items-start mt-2">
                <AlertCircle className="w-4 h-4 text-[#2d544c] shrink-0 mt-0.5" />
                <p className="text-[10px] text-[#2d544c] leading-relaxed font-semibold">
                  Al crear este lead, se vinculará retroactivamente todo el historial de chat acumulado para este número de WhatsApp.
                </p>
              </div>

              <div className="flex gap-2 pt-3 border-t border-[#cbd6e2]/40">
                <button 
                  type="button" 
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-[#cbd6e2] bg-white rounded-lg text-xs font-bold text-[#33475b] hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={createLoading}
                  className="flex-1 px-4 py-2 bg-[#2d544c] hover:bg-[#1f3a35] disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  {createLoading ? 'Creando...' : 'Crear & Enlazar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: VINCULAR A CONTACTO EXISTENTE */}
      {isLinkModalOpen && selectedChat && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white border border-[#cbd6e2] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-up">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-[#cbd6e2] flex justify-between items-center text-[#2d544c] bg-[#eaf0f6]/30">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                <h3 className="font-bold text-sm">Vincular a Contacto Existente</h3>
              </div>
              <button onClick={() => setIsLinkModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4">
              <p className="text-[11px] text-slate-500">
                Busca un contacto existente en la base de datos por su nombre, correo o teléfono anterior para asignarle este chat de WhatsApp.
              </p>

              {/* Input de Búsqueda */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#516f90]" />
                  <input 
                    type="text" 
                    placeholder="Escribe nombre, correo..."
                    value={linkSearchQuery}
                    onChange={(e) => setLinkSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchLeads()}
                    className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded-lg pl-9 pr-4 py-2 text-xs focus:ring-1 focus:ring-[#2d544c]/20 outline-none text-[#33475b]"
                  />
                </div>
                <button
                  onClick={handleSearchLeads}
                  disabled={searchingLeads}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-700 disabled:opacity-50"
                >
                  Buscar
                </button>
              </div>

              {/* Resultados */}
              <div className="border border-[#cbd6e2]/60 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                {searchingLeads ? (
                  <div className="text-center py-8 text-xs text-slate-400 animate-pulse font-semibold">Buscando...</div>
                ) : linkSearchResults.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">Introduce un término y pulsa Buscar</div>
                ) : (
                  linkSearchResults.map((l) => (
                    <div 
                      key={l.id}
                      onClick={() => handleLinkLead(l.id)}
                      className="p-3 hover:bg-slate-50 cursor-pointer flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <p className="font-bold text-slate-800">{l.name}</p>
                        <p className="text-[10px] text-slate-500">{l.email} | {l.phone}</p>
                      </div>
                      <button 
                        disabled={linkLoading}
                        className="text-[10px] font-bold text-[#2d544c] hover:underline"
                      >
                        Enlazar
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex pt-3 border-t border-[#cbd6e2]/40">
                <button 
                  onClick={() => setIsLinkModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-[#cbd6e2] bg-white rounded-lg text-xs font-bold text-[#33475b] hover:bg-slate-50"
                >
                  Cerrar
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
