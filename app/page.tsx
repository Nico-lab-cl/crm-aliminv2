'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  Mail, 
  Send, 
  Eye, 
  Plus, 
  Filter, 
  RefreshCcw,
  Zap,
  ArrowUpRight,
  Settings,
  Calendar,
  Trash2,
  ListFilter,
  Loader2,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface Campaign {
  id: string;
  title: string;
  subject: string;
  status: string;
  created_at: string;
  is_automation: boolean;
  automation_formid: string;
}

interface CampaignLog {
  id: string;
  campaign_title: string;
  email: string;
  status: string;
  sent_at: string;
  opened_at: string;
}

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
    advancedFilters?: Array<{ column: string; operator: string; value: string }>;
    activity?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    ids?: string[];
  };
  created_at: string;
}

interface PreviewPayload {
  campaignId?: string;
  filters?: {
    ids?: string[];
    status?: string;
    source?: string;
    project?: string;
    interest?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    activity?: string;
    startDate?: string;
    endDate?: string;
  };
  advancedFilters?: Array<{ column: string; operator: string; value: string }>;
  dateRange?: {
    start?: string;
    end?: string;
  };
}

interface ExecutePayload {
  campaignId: string;
  filters?: {
    ids?: string[];
    status?: string;
    source?: string;
    project?: string;
    interest?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    activity?: string;
    startDate?: string;
    endDate?: string;
  };
  advancedFilters?: Array<{ column: string; operator: string; value: string }>;
  dateRange?: {
    start?: string;
    end?: string;
  };
  batchSize?: number;
  delayMs?: number;
}

