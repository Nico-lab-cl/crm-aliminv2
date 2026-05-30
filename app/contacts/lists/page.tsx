'use client';

import { useEffect, useState, useCallback } from 'react';
import { 
  Users, 
  Trash2, 
  Plus, 
  Layers, 
  Zap, 
  Search, 
  ListFilter, 
  RefreshCcw, 
  Save, 
  Clock
} from 'lucide-react';

interface Segment {
  id: string;
  name: string;
  type: 'dynamic' | 'static';
  filters: {
    status?: string;
    source?: string;
    project?: string;
    interest?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    activity?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    ids?: string[];
  };
  created_at: string;
}

interface Lead {
  id: string;
  FirstName?: string;
  LastName?: string;
  firstName?: string;
  lastName?: string;
  Email?: string;
  email?: string;
  Phone?: string;
  phone?: string;
  Status?: string;
  status?: string;
  Source?: string;
  source?: string;
  AdvisorName?: string;
  advisorName?: string;
  CreatedAt?: string;
  createdAt?: string;
}

export default function ListsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loadingSegments, setLoadingSegments] = useState(true);
  
  // Filtros del creador
  const [listName, setListName] = useState('');
  const [listType, setListType] = useState<'dynamic' | 'static'>('dynamic');
  const [statusFilter, setStatusFilter] = useState('');
  const [interestFilter, setInterestFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [activityFilter, setActivityFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  
  // UTM Filters
  const [utmSourceFilter, setUtmSourceFilter] = useState('');
  const [utmMediumFilter, setUtmMediumFilter] = useState('');
  const [utmCampaignFilter, setUtmCampaignFilter] = useState('');

  // UTM Metadata from API
  const [utmSources, setUtmSources] = useState<string[]>([]);
  const [utmMediums, setUtmMediums] = useState<string[]>([]);
  const [utmCampaigns, setUtmCampaigns] = useState<string[]>([]);

  // Previsualización de Leads
  const [previewLeads, setPreviewLeads] = useState<Lead[]>([]);
  const [previewCount, setPreviewCount] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Segmento Activo / Editando
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);

  // Cargar metadatos de filtros (incluyendo UTMs)
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const res = await fetch('/api/leads/filters');
        if (res.ok) {
          const data = await res.json();
          setUtmSources(data.utmSources || []);
          setUtmMediums(data.utmMediums || []);
          setUtmCampaigns(data.utmCampaigns || []);
        }
      } catch (e) {
        console.error('Error fetching filters metadata:', e);
      }
    };
    fetchMetadata();
  }, []);

  // Cargar todos los segmentos guardados
  const fetchSegments = useCallback(async () => {
    setLoadingSegments(true);
    try {
      const res = await fetch('/api/segments');
      if (res.ok) {
        setSegments(await res.json());
      }
    } catch (e) {
      console.error('Error fetching segments:', e);
    } finally {
      setLoadingSegments(false);
    }
  }, []);

  useEffect(() => {
    fetchSegments();
  }, [fetchSegments]);

  // Carga reactiva de previsualización de leads calificados
  const fetchPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        interest: interestFilter,
        project: projectFilter,
        activity: activityFilter,
        search: searchFilter,
        utmSource: utmSourceFilter,
        utmMedium: utmMediumFilter,
        utmCampaign: utmCampaignFilter,
        startDate: startDateFilter,
        endDate: endDateFilter,
        limit: '100' // preview limit
      });

      const res = await fetch(`/api/leads?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPreviewLeads(data.leads || []);
        setPreviewCount(data.totalCount || 0);
      }
    } catch (e) {
      console.error('Error fetching leads preview:', e);
    } finally {
      setPreviewLoading(false);
    }
  }, [
    statusFilter, 
    interestFilter, 
    projectFilter, 
    activityFilter, 
    searchFilter, 
    utmSourceFilter, 
    utmMediumFilter, 
    utmCampaignFilter,
    startDateFilter,
    endDateFilter
  ]);

  useEffect(() => {
    // Si estamos editando un segmento estático existente, no cargamos preview reactiva
    if (selectedSegment && selectedSegment.type === 'static') {
      return;
    }
    fetchPreview();
  }, [fetchPreview, selectedSegment]);

  // Cargar detalles de un segmento existente al seleccionarlo
  const handleSelectSegment = async (segment: Segment) => {
    setSelectedSegment(segment);
    setListName(segment.name);
    setListType(segment.type);
    setStartDateFilter(segment.filters.startDate || '');
    setEndDateFilter(segment.filters.endDate || '');

    if (segment.type === 'static') {
      // Cargar leads específicos de la lista estática
      setPreviewLoading(true);
      try {
        const ids = segment.filters.ids || [];
        if (ids.length === 0) {
          setPreviewLeads([]);
          setPreviewCount(0);
        } else {
          const res = await fetch(`/api/leads?ids=${ids.join(',')}`);
          if (res.ok) {
            const data = await res.json();
            setPreviewLeads(data.leads || []);
            setPreviewCount(data.totalCount || 0);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setPreviewLoading(false);
      }
    } else {
      // Dinámico: Rellenar filtros para previsualización
      setStatusFilter(segment.filters.status || '');
      setInterestFilter(segment.filters.interest || '');
      setProjectFilter(segment.filters.project || '');
      setActivityFilter(segment.filters.activity || '');
      setSearchFilter(segment.filters.search || '');
      setUtmSourceFilter(segment.filters.utmSource || '');
      setUtmMediumFilter(segment.filters.utmMedium || '');
      setUtmCampaignFilter(segment.filters.utmCampaign || '');
    }
  };

  // Restablecer creador a limpio
  const handleResetCreator = () => {
    setSelectedSegment(null);
    setListName('');
    setListType('dynamic');
    setStatusFilter('');
    setInterestFilter('');
    setProjectFilter('');
    setActivityFilter('');
    setSearchFilter('');
    setUtmSourceFilter('');
    setUtmMediumFilter('');
    setUtmCampaignFilter('');
    setStartDateFilter('');
    setEndDateFilter('');
    fetchPreview();
  };

  // Guardar lista (dinámica o estática, creación o edición)
  const handleSaveList = async (e: React.FormEvent, forceNew = false) => {
    if (e) e.preventDefault();
    if (!listName.trim()) return alert('Ingresa un nombre para la lista.');

    let filtersObj: Segment['filters'] = {};

    if (listType === 'static') {
      // Estática: Guardar instantánea de IDs actuales calificados
      if (previewLeads.length === 0) {
        return alert('No hay contactos en la previsualización para crear una lista estática.');
      }
      const ids = previewLeads.map(l => l.id);
      filtersObj = {
        ids,
        startDate: startDateFilter || undefined,
        endDate: endDateFilter || undefined
      };
    } else {
      // Dinámica: Guardar criterios de filtrado
      filtersObj = {
        status: statusFilter || undefined,
        interest: interestFilter || undefined,
        project: projectFilter || undefined,
        activity: activityFilter || undefined,
        search: searchFilter || undefined,
        utmSource: utmSourceFilter || undefined,
        utmMedium: utmMediumFilter || undefined,
        utmCampaign: utmCampaignFilter || undefined,
        startDate: startDateFilter || undefined,
        endDate: endDateFilter || undefined
      };
    }

    try {
      const isEditing = !!selectedSegment && !forceNew;
      const url = isEditing ? `/api/segments/${selectedSegment.id}` : '/api/segments';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: listName,
          type: listType,
          filters: filtersObj
        })
      });

      if (res.ok) {
        alert(isEditing ? `Lista "${listName}" actualizada correctamente.` : `Lista "${listName}" creada correctamente.`);
        handleResetCreator();
        fetchSegments();
      } else {
        const err = await res.json();
        alert('Error al guardar: ' + err.message);
      }
    } catch (e) {
      console.error(e);
      alert('Error de conexión.');
    }
  };

  // Eliminar segmento
  const handleDeleteSegment = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('¿Estás seguro de eliminar este segmento?')) return;

    try {
      const res = await fetch(`/api/segments/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedSegment && selectedSegment.id === id) {
          handleResetCreator();
        }
        fetchSegments();
      } else {
        alert('No se pudo eliminar el segmento.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getLeadName = (lead: Lead) => {
    const first = lead.FirstName || lead.firstName || '';
    const last = lead.LastName || lead.lastName || '';
    return first && last ? `${first} ${last}` : first || 'Sin Nombre';
  };

  // Renderizar filtros del segmento en formato legible de badge
  const renderFilterBadges = (filters: Segment['filters']) => {
    const badges: string[] = [];
    if (filters.ids) {
      return <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded font-bold uppercase">Snapshot: {filters.ids.length} Leads</span>;
    }
    if (filters.status) badges.push(`Estado: ${filters.status}`);
    if (filters.source) badges.push(`Origen: ${filters.source}`);
    if (filters.interest) badges.push(`Interés: ${filters.interest}`);
    if (filters.project) badges.push(`Proyecto: ${filters.project}`);
    if (filters.activity) {
      const actLabels: Record<string, string> = {
        web_subscription: 'Suscripción Web',
        meta_conversion: 'Meta Ads',
        visit: 'Visita Terreno',
        reservation: 'Reserva Lote'
      };
      badges.push(`Actividad: ${actLabels[filters.activity] || filters.activity}`);
    }
    if (filters.utmSource) badges.push(`UTM Source: ${filters.utmSource}`);
    if (filters.startDate) badges.push(`Desde: ${new Date(filters.startDate).toLocaleDateString('es-CL', { timeZone: 'UTC' })}`);
    if (filters.endDate) badges.push(`Hasta: ${new Date(filters.endDate).toLocaleDateString('es-CL', { timeZone: 'UTC' })}`);

    if (badges.length === 0) return <span className="text-[10px] text-slate-400 italic">Sin filtros (Todos los leads)</span>;

    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {badges.map((b, i) => (
          <span key={i} className="text-[9px] bg-[#f5f8fa] text-[#516f90] border border-[#cbd6e2]/60 px-1.5 py-0.5 rounded font-medium">
            {b}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto text-[#33475b]">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#2d544c] text-white rounded-xl shadow-md">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-[#2d544c]">Listas y Segmentos</h1>
              <p className="text-[#516f90] mt-1 text-sm">Crea audiencias dinámicas y estáticas para automatizar tus campañas de Email Marketing.</p>
            </div>
          </div>
        </div>
        <div>
          {selectedSegment && (
            <button 
              onClick={handleResetCreator}
              className="flex items-center gap-2 px-4 py-2 border border-[#cbd6e2] bg-white text-[#33475b] hover:text-[#2d544c] hover:bg-[#f5f8fa] rounded-xl font-bold transition-all shadow-sm text-sm"
            >
              <Plus className="w-4 h-4" />
              Crear Nueva Lista
            </button>
          )}
        </div>
      </div>

      {/* Grid Principal (2 Columnas) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Columna Izquierda (4/12): Lista de Segmentos Guardados */}
        <div className="lg:col-span-4 bg-white border border-[#cbd6e2] rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#cbd6e2]/40 pb-3">
            <h3 className="font-bold text-[#2d544c] flex items-center gap-2">
              <ListFilter className="w-4 h-4" />
              Tus Listas Guardadas
            </h3>
            <button onClick={fetchSegments} title="Recargar Listas">
              <RefreshCcw className={`w-3.5 h-3.5 text-[#516f90] hover:text-[#2d544c] ${loadingSegments ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="space-y-3 overflow-y-auto max-h-[70vh] pr-1">
            {loadingSegments ? (
              <div className="text-center py-12 text-[#516f90] animate-pulse">
                <RefreshCcw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#2d544c]" />
                <span className="text-xs font-bold uppercase tracking-wider">Cargando listas...</span>
              </div>
            ) : segments.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-[#cbd6e2] rounded-xl">
                <Layers className="w-10 h-10 text-[#cbd6e2] mx-auto mb-3" />
                <p className="text-sm font-bold text-[#33475b]">No tienes listas creadas</p>
                <p className="text-xs text-[#516f90] mt-1 max-w-xs mx-auto">Configura filtros en la derecha y haz clic en guardar para crear tu primer segmento.</p>
              </div>
            ) : (
              segments.map((seg) => {
                const isActive = selectedSegment?.id === seg.id;
                return (
                  <div 
                    key={seg.id} 
                    onClick={() => handleSelectSegment(seg)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer relative group flex justify-between items-start ${
                      isActive 
                        ? 'border-[#2d544c] bg-[#eaf0f6]/50 shadow-md ring-1 ring-[#2d544c]/20' 
                        : 'border-[#cbd6e2] hover:border-[#2d544c]/40 hover:bg-[#f5f8fa]/40 bg-white'
                    }`}
                  >
                    <div className="space-y-1.5 flex-1 min-w-0 pr-6">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                          seg.type === 'static' 
                            ? 'bg-blue-50 text-blue-700 border-blue-200' 
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {seg.type === 'static' ? 'Estática' : 'Dinámica'}
                        </span>
                        <h4 className="font-bold text-[#33475b] truncate text-sm">{seg.name}</h4>
                      </div>
                      
                      {renderFilterBadges(seg.filters)}

                      <div className="flex items-center gap-1.5 text-[10px] text-[#516f90] pt-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Creado: {new Date(seg.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <button 
                      onClick={(e) => handleDeleteSegment(seg.id, e)}
                      className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors absolute right-2 top-2 lg:opacity-0 lg:group-hover:opacity-100"
                      title="Eliminar Lista"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Columna Derecha (8/12): Creador / Inspector de Segmentos */}
        <div className="lg:col-span-8 bg-white border border-[#cbd6e2] rounded-2xl p-6 shadow-sm space-y-6">
          <div className="border-b border-[#cbd6e2]/40 pb-4 flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold text-[#2d544c]">
                {selectedSegment ? `Editando Lista: ${selectedSegment.name}` : 'Creador de Listas y Segmentos'}
              </h3>
              <p className="text-xs text-[#516f90] mt-0.5">
                {selectedSegment ? 'Modifica los parámetros de esta lista y guarda los cambios.' : 'Elige el tipo de lista, configura los filtros y haz clic en Guardar.'}
              </p>
            </div>
            {selectedSegment && (
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                selectedSegment.type === 'static' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
                Lista {selectedSegment.type === 'static' ? 'Estática (Snapshot)' : 'Dinámica (Auto-actualizable)'}
              </span>
            )}
          </div>

          <form onSubmit={(e) => handleSaveList(e)} className="space-y-6">
            
            {/* 1. Nombre y Tipo de Lista */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#f5f8fa]/50 p-4 rounded-xl border border-[#cbd6e2]/50">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider block">Nombre de la Lista / Segmento</label>
                <input 
                  type="text" 
                  placeholder="Ej: Clientes Arena y Sol Fríos"
                  required
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  className="w-full bg-white border border-[#cbd6e2] rounded-lg px-4 py-2.5 text-[#33475b] focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-sm font-medium transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider block">Tipo de Lista</label>
                {selectedSegment ? (
                  <div className="py-2.5 px-4 bg-white border border-[#cbd6e2] rounded-lg text-sm text-[#33475b] font-semibold">
                    {selectedSegment.type === 'static' ? 'Estática (IDs fijos)' : 'Dinámica (Criterios activos)'}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setListType('dynamic')}
                      className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all ${
                        listType === 'dynamic'
                          ? 'border-[#2d544c] bg-[#eaf0f6] text-[#2d544c]'
                          : 'border-[#cbd6e2] bg-white text-[#516f90] hover:bg-[#f5f8fa]'
                      }`}
                    >
                      Dinámica ⚡
                    </button>
                    <button
                      type="button"
                      onClick={() => setListType('static')}
                      className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all ${
                        listType === 'static'
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-[#cbd6e2] bg-white text-[#516f90] hover:bg-[#f5f8fa]'
                      }`}
                    >
                      Estática 📸
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Advertencia Informativa sobre Tipos */}
            {!selectedSegment && (
              <div className="bg-[#eaf0f6] border border-[#2d544c]/10 rounded-xl p-3.5 flex gap-2.5 items-start">
                <Zap className="w-5 h-5 text-[#2d544c] shrink-0 mt-0.5" />
                <p className="text-xs text-[#2d544c] leading-relaxed font-medium">
                  {listType === 'dynamic' ? (
                    <><strong>Lista Dinámica (Recomendado):</strong> Evalúa los criterios en tiempo real. Cualquier lead que ingrese en el futuro (desde formularios de Meta o la web aliminspa.cl) que califique con estas reglas se agregará automáticamente.</>
                  ) : (
                    <><strong>Lista Estática (Snapshot):</strong> Captura los contactos que califiquen con estos filtros <em>justo en este momento</em>. En el futuro, la lista mantendrá fijos únicamente a estos contactos específicos sin añadir nuevos registros.</>
                  )}
                </p>
              </div>
            )}

            {/* 2. Filtros de Segmentación (Editables para creación/dinámicas, leídos para estáticas) */}
            <div className="space-y-5">
              <h4 className="text-xs font-bold text-[#516f90] uppercase tracking-wider border-b border-[#cbd6e2]/40 pb-2">Reglas de Segmentación</h4>
              
              {/* Fila 1: Filtros de Negocio */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider block">Estado del Contacto</label>
                  <select 
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    disabled={selectedSegment?.type === 'static'}
                    className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white"
                  >
                      <option value="">Todos los Estados</option>
                      <option value="Nuevo">Nuevo</option>
                      <option value="Contactado">Contactado</option>
                      <option value="Visita">Visita</option>
                      <option value="Reservado">Reservado</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider block">Interés / Temperatura</label>
                    <select 
                      value={interestFilter}
                      onChange={(e) => setInterestFilter(e.target.value)}
                      disabled={selectedSegment?.type === 'static'}
                      className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white"
                    >
                      <option value="">Todos los Intereses</option>
                      <option value="FRIO">Frío ❄️</option>
                      <option value="INTERESADO">Interesado 🔥</option>
                      <option value="VENTA">Venta 💰</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider block">Proyecto de Interés</label>
                    <select 
                      value={projectFilter}
                      onChange={(e) => setProjectFilter(e.target.value)}
                      disabled={selectedSegment?.type === 'static'}
                      className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white"
                    >
                      <option value="">Todos los Proyectos</option>
                      <option value="Lomas del Mar">Lomas del Mar</option>
                      <option value="Arena y Sol">Arena y Sol</option>
                    </select>
                  </div>
                </div>

                {/* Fila 2: Actividades Técnicas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider block">Actividad Técnica Realizada</label>
                    <select 
                      value={activityFilter}
                      onChange={(e) => setActivityFilter(e.target.value)}
                      disabled={selectedSegment?.type === 'static'}
                      className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white"
                    >
                      <option value="">Todas las Actividades</option>
                      <option value="web_subscription">Suscripción en Sitio Web 🌐</option>
                      <option value="meta_conversion">Conversión de Anuncio Meta Ads 📱</option>
                      <option value="visit">Visita a Terreno Agendada 📍</option>
                      <option value="reservation">Propiedad Reservada 💰</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider block">Texto de Búsqueda (Filtro Libre)</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#516f90]" />
                      <input 
                        type="text" 
                        placeholder="Filtrar por nombre, correo..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        disabled={selectedSegment?.type === 'static'}
                        className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-[#2d544c]/20 outline-none focus:bg-white transition-all text-[#33475b]"
                      />
                    </div>
                  </div>
                </div>

                {/* Fila 3: Parámetros UTM Detectados en DB */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-[#516f90] uppercase tracking-wider block">Clasificación por Parámetros UTM</span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-[#516f90]">UTM Source</span>
                      <select 
                        value={utmSourceFilter}
                        onChange={(e) => setUtmSourceFilter(e.target.value)}
                        disabled={selectedSegment?.type === 'static'}
                        className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white"
                      >
                        <option value="">Todos los UTM Sources</option>
                        {utmSources.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-[#516f90]">UTM Medium</span>
                      <select 
                        value={utmMediumFilter}
                        onChange={(e) => setUtmMediumFilter(e.target.value)}
                        disabled={selectedSegment?.type === 'static'}
                        className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white"
                      >
                        <option value="">Todos los UTM Mediums</option>
                        {utmMediums.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-[#516f90]">UTM Campaign</span>
                      <select 
                        value={utmCampaignFilter}
                        onChange={(e) => setUtmCampaignFilter(e.target.value)}
                        disabled={selectedSegment?.type === 'static'}
                        className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white"
                      >
                        <option value="">Todos los UTM Campaigns</option>
                        {utmCampaigns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Fila 4: Filtros de Fecha de Creación */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-[#516f90] uppercase tracking-wider block">Filtro por Fecha de Creación (Ingreso)</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-[#516f90]">Desde (Creado el o después)</span>
                      <input 
                        type="date" 
                        value={startDateFilter}
                        onChange={(e) => setStartDateFilter(e.target.value)}
                        disabled={selectedSegment?.type === 'static'}
                        className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-[#516f90]">Hasta (Creado el o antes)</span>
                      <input 
                        type="date" 
                        value={endDateFilter}
                        onChange={(e) => setEndDateFilter(e.target.value)}
                        disabled={selectedSegment?.type === 'static'}
                        className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Actividades Próximas (Coming Soon) */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-[#516f90] uppercase tracking-wider block">Actividades de Trazabilidad Técnica (Próximamente / Coming Soon)</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Correo Recibido 📧', title: 'Registra cuando el lead reciba una campaña' },
                      { label: 'Correo Abierto 👁️', title: 'Registra si el lead abrió la campaña' },
                      { label: 'Correo Clickeado 🔗', title: 'Registra interacciones con enlaces internos' },
                      { label: 'WhatsApp Evolution 💬', title: 'Mapea callbacks de la API de Evolution WhatsApp' }
                    ].map((act, i) => (
                      <div 
                        key={i} 
                        className="p-2 border border-zinc-200 bg-zinc-50 rounded-lg text-center opacity-60 cursor-not-allowed select-none group relative"
                        title={act.title}
                      >
                        <span className="text-[10px] font-bold text-zinc-500 block">{act.label}</span>
                        <span className="text-[8px] bg-amber-100 text-amber-800 border border-amber-200 px-1 py-0.5 rounded font-bold uppercase mt-1 inline-block leading-none">Coming Soon</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            {/* 3. Previsualización de Destinatarios */}
            <div className="bg-white border border-[#cbd6e2] rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-[#cbd6e2]/60 bg-[#f5f8fa] flex justify-between items-center">
                <span className="text-xs font-bold text-[#2d544c] uppercase tracking-wider">
                  Previsualización de Destinatarios ({previewCount} leads calificados)
                </span>
                {previewLoading && <RefreshCcw className="w-3.5 h-3.5 text-[#2d544c] animate-spin" />}
              </div>

              <div className="overflow-x-auto max-h-[300px]">
                {previewLoading && previewLeads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-[#516f90] animate-pulse">
                    <RefreshCcw className="w-6 h-6 animate-spin text-[#2d544c] mb-2" />
                    <span className="text-xs font-semibold uppercase tracking-widest">Calculando filtros...</span>
                  </div>
                ) : previewLeads.length === 0 ? (
                  <div className="text-center py-16">
                    <Users className="w-10 h-10 text-zinc-300 mx-auto mb-2" />
                    <p className="text-xs text-[#516f90] font-semibold">Ningún contacto califica con los criterios seleccionados.</p>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#f5f8fa] border-b border-[#cbd6e2]/80 sticky top-0">
                      <tr className="text-[#516f90] font-bold">
                        <th className="px-4 py-2.5">Nombre</th>
                        <th className="px-4 py-2.5">Email</th>
                        <th className="px-4 py-2.5">Estado</th>
                        <th className="px-4 py-2.5">Origen</th>
                        <th className="px-4 py-2.5">Asesor</th>
                        <th className="px-4 py-2.5 text-right">Creado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#cbd6e2]/60">
                      {previewLeads.map((lead) => (
                        <tr key={lead.id} className="hover:bg-[#f5f8fa]/40 transition-colors">
                          <td className="px-4 py-2.5 font-bold text-[#33475b]">{getLeadName(lead)}</td>
                          <td className="px-4 py-2.5 text-slate-500">{lead.Email || lead.email || '-'}</td>
                          <td className="px-4 py-2.5">
                            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 text-[10px] font-semibold uppercase">
                              {lead.Status || lead.status || 'Nuevo'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 font-medium">
                            {lead.Source || lead.source || 'Manual'}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 font-semibold">
                            {lead.AdvisorName || lead.advisorName || 'No Asignado'}
                          </td>
                          <td className="px-4 py-2.5 text-right text-slate-400">
                            {lead.CreatedAt || lead.createdAt ? new Date(lead.CreatedAt || lead.createdAt || '').toLocaleDateString() : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Botones de Guardado / Edición */}
            <div className="flex justify-end gap-3 pt-3 flex-wrap">
              {selectedSegment ? (
                <>
                  <button 
                    type="button"
                    onClick={handleResetCreator}
                    className="px-4 py-2.5 border border-[#cbd6e2] bg-white text-[#33475b] hover:bg-[#f5f8fa] rounded-xl font-bold transition-all text-sm animate-fade-in"
                  >
                    Cancelar Edición
                  </button>
                  <button 
                    type="button"
                    onClick={(e) => handleSaveList(e, true)}
                    disabled={previewLoading || previewCount === 0}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-md disabled:opacity-50 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Guardar como Nueva Lista
                  </button>
                  <button 
                    type="submit"
                    disabled={previewLoading || previewCount === 0}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#2d544c] hover:bg-[#1f3a35] text-white rounded-xl font-bold transition-all shadow-md disabled:opacity-50 text-sm"
                  >
                    <Save className="w-4 h-4" />
                    Guardar Cambios
                  </button>
                </>
              ) : (
                <button 
                  type="submit"
                  disabled={previewLoading || previewCount === 0}
                  className="flex items-center gap-2 px-6 py-3 bg-[#2d544c] text-white rounded-xl font-bold hover:bg-[#1f3a35] transition-all shadow-md disabled:opacity-50 disabled:shadow-none text-sm"
                >
                  <Save className="w-4 h-4" />
                  Guardar Lista / Segmento
                </button>
              )}
            </div>

          </form>
        </div>

      </div>

    </div>
  );
}
