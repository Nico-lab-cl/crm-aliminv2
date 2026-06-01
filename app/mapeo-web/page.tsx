'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Globe,
  Activity,
  Search,
  EyeOff,
  Link2,
  Copy,
  Check,
  ExternalLink,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  MousePointer,
  FileText,
  Info,
  Layers,
  Sparkles,
  ArrowRight,
  UserCheck,
  UserX,
  X
} from 'lucide-react';

interface ActivityLog {
  id: number;
  lead_id: string | null;
  anonymous_id: string | null;
  event_type: string;
  page_url: string;
  page_title: string;
  details: Record<string, unknown>;
  created_at: string;
  lead_name: string | null;
  lead_email: string | null;
  is_synchronized: boolean;
}

export default function WebMappingPage() {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);

  // States
  const [filter, setFilter] = useState<'all' | 'anonymous' | 'identified'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActivity, setSelectedActivity] = useState<ActivityLog | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Real-time polling
  const [pollingActive, setPollingActive] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const secondsTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch activities
  const fetchActivities = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const offset = (page - 1) * limit;
      const params = new URLSearchParams({
        filter,
        limit: limit.toString(),
        offset: offset.toString()
      });
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await fetch(`/api/web-mapping?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activities || []);
        setTotalCount(data.totalCount || 0);
        setLastUpdated(new Date());
        setSecondsSinceUpdate(0);
      }
    } catch (e) {
      console.error('Error fetching web mapping logs:', e);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [page, limit, filter, startDate, endDate]);

  // Load activities on mount and state changes
  useEffect(() => {
    fetchActivities(true);
  }, [fetchActivities]);

  // Polling setup
  useEffect(() => {
    if (pollingActive) {
      pollingTimerRef.current = setInterval(() => {
        fetchActivities(false);
      }, 10000); // Poll every 10 seconds

      secondsTimerRef.current = setInterval(() => {
        setSecondsSinceUpdate(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
      if (secondsTimerRef.current) clearInterval(secondsTimerRef.current);
    };
  }, [pollingActive, fetchActivities]);

  // Helper to copy text to clipboard
  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper to format date nicely
  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  // Helper to resolve event style
  const getEventStyle = (type: string) => {
    switch (type) {
      case 'PAGE_VISIT':
      case 'PAGE_VIEW':
        return { icon: Globe, colorClass: 'bg-emerald-500 text-white', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'CLICK_BUTTON':
        return { icon: MousePointer, colorClass: 'bg-indigo-500 text-white', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'FORM_SUBMIT':
      case 'LEAD_REGISTERED':
        return { icon: FileText, colorClass: 'bg-violet-500 text-white', badgeClass: 'bg-violet-50 text-violet-700 border-violet-200' };
      case 'EMAIL_CLICKED':
        return { icon: Link2, colorClass: 'bg-amber-500 text-white', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' };
      default:
        return { icon: Activity, colorClass: 'bg-slate-500 text-white', badgeClass: 'bg-slate-50 text-slate-700 border-slate-200' };
    }
  };

  // Filter activities on the client side based on query for instant search feedback
  const filteredActivities = activities.filter(act => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (act.anonymous_id && act.anonymous_id.toLowerCase().includes(q)) ||
      (act.lead_id && act.lead_id.toLowerCase().includes(q)) ||
      (act.lead_name && act.lead_name.toLowerCase().includes(q)) ||
      (act.lead_email && act.lead_email.toLowerCase().includes(q)) ||
      (act.page_title && act.page_title.toLowerCase().includes(q)) ||
      (act.page_url && act.page_url.toLowerCase().includes(q)) ||
      (act.event_type && act.event_type.toLowerCase().includes(q))
    );
  });

  // Pagination calculation
  const totalPages = Math.ceil(totalCount / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto text-[#33475b] animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-[#2d544c] tracking-tight">Mapeo Web</h1>
            <span className="bg-[#eaf0f6] text-[#2d544c] text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm border border-[#cbd6e2]/50">
              <Globe className="w-3.5 h-3.5 animate-pulse" />
              Auditoría en Tiempo Real
            </span>
          </div>
          <p className="text-[#516f90] mt-1.5 text-sm">
            Monitorea el comportamiento de visitantes anónimos e identificados. Observa la fusión de historiales al asociar un lead con su huella digital.
          </p>
        </div>

        <div className="flex items-center gap-3 self-end md:self-auto">
          {/* Live Polling Status Indicator */}
          <button
            onClick={() => setPollingActive(!pollingActive)}
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold shadow-sm transition-all bg-white hover:bg-[#f5f8fa] ${
              pollingActive ? 'text-green-600 border-green-200' : 'text-zinc-400 border-[#cbd6e2]'
            }`}
            title={pollingActive ? 'Pausar actualización en vivo' : 'Activar actualización en vivo'}
          >
            <span className={`w-2 h-2 rounded-full ${pollingActive ? 'bg-green-500 animate-ping' : 'bg-zinc-300'}`} />
            <div className="flex flex-col items-start text-left">
              <span className={pollingActive ? 'text-green-600 font-extrabold' : 'text-zinc-500'}>
                {pollingActive ? `En Vivo (${secondsSinceUpdate}s)` : 'Pausado'}
              </span>
              <span className="text-[9px] text-[#516f90] font-normal leading-none mt-0.5">
                Ref: {lastUpdated.toLocaleTimeString()}
              </span>
            </div>
          </button>

          <button
            onClick={() => fetchActivities(true)}
            className="p-3 bg-white border border-[#cbd6e2] rounded-xl text-[#33475b] hover:bg-[#f5f8fa] hover:text-[#2d544c] transition-all shadow-sm"
            title="Sincronizar ahora"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Grid: Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-[#cbd6e2] rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
            <Globe className="w-24 h-24 text-[#2d544c]" />
          </div>
          <p className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Total de Eventos Registrados</p>
          <p className="text-3xl font-extrabold text-[#2d544c] mt-2">{totalCount}</p>
          <p className="text-xs text-[#516f90] mt-1">Actividades totales de navegación y clics</p>
        </div>

        <div className="bg-white border border-[#cbd6e2] rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
            <UserX className="w-24 h-24 text-slate-600" />
          </div>
          <p className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Tráfico Incógnito</p>
          <p className="text-3xl font-extrabold text-slate-700 mt-2">
            {activities.filter(a => !a.is_synchronized).length} <span className="text-sm font-normal text-slate-500">en esta página</span>
          </p>
          <p className="text-xs text-[#516f90] mt-1">Visitantes que aún no se han identificado</p>
        </div>

        <div className="bg-white border border-[#cbd6e2] rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
            <UserCheck className="w-24 h-24 text-green-600" />
          </div>
          <p className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Tráfico Sincronizado</p>
          <p className="text-3xl font-extrabold text-green-600 mt-2">
            {activities.filter(a => a.is_synchronized).length} <span className="text-sm font-normal text-green-500">en esta página</span>
          </p>
          <p className="text-xs text-[#516f90] mt-1">Acciones atribuidas a leads identificados</p>
        </div>
      </div>

      {/* Control Panel: Filters & Search */}
      <div className="bg-white border border-[#cbd6e2] rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Navigation/Filters Tabs */}
          <div className="flex bg-[#f5f8fa] p-1.5 rounded-xl border border-[#cbd6e2]/40 self-start">
            <button
              onClick={() => {
                setFilter('all');
                setPage(1);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                filter === 'all'
                  ? 'bg-white text-[#2d544c] shadow-sm border border-[#cbd6e2]/50'
                  : 'text-[#516f90] hover:text-[#2d544c]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Todos
            </button>
            <button
              onClick={() => {
                setFilter('anonymous');
                setPage(1);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                filter === 'anonymous'
                  ? 'bg-white text-[#2d544c] shadow-sm border border-[#cbd6e2]/50'
                  : 'text-[#516f90] hover:text-[#2d544c]'
              }`}
            >
              <EyeOff className="w-3.5 h-3.5" />
              Incógnito
            </button>
            <button
              onClick={() => {
                setFilter('identified');
                setPage(1);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                filter === 'identified'
                  ? 'bg-white text-[#2d544c] shadow-sm border border-[#cbd6e2]/50'
                  : 'text-[#516f90] hover:text-[#2d544c]'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              Sincronizado
            </button>
          </div>

          {/* Search Input */}
          <div className="relative group w-full lg:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#516f90] group-focus-within:text-[#2d544c] transition-colors" />
            <input
              type="text"
              placeholder="Buscar por ID, nombre, correo, URL o evento..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d544c]/20 focus:bg-white transition-all text-[#33475b]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#516f90] hover:text-[#33475b] text-xs font-bold bg-slate-200/60 hover:bg-slate-200 p-1 rounded-full"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Date Filters Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end pt-3 border-t border-[#cbd6e2]/40">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[#516f90] uppercase tracking-wider">Actividad Desde</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[#516f90] uppercase tracking-wider">Actividad Hasta</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white transition-all"
            />
          </div>

          {/* Reset Filters Button */}
          <div>
            {(startDate || endDate) ? (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setPage(1);
                }}
                className="py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 hover:border-zinc-300 text-zinc-600 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 w-full sm:w-auto"
              >
                <X className="w-3.5 h-3.5" />
                Limpiar Fechas
              </button>
            ) : (
              <div className="h-10 hidden sm:block" />
            )}
          </div>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-40 gap-3 text-[#516f90]">
              <RefreshCcw className="w-8 h-8 animate-spin text-[#2d544c]" />
              <span className="text-xs font-bold uppercase tracking-widest animate-pulse">Consultando logs de red...</span>
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center px-4">
              <div className="w-16 h-16 bg-[#eaf0f6] rounded-full flex items-center justify-center mb-4 text-[#2d544c]">
                <Globe className="w-8 h-8" />
              </div>
              <p className="text-lg font-bold text-[#33475b]">Sin actividades de mapeo web</p>
              <p className="text-sm text-[#516f90] mt-1 max-w-md">
                {searchQuery
                  ? 'No se encontraron resultados que coincidan con la búsqueda.'
                  : 'Aún no se registran interacciones en la landing page.'}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-4 text-xs font-bold text-[#2d544c] hover:underline"
                >
                  Limpiar búsqueda
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f5f8fa] text-[#516f90] text-xs font-bold uppercase tracking-wider border-b border-[#cbd6e2]">
                  <th className="px-6 py-4">Evento</th>
                  <th className="px-6 py-4">Visitante / Identidad</th>
                  <th className="px-6 py-4">ID Anónimo</th>
                  <th className="px-6 py-4">Página / Enlace</th>
                  <th className="px-6 py-4">Fecha y Hora</th>
                  <th className="px-6 py-4 text-right">Detalles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#cbd6e2]">
                {filteredActivities.map((act) => {
                  const style = getEventStyle(act.event_type);
                  const Icon = style.icon;

                  return (
                    <tr
                      key={act.id}
                      className="hover:bg-[#f5f8fa]/80 transition-colors group text-sm"
                    >
                      {/* Event Type */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-2 rounded-xl ${style.colorClass} shadow-sm`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-[#33475b] block">
                              {act.event_type === 'PAGE_VISIT' || act.event_type === 'PAGE_VIEW'
                                ? 'Visita Web'
                                : act.event_type === 'CLICK_BUTTON'
                                ? 'Clic en Botón'
                                : act.event_type === 'LEAD_REGISTERED' || act.event_type === 'FORM_SUBMIT'
                                ? 'Registro Form'
                                : act.event_type === 'EMAIL_CLICKED'
                                ? 'Clic en Email'
                                : act.event_type}
                            </span>
                            {typeof act.details?.element_name === 'string' && (
                              <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                                {act.details.element_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Visitor / Identity status */}
                      <td className="px-6 py-4">
                        {act.is_synchronized ? (
                          <div className="space-y-1">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold border bg-green-50 text-green-700 border-green-200 inline-flex items-center gap-1">
                              <UserCheck className="w-3 h-3" />
                              Sincronizado
                            </span>
                            <div className="block">
                              <a
                                href={`/contacts?search=${encodeURIComponent(act.lead_email || act.lead_id || '')}`}
                                className="font-bold text-[#2d544c] hover:underline flex items-center gap-1 group-hover:text-green-700"
                              >
                                {act.lead_name || 'Lead Registrado'}
                                <ExternalLink className="w-3 h-3 opacity-50" />
                              </a>
                              <span className="text-xs text-[#516f90] block">{act.lead_email}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold border bg-slate-100 text-slate-600 border-slate-200 inline-flex items-center gap-1">
                              <EyeOff className="w-3 h-3" />
                              Incógnito
                            </span>
                            <span className="text-xs text-[#516f90] block italic">Visitante sin registrar</span>
                          </div>
                        )}
                      </td>

                      {/* Anonymous ID */}
                      <td className="px-6 py-4">
                        {act.anonymous_id ? (
                          <div className="flex items-center gap-1.5 group/id">
                            <code className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200/60 font-mono">
                              {act.anonymous_id.substring(0, 8)}...
                            </code>
                            <button
                              onClick={() => handleCopyText(act.anonymous_id!, `anon-${act.id}`)}
                              className="text-[#516f90] hover:text-[#2d544c] opacity-0 group-hover/id:opacity-100 transition-opacity p-1 rounded hover:bg-slate-200"
                              title="Copiar ID Anónimo completo"
                            >
                              {copiedId === `anon-${act.id}` ? (
                                <Check className="w-3 h-3 text-green-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono text-xs">-</span>
                        )}
                      </td>

                      {/* Page / Enlace URL */}
                      <td className="px-6 py-4 max-w-[280px]">
                        <div className="truncate" title={act.page_url}>
                          <span className="font-semibold text-[#33475b] block truncate">
                            {act.page_title || 'Página de Inicio'}
                          </span>
                          <span className="text-xs text-[#516f90] font-mono block truncate">
                            {act.page_url ? act.page_url.replace(/https?:\/\/[^\/]+/, '') : '/'}
                          </span>
                        </div>
                      </td>

                      {/* Date & Time */}
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-[#516f90]">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-[#516f90]/80" />
                          {formatDate(act.created_at)}
                        </div>
                      </td>

                      {/* Details view CTA */}
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedActivity(act)}
                          className="px-3 py-1.5 border border-[#cbd6e2] hover:border-[#2d544c] bg-white hover:bg-[#eaf0f6] text-[#33475b] hover:text-[#2d544c] rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 ml-auto"
                        >
                          <Info className="w-3.5 h-3.5" />
                          Inspeccionar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-[#cbd6e2] bg-[#f5f8fa] flex items-center justify-between">
            <span className="text-xs font-medium text-[#516f90]">
              Página <span className="text-[#2d544c] font-bold">{page}</span> de{' '}
              <span className="text-[#2d544c] font-bold">{totalPages}</span> ({totalCount} resultados)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                disabled={!hasPrevPage}
                className="p-2 rounded-lg border border-[#cbd6e2] bg-white text-[#33475b] hover:bg-[#f5f8fa] transition-all disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
                disabled={!hasNextPage}
                className="p-2 rounded-lg border border-[#cbd6e2] bg-white text-[#33475b] hover:bg-[#f5f8fa] transition-all disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Inspect Event Detail Drawer/Modal */}
      {selectedActivity && (
        <div className="fixed inset-0 bg-[#33475b]/60 backdrop-blur-sm flex items-center justify-end z-50 animate-fade-in">
          <div className="bg-white border-l border-[#cbd6e2] w-full max-w-2xl h-screen flex flex-col shadow-2xl animate-slide-left">
            {/* Header */}
            <div className="p-6 border-b border-[#cbd6e2] flex justify-between items-center bg-[#eaf0f6]/30 text-[#2d544c]">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${getEventStyle(selectedActivity.event_type).colorClass}`}>
                  {(() => {
                    const Icon = getEventStyle(selectedActivity.event_type).icon;
                    return <Icon className="w-5 h-5" />;
                  })()}
                </div>
                <div>
                  <h3 className="text-lg font-bold">Detalle del Evento #{selectedActivity.id}</h3>
                  <p className="text-xs text-[#516f90]">Mapeo de interacción digital y metadatos.</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedActivity(null)}
                className="text-[#516f90] hover:text-[#2d544c] p-2 rounded-full hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Visitor Status Section */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                <h4 className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Identidad de Visitante</h4>
                <div className="flex items-start gap-4">
                  {selectedActivity.is_synchronized ? (
                    <>
                      <div className="p-2.5 bg-green-100 text-green-700 rounded-xl border border-green-200">
                        <UserCheck className="w-6 h-6" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-base">
                            {selectedActivity.lead_name || 'Contacto Identificado'}
                          </span>
                          <span className="px-2 py-0.5 text-[9px] font-bold bg-green-100 text-green-800 rounded border border-green-200 uppercase">
                            Sincronizado
                          </span>
                        </div>
                        <p className="text-sm text-[#516f90] font-medium">{selectedActivity.lead_email}</p>
                        <p className="text-xs text-slate-500 font-mono mt-1">Lead ID: {selectedActivity.lead_id}</p>
                        <div className="pt-2">
                          <a
                            href={`/contacts?search=${encodeURIComponent(selectedActivity.lead_email || '')}`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-[#2d544c] hover:underline"
                          >
                            Ver contacto en base de datos
                            <ArrowRight className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="p-2.5 bg-slate-200 text-slate-600 rounded-xl border border-slate-300">
                        <EyeOff className="w-6 h-6" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-base">Visitante Incógnito</span>
                          <span className="px-2 py-0.5 text-[9px] font-bold bg-slate-200 text-slate-700 rounded border border-slate-300 uppercase">
                            Anónimo
                          </span>
                        </div>
                        <p className="text-sm text-[#516f90]">Aún no ha interactuado con correos ni rellenado formularios.</p>
                        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 p-2.5 rounded-lg font-medium mt-2 flex items-start gap-2">
                          <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
                          <span>
                            Una vez que este navegador abra un correo con lead_id o envíe un formulario, su historial se fusionará automáticamente a su lead correspondiente.
                          </span>
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Event Details Section */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Detalles del Evento</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-slate-100 rounded-xl p-3 bg-white">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Tipo de Evento</span>
                    <span className="font-semibold text-slate-700 text-sm block mt-0.5">{selectedActivity.event_type}</span>
                  </div>
                  <div className="border border-slate-100 rounded-xl p-3 bg-white">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Fecha de Registro</span>
                    <span className="font-semibold text-slate-700 text-sm block mt-0.5">{formatDate(selectedActivity.created_at)}</span>
                  </div>
                  <div className="border border-slate-100 rounded-xl p-3 bg-white md:col-span-2">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Título de Página</span>
                    <span className="font-semibold text-slate-700 text-sm block mt-0.5">{selectedActivity.page_title || 'Página Principal'}</span>
                  </div>
                  <div className="border border-slate-100 rounded-xl p-3 bg-white md:col-span-2">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">URL Completa</span>
                    <a
                      href={selectedActivity.page_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-[#2d544c] hover:underline block mt-1 break-all"
                    >
                      {selectedActivity.page_url || '/'}
                    </a>
                  </div>
                </div>
              </div>

              {/* Metadata JSON Details */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Metadatos y Payload</h4>
                  <button
                    onClick={() =>
                      handleCopyText(JSON.stringify(selectedActivity.details, null, 2), `payload-${selectedActivity.id}`)
                    }
                    className="text-xs text-[#2d544c] hover:underline flex items-center gap-1 font-bold"
                  >
                    {copiedId === `payload-${selectedActivity.id}` ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-600" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copiar JSON
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-x-auto border border-slate-800 shadow-inner max-h-[300px]">
                  <pre>{JSON.stringify(selectedActivity.details, null, 2)}</pre>
                </div>
              </div>

              {/* Unique Device Tokens */}
              <div className="border border-slate-100 rounded-xl p-4 space-y-3 bg-white">
                <h4 className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Tokens de Navegación</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">Anonymous Device Token:</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        {selectedActivity.anonymous_id || 'No disponible'}
                      </span>
                      {selectedActivity.anonymous_id && (
                        <button
                          onClick={() => handleCopyText(selectedActivity.anonymous_id!, `token-${selectedActivity.id}`)}
                          className="text-[#516f90] hover:text-[#2d544c] p-0.5 rounded hover:bg-slate-100"
                        >
                          {copiedId === `token-${selectedActivity.id}` ? (
                            <Check className="w-3 h-3 text-green-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-[#cbd6e2] bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedActivity(null)}
                className="px-6 py-2.5 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300 transition-all text-sm shadow-sm"
              >
                Cerrar Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
