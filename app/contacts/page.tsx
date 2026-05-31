'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  Download, 
  RefreshCcw, 
  Check, 
  X, 
  Calendar,
  Layers,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  MessageSquare,
  Info,
  Clock,
  Link2,
  Edit3,
  Map,
  FileText,
  Mail,
  Eye,
  ExternalLink,
  Globe,
  MousePointer
} from 'lucide-react';

interface Lead {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; // Permite mapear dinámicamente cualquier esquema de columnas
}

interface Advisor {
  id: string;
  name: string;
  email?: string;
}

const getMontoPie = (lead: Lead | null) => {
  if (!lead) return null;
  return lead.pie || lead.monto_pie || lead.montoPie || lead.monto_de_pie || lead.montoDePie || lead.downpayment || lead.down_payment || null;
};

const getEventStyle = (type: string) => {
  switch (type) {
    case 'EMAIL_SENT':
      return { icon: Mail, colorClass: 'bg-blue-500', bgClass: 'bg-blue-50/50', borderClass: 'border-blue-100' };
    case 'EMAIL_OPENED':
      return { icon: Eye, colorClass: 'bg-green-500', bgClass: 'bg-green-50/50', borderClass: 'border-green-100' };
    case 'EMAIL_CLICKED':
      return { icon: ExternalLink, colorClass: 'bg-amber-500', bgClass: 'bg-amber-50/50', borderClass: 'border-amber-100' };
    case 'PAGE_VIEW':
      return { icon: Globe, colorClass: 'bg-sky-500', bgClass: 'bg-sky-50/50', borderClass: 'border-sky-100' };
    case 'FORM_SUBMIT':
      return { icon: FileText, colorClass: 'bg-indigo-500', bgClass: 'bg-indigo-50/50', borderClass: 'border-indigo-100' };
    case 'CLICK_BUTTON':
      return { icon: MousePointer, colorClass: 'bg-violet-500', bgClass: 'bg-violet-50/50', borderClass: 'border-violet-100' };
    case 'SYSTEM_CREATED':
      return { icon: Check, colorClass: 'bg-emerald-500', bgClass: 'bg-emerald-50/50', borderClass: 'border-emerald-100' };
    default:
      return { icon: Clock, colorClass: 'bg-slate-500', bgClass: 'bg-slate-50/50', borderClass: 'border-slate-100' };
  }
};

interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  date: string;
  details?: {
    page_url?: string;
    form_data?: Record<string, unknown>;
  };
}