interface BatchJobStatus {
  id: string;
  campaignId: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'DAILY_LIMIT';
  totalLeads: number;
  processedLeads: number;
  failedLeads: number;
  skippedLeads: number;
  sentBatches: number;
  totalBatches: number;
  batchSize: number;
  delayMs: number;
  dailyLimit: number;
  dailyRemaining: number;
  currentBatchIndex: number;
  startedAt: string;
  completedAt: string | null;
  progress: number;
  errors: string[];
}

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [logs, setLogs] = useState<CampaignLog[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [previewLeads, setPreviewLeads] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Campaign | null>(null);
  const [automationLoading, setAutomationLoading] = useState(false);
  
  // Segmentos
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState('');
  
  // -- Nuevos Estados para Explorador Avanzado --
  const [schema, setSchema] = useState<{name: string, type: string, label: string}[]>([]);
  const [advancedFilters, setAdvancedFilters] = useState<{column: string, operator: string, value: string}[]>([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [visibleColumns, setVisibleColumns] = useState<string[]>(['Email', 'FirstName', 'Status', 'Source', 'CreatedAt']);
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  // -- Batch Execution States --
  const [batchSize, setBatchSize] = useState(50);
  const [batchDelay, setBatchDelay] = useState(5);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<BatchJobStatus | null>(null);
  const [showBatchConfig, setShowBatchConfig] = useState(false);
  const [dailyQuota, setDailyQuota] = useState({ sentToday: 0, dailyLimit: 2000, remaining: 2000 });

  useEffect(() => {
    fetchData();
    fetchDailyQuota();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  // Poll job status when there's an active job
  useEffect(() => {
    if (!activeJobId) return;
    
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/campaigns/execute/status?jobId=${activeJobId}`);
        if (res.ok) {
          const data: BatchJobStatus = await res.json();
          setJobStatus(data);
          
          // Stop polling when job is done
          if (data.status === 'COMPLETED' || data.status === 'FAILED' || data.status === 'CANCELLED' || data.status === 'DAILY_LIMIT') {
            setLoading(false);
            fetchLogs();
            fetchDailyQuota();
          }
        }
      } catch (err) {
        console.error('Error polling job status:', err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [activeJobId]);

  useEffect(() => {
    const fetchPreview = async () => {
      setPreviewLoading(true);
      try {
        let payload: PreviewPayload = {};
        
        if (selectedSegmentId) {
          const seg = segments.find(s => s.id === selectedSegmentId);
          if (seg) {
            if (seg.type === 'static') {
              payload = {
                campaignId: selectedCampaign || undefined,
                filters: { ids: seg.filters.ids }
              };
            } else {
              payload = {
                campaignId: selectedCampaign || undefined,
                filters: { 
                  status: seg.filters.status || undefined, 
                  source: seg.filters.source || undefined,
                  project: seg.filters.project || undefined,
                  interest: seg.filters.interest || undefined,
                  utmSource: seg.filters.utmSource || undefined,
                  utmMedium: seg.filters.utmMedium || undefined,
                  utmCampaign: seg.filters.utmCampaign || undefined,
                  activity: seg.filters.activity || undefined,
                  startDate: seg.filters.startDate || undefined,
                  endDate: seg.filters.endDate || undefined
                },
                advancedFilters: seg.filters.advancedFilters || []
              };
            }
          }
        } else {
          payload = { 
            campaignId: selectedCampaign || undefined,
            filters: { 
              status: selectedStatus || undefined, 
              source: selectedSource || undefined,
              project: selectedProject || undefined
            },
            advancedFilters,
            dateRange: {
              start: dateRange.start || undefined,
              end: dateRange.end || undefined
            }
          };
        }

        const res = await fetch('/api/campaigns/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const data = await res.json();
          setPreviewCount(data.mailableCount || data.count);
          setPreviewLeads(data.preview || []);
        }
      } catch (err) {
        console.error('Error fetching preview:', err);
      } finally {
        setPreviewLoading(false);
      }
    };
    fetchPreview();
  }, [selectedStatus, selectedSource, selectedProject, advancedFilters, dateRange, selectedSegmentId, segments, selectedCampaign]);

  const fetchData = async () => {
    try {
      const [cRes, filtersRes, lRes, segmentsRes] = await Promise.all([
        fetch('/api/campaigns'),
        fetch('/api/leads/filters'),
        fetch('/api/campaigns/logs'),
        fetch('/api/segments')
      ]);
      
      if (cRes.ok) setCampaigns(await cRes.json());
      if (segmentsRes.ok) setSegments(await segmentsRes.json());
      if (filtersRes.ok) {
         const data = await filtersRes.json();
          if (Array.isArray(data)) {
            setStatuses(data);
          } else {
            setStatuses(data.statuses || []);
            setSources(data.sources || []);
            setProjects(data.projects || []);
            if (data.schema) setSchema(data.schema);
          }
      }
      if (lRes.ok) setLogs(await lRes.json());
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  const fetchLogs = async () => {
    const lRes = await fetch('/api/campaigns/logs');
    if (lRes.ok) setLogs(await lRes.json());
  };

  const fetchDailyQuota = async () => {
    try {
      const res = await fetch('/api/campaigns/execute');
      if (res.ok) setDailyQuota(await res.json());
    } catch (err) {
      console.error('Error fetching daily quota:', err);
    }
  };

  const handleExecute = async () => {
    if (!selectedCampaign) return alert('Selecciona una campaña');
    
    const confirmMsg = `¿Iniciar envío masivo?\n\n• Lote: ${batchSize} leads por batch\n• Espera: ${batchDelay}s entre lotes\n• Audiencia: ${previewCount || 0} leads\n\n¿Continuar?`;
    if (!confirm(confirmMsg)) return;

    const payload: ExecutePayload = { 
      campaignId: selectedCampaign,
      batchSize,
      delayMs: batchDelay * 1000,
    };
    
    if (selectedSegmentId) {
      const seg = segments.find(s => s.id === selectedSegmentId);
      if (seg) {
        if (seg.type === 'static') {
          payload.filters = { ids: seg.filters.ids };
        } else {
          payload.filters = {
            status: seg.filters.status || undefined, 
            source: seg.filters.source || undefined,
            project: seg.filters.project || undefined,
            interest: seg.filters.interest || undefined,
            utmSource: seg.filters.utmSource || undefined,
            utmMedium: seg.filters.utmMedium || undefined,
            utmCampaign: seg.filters.utmCampaign || undefined,
            activity: seg.filters.activity || undefined,
            startDate: seg.filters.startDate || undefined,
            endDate: seg.filters.endDate || undefined
          };
          payload.advancedFilters = seg.filters.advancedFilters || [];
        }
      }
    } else {
      payload.filters = { 
        status: selectedStatus || undefined,
        source: selectedSource || undefined,
        project: selectedProject || undefined
      };
      payload.advancedFilters = advancedFilters;
      payload.dateRange = dateRange;
    }

    setLoading(true);
    setJobStatus(null);
    try {
      const res = await fetch('/api/campaigns/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.jobId) {
        setActiveJobId(data.jobId);
        setJobStatus({
          id: data.jobId,
          campaignId: selectedCampaign,
          status: 'QUEUED',
          totalLeads: data.totalLeads,
          processedLeads: 0,
          failedLeads: 0,
          skippedLeads: (data.totalLeads || 0) - (data.willSend || data.totalLeads || 0),
          sentBatches: 0,
          totalBatches: Math.ceil((data.willSend || data.totalLeads) / batchSize),
          batchSize,
          delayMs: batchDelay * 1000,
          dailyLimit: data.dailyLimit || 2000,
          dailyRemaining: data.dailyRemaining || 2000,
          currentBatchIndex: 0,
          startedAt: new Date().toISOString(),
          completedAt: null,
          progress: 0,
          errors: [],
        });
      } else {
        alert(data.message);
        setLoading(false);
      }
    } catch {
      alert('Error ejecutando campaña');
      setLoading(false);
    }
  };

  const handleCancelJob = async () => {
    if (!activeJobId) return;
    if (!confirm('¿Cancelar el envío masivo en curso?')) return;
    
    try {
      await fetch(`/api/campaigns/execute/status?jobId=${activeJobId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Error cancelling job:', err);
    }
  };

  const handleCloseJobTracker = () => {
    setActiveJobId(null);
    setJobStatus(null);
    setLoading(false);
  };

  const handleSendTest = async () => {
    if (!selectedCampaign || !testEmail) return alert('Selecciona campaña e ingresa un email');
    
    setTestLoading(true);
    try {
      const res = await fetch('/api/campaigns/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: selectedCampaign, email: testEmail }),
      });

      const data = await res.json();
      alert(data.message);
      fetchLogs();
    } catch {
      alert('Error enviando prueba');
    } finally {
      setTestLoading(false);
    }
  };

  const handleSaveAutomation = async () => {
    if (!editingAutomation) return;
    
    setAutomationLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${editingAutomation.id}/automation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_automation: editingAutomation.is_automation,
          automation_formid: editingAutomation.automation_formid
        }),
      });

      if (res.ok) {
        setEditingAutomation(null);
        fetchData();
      } else {
        alert('Error al guardar la automatización');
      }
    } catch {
      alert('Error en el servidor');
    } finally {
      setAutomationLoading(false);
    }
  };

  const openRate = logs.length > 0 ? (logs.filter(l => l.status === 'OPENED').length / logs.length * 100).toFixed(1) : 0;

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-[#2d544c]">Panel de Resumen</h1>
          <p className="text-[#516f90] mt-1">Monitorea el desempeño de tus campañas y la interacción de tus leads.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={fetchData}
            className="p-2.5 bg-white border border-[#cbd6e2] rounded-lg text-[#33475b] hover:bg-[#f5f8fa] transition-all"
            title="Actualizar datos"
          >
            <RefreshCcw className="w-5 h-5" />
          </button>
          <Link 
            href="/campaigns/builder"
            className="bg-[#2d544c] hover:bg-[#1f3a35] text-white px-5 py-2.5 rounded-lg font-bold shadow-sm transition-all flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Crear Campaña
          </Link>
        </div>
      </div>

      {/* Metrics Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Enviados', value: logs.length, icon: Send, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Aperturas Totales', value: logs.filter(l => l.status === 'OPENED').length, icon: Eye, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Tasa de Apertura', value: `${openRate}%`, icon: Zap, color: 'text-[#c49a00]', bg: 'bg-yellow-50' },
          { label: 'Campañas Activas', value: campaigns.length, icon: Mail, color: 'text-[#2d544c]', bg: 'bg-[#eaf0f6]' },
        ].map((stat, i) => (
          <div key={i} className="bg-white border border-[#cbd6e2] rounded-xl p-6 shadow-sm flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-[#516f90] uppercase tracking-wider">{stat.label}</p>
              <h3 className="text-3xl font-bold text-[#33475b] mt-2">{stat.value}</h3>
              <div className="mt-4 flex items-center gap-1 text-xs font-medium text-green-600">
                <ArrowUpRight className="w-3 h-3" />
                <span>+12% vs mes pasado</span>
              </div>
            </div>
            <div className={`p-3 rounded-lg ${stat.bg}`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Control Card */}
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-[#cbd6e2] flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#2d544c] flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Lanzar Campaña Directa
              </h2>
              <div className="flex items-center gap-2">
                <input 
                  type="email" 
                  placeholder="Email de prueba..."
                  className="bg-[#f5f8fa] border-[#cbd6e2] border text-sm px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2d544c]/20 w-48"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
                <button 
                  onClick={handleSendTest}
                  disabled={testLoading || !selectedCampaign || !testEmail}
                  className="bg-[#c49a00] hover:bg-[#a68200] text-white px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                >
                  {testLoading ? '...' : 'Enviar Prueba'}
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Selector de Listas / Segmentos Guardados */}
              <div className="bg-[#eaf0f6]/40 p-4 rounded-xl border border-[#cbd6e2]/60 grid grid-cols-1 md:grid-cols-2 gap-4 items-center shadow-sm">
                <div className="space-y-0.5">
                  <label className="text-xs font-bold text-[#2d544c] uppercase tracking-wider block">Cargar Lista / Segmento Guardado</label>
                  <p className="text-[11px] text-[#516f90]">Elige una audiencia dinámica o estática pre-construida para automatizar el envío.</p>
                </div>
                <div>
                  <select
                    className="w-full bg-white border-[#cbd6e2] border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-sm font-bold text-[#2d544c]"
                    value={selectedSegmentId}
                    onChange={(e) => setSelectedSegmentId(e.target.value)}
                  >
                    <option value="">-- Usar Filtros Manuales --</option>
                    {segments.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.type === 'static' ? 'Estática' : 'Dinámica'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedSegmentId && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex gap-2.5 items-start text-xs text-amber-800 font-medium">
                  <Zap className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p>
                    <strong>Lista de Audiencia Activa:</strong> Los filtros manuales inferiores han sido deshabilitados. Para modificarlos de forma manual, selecciona <em>&quot;-- Usar Filtros Manuales --&quot;</em> en el selector superior.
                  </p>
                </div>
              )}

              <div className={`transition-all duration-300 ${selectedSegmentId ? 'opacity-40 pointer-events-none select-none' : ''}`}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#516f90]">1. Seleccionar Campaña</label>
                  <select 
                    className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-sm"
                    value={selectedCampaign}
                    onChange={(e) => setSelectedCampaign(e.target.value)}
                  >
                    <option value="">-- Seleccionar --</option>
                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#516f90]">2. Segmentar por Estado</label>
                  <select 
                    className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-sm"
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                  >
                    <option value="">Todos los estados</option>
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#516f90]">3. Filtrar por Origen</label>
                  <select 
                    className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-sm"
                    value={selectedSource}
                    onChange={(e) => setSelectedSource(e.target.value)}
                  >
                    <option value="">Todos los orígenes</option>
                    {sources.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#516f90]">4. Filtrar por Proyecto</label>
                  <select 
                    className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-sm"
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                  >
                    <option value="">Todos los Proyectos</option>
                    {projects.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              {/* Rango de Fechas Avanzado */}
              <div className="bg-[#f5f8fa] border border-[#cbd6e2] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#2d544c] flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Filtrar por Periodo
                  </h3>
                  <button 
                    onClick={() => setDateRange({ start: '', end: '' })}
                    className="text-[10px] font-bold text-[#516f90] hover:text-red-600 transition-all"
                  >
                    LIMPIAR FECHAS
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-[#516f90] uppercase">Desde</span>
                    <input 
                      type="date" 
                      className="w-full bg-white border-[#cbd6e2] border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2d544c]/20 outline-none"
                      value={dateRange.start}
                      onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-[#516f90] uppercase">Hasta</span>
                    <input 
                      type="date" 
                      className="w-full bg-white border-[#cbd6e2] border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2d544c]/20 outline-none"
                      value={dateRange.end}
                      onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Constructor de Filtros Avanzados */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <button 
                    onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    className="text-xs font-bold text-[#0091ae] flex items-center gap-1 hover:underline"
                  >
                    {showAdvancedFilters ? '- Ocultar Filtros Avanzados' : '+ Añadir Filtros Especiales (CRM Pro)'}
                  </button>
                  {advancedFilters.length > 0 && (
                    <button 
                      onClick={() => setAdvancedFilters([])}
                      className="text-[10px] font-bold text-[#516f90] hover:text-red-500"
                    >
                      ELIMINAR TODOS
                    </button>
                  )}
                </div>

                {showAdvancedFilters && (
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    {advancedFilters.map((f, idx) => (
                      <div key={idx} className="flex gap-2 items-center bg-[#f5f8fa] p-2 rounded-lg border border-[#cbd6e2]">
                        <select 
                          className="flex-1 bg-white border-[#cbd6e2] border rounded-md px-2 py-1.5 text-xs outline-none"
                          value={f.column}
                          onChange={(e) => {
                            const newFilters = [...advancedFilters];
                            newFilters[idx].column = e.target.value;
                            setAdvancedFilters(newFilters);
                          }}
                        >
                          <option value="">Seleccionar Campo</option>
                          {schema.map(s => <option key={s.name} value={s.name}>{s.label}</option>)}
                        </select>
                        
                        <select 
                          className="w-32 bg-white border-[#cbd6e2] border rounded-md px-2 py-1.5 text-xs outline-none"
                          value={f.operator}
                          onChange={(e) => {
                            const newFilters = [...advancedFilters];
                            newFilters[idx].operator = e.target.value;
                            setAdvancedFilters(newFilters);
                          }}
                        >
                          <option value="equals">Es igual a</option>
                          <option value="contains">Contiene</option>
                          <option value="starts_with">Empieza con</option>
                          <option value="ends_with">Termina con</option>
                        </select>

                        <input 
                          type="text" 
                          placeholder="Valor..."
                          className="flex-[1.5] bg-white border-[#cbd6e2] border rounded-md px-3 py-1.5 text-xs outline-none"
                          value={f.value}
                          onChange={(e) => {
                            const newFilters = [...advancedFilters];
                            newFilters[idx].value = e.target.value;
                            setAdvancedFilters(newFilters);
                          }}
                        />

                        <button 
                          onClick={() => setAdvancedFilters(advancedFilters.filter((_, i) => i !== idx))}
                          className="p-1.5 text-[#516f90] hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    
                    <button 
                      onClick={() => setAdvancedFilters([...advancedFilters, { column: '', operator: 'contains', value: '' }])}
                      className="w-full py-2 border-2 border-dashed border-[#cbd6e2] rounded-lg text-[#516f90] text-xs font-bold hover:bg-[#f5f8fa] hover:border-[#2d544c] transition-all"
                    >
                      + AGREGAR REGLA DE FILTRADO
                    </button>
                  </div>
                )}
              </div>
              </div> {/* Fin de filtros manuales deshabilitados */}

              {/* Preview Box con Selector de Columnas */}
              <div className="bg-white border border-[#cbd6e2] rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-[#cbd6e2] bg-[#f5f8fa] flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#2d544c] uppercase tracking-widest">
                    Explorador de Audiencia ({previewCount || 0} leads)
                  </h4>
                  <button 
                    onClick={() => setShowColumnConfig(!showColumnConfig)}
                    className="flex items-center gap-2 text-xs font-bold text-[#516f90] hover:text-[#2d544c] bg-white border border-[#cbd6e2] px-3 py-1.5 rounded-lg shadow-sm"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Configurar Columnas
                  </button>
                </div>

                {showColumnConfig && (
                  <div className="p-4 bg-[#eaf0f6]/50 border-b border-[#cbd6e2] grid grid-cols-2 sm:grid-cols-4 gap-3 animate-in fade-in duration-200">
                    {schema.map(col => (
                      <label key={col.name} className="flex items-center gap-2 cursor-pointer group">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-[#cbd6e2] text-[#2d544c] focus:ring-[#2d544c]"
                          checked={visibleColumns.includes(col.name)}
                          onChange={(e) => {
                            if (e.target.checked) setVisibleColumns([...visibleColumns, col.name]);
                            else setVisibleColumns(visibleColumns.filter(c => c !== col.name));
                          }}
                        />
                        <span className="text-[11px] font-medium text-[#516f90] group-hover:text-[#2d544c] transition-colors">{col.label}</span>
                      </label>
                    ))}
                  </div>
                )}

                <div className="p-0 overflow-x-auto max-h-[400px]">
                  {previewLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-[#516f90] animate-pulse">
                      <RefreshCcw className="w-8 h-8 animate-spin" />
                      <span className="text-sm font-bold uppercase tracking-widest">Sincronizando Leads...</span>
                    </div>
                  ) : previewLeads.length > 0 ? (
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-[#f5f8fa] border-b border-[#cbd6e2]">
                        <tr>
                          {visibleColumns.map(col => (
                            <th key={col} className="px-4 py-3 font-bold text-[#516f90] uppercase tracking-tighter text-nowrap">
                              {schema.find(s => s.name === col)?.label || col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#cbd6e2]">
                        {previewLeads.map((lead, idx) => (
                          <tr key={idx} className="hover:bg-[#f5f8fa] transition-colors">
                            {visibleColumns.map(col => (
                              <td key={col} className="px-4 py-3 text-[#33475b] max-w-[200px] truncate">
                                {col === 'created_at' ? new Date(lead[col]).toLocaleDateString() : (lead[col] || '-')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="py-20 text-center space-y-2">
                       <ListFilter className="w-10 h-10 text-[#cbd6e2] mx-auto" />
                       <p className="text-sm text-[#516f90] font-medium">No se encontraron leads con estos criterios.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Batch Config */}
              <div className="bg-[#f5f8fa] border border-[#cbd6e2] rounded-xl overflow-hidden">
                <button 
                  onClick={() => setShowBatchConfig(!showBatchConfig)}
                  className="w-full px-5 py-3 flex items-center justify-between text-sm font-bold text-[#2d544c] hover:bg-[#eaf0f6] transition-all"
                >
                  <span className="flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Configuración de Envío por Lotes
                  </span>
                  <span className="text-xs text-[#516f90] font-medium">
                    {batchSize} leads × {batchDelay}s delay
                  </span>
                </button>
                
                {showBatchConfig && (
                  <div className="px-5 pb-5 pt-2 space-y-4 border-t border-[#cbd6e2] animate-in fade-in duration-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Leads por Lote</label>
                        <select
                          className="w-full bg-white border-[#cbd6e2] border rounded-lg px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#2d544c]/20 outline-none"
                          value={batchSize}
                          onChange={(e) => setBatchSize(Number(e.target.value))}
                        >
                          <option value={10}>10 leads (muy conservador)</option>
                          <option value={25}>25 leads (conservador)</option>
                          <option value={50}>50 leads (recomendado)</option>
                          <option value={100}>100 leads (moderado)</option>
                          <option value={200}>200 leads (agresivo)</option>
                          <option value={500}>500 leads (máximo)</option>
                        </select>
                        <p className="text-[10px] text-[#516f90]">Cuántos leads se envían a n8n antes de hacer una pausa.</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Pausa entre Lotes</label>
                        <select
                          className="w-full bg-white border-[#cbd6e2] border rounded-lg px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#2d544c]/20 outline-none"
                          value={batchDelay}
                          onChange={(e) => setBatchDelay(Number(e.target.value))}
                        >
                          <option value={2}>2 segundos</option>
                          <option value={5}>5 segundos (recomendado)</option>
                          <option value={10}>10 segundos</option>
                          <option value={30}>30 segundos</option>
                          <option value={60}>1 minuto</option>
                          <option value={120}>2 minutos</option>
                          <option value={300}>5 minutos</option>
                          <option value={600}>10 minutos</option>
                        </select>
                        <p className="text-[10px] text-[#516f90]">Tiempo de espera entre cada lote para no sobrecargar el servidor.</p>
                      </div>
                    </div>
                    
                    {previewCount && previewCount > 0 && (
                      <div className="bg-white border border-[#cbd6e2] rounded-lg p-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-[#2d544c] mb-2">
                          <Clock className="w-3.5 h-3.5" />
                          Estimación de Tiempo
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-2xl font-bold text-[#33475b]">{Math.ceil(previewCount / batchSize)}</p>
                            <p className="text-[10px] text-[#516f90] font-medium">LOTES TOTALES</p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-[#33475b]">
                              {Math.ceil((previewCount * 1.5 + (Math.ceil(previewCount / batchSize) - 1) * batchDelay) / 60)}m
                            </p>
                            <p className="text-[10px] text-[#516f90] font-medium">TIEMPO ESTIMADO</p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-[#33475b]">{previewCount}</p>
                            <p className="text-[10px] text-[#516f90] font-medium">LEADS TOTALES</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Daily Quota Indicator */}
                    <div className={`border rounded-lg p-4 space-y-3 ${
                      dailyQuota.remaining === 0 ? 'bg-red-50 border-red-200' : 
                      dailyQuota.remaining < 500 ? 'bg-amber-50 border-amber-200' :
                      'bg-[#eaf0f6] border-[#cbd6e2]'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#2d544c]">📊 Cuota Gmail Diaria</span>
                        <span className={`text-xs font-bold ${
                          dailyQuota.remaining === 0 ? 'text-red-600' : 
                          dailyQuota.remaining < 500 ? 'text-amber-600' : 'text-green-600'
                        }`}>
                          {dailyQuota.remaining} restantes
                        </span>
                      </div>
                      <div className="w-full bg-white rounded-full h-2.5 overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all ${
                            dailyQuota.remaining === 0 ? 'bg-red-500' :
                            dailyQuota.remaining < 500 ? 'bg-amber-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(100, (dailyQuota.sentToday / dailyQuota.dailyLimit) * 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-[#516f90] font-medium">
                        <span>{dailyQuota.sentToday} enviados hoy</span>
                        <span>Límite: {dailyQuota.dailyLimit}/día</span>
                      </div>
                      {previewCount && previewCount > dailyQuota.remaining && (
                        <div className="bg-amber-100 rounded-md p-2 text-[10px] text-amber-800 font-medium">
                          ⚠️ Tu lista tiene {previewCount} leads pero solo quedan {dailyQuota.remaining} emails hoy. 
                          Se enviarán {dailyQuota.remaining} hoy y los {previewCount - dailyQuota.remaining} restantes mañana.
                          ({Math.ceil(previewCount / dailyQuota.dailyLimit)} días en total)
                        </div>
                      )}
                      {dailyQuota.remaining === 0 && (
                        <div className="bg-red-100 rounded-md p-2 text-[10px] text-red-700 font-bold">
                          🚫 Cuota agotada. No puedes enviar más emails hoy. Espera hasta mañana.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button 
                onClick={handleExecute}
                disabled={loading || !selectedCampaign || previewCount === 0 || previewCount === null}
                className="w-full bg-[#2d544c] hover:bg-[#1f3a35] text-white py-4 rounded-xl font-bold shadow-lg transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                {loading ? 'Enviando en Lotes...' : `Iniciar Envío Masivo (${previewCount || 0} leads)`}
              </button>
            </div>
          </section>

          {/* Campaigns Table */}
          <section className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-[#cbd6e2] flex justify-between items-center">
              <h2 className="text-xl font-bold text-[#2d544c]">Mis Campañas</h2>
              <button className="text-sm font-semibold text-[#0091ae] hover:underline">Ver todas</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-[#f5f8fa] text-[#516f90] text-xs font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">Campaña</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4 text-center">Auto</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#cbd6e2]">
                  {campaigns.slice(0, 5).map((campaign) => (
                    <tr key={campaign.id} className="hover:bg-[#f5f8fa] transition-colors group">
                      <td className="px-6 py-4">
                        <p className="font-bold text-[#33475b]">{campaign.title}</p>
                        <p className="text-xs text-[#516f90] truncate max-w-[200px]">{campaign.subject}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                          campaign.status === 'READY' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {campaign.status || 'DRAFT'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-[#516f90]">
                        {new Date(campaign.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button 
                          onClick={() => setEditingAutomation(campaign)}
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                            campaign.is_automation ? 'bg-[#eaf0f6] text-[#2d544c]' : 'text-[#cbd6e2] hover:text-[#516f90]'
                          }`}
                        >
                          <Zap className={`w-5 h-5 ${campaign.is_automation ? 'fill-current' : ''}`} />
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/campaigns/builder/${campaign.id}`} className="text-[#0091ae] hover:text-[#007a93] text-sm font-bold">
                          Diseñar
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Side Panel: Recent Activity */}
        <div className="space-y-8">
          <section className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm h-full flex flex-col">
            <div className="p-6 border-b border-[#cbd6e2] flex justify-between items-center">
              <h2 className="text-xl font-bold text-[#2d544c]">Actividad Reciente</h2>
              <span className="text-[10px] bg-[#eaf0f6] text-[#2d544c] px-2 py-0.5 rounded-full font-bold">LIVE</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[800px]">
              {logs.map((log) => (
                <div key={log.id} className="p-4 rounded-xl border border-transparent hover:border-[#cbd6e2] hover:bg-[#f5f8fa] transition-all group">
                  <div className="flex items-start gap-4">
                    <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                      log.status === 'OPENED' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-[#cbd6e2]'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <p className="text-sm font-bold text-[#33475b] truncate">{log.email}</p>
                        <span className="text-[10px] text-[#516f90] whitespace-nowrap">
                          {log.status === 'OPENED' ? 'Justo ahora' : 'Hace poco'}
                        </span>
                      </div>
                      <p className="text-xs text-[#516f90] mt-1 italic line-clamp-1">{log.campaign_title}</p>
                      <div className="mt-3 flex items-center gap-2">
                         <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                           log.status === 'OPENED' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                         }`}>
                           {log.status}
                         </span>
                         {log.opened_at && <Eye className="w-3 h-3 text-green-600" />}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Mail className="w-12 h-12 text-[#cbd6e2] mb-4" />
                  <p className="text-sm text-[#516f90]">No hay actividad de envío todavía.</p>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-[#cbd6e2]">
              <button className="w-full py-2 text-sm font-bold text-[#2d544c] hover:bg-[#eaf0f6] transition-all rounded-lg">
                Ver historial completo
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Modal: Meta Automation */}
      {editingAutomation && (
        <div className="fixed inset-0 bg-[#33475b]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#cbd6e2] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-[#cbd6e2] flex justify-between items-center text-[#2d544c]">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 fill-current" />
                <h3 className="text-xl font-bold">Automatización Meta</h3>
              </div>
              <button 
                onClick={() => setEditingAutomation(null)}
                className="text-[#516f90] hover:text-[#2d544c] p-1 rounded-full hover:bg-[#f5f8fa]"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between p-4 bg-[#f5f8fa] rounded-xl border border-[#cbd6e2]">
                <div className="space-y-1">
                  <div className="font-bold text-[#33475b]">Estado</div>
                  <div className={`text-xs font-bold ${editingAutomation.is_automation ? 'text-green-600' : 'text-[#516f90]'}`}>
                    {editingAutomation.is_automation ? 'ACTIVADA' : 'DESACTIVADA'}
                  </div>
                </div>
                <button
                  onClick={() => setEditingAutomation({...editingAutomation, is_automation: !editingAutomation.is_automation})}
                  className={`w-14 h-7 rounded-full transition-all relative ${editingAutomation.is_automation ? 'bg-[#2d544c]' : 'bg-[#cbd6e2]'}`}
                >
                  <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all shadow-sm ${editingAutomation.is_automation ? 'right-1' : 'left-1'}`}></div>
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-[#516f90]">Meta FormID vinculados</label>
                <input 
                  type="text" 
                  placeholder="Ej: 798890826611593"
                  className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded-lg px-4 py-3 text-[#33475b] focus:ring-2 focus:ring-[#2d544c]/20 outline-none font-medium"
                  value={editingAutomation.automation_formid || ''}
                  onChange={(e) => setEditingAutomation({...editingAutomation, automation_formid: e.target.value})}
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  {[
                    { label: 'Lomas del Mar', id: '798890826611593' },
                    { label: 'Arena y Sol', id: '1896385304349584' }
                  ].map(preset => (
                    <button 
                      key={preset.id}
                      onClick={() => setEditingAutomation({...editingAutomation, automation_formid: preset.id})}
                      className="text-[10px] bg-white border border-[#cbd6e2] hover:border-[#2d544c] px-2.5 py-1 rounded-full text-[#516f90] hover:text-[#2d544c] transition-all font-bold"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-[#eaf0f6] p-4 rounded-xl border border-[#2d544c]/10">
                <p className="text-xs text-[#2d544c] leading-relaxed font-medium">
                  <strong>💡 Pro-tip:</strong> Al activar la automatización, el CRM enviará este correo automáticamente a cada nuevo lead que ingrese por los formularios seleccionados (con 5 min de espera para mayor realismo).
                </p>
              </div>
            </div>

            <div className="p-6 bg-[#f5f8fa] flex gap-3 border-t border-[#cbd6e2]">
              <button 
                onClick={() => setEditingAutomation(null)}
                className="flex-1 px-4 py-3 rounded-xl border border-[#cbd6e2] font-bold text-[#33475b] hover:bg-white transition-all"
              >
                Cerrar
              </button>
              <button 
                onClick={handleSaveAutomation}
                disabled={automationLoading}
                className="flex-1 px-4 py-3 rounded-xl bg-[#2d544c] hover:bg-[#1f3a35] text-white font-bold transition-all disabled:opacity-50 shadow-md"
              >
                {automationLoading ? '...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Job Progress Overlay */}
      {jobStatus && (
        <div className="fixed bottom-6 right-6 w-[420px] bg-white border border-[#cbd6e2] rounded-2xl shadow-2xl overflow-hidden z-50 animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className={`px-5 py-3 flex items-center justify-between ${
            jobStatus.status === 'COMPLETED' ? 'bg-green-50 border-b border-green-200' :
            jobStatus.status === 'FAILED' ? 'bg-red-50 border-b border-red-200' :
            jobStatus.status === 'CANCELLED' ? 'bg-amber-50 border-b border-amber-200' :
            jobStatus.status === 'DAILY_LIMIT' ? 'bg-blue-50 border-b border-blue-200' :
            'bg-[#eaf0f6] border-b border-[#cbd6e2]'
          }`}>
            <div className="flex items-center gap-2">
              {jobStatus.status === 'RUNNING' && <Loader2 className="w-4 h-4 animate-spin text-[#2d544c]" />}
              {jobStatus.status === 'QUEUED' && <Clock className="w-4 h-4 text-[#516f90]" />}
              {jobStatus.status === 'COMPLETED' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
              {jobStatus.status === 'FAILED' && <XCircle className="w-4 h-4 text-red-600" />}
              {jobStatus.status === 'CANCELLED' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
              {jobStatus.status === 'DAILY_LIMIT' && <AlertTriangle className="w-4 h-4 text-blue-600" />}
              <span className="text-sm font-bold text-[#33475b]">
                {jobStatus.status === 'RUNNING' ? 'Envío en Progreso' :
                 jobStatus.status === 'QUEUED' ? 'Preparando Envío...' :
                 jobStatus.status === 'COMPLETED' ? 'Envío Completado' :
                 jobStatus.status === 'FAILED' ? 'Envío Fallido' :
                 jobStatus.status === 'DAILY_LIMIT' ? 'Límite Diario Alcanzado' :
                 'Envío Cancelado'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {(jobStatus.status === 'RUNNING' || jobStatus.status === 'QUEUED') && (
                <button
                  onClick={handleCancelJob}
                  className="text-xs font-bold text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-all"
                >
                  Cancelar
                </button>
              )}
              {(jobStatus.status === 'COMPLETED' || jobStatus.status === 'FAILED' || jobStatus.status === 'CANCELLED' || jobStatus.status === 'DAILY_LIMIT') && (
                <button
                  onClick={handleCloseJobTracker}
                  className="text-[#516f90] hover:text-[#33475b] p-1 rounded hover:bg-white transition-all"
                >
                  <Plus className="w-4 h-4 rotate-45" />
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="px-5 pt-4 pb-2">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-bold text-[#33475b]">{jobStatus.progress}%</span>
              <span className="text-[#516f90] font-medium">
                {jobStatus.processedLeads} / {jobStatus.totalLeads} leads
              </span>
            </div>
            <div className="w-full bg-[#eaf0f6] rounded-full h-3 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  jobStatus.status === 'COMPLETED' ? 'bg-green-500' :
                  jobStatus.status === 'FAILED' ? 'bg-red-500' :
                  jobStatus.status === 'CANCELLED' ? 'bg-amber-500' :
                  jobStatus.status === 'DAILY_LIMIT' ? 'bg-blue-500' :
                  'bg-[#2d544c]'
                }`}
                style={{ width: `${jobStatus.progress}%` }}
              />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="px-5 py-3 grid grid-cols-4 gap-3">
            <div className="text-center">
              <p className="text-lg font-bold text-[#33475b]">{jobStatus.sentBatches}</p>
              <p className="text-[9px] text-[#516f90] font-bold uppercase">Lotes</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-[#33475b]">{jobStatus.totalBatches}</p>
              <p className="text-[9px] text-[#516f90] font-bold uppercase">Total</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-green-600">{jobStatus.processedLeads - jobStatus.failedLeads}</p>
              <p className="text-[9px] text-[#516f90] font-bold uppercase">Exitosos</p>
            </div>
            <div className="text-center">
              <p className={`text-lg font-bold ${jobStatus.failedLeads > 0 ? 'text-red-600' : 'text-[#33475b]'}`}>{jobStatus.failedLeads}</p>
              <p className="text-[9px] text-[#516f90] font-bold uppercase">Fallidos</p>
            </div>
          </div>

          {/* Errors */}
          {jobStatus.errors.length > 0 && (
            <div className="px-5 pb-3">
              <details className="text-xs">
                <summary className="text-red-600 font-bold cursor-pointer hover:text-red-800">Ver errores ({jobStatus.errors.length})</summary>
                <div className="mt-2 space-y-1 max-h-[100px] overflow-y-auto bg-red-50 rounded-lg p-2">
                  {jobStatus.errors.map((err, i) => (
                    <p key={i} className="text-red-700 text-[10px] font-mono">{err}</p>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* Elapsed time */}
          {jobStatus.status === 'RUNNING' && (
            <div className="px-5 pb-3 flex items-center gap-1.5 text-[10px] text-[#516f90] font-medium">
              <Clock className="w-3 h-3" />
              Batch {jobStatus.currentBatchIndex}/{jobStatus.totalBatches} • 
              {jobStatus.batchSize} leads/lote • 
              {jobStatus.delayMs / 1000}s pausa
            </div>
          )}

          {/* Daily Limit Info */}
          {jobStatus.status === 'DAILY_LIMIT' && jobStatus.skippedLeads > 0 && (
            <div className="px-5 pb-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 font-medium">
                <p className="font-bold mb-1">📋 {jobStatus.skippedLeads} leads pendientes para mañana</p>
                <p>Se enviaron {jobStatus.processedLeads - jobStatus.failedLeads} de {jobStatus.totalLeads} leads hoy. 
                El resto se puede enviar mañana cuando se renueve la cuota de Gmail.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
