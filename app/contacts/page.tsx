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
  Sparkles
} from 'lucide-react';

interface Lead {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; // Permite mapear dinámicamente cualquier esquema de columnas
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
  
  // Opciones de filtros dinámicos (cargados desde API)
  const [statuses, setStatuses] = useState<string[]>(['Nuevo', 'Contactado', 'Visita']);
  const [sources, setSources] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);

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

  // Cargar filtros iniciales
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
    fetchFilters();
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
        project
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
  }, [page, limit, search, status, source, project]);

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
  const getLeadSource = (lead: Lead) => lead.Source || lead.source || 'Manual';
  const getLeadProject = (lead: Lead) => lead.Project || lead.project || '-';
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
      <div className="bg-white border border-[#cbd6e2] rounded-xl p-5 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
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

        {/* Filtrar por Proyecto */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Proyecto</label>
          <select 
            value={project}
            onChange={(e) => {
              setProject(e.target.value);
              setPage(1);
            }}
            className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white"
          >
            <option value="">Todos los Proyectos</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
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
              {(search || status || source || project) && (
                <button 
                  onClick={() => {
                    setSearch('');
                    setStatus('');
                    setSource('');
                    setProject('');
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
                  <th className="px-6 py-4">Proyecto</th>
                  <th className="px-6 py-4">Lote / Etapa</th>
                  <th className="px-6 py-4">F. Ingreso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#cbd6e2]">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-[#f5f8fa] transition-all group">
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
                    <td className="px-6 py-4 text-sm text-[#33475b] font-medium">
                      {getLeadProject(lead)}
                    </td>
                    <td className="px-6 py-4 text-xs text-[#516f90]">
                      {getLeadLote(lead) || getLeadEtapa(lead) ? (
                        <div className="space-y-0.5">
                          {getLeadLote(lead) && <p className="font-bold">Lote: <span className="font-medium">{getLeadLote(lead)}</span></p>}
                          {getLeadEtapa(lead) && <p className="text-[10px]">Etapa: {getLeadEtapa(lead)}</p>}
                        </div>
                      ) : '-'}
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
    </div>
  );
}
