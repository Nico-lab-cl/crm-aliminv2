'use client';

import { useEffect, useState, useCallback } from 'react';
import { 
  BarChart3, 
  Mail, 
  Send, 
  Eye, 
  MousePointer, 
  Calendar, 
  Search, 
  RefreshCcw, 
  Filter, 
  Clock,
  ExternalLink,
  TrendingUp,
  FlaskConical
} from 'lucide-react';

interface Campaign {
  id: string;
  title: string;
  subject: string;
  created_at: string;
}

interface CampaignLog {
  id: string;
  email: string;
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  clicks: number;
  last_clicked_at: string | null;
  is_test: boolean;
}

interface StatGroup {
  sent: number;
  opened: number;
  clicked: number;
  clicksCount: number;
}

export default function CampaignMetricsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [realStats, setRealStats] = useState<StatGroup>({ sent: 0, opened: 0, clicked: 0, clicksCount: 0 });
  const [testStats, setTestStats] = useState<StatGroup>({ sent: 0, opened: 0, clicked: 0, clicksCount: 0 });
  const [logs, setLogs] = useState<CampaignLog[]>([]);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filtros locales
  const [searchEmail, setSearchEmail] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'real' | 'test'>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const fetchMetrics = useCallback(async (campaignId: string = '') => {
    setLoading(true);
    setError(null);
    try {
      const url = campaignId 
        ? `/api/campaigns/metrics?campaignId=${campaignId}`
        : '/api/campaigns/metrics';
        
      const res = await fetch(url);
      if (!res.ok) throw new Error('Error al obtener las métricas de la campaña');
      
      const data = await res.json();
      if (data.success) {
        setCampaigns(data.campaigns || []);
        setSelectedId(data.selectedCampaignId || '');
        setRealStats(data.real || { sent: 0, opened: 0, clicked: 0, clicksCount: 0 });
        setTestStats(data.test || { sent: 0, opened: 0, clicked: 0, clicksCount: 0 });
        setLogs(data.logs || []);
      } else {
        throw new Error(data.message || 'Error desconocido');
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const handleCampaignChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextId = e.target.value;
    setSelectedId(nextId);
    fetchMetrics(nextId);
  };

  // Helper para calcular tasas
  const getRate = (part: number, total: number) => {
    if (total === 0) return '0.0%';
    return `${((part / total) * 100).toFixed(1)}%`;
  };

  // Filtrar logs localmente
  const filteredLogs = logs.filter(log => {
    const matchesEmail = log.email.toLowerCase().includes(searchEmail.toLowerCase());
    const matchesType = 
      filterType === 'all' ? true :
      filterType === 'real' ? !log.is_test : log.is_test;
      
    const matchesStatus =
      filterStatus === 'all' ? true :
      filterStatus === 'opened' ? (log.opened_at !== null || log.status === 'OPENED') :
      filterStatus === 'clicked' ? (log.clicks > 0) :
      filterStatus === 'sent' ? (log.status === 'SENT') :
      log.status === filterStatus;

    return matchesEmail && matchesType && matchesStatus;
  });

  const selectedCampaign = campaigns.find(c => c.id === selectedId);

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto text-[#33475b]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-[#eaf0f6] rounded-xl text-[#2d544c]">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-[#2d544c]">Métricas por Campaña</h1>
              <p className="text-sm text-[#516f90] mt-0.5">Analiza el CTR, apertura e interacción detallada de tus envíos reales y pruebas.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Selector de campaña */}
          <div className="flex flex-col w-full md:w-72">
            <span className="text-[10px] font-bold text-[#516f90] uppercase tracking-wider mb-1">Seleccionar Campaña Reciente</span>
            <select
              value={selectedId}
              onChange={handleCampaignChange}
              disabled={campaigns.length === 0}
              className="w-full bg-white border border-[#cbd6e2] rounded-xl px-4 py-2.5 text-sm font-bold text-[#2d544c] shadow-sm outline-none focus:ring-2 focus:ring-[#2d544c]/20"
            >
              {campaigns.length === 0 ? (
                <option value="">No hay campañas enviadas</option>
              ) : (
                campaigns.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))
              )}
            </select>
          </div>

          <button 
            onClick={() => fetchMetrics(selectedId)}
            className="p-3 bg-white border border-[#cbd6e2] rounded-xl text-[#33475b] hover:bg-[#f5f8fa] transition-all shadow-sm self-end"
            title="Recargar datos"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 gap-3 text-slate-400">
          <RefreshCcw className="w-8 h-8 animate-spin text-[#2d544c]" />
          <span className="text-sm font-semibold uppercase tracking-widest animate-pulse">Cargando métricas...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm font-medium">
          {error}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="bg-white border border-[#cbd6e2] rounded-2xl p-16 text-center shadow-sm">
          <div className="w-16 h-16 bg-[#eaf0f6] rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail className="w-8 h-8 text-[#2d544c]" />
          </div>
          <h3 className="text-xl font-bold text-[#33475b]">No se registran envíos todavía</h3>
          <p className="text-sm text-[#516f90] mt-2 max-w-sm mx-auto">
            Envía una campaña de correo o realiza un envío de prueba para comenzar a ver las tasas de interacción en tiempo real.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Info Banner */}
          {selectedCampaign && (
            <div className="bg-[#eaf0f6]/30 border border-[#cbd6e2]/60 rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="bg-[#eaf0f6] text-[#2d544c] text-[10px] font-bold px-2 py-0.5 rounded border border-[#cbd6e2]/40">Asunto</span>
                  <span className="text-sm font-semibold text-[#33475b] italic">&quot;{selectedCampaign.subject}&quot;</span>
                </div>
                <p className="text-xs text-[#516f90] flex items-center gap-1.5 pt-0.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Creado el {new Date(selectedCampaign.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#516f90] font-semibold bg-white px-3 py-1.5 rounded-lg border border-[#cbd6e2]/40 shadow-sm">
                <TrendingUp className="w-4 h-4 text-[#2d544c]" />
                Modo Producción Activo
              </div>
            </div>
          )}

          {/* Sección de Envíos Reales */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[#2d544c] flex items-center gap-1.5">
                <Send className="w-4 h-4 text-[#2d544c]" />
                Envíos Reales (Campañas Masivas)
              </h2>
              <span className="h-px bg-[#cbd6e2] flex-1" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Entregados', value: realStats.sent, desc: 'Total destinatarios reales', icon: Send, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Tasa de Apertura', value: getRate(realStats.opened, realStats.sent), desc: `${realStats.opened} aperturas registradas`, icon: Eye, color: 'text-green-600', bg: 'bg-green-50' },
                { label: 'Tasa de Clic (CTR)', value: getRate(realStats.clicked, realStats.sent), desc: `${realStats.clicked} hicieron clic en enlaces`, icon: MousePointer, color: 'text-[#c49a00]', bg: 'bg-yellow-50' },
                { label: 'Clics Totales', value: realStats.clicksCount, desc: 'Suma absoluta de clics', icon: ExternalLink, color: 'text-indigo-600', bg: 'bg-indigo-50' },
              ].map((stat, i) => (
                <div key={i} className="bg-white border border-[#cbd6e2] rounded-2xl p-6 shadow-sm flex items-start justify-between">
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-[#516f90] uppercase tracking-wider">{stat.label}</span>
                    <h3 className="text-3xl font-extrabold text-[#33475b]">{stat.value}</h3>
                    <p className="text-[11px] text-[#516f90] font-medium leading-none">{stat.desc}</p>
                  </div>
                  <div className={`p-3 rounded-xl ${stat.bg}`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sección de Envíos de Prueba */}
          <div className="space-y-4 pt-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[#b88c00] flex items-center gap-1.5">
                <FlaskConical className="w-4 h-4 text-[#c49a00]" />
                Envíos de Prueba (Pruebas de Bandeja)
              </h2>
              <span className="h-px bg-[#cbd6e2] flex-1" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Enviados Test', value: testStats.sent, desc: 'Total envíos rápidos de prueba', icon: Send, color: 'text-zinc-600', bg: 'bg-zinc-100' },
                { label: 'Aperturas Test', value: getRate(testStats.opened, testStats.sent), desc: `${testStats.opened} aperturas registradas`, icon: Eye, color: 'text-green-600', bg: 'bg-green-50' },
                { label: 'CTR Test', value: getRate(testStats.clicked, testStats.sent), desc: `${testStats.clicked} hicieron clic en enlaces`, icon: MousePointer, color: 'text-[#c49a00]', bg: 'bg-yellow-50' },
                { label: 'Clics Test', value: testStats.clicksCount, desc: 'Suma absoluta de clics de prueba', icon: ExternalLink, color: 'text-indigo-600', bg: 'bg-indigo-50' },
              ].map((stat, i) => (
                <div key={i} className="bg-white border border-[#cbd6e2] rounded-2xl p-6 shadow-sm flex items-start justify-between border-dashed border-amber-200">
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-[#7a8c9e] uppercase tracking-wider">{stat.label}</span>
                    <h3 className="text-3xl font-extrabold text-[#33475b]">{stat.value}</h3>
                    <p className="text-[11px] text-[#516f90] font-medium leading-none">{stat.desc}</p>
                  </div>
                  <div className={`p-3 rounded-xl ${stat.bg}`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Listado de Logs y Seguimiento */}
          <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-hidden space-y-5 p-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
              <div>
                <h3 className="text-base font-bold text-[#2d544c]">Listado de Seguimiento</h3>
                <p className="text-xs text-[#516f90] mt-0.5">Visualiza el historial detallado de envíos individuales y las interacciones.</p>
              </div>

              {/* Controles de filtro y búsqueda */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Buscador */}
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#516f90]" />
                  <input
                    type="text"
                    placeholder="Filtrar por correo..."
                    className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg py-2 pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#2d544c]/20 focus:bg-white transition-all"
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                  />
                </div>

                {/* Filtro de Tipo */}
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-[#516f90]" />
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as 'all' | 'real' | 'test')}
                    className="bg-[#f5f8fa] border-[#cbd6e2] border text-xs px-2.5 py-2 rounded-lg font-semibold text-[#33475b] outline-none"
                  >
                    <option value="all">Todos los Tipos</option>
                    <option value="real">Solo Reales</option>
                    <option value="test">Solo Pruebas</option>
                  </select>
                </div>

                {/* Filtro de Estado */}
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-[#f5f8fa] border-[#cbd6e2] border text-xs px-2.5 py-2 rounded-lg font-semibold text-[#33475b] outline-none"
                >
                  <option value="all">Todos los Estados</option>
                  <option value="sent">SENT (Solo Enviados)</option>
                  <option value="opened">OPENED (Solo Abiertos)</option>
                  <option value="clicked">CLICKED (Con Clics)</option>
                </select>
              </div>
            </div>

            {/* Tabla */}
            <div className="overflow-x-auto border border-[#cbd6e2] rounded-xl">
              {filteredLogs.length === 0 ? (
                <div className="text-center py-16 text-slate-400 text-xs font-semibold">
                  No se encontraron logs con los filtros aplicados.
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#f5f8fa] text-[#516f90] text-[10px] font-bold uppercase tracking-wider border-b border-[#cbd6e2]">
                      <th className="px-5 py-3">Correo Destinatario</th>
                      <th className="px-5 py-3">Tipo Envío</th>
                      <th className="px-5 py-3">Estado</th>
                      <th className="px-5 py-3">Fecha Envío</th>
                      <th className="px-5 py-3">Fecha Apertura</th>
                      <th className="px-5 py-3 text-center">Clics</th>
                      <th className="px-5 py-3">Último Clic</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#cbd6e2]/60 text-xs">
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#f5f8fa]/60 transition-all">
                        <td className="px-5 py-3.5 font-semibold text-[#33475b]">
                          {log.email}
                        </td>
                        <td className="px-5 py-3.5 font-bold">
                          {log.is_test ? (
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[9px] flex items-center gap-1 w-max">
                              <FlaskConical className="w-3 h-3" /> Prueba (Test)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-green-50 text-[#2d544c] border border-green-200 rounded text-[9px] flex items-center gap-1 w-max">
                              <Send className="w-3 h-3" /> Real (Campaña)
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {log.status === 'OPENED' || log.opened_at !== null ? (
                            <span className="px-2.5 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full font-bold text-[10px]">
                              OPENED
                            </span>
                          ) : log.status === 'TEST' ? (
                            <span className="px-2.5 py-0.5 bg-zinc-100 text-zinc-600 border border-zinc-200 rounded-full font-bold text-[10px]">
                              TEST
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full font-bold text-[10px]">
                              {log.status}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-[#516f90] whitespace-nowrap">
                          {log.sent_at ? (
                            <div className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {new Date(log.sent_at).toLocaleString()}
                            </div>
                          ) : '-'}
                        </td>
                        <td className="px-5 py-3.5 text-[#516f90] whitespace-nowrap">
                          {log.opened_at ? (
                            <div className="flex items-center gap-1 text-green-600 font-medium">
                              <Eye className="w-3.5 h-3.5 text-green-600" />
                              {new Date(log.opened_at).toLocaleString()}
                            </div>
                          ) : '-'}
                        </td>
                        <td className="px-5 py-3.5 text-center font-bold text-[#33475b]">
                          {log.clicks > 0 ? (
                            <span className="bg-amber-100/50 text-[#b88c00] px-2 py-0.5 rounded text-[10px]">
                              {log.clicks} clic(s)
                            </span>
                          ) : '0'}
                        </td>
                        <td className="px-5 py-3.5 text-[#516f90] whitespace-nowrap">
                          {log.last_clicked_at ? (
                            <div className="flex items-center gap-1 text-amber-600">
                              <ExternalLink className="w-3.5 h-3.5" />
                              {new Date(log.last_clicked_at).toLocaleString()}
                            </div>
                          ) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