export default function ContactsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  
  // Estados de filtros
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [project, setProject] = useState('');
  const [interest, setInterest] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Opciones de filtros dinámicos (cargados desde API)
  const [statuses, setStatuses] = useState<string[]>(['Nuevo', 'Contactado', 'Visita', 'Reservado']);
  const [sources, setSources] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);

  // Estado para la vista de detalle estilo HubSpot
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [activeTab, setActiveTab] = useState<'notes' | 'activity'>('notes');
  const [newNote, setNewNote] = useState('');
  const [isUpdatingField, setIsUpdatingField] = useState(false);

  // Actividades del Lead
  const [activities, setActivities] = useState<TimelineEvent[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [eventStartDate, setEventStartDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');

  const fetchActivities = useCallback(async (leadId: string, start = '', end = '') => {
    setLoadingActivities(true);
    try {
      const params = new URLSearchParams();
      if (start) params.set('startDate', start);
      if (end) params.set('endDate', end);

      const res = await fetch(`/api/leads/${leadId}/activities?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setActivities(data.events || []);
      }
    } catch (e) {
      console.error('Error fetching activities:', e);
    } finally {
      setLoadingActivities(false);
    }
  }, []);

  // Limpiar filtros al cambiar de contacto
  useEffect(() => {
    if (selectedLead?.id) {
      setEventStartDate('');
      setEventEndDate('');
    }
  }, [selectedLead?.id]);

  // Cargar actividades cuando cambie el lead o los filtros de fecha
  useEffect(() => {
    if (selectedLead) {
      fetchActivities(selectedLead.id, eventStartDate, eventEndDate);
    } else {
      setActivities([]);
    }
  }, [selectedLead, eventStartDate, eventEndDate, fetchActivities]);

  useEffect(() => {
    if (selectedLead) {
      setNewNote(selectedLead.notes || '');
    }
  }, [selectedLead]);

  const handleUpdateLead = async (leadId: string, fieldsToUpdate: Partial<Lead>) => {
    // Actualización optimista en local
    setLeads(prevLeads => prevLeads.map(l => l.id === leadId ? { ...l, ...fieldsToUpdate } : l));
    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead(prev => prev ? { ...prev, ...fieldsToUpdate } : null);
    }
    
    setIsUpdatingField(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fieldsToUpdate)
      });
      if (!res.ok) {
        throw new Error('Error al actualizar contacto');
      }
    } catch (e) {
      console.error('Error updating lead:', e);
      alert('No se pudo guardar la información del contacto en el servidor.');
    } finally {
      setIsUpdatingField(false);
    }
  };

  // Estado del Modal de Añadir Contacto
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    status: 'Nuevo',
    source: 'Manual',
    project: '',
    lote: '',
    etapa: ''
  });

  // Polling en tiempo real
  const [pollingActive, setPollingActive] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const secondsTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cargar filtros y asesores iniciales
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const res = await fetch('/api/leads/filters');
        if (res.ok) {
          const data = await res.json();
          if (data.statuses && data.statuses.length > 0) setStatuses(data.statuses);
          if (data.sources) setSources(data.sources);
          if (data.projects) setProjects(data.projects);
        }
      } catch (e) {
        console.error('Error fetching filters:', e);
      }
    };

    const fetchAdvisors = async () => {
      try {
        const res = await fetch('/api/advisors');
        if (res.ok) {
          const data = await res.json();
          setAdvisors(data.advisors || []);
        }
      } catch (e) {
        console.error('Error fetching advisors:', e);
      }
    };

    fetchFilters();
    fetchAdvisors();
  }, []);

  // Cargar leads cada vez que cambien filtros o página
  const fetchLeads = useCallback(async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        search,
        status,
        source,
        project,
        interest,
        startDate,
        endDate
      });
      const res = await fetch(`/api/leads?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
        setTotalCount(data.totalCount || 0);
        setLastUpdated(new Date());
        setSecondsSinceUpdate(0);
      }
    } catch (e) {
      console.error('Error fetching leads:', e);
    } finally {
      if (showLoadingSpinner) setLoading(false);
    }
  }, [page, limit, search, status, source, project, interest, startDate, endDate]);

  // Efecto para búsquedas y filtrados dinámicos
  useEffect(() => {
    fetchLeads(true);
  }, [fetchLeads]);

  // Manejar debounce para el buscador de texto
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchLeads(true);
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [search, fetchLeads]);

  // Temporizadores para Live Polling (Cada 10 segundos recarga en segundo plano)
  useEffect(() => {
    if (pollingActive) {
      pollingTimerRef.current = setInterval(() => {
        fetchLeads(false); // recargar sin mostrar spinner principal
      }, 10000);

      secondsTimerRef.current = setInterval(() => {
        setSecondsSinceUpdate(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
      if (secondsTimerRef.current) clearInterval(secondsTimerRef.current);
    };
  }, [pollingActive, fetchLeads]);

  // Helpers de compatibilidad para leer campos del Lead sin importar la capitalización
  const getLeadName = (lead: Lead) => {
    const first = lead.FirstName || lead.firstName || lead.name || '';
    const last = lead.LastName || lead.lastName || '';
    if (first && last) return `${first} ${last}`;
    if (first) return first;
    return 'Sin Nombre';
  };

  const getLeadEmail = (lead: Lead) => lead.Email || lead.email || 'Sin Email';
  const getLeadPhone = (lead: Lead) => lead.Phone || lead.phone || 'Sin Teléfono';
  const getLeadStatus = (lead: Lead) => lead.Status || lead.status || 'Nuevo';
  const getLeadSource = (lead: Lead) => {
    const src = lead.Source || lead.source || 'Manual';
    const srcLower = src.toLowerCase();
    if (srcLower === 'web' || srcLower.includes('aliminspa')) return 'Sitio Web';
    return src;
  };
  
  const getLeadProject = (lead: Lead) => {
    // 1. Si el campo Project / project existe y no está vacío, usarlo
    const proj = lead.Project || lead.project;
    if (proj && proj !== '-') return proj;

    // 2. Si no, intentar inferir por FormId (formularios de Meta)
    const formId = lead.FormId || lead.formid || lead.FormID;
    if (formId) {
      if (formId === '798890826611593') return 'Lomas del Mar';
      if (formId === '1896385304349584') return 'Arena y Sol';
    }

    // 3. Intentar inferir por AdName (nombre del anuncio / interés)
    const adName = lead.AdName || lead.adname || lead.Adname;
    if (adName) {
      const adNameLower = adName.toLowerCase();
      if (adNameLower.includes('lomas') || adNameLower.includes('mar')) return 'Lomas del Mar';
      if (adNameLower.includes('arena') || adNameLower.includes('sol')) return 'Arena y Sol';
    }

    // 4. Si el origen (Source) es el nombre del proyecto
    const src = lead.Source || lead.source;
    if (src) {
      const srcLower = src.toLowerCase();
      if (srcLower.includes('lomas') || srcLower.includes('mar')) return 'Lomas del Mar';
      if (srcLower.includes('arena') || srcLower.includes('sol')) return 'Arena y Sol';
    }

    // 5. Intentar inferir por interests / interes (campo de procedencia web)
    const int = lead.interests || lead.Interests || lead.interes || lead.Interes;
    if (int) {
      const intLower = int.toLowerCase();
      if (intLower.includes('lomas') || intLower.includes('mar')) return 'Lomas del Mar';
      if (intLower.includes('arena') || intLower.includes('sol')) return 'Arena y Sol';
    }

    return '-';
  };

  const getLeadLote = (lead: Lead) => lead.Lote || lead.lote || '';
  const getLeadEtapa = (lead: Lead) => lead.Etapa || lead.etapa || '';
  const getLeadDate = (lead: Lead) => lead.CreatedAt || lead.createdAt || lead.created_at || '';

  // Función para descargar los datos filtrados actuales en CSV
  const handleExportCSV = () => {
    if (leads.length === 0) return alert('No hay contactos para exportar');
    
    // Encabezados del CSV
    const headers = ['Nombre', 'Email', 'Teléfono', 'Estado', 'Origen', 'Proyecto', 'Lote', 'Etapa', 'Fecha Creación'];
    
    // Contenido
    const csvRows = [
      headers.join(','),
      ...leads.map(lead => [
        `"${getLeadName(lead).replace(/"/g, '""')}"`,
        `"${getLeadEmail(lead)}"`,
        `"${getLeadPhone(lead)}"`,
        `"${getLeadStatus(lead)}"`,
        `"${getLeadSource(lead)}"`,
        `"${getLeadProject(lead)}"`,
        `"${getLeadLote(lead)}"`,
        `"${getLeadEtapa(lead)}"`,
        `"${getLeadDate(lead) ? new Date(getLeadDate(lead)).toLocaleDateString() : ''}"`
      ].join(','))
    ];

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `leads_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Manejo de guardado en el Modal
  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email) return alert('El correo es obligatorio');

    setFormLoading(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (res.ok) {
        setIsModalOpen(false);
        setFormData({
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          status: 'Nuevo',
          source: 'Manual',
          project: '',
          lote: '',
          etapa: ''
        });
        fetchLeads(true);
      } else {
        const errorData = await res.json();
        alert('Error al guardar: ' + errorData.message);
      }
    } catch (e) {
      console.error(e);
      alert('Error en la conexión con el servidor');
    } finally {
      setFormLoading(false);
    }
  };

  // Paginación
  const totalPages = Math.ceil(totalCount / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  // Estilo semántico para estados de Leads
  const getStatusStyle = (statusName: string) => {
    const s = statusName.toLowerCase();
    if (s === 'nuevo' || s === 'new') return 'bg-sky-50 text-sky-700 border-sky-200';
    if (s === 'contactado' || s === 'contacted') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (s === 'visita' || s === 'visited') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (s === 'reservado' || s === 'reserved') return 'bg-purple-50 text-purple-700 border-purple-200';
    return 'bg-slate-50 text-slate-600 border-slate-200';
  };

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto text-[#33475b]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-[#2d544c]">Contactos</h1>
            <span className="bg-[#eaf0f6] text-[#2d544c] text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm border border-[#cbd6e2]/50">
              <Users className="w-3.5 h-3.5" />
              {totalCount} leads
            </span>
          </div>
          <p className="text-[#516f90] mt-1.5 text-sm">Gestiona y monitorea tu base de datos de leads sincronizados y agregados manualmente.</p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Live Polling Status */}
          <button 
            onClick={() => setPollingActive(!pollingActive)}
            className={`flex items-center gap-2.5 px-3 py-1 rounded-lg border text-[11px] font-bold shadow-sm transition-all bg-white hover:bg-[#f5f8fa] ${
              pollingActive ? 'text-green-600 border-green-200' : 'text-zinc-400 border-[#cbd6e2]'
            }`}
            title={pollingActive ? 'Pausar actualización en vivo' : 'Activar actualización en vivo'}
          >
            <span className={`w-2 h-2 rounded-full ${pollingActive ? 'bg-green-500 animate-ping' : 'bg-zinc-300'}`} />
            <div className="flex flex-col items-start text-left">
              <span className={pollingActive ? 'text-green-600' : 'text-zinc-500'}>
                {pollingActive ? `En Vivo (${secondsSinceUpdate}s)` : 'Pausado'}
              </span>
              <span className="text-[9px] text-[#516f90] font-normal leading-none mt-0.5">
                Act: {lastUpdated.toLocaleTimeString()}
              </span>
            </div>
          </button>

          <button 
            onClick={() => fetchLeads(true)}
            className="p-2.5 bg-white border border-[#cbd6e2] rounded-lg text-[#33475b] hover:bg-[#f5f8fa] transition-all shadow-sm"
            title="Sincronizar ahora"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2.5 border border-[#cbd6e2] bg-white text-[#33475b] hover:text-[#2d544c] rounded-lg font-bold hover:bg-[#f5f8fa] transition-all shadow-sm text-sm"
          >
            <Download className="w-4 h-4 text-[#516f90]" />
            Exportar CSV
          </button>
          
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#2d544c] text-white rounded-lg font-bold hover:bg-[#1f3a35] transition-all shadow-md text-sm"
          >
            <UserPlus className="w-4 h-4" />
            Añadir Contacto
          </button>
        </div>
      </div>

      {/* Filtros de Búsqueda y Segmentación */}
      <div className="bg-white border border-[#cbd6e2] rounded-xl p-5 shadow-sm space-y-4">
        {/* Fila 1: Búsqueda y Filtros Básicos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          {/* Buscador */}
          <div className="space-y-1.5 lg:col-span-2">
            <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Buscar contacto</label>
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#516f90] group-focus-within:text-[#2d544c] transition-colors" />
              <input 
                type="text" 
                placeholder="Buscar por nombre, email, teléfono..." 
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1); // Reiniciar página al buscar
                }}
                className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d544c]/20 focus:bg-white transition-all text-[#33475b]"
              />
            </div>
          </div>

          {/* Filtrar por Estado */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Estado</label>
            <select 
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white"
            >
              <option value="">Todos los Estados</option>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Filtrar por Origen */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Origen</label>
            <select 
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setPage(1);
              }}
              className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white"
            >
              <option value="">Todos los Orígenes</option>
              {sources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Fila 2: Filtros Avanzados (Interés y Fecha de Creación) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end pt-2 border-t border-[#cbd6e2]/40">
          {/* Filtrar por Interés */}
          <div className="space-y-1.5 lg:col-span-2">
            <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Interés del Lead</label>
            <select 
              value={interest}
              onChange={(e) => {
                setInterest(e.target.value);
                setPage(1);
              }}
              className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white"
            >
              <option value="">Todos los Intereses</option>
              <option value="FRIO">Frío</option>
              <option value="INTERESADO">Interesado</option>
              <option value="VENTA">Venta</option>
            </select>
          </div>

          {/* Creado Desde */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Creado Desde</label>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white"
            />
          </div>

          {/* Creado Hasta */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Creado Hasta</label>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white"
            />
          </div>

          {/* Botón de Limpiar Filtros */}
          <div>
            {(search || status || source || project || interest || startDate || endDate) ? (
              <button 
                onClick={() => {
                  setSearch('');
                  setStatus('');
                  setSource('');
                  setProject('');
                  setInterest('');
                  setStartDate('');
                  setEndDate('');
                  setPage(1);
                }}
                className="w-full py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 hover:border-zinc-300 text-zinc-600 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                Limpiar Filtros
              </button>
            ) : (
              <div className="h-10 hidden lg:block" />
            )}
          </div>
        </div>
      </div>

      {/* Tabla de Contactos */}
      <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto min-h-[300px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-3 text-[#516f90]">
              <RefreshCcw className="w-8 h-8 animate-spin text-[#2d544c]" />
              <span className="text-sm font-semibold uppercase tracking-widest animate-pulse">Cargando base de datos...</span>
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-20 h-20 bg-[#eaf0f6] rounded-full flex items-center justify-center mb-6">
                <Users className="w-10 h-10 text-[#2d544c]" />
              </div>
              <p className="text-xl font-bold text-[#33475b]">No se encontraron contactos</p>
              <p className="text-[#516f90] mt-2 max-w-sm text-sm">Prueba limpiando los filtros actuales o añade un contacto nuevo manualmente.</p>
              {(search || status || source || project || interest || startDate || endDate) && (
                <button 
                  onClick={() => {
                    setSearch('');
                    setStatus('');
                    setSource('');
                    setProject('');
                    setInterest('');
                    setStartDate('');
                    setEndDate('');
                    setPage(1);
                  }}
                  className="mt-5 text-sm font-bold text-[#2d544c] hover:underline"
                >
                  Limpiar Filtros
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f5f8fa] text-[#516f90] text-xs font-bold uppercase tracking-wider border-b border-[#cbd6e2]">
                  <th className="px-6 py-4">Nombre / Cliente</th>
                  <th className="px-6 py-4">Correo Electrónico</th>
                  <th className="px-6 py-4">Teléfono</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4">Origen</th>
                  <th className="px-6 py-4">Asesor</th>
                  <th className="px-6 py-4">F. Ingreso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#cbd6e2]">
                {leads.map((lead) => (
                  <tr key={lead.id} onClick={() => setSelectedLead(lead)} className="hover:bg-[#f5f8fa] transition-all group cursor-pointer select-none">
                    <td className="px-6 py-4">
                      <p className="font-bold text-[#33475b] group-hover:text-[#2d544c] transition-colors">{getLeadName(lead)}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#516f90] font-medium">
                      {getLeadEmail(lead)}
                    </td>
                    <td className="px-6 py-4 text-sm text-[#516f90]">
                      {getLeadPhone(lead)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-[11px] font-bold border ${getStatusStyle(getLeadStatus(lead))}`}>
                        {getLeadStatus(lead)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-[#516f90]">
                      <span className="px-2 py-0.5 bg-slate-100 rounded border border-slate-200">
                        {getLeadSource(lead)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#516f90] font-semibold">
                      {lead.AdvisorName || lead.advisorName || lead.assignedTo?.name || 'No Asignado'}
                    </td>
                    <td className="px-6 py-4 text-xs text-[#516f90] whitespace-nowrap">
                      {getLeadDate(lead) ? (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-[#516f90]" />
                          {new Date(getLeadDate(lead)).toLocaleDateString()}
                        </div>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-[#cbd6e2] bg-[#f5f8fa] flex items-center justify-between">
            <span className="text-xs font-medium text-[#516f90]">
              Página <span className="text-[#2d544c] font-bold">{page}</span> de <span className="text-[#2d544c] font-bold">{totalPages}</span> ({totalCount} resultados)
            </span>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                disabled={!hasPrevPage}
                className="p-1.5 rounded-lg border border-[#cbd6e2] bg-white text-[#33475b] hover:bg-[#f5f8fa] transition-all disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
                disabled={!hasNextPage}
                className="p-1.5 rounded-lg border border-[#cbd6e2] bg-white text-[#33475b] hover:bg-[#f5f8fa] transition-all disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Añadir Contacto Manual */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#33475b]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white border border-[#cbd6e2] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl animate-scale-up">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-[#cbd6e2] flex justify-between items-center text-[#2d544c] bg-[#eaf0f6]/30">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#2d544c] text-white rounded-lg">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[#2d544c]">Nuevo Contacto</h3>
                  <p className="text-xs text-[#516f90]">Completa los datos del lead para agregarlo a la base de datos principal.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-[#516f90] hover:text-[#2d544c] p-1.5 rounded-full hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddContact}>
              <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Nombre */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Nombre</label>
                    <input 
                      type="text" 
                      placeholder="Ej: Nicolás"
                      value={formData.firstName}
                      onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                      className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded-lg px-4 py-2.5 text-[#33475b] focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-sm font-medium focus:bg-white transition-all"
                    />
                  </div>
                  
                  {/* Apellido */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Apellido</label>
                    <input 
                      type="text" 
                      placeholder="Ej: Silva"
                      value={formData.lastName}
                      onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                      className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded-lg px-4 py-2.5 text-[#33475b] focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-sm font-medium focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Correo Electrónico */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Correo Electrónico *</label>
                    <input 
                      type="email" 
                      placeholder="nicolas@aliminspa.cl"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded-lg px-4 py-2.5 text-[#33475b] focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-sm font-medium focus:bg-white transition-all"
                    />
                  </div>
                  
                  {/* Teléfono */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Teléfono</label>
                    <input 
                      type="text" 
                      placeholder="Ej: +56 9 1234 5678"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded-lg px-4 py-2.5 text-[#33475b] focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-sm font-medium focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Estado */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Estado</label>
                    <select 
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                      className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white"
                    >
                      {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  
                  {/* Origen */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Origen</label>
                    <select 
                      value={formData.source}
                      onChange={(e) => setFormData({...formData, source: e.target.value})}
                      className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white"
                    >
                      <option value="Manual">Manual</option>
                      <option value="META">META</option>
                      <option value="Sitio Web">Sitio Web</option>
                      <option value="Referido">Referido</option>
                      {sources.filter(s => s !== 'Manual' && s !== 'META' && s !== 'Sitio Web' && s !== 'Referido').map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  {/* Proyecto */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Proyecto</label>
                    <select 
                      value={formData.project}
                      onChange={(e) => setFormData({...formData, project: e.target.value})}
                      className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white"
                    >
                      <option value="">Seleccionar Proyecto</option>
                      <option value="Lomas del Mar">Lomas del Mar</option>
                      <option value="Arena y Sol">Arena y Sol</option>
                      {projects.filter(p => p !== 'Lomas del Mar' && p !== 'Arena y Sol').map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#f5f8fa] p-4 rounded-xl border border-[#cbd6e2]/50">
                  {/* Lote */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#516f90]" />
                      <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Número de Lote</label>
                    </div>
                    <input 
                      type="text" 
                      placeholder="Ej: A-15"
                      value={formData.lote}
                      onChange={(e) => setFormData({...formData, lote: e.target.value})}
                      className="w-full bg-white border border-[#cbd6e2] rounded-lg px-4 py-2.5 text-[#33475b] focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-sm font-medium transition-all"
                    />
                  </div>
                  
                  {/* Etapa */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-[#516f90]" />
                      <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Etapa</label>
                    </div>
                    <input 
                      type="text" 
                      placeholder="Ej: Etapa 1"
                      value={formData.etapa}
                      onChange={(e) => setFormData({...formData, etapa: e.target.value})}
                      className="w-full bg-white border border-[#cbd6e2] rounded-lg px-4 py-2.5 text-[#33475b] focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-sm font-medium transition-all"
                    />
                  </div>
                </div>

                <div className="bg-[#eaf0f6] p-4 rounded-xl border border-[#2d544c]/10 flex gap-2.5 items-start">
                  <Sparkles className="w-5 h-5 text-[#2d544c] shrink-0 mt-0.5" />
                  <p className="text-xs text-[#2d544c] leading-relaxed font-medium">
                    Al guardar este contacto, estará disponible inmediatamente para ser seleccionado en las audiencias de tus campañas de Email Marketing.
                  </p>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 bg-[#f5f8fa] flex gap-3 border-t border-[#cbd6e2]">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-[#cbd6e2] font-bold text-[#33475b] hover:bg-white transition-all text-sm"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 px-4 py-3 rounded-xl bg-[#2d544c] hover:bg-[#1f3a35] text-white font-bold transition-all disabled:opacity-50 shadow-md flex items-center justify-center gap-2 text-sm"
                >
                  {formLoading ? 'Guardando...' : (
                    <>
                      <Check className="w-4 h-4" />
                      Guardar Contacto
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Panel de Detalle Estilo HubSpot (3 Columnas) */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-center items-center backdrop-blur-sm bg-black/40 animate-fade-in p-4 md:p-6">
          <div className="bg-[#f5f8fa] w-full max-w-7xl h-[92vh] rounded-2xl border border-[#cbd6e2] shadow-2xl flex flex-col overflow-hidden animate-slide-up">
            
            {/* Cabecera del Panel */}
            <div className="px-6 py-4 bg-white border-b border-[#cbd6e2] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#eaf0f6] rounded-full flex items-center justify-center font-bold text-[#2d544c] border border-[#2d544c]/20 text-lg uppercase select-none">
                  {(selectedLead.FirstName || selectedLead.firstName || 'C')[0]}
                  {(selectedLead.LastName || selectedLead.lastName || '')[0]}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#33475b] flex items-center gap-2">
                    {getLeadName(selectedLead)}
                    <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-xs text-[#516f90] rounded font-bold uppercase tracking-wide">
                      {getLeadSource(selectedLead)}
                    </span>
                  </h2>
                  <p className="text-xs text-[#516f90] font-medium">{getLeadEmail(selectedLead)}</p>
                </div>
              </div>
              
              <button 
                onClick={() => setSelectedLead(null)}
                className="p-2 text-[#516f90] hover:text-[#33475b] hover:bg-[#f5f8fa] rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Cuerpo del Panel (3 Columnas) */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
              
              {/* Columna Izquierda (3/12) - Perfil & Información General */}
              <div className="lg:col-span-3 bg-white border-r border-[#cbd6e2] p-5 overflow-y-auto space-y-6 flex flex-col">
                <div>
                  <h3 className="text-xs font-bold text-[#516f90] uppercase tracking-wider mb-4">Información del Contacto</h3>
                  
                  <div className="space-y-4">
                    {/* Nombre Completo */}
                    <div>
                      <label className="text-[10px] font-bold text-[#516f90] uppercase tracking-wide block mb-1">Nombre</label>
                      <input 
                        type="text" 
                        defaultValue={selectedLead.FirstName || selectedLead.firstName || ''}
                        onBlur={(e) => handleUpdateLead(selectedLead.id, { firstName: e.target.value })}
                        className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded px-3 py-1.5 text-sm text-[#33475b] focus:ring-1 focus:ring-[#2d544c]/20 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#516f90] uppercase tracking-wide block mb-1">Apellido</label>
                      <input 
                        type="text" 
                        defaultValue={selectedLead.LastName || selectedLead.lastName || ''}
                        onBlur={(e) => handleUpdateLead(selectedLead.id, { lastName: e.target.value })}
                        className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded px-3 py-1.5 text-sm text-[#33475b] focus:ring-1 focus:ring-[#2d544c]/20 outline-none"
                      />
                    </div>
                    
                    {/* Email */}
                    <div>
                      <label className="text-[10px] font-bold text-[#516f90] uppercase tracking-wide block mb-1">Correo Electrónico</label>
                      <input 
                        type="email" 
                        defaultValue={getLeadEmail(selectedLead)}
                        onBlur={(e) => handleUpdateLead(selectedLead.id, { email: e.target.value })}
                        className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded px-3 py-1.5 text-sm text-[#33475b] focus:ring-1 focus:ring-[#2d544c]/20 outline-none"
                      />
                    </div>
                    
                    {/* Teléfono */}
                    <div>
                      <label className="text-[10px] font-bold text-[#516f90] uppercase tracking-wide block mb-1">Teléfono</label>
                      <input 
                        type="text" 
                        defaultValue={getLeadPhone(selectedLead)}
                        onBlur={(e) => handleUpdateLead(selectedLead.id, { phone: e.target.value })}
                        className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded px-3 py-1.5 text-sm text-[#33475b] focus:ring-1 focus:ring-[#2d544c]/20 outline-none"
                      />
                    </div>
                    
                    {/* Estado */}
                    <div>
                      <label className="text-[10px] font-bold text-[#516f90] uppercase tracking-wide block mb-1">Estado</label>
                      <select 
                        value={getLeadStatus(selectedLead)}
                        onChange={(e) => handleUpdateLead(selectedLead.id, { status: e.target.value })}
                        className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded px-3 py-1.5 text-sm text-[#33475b] focus:ring-1 focus:ring-[#2d544c]/20 outline-none"
                      >
                        {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
 
                    {/* Temperatura (Interés) */}
                    <div>
                      <label className="text-[10px] font-bold text-[#516f90] uppercase tracking-wide block mb-1">Interés / Temperatura</label>
                      <select 
                        value={selectedLead.Rating || selectedLead.rating || 'FRIO'}
                        onChange={(e) => handleUpdateLead(selectedLead.id, { rating: e.target.value })}
                        className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded px-3 py-1.5 text-sm text-[#33475b] focus:ring-1 focus:ring-[#2d544c]/20 outline-none font-bold text-slate-700"
                      >
                        <option value="FRIO">Frío ❄️</option>
                        <option value="INTERESADO">Interesado 🔥</option>
                        <option value="VENTA">Venta 💰</option>
                      </select>
                    </div>

                    {/* Asesor Asignado */}
                    <div>
                      <label className="text-[10px] font-bold text-[#516f90] uppercase tracking-wide block mb-1">Asesor Asignado</label>
                      <select 
                        value={selectedLead.assignedToId || selectedLead.assignedTo?.id || selectedLead.assignedtoid || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const advisor = advisors.find(a => a.id === val);
                          handleUpdateLead(selectedLead.id, { 
                            assignedToId: val || null,
                            AdvisorName: advisor ? advisor.name : 'No Asignado'
                          });
                        }}
                        className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded px-3 py-1.5 text-sm text-[#33475b] focus:ring-1 focus:ring-[#2d544c]/20 outline-none font-bold text-slate-700"
                      >
                        <option value="">No Asignado</option>
                        {advisors.map(adv => (
                          <option key={adv.id} value={adv.id}>{adv.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
 
                <div className="pt-4 border-t border-[#cbd6e2]/40 flex-1 flex flex-col justify-end text-xs text-[#516f90] space-y-2">
                  <div className="flex justify-between">
                    <span>Creado:</span>
                    <span className="font-bold">{getLeadDate(selectedLead) ? new Date(getLeadDate(selectedLead)).toLocaleDateString() : '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Último Update:</span>
                    <span className="font-bold">{selectedLead.updatedAt ? new Date(selectedLead.updatedAt).toLocaleDateString() : '-'}</span>
                  </div>
                  {isUpdatingField && (
                    <p className="text-[10px] text-[#2d544c] font-bold animate-pulse text-right">✓ Sincronizando cambios...</p>
                  )}
                </div>
              </div>
              
              {/* Columna Central (6/12) - Notas & Actividad */}
              <div className="lg:col-span-6 flex flex-col p-5 overflow-hidden">
                <div className="border-b border-[#cbd6e2] pb-3 mb-4 flex items-center justify-between">
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setActiveTab('notes')}
                      className={`text-sm font-bold pb-2 transition-all border-b-2 ${activeTab === 'notes' ? 'border-[#2d544c] text-[#2d544c]' : 'border-transparent text-[#516f90]'}`}
                    >
                      Notas & Historial
                    </button>
                    <button 
                      onClick={() => setActiveTab('activity')}
                      className={`text-sm font-bold pb-2 transition-all border-b-2 ${activeTab === 'activity' ? 'border-[#2d544c] text-[#2d544c]' : 'border-transparent text-[#516f90]'}`}
                    >
                      Actividad Técnica
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                  {activeTab === 'notes' ? (
                    <>
                      {/* Editor de Notas */}
                      <div className="bg-white border border-[#cbd6e2] rounded-xl p-4 shadow-sm space-y-3">
                        <label className="text-xs font-bold text-[#33475b] block">Editar Nota Principal</label>
                        <textarea 
                          placeholder="Agrega comentarios o detalles importantes del contacto aquí..."
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          rows={3}
                          className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded-lg p-3 text-sm text-[#33475b] focus:ring-2 focus:ring-[#2d544c]/20 outline-none resize-none"
                        />
                        <div className="flex justify-end">
                          <button 
                            onClick={async () => {
                              await handleUpdateLead(selectedLead.id, { notes: newNote });
                            }}
                            disabled={isUpdatingField}
                            className="bg-[#2d544c] hover:bg-[#1f3a35] text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-sm disabled:opacity-50"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            Guardar Nota
                          </button>
                        </div>
                      </div>
 
                      {/* Línea de Tiempo de Actividades */}
                      <div className="space-y-4 pt-2 flex flex-col">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Historial de Eventos</h4>
                          
                          {/* Filtro de Fechas */}
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <input 
                              type="date"
                              value={eventStartDate}
                              onChange={(e) => setEventStartDate(e.target.value)}
                              className="bg-white border border-[#cbd6e2] rounded px-1.5 py-0.5 text-[#33475b] outline-none text-xs"
                              title="Fecha inicial"
                            />
                            <span className="text-slate-400">a</span>
                            <input 
                              type="date"
                              value={eventEndDate}
                              onChange={(e) => setEventEndDate(e.target.value)}
                              className="bg-white border border-[#cbd6e2] rounded px-1.5 py-0.5 text-[#33475b] outline-none text-xs"
                              title="Fecha final"
                            />
                            {(eventStartDate || eventEndDate) && (
                              <button 
                                onClick={() => { setEventStartDate(''); setEventEndDate(''); }}
                                className="text-red-500 hover:text-red-700 hover:bg-slate-100 rounded p-0.5"
                                title="Limpiar filtro de fecha"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Contenedor del Historial con Scroll Interno */}
                        <div className="relative border-l-2 border-[#cbd6e2] ml-3 pl-6 space-y-6 py-2 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                          
                          {/* Nota Principal del Asesor (Fijada al inicio) */}
                          {selectedLead.notes && (
                            <div className="relative">
                              <div className="absolute -left-[31px] top-0 w-4 h-4 bg-amber-500 rounded-full border-2 border-white flex items-center justify-center">
                                <Edit3 className="w-2 h-2 text-white" />
                              </div>
                              <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 shadow-sm text-xs text-[#33475b] space-y-1">
                                <p className="font-bold flex items-center gap-1.5 text-amber-800">
                                  <Edit3 className="w-3 h-3" /> Nota del Asesor
                                </p>
                                <p className="leading-relaxed whitespace-pre-wrap">{selectedLead.notes}</p>
                              </div>
                            </div>
                          )}

                          {/* Actividades Dinámicas cargadas desde el API */}
                          {loadingActivities ? (
                            <div className="flex items-center justify-center py-12 text-slate-400 gap-2 text-xs font-semibold">
                              <RefreshCcw className="w-4 h-4 animate-spin text-[#2d544c]" />
                              <span>Cargando historial de actividad...</span>
                            </div>
                          ) : activities.length === 0 ? (
                            <div className="text-center py-12 text-xs text-slate-400 font-medium">
                              No hay eventos ni actividades registradas.
                            </div>
                          ) : (
                            activities.map((event) => {
                              const style = getEventStyle(event.type);
                              const Icon = style.icon;
                              return (
                                <div key={event.id} className="relative animate-fade-in">
                                  <div className={`absolute -left-[31px] top-0 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${style.colorClass}`}>
                                    <Icon className="w-2 h-2 text-white" />
                                  </div>
                                  <div className={`${style.bgClass} border ${style.borderClass} rounded-xl p-3 shadow-sm text-xs text-[#33475b] space-y-1`}>
                                    <p className="font-bold text-slate-800">
                                      {event.title}
                                    </p>
                                    <p className="leading-relaxed text-slate-600">{event.description}</p>
                                    
                                    {/* Enlace de página visitada */}
                                    {event.type === 'PAGE_VIEW' && event.details?.page_url && (
                                      <a 
                                        href={event.details.page_url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-[10px] text-sky-600 hover:underline flex items-center gap-1 font-mono font-medium truncate max-w-xs mt-1"
                                      >
                                        <Link2 className="w-3 h-3 shrink-0" />
                                        {event.details.page_url}
                                      </a>
                                    )}
                                    
                                    {/* Campos de formulario enviado */}
                                    {event.type === 'FORM_SUBMIT' && event.details?.form_data && (
                                      <div className="mt-2 bg-white/80 border border-slate-200/50 rounded-lg p-2 font-mono text-[10px] text-slate-600 max-h-32 overflow-y-auto">
                                        {Object.entries(event.details.form_data).map(([k, v]) => (
                                          <div key={k} className="flex justify-between py-0.5 border-b border-slate-100 last:border-0 gap-4">
                                            <span className="font-semibold text-slate-500 shrink-0">{k}:</span>
                                            <span className="text-slate-800 break-all text-right font-medium">{String(v)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    <p className="text-[9px] text-[#516f90] pt-1 font-semibold flex items-center gap-1">
                                      <Clock className="w-3 h-3 text-slate-400" />
                                      {new Date(event.date).toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Actividad Técnica */
                    <div className="bg-white border border-[#cbd6e2] rounded-xl p-5 shadow-sm space-y-4">
                      <h4 className="text-xs font-bold text-[#33475b] uppercase tracking-wider flex items-center gap-1.5">
                        <Info className="w-4 h-4 text-[#2d544c]" />
                        Metadatos Completos en DB
                      </h4>
                      <p className="text-xs text-[#516f90]">A continuación se listan todos los campos físicos y valores de la tabla Lead devueltos en la base de datos de producción:</p>
                      
                      <div className="divide-y divide-[#cbd6e2]/40 text-xs border border-[#cbd6e2]/60 rounded-lg bg-slate-50/50">
                        {Object.keys(selectedLead).map((key) => {
                          const val = selectedLead[key];
                          if (val === null || val === undefined || typeof val === 'object') return null;
                          return (
                            <div key={key} className="flex py-2 px-3 hover:bg-slate-50 justify-between items-center">
                              <span className="font-mono text-[#516f90] font-semibold">{key}</span>
                              <span className="font-medium text-[#33475b] max-w-xs break-all text-right">{val.toString()}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Columna Derecha (3/12) - Datos Asociados & Parámetros Tracking */}
              <div className="lg:col-span-3 bg-white border-l border-[#cbd6e2] p-5 overflow-y-auto space-y-6">
                
                {/* Sección 1: Asociación de Propiedad */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-[#516f90] uppercase tracking-wider flex items-center gap-1.5">
                    <Map className="w-4 h-4 text-[#2d544c]" />
                    Propiedad & Proyecto
                  </h4>
                  
                  <div className="bg-slate-50 rounded-xl p-3 border border-[#cbd6e2]/60 space-y-2.5 text-xs">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-[#516f90]">Proyecto</p>
                      <p className="font-bold text-[#33475b] text-sm mt-0.5">{getLeadProject(selectedLead)}</p>
                    </div>
                    {getLeadLote(selectedLead) && (
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#516f90]">Lote Asignado</p>
                        <p className="font-semibold text-slate-800 mt-0.5">Lote {getLeadLote(selectedLead)}</p>
                      </div>
                    )}
                    {getLeadEtapa(selectedLead) && (
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#516f90]">Etapa</p>
                        <p className="text-slate-700 mt-0.5">{getLeadEtapa(selectedLead)}</p>
                      </div>
                    )}
                    {!getLeadLote(selectedLead) && !getLeadEtapa(selectedLead) && (
                      <p className="text-slate-400 italic">No hay lote ni etapa asociados en la base de datos.</p>
                    )}
                  </div>
                </div>
 
                {/* Sección 2: Visitas Agendadas */}
                {(selectedLead.visited || selectedLead.visitProject || selectedLead.visitDate) && (
                  <div className="space-y-3 pt-3 border-t border-[#cbd6e2]/40">
                    <h4 className="text-xs font-bold text-[#516f90] uppercase tracking-wider flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-[#2d544c]" />
                      Visitas
                    </h4>
                    <div className="bg-slate-50 rounded-xl p-3 border border-[#cbd6e2]/60 space-y-2.5 text-xs text-[#33475b]">
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#516f90]">¿Realizó Visita?</p>
                        <p className="font-bold mt-0.5">{selectedLead.visited ? 'Sí ✓' : 'No'}</p>
                      </div>
                      {selectedLead.visitProject && (
                        <div>
                          <p className="text-[10px] uppercase font-bold text-[#516f90]">Proyecto Visitado</p>
                          <p className="font-semibold mt-0.5">{selectedLead.visitProject}</p>
                        </div>
                      )}
                      {selectedLead.visitDate && (
                        <div>
                          <p className="text-[10px] uppercase font-bold text-[#516f90]">Fecha de Visita</p>
                          <p className="mt-0.5">{new Date(selectedLead.visitDate).toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
 
                {/* Sección 3: Parámetros UTM de Captura */}
                {(selectedLead.utmSource || selectedLead.utmMedium || selectedLead.utmCampaign || selectedLead.utmContent || selectedLead.utmTerm) && (
                  <div className="space-y-3 pt-3 border-t border-[#cbd6e2]/40">
                    <h4 className="text-xs font-bold text-[#516f90] uppercase tracking-wider flex items-center gap-1.5">
                      <Link2 className="w-4 h-4 text-[#2d544c]" />
                      Parámetros UTM
                    </h4>
                    
                    <div className="bg-slate-50 rounded-xl p-3 border border-[#cbd6e2]/60 space-y-2 text-xs">
                      {selectedLead.utmSource && (
                        <div>
                          <span className="font-bold text-[#516f90]">Source:</span> <span className="text-[#33475b]">{selectedLead.utmSource}</span>
                        </div>
                      )}
                      {selectedLead.utmMedium && (
                        <div>
                          <span className="font-bold text-[#516f90]">Medium:</span> <span className="text-[#33475b]">{selectedLead.utmMedium}</span>
                        </div>
                      )}
                      {selectedLead.utmCampaign && (
                        <div>
                          <span className="font-bold text-[#516f90]">Campaign:</span> <span className="text-[#33475b]">{selectedLead.utmCampaign}</span>
                        </div>
                      )}
                      {selectedLead.utmContent && (
                        <div>
                          <span className="font-bold text-[#516f90]">Content:</span> <span className="text-[#33475b]">{selectedLead.utmContent}</span>
                        </div>
                      )}
                      {selectedLead.utmTerm && (
                        <div>
                          <span className="font-bold text-[#516f90]">Term:</span> <span className="text-[#33475b]">{selectedLead.utmTerm}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
 
                {/* Sección 4: Datos Técnicos (Meta Lead Ads) */}
                {(selectedLead.formId || selectedLead.formid || selectedLead.adName || selectedLead.adname || selectedLead.adId || selectedLead.adid || selectedLead.contactId || selectedLead.contactid || getMontoPie(selectedLead)) && (
                  <div className="space-y-3 pt-3 border-t border-[#cbd6e2]/40">
                    <h4 className="text-xs font-bold text-[#516f90] uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-[#2d544c]" />
                      Meta Ads Integración
                    </h4>
                    
                    <div className="bg-slate-50 rounded-xl p-3 border border-[#cbd6e2]/60 space-y-2 text-xs">
                      {(selectedLead.formId || selectedLead.formid) && (
                        <div>
                          <p className="text-[10px] uppercase font-bold text-[#516f90]">ID Formulario</p>
                          <p className="font-mono text-[#33475b] mt-0.5">{selectedLead.formId || selectedLead.formid}</p>
                        </div>
                      )}
                      {(selectedLead.adName || selectedLead.adname) && (
                        <div>
                          <p className="text-[10px] uppercase font-bold text-[#516f90]">Nombre del Anuncio</p>
                          <p className="text-[#33475b] mt-0.5">{selectedLead.adName || selectedLead.adname}</p>
                        </div>
                      )}
                      {getMontoPie(selectedLead) && (
                        <div>
                          <p className="text-[10px] uppercase font-bold text-[#516f90]">Monto de Pie Dispuesto a Pagar</p>
                          <p className="text-[#2d544c] font-bold mt-0.5">{getMontoPie(selectedLead)}</p>
                        </div>
                      )}
                      {(selectedLead.adId || selectedLead.adid) && (
                        <div>
                          <p className="text-[10px] uppercase font-bold text-[#516f90]">ID del Anuncio</p>
                          <p className="font-mono text-[#33475b] mt-0.5">{selectedLead.adId || selectedLead.adid}</p>
                        </div>
                      )}
                      {(selectedLead.contactId || selectedLead.contactid) && (
                        <div>
                          <p className="text-[10px] uppercase font-bold text-[#516f90]">ID de Contacto (Meta)</p>
                          <p className="font-mono text-[#33475b] mt-0.5">{selectedLead.contactId || selectedLead.contactid}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
 
              </div>
              
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}
