'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Activity, 
  Users, 
  Smartphone, 
  Globe, 
  Clock, 
  MousePointerClick, 
  MapPin, 
  Laptop, 
  Compass, 
  Calendar 
} from 'lucide-react';

interface ElementMetric {
  element: string;
  clicks: number;
}

interface HistoryMetric {
  date: string;
  clicks: number;
}

interface GeoMetric {
  country: string;
  city: string;
  clicks: number;
}

interface TechItem {
  name: string;
  clicks: number;
}

interface MetricsData {
  signatureId: string;
  name: string;
  summary: {
    totalClicks: number;
    uniqueClicks: number;
  };
  elements: ElementMetric[];
  history: HistoryMetric[];
  geography: GeoMetric[];
  technology: {
    devices: TechItem[];
    operatingSystems: TechItem[];
    browsers: TechItem[];
  };
}

const ELEMENT_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  website: { label: 'Sitio Web', icon: '🌐', color: 'bg-blue-500' },
  whatsapp: { label: 'WhatsApp', icon: '💬', color: 'bg-green-500' },
  instagram: { label: 'Instagram', icon: '📸', color: 'bg-pink-500' },
  facebook: { label: 'Facebook', icon: '👥', color: 'bg-blue-600' },
  linkedin: { label: 'LinkedIn', icon: '💼', color: 'bg-sky-700' },
  youtube: { label: 'YouTube', icon: '🎥', color: 'bg-red-500' },
  email: { label: 'Correo Electrónico', icon: '✉️', color: 'bg-indigo-500' },
  phone: { label: 'Teléfono Fijo', icon: '📞', color: 'bg-teal-600' },
  mobile: { label: 'Celular / Móvil', icon: '📱', color: 'bg-emerald-500' },
};

export default function SignatureMetricsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchMetrics = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/signatures/${id}/metrics`);
        if (!res.ok) {
          throw new Error('No se pudieron cargar las métricas de la firma.');
        }
        const data = await res.json();
        setMetrics(data);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Error al obtener métricas.');
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 space-y-4">
        <div className="w-10 h-10 border-4 border-[#2d544c] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-[#516f90] font-medium">Compilando reporte de analíticas...</p>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4 mt-20 bg-white border border-[#cbd6e2] rounded-2xl shadow-sm">
        <div className="text-red-500 font-bold text-lg">Error</div>
        <p className="text-sm text-[#516f90]">{error || 'No se pudieron procesar las analíticas.'}</p>
        <button
          onClick={() => router.push('/campaigns/signatures')}
          className="inline-flex items-center gap-2 bg-[#2d544c] hover:bg-[#203c36] text-white font-semibold py-2 px-4 rounded-lg text-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a Firmas
        </button>
      </div>
    );
  }

  // Cálculos de métricas
  const maxHistoryClicks = metrics.history.length > 0
    ? Math.max(...metrics.history.map(h => h.clicks))
    : 0;

  const maxElementClicks = metrics.elements.length > 0
    ? Math.max(...metrics.elements.map(e => e.clicks))
    : 0;

  const totalClicksVal = metrics.summary.totalClicks || 1; // evitar division por cero
  const clickThroughRate = ((metrics.summary.uniqueClicks / totalClicksVal) * 100).toFixed(1);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Botón Volver e Info Firma */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => router.push('/campaigns/signatures')}
          className="p-2 hover:bg-[#eaf0f6] rounded-full transition-colors text-[#516f90]"
          title="Volver"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-[#33475b] flex items-center gap-2">
            Métricas: <span className="text-[#2d544c]">{metrics.name}</span>
          </h1>
          <p className="text-xs text-[#516f90]">
            Reporte detallado de clics recopilados desde los correos electrónicos enviados.
          </p>
        </div>
      </div>

      {/* Tarjetas de Resumen Rápido */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-[#cbd6e2] shadow-sm flex items-center gap-5">
          <div className="w-12 h-12 rounded-lg bg-[#eaf0f6] text-[#2d544c] flex items-center justify-center">
            <MousePointerClick className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Clics Totales</p>
            <p className="text-3xl font-extrabold text-[#33475b] mt-1">{metrics.summary.totalClicks}</p>
            <p className="text-[10px] text-[#516f90] mt-0.5">Veces que se interactuó con la firma</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-[#cbd6e2] shadow-sm flex items-center gap-5">
          <div className="w-12 h-12 rounded-lg bg-[#eaf0f6] text-[#2d544c] flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Clics Únicos</p>
            <p className="text-3xl font-extrabold text-[#33475b] mt-1">{metrics.summary.uniqueClicks}</p>
            <p className="text-[10px] text-[#516f90] mt-0.5">Usuarios/Dispositivos únicos (por IP)</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-[#cbd6e2] shadow-sm flex items-center gap-5">
          <div className="w-12 h-12 rounded-lg bg-[#eaf0f6] text-[#2d544c] flex items-center justify-center">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Tasa de Unicidad</p>
            <p className="text-3xl font-extrabold text-[#33475b] mt-1">{clickThroughRate}%</p>
            <p className="text-[10px] text-[#516f90] mt-0.5">Relación entre clics únicos y totales</p>
          </div>
        </div>
      </div>

      {/* Grilla Central: Gráfico Histórico y Clics por Elemento */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Historial de Clics - 30 días (Col 7) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-[#cbd6e2] p-6 shadow-sm flex flex-col">
          <h3 className="font-bold text-[#33475b] text-sm mb-6 flex items-center gap-2 border-b border-[#f5f8fa] pb-3">
            <Calendar className="w-4.5 h-4.5 text-[#2d544c]" />
            Evolución de Clics (Últimos 30 días)
          </h3>

          {metrics.history.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-[#516f90] text-xs">
              <Clock className="w-8 h-8 mb-2 opacity-50" />
              <span>Aún no hay registros de clics para graficar la evolución.</span>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between">
              {/* Gráfico SVG customizado */}
              <div className="h-64 w-full flex items-end justify-between gap-1.5 px-2">
                {metrics.history.map((h, i) => {
                  const percent = maxHistoryClicks > 0 ? (h.clicks / maxHistoryClicks) * 90 : 0;
                  const day = h.date.split('-')[2];
                  
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center group relative">
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-1 hidden group-hover:block bg-[#33475b] text-white text-[10px] py-1 px-2 rounded shadow-md z-10 whitespace-nowrap">
                        {h.date}: <strong className="font-bold">{h.clicks} clics</strong>
                      </div>
                      
                      {/* Barra */}
                      <div 
                        style={{ height: `${Math.max(percent, 4)}%` }}
                        className={`w-full rounded-t transition-all duration-300 ${
                          percent > 0 ? 'bg-[#2d544c] hover:bg-[#203c36]' : 'bg-[#cbd6e2]'
                        }`}
                      />
                      
                      {/* Etiqueta Día */}
                      <span className="text-[10px] text-[#516f90] mt-2 font-medium">
                        {day}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-[#cbd6e2] mt-4 pt-3 flex justify-between text-[10px] text-[#516f90] font-bold">
                <span>{metrics.history[0]?.date}</span>
                <span>Intervalo Diario</span>
                <span>{metrics.history[metrics.history.length - 1]?.date}</span>
              </div>
            </div>
          )}
        </div>

        {/* Clics por Elemento / Canal (Col 5) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-[#cbd6e2] p-6 shadow-sm flex flex-col">
          <h3 className="font-bold text-[#33475b] text-sm mb-6 flex items-center gap-2 border-b border-[#f5f8fa] pb-3">
            <MousePointerClick className="w-4.5 h-4.5 text-[#2d544c]" />
            Ranking de Secciones Clicadas
          </h3>

          {metrics.elements.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-[#516f90] text-xs">
              <Activity className="w-8 h-8 mb-2 opacity-50" />
              <span>Ningún botón o enlace ha sido clicado todavía.</span>
            </div>
          ) : (
            <div className="space-y-4 flex-1 overflow-y-auto pr-1">
              {metrics.elements.map((el) => {
                const configItem = ELEMENT_LABELS[el.element] || { label: el.element, icon: '🔗', color: 'bg-gray-500' };
                const pct = maxElementClicks > 0 ? (el.clicks / maxElementClicks) * 100 : 0;

                return (
                  <div key={el.element} className="space-y-1">
                    <div className="flex justify-between text-xs font-bold text-[#33475b]">
                      <span className="flex items-center gap-1">
                        <span className="text-sm">{configItem.icon}</span>
                        <span>{configItem.label}</span>
                      </span>
                      <span>{el.clicks} ({((el.clicks / metrics.summary.totalClicks) * 100).toFixed(0)}%)</span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-[#f6f9fc] h-2.5 rounded-full overflow-hidden border border-[#f0f4f8]">
                      <div 
                        style={{ width: `${pct}%` }} 
                        className={`h-full rounded-full ${configItem.color}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Grilla Inferior: Distribución Geográfica y Datos Tecnológicos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Distribución Geográfica */}
        <div className="bg-white rounded-xl border border-[#cbd6e2] p-6 shadow-sm">
          <h3 className="font-bold text-[#33475b] text-sm mb-4 flex items-center gap-2 border-b border-[#f5f8fa] pb-3">
            <Globe className="w-4.5 h-4.5 text-[#2d544c]" />
            Ubicación Geográfica de Clics
          </h3>

          {metrics.geography.length === 0 ? (
            <div className="py-12 text-center text-[#516f90] text-xs flex flex-col items-center justify-center">
              <MapPin className="w-8 h-8 mb-2 opacity-50" />
              <span>Sin registros geográficos disponibles.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#cbd6e2] text-[10px] text-[#516f90] font-bold uppercase">
                    <th className="py-2.5">País</th>
                    <th className="py-2.5">Ciudad / Región</th>
                    <th className="py-2.5 text-right">Clics</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f5f8fa] text-xs text-[#33475b] font-semibold">
                  {metrics.geography.map((geo, idx) => (
                    <tr key={idx} className="hover:bg-[#f6f9fc] transition-colors">
                      <td className="py-2.5 flex items-center gap-1.5">
                        <span className="text-sm">📍</span>
                        <span>{geo.country}</span>
                      </td>
                      <td className="py-2.5 text-[#516f90]">{geo.city || 'Desconocida'}</td>
                      <td className="py-2.5 text-right font-bold text-[#2d544c]">{geo.clicks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Tecnología (Dispositivos, Browsers y OS) */}
        <div className="bg-white rounded-xl border border-[#cbd6e2] p-6 shadow-sm flex flex-col justify-between">
          <h3 className="font-bold text-[#33475b] text-sm mb-4 flex items-center gap-2 border-b border-[#f5f8fa] pb-3">
            <Laptop className="w-4.5 h-4.5 text-[#2d544c]" />
            Entornos y Tecnología
          </h3>

          {metrics.summary.totalClicks === 0 ? (
            <div className="py-12 text-center text-[#516f90] text-xs flex flex-col items-center justify-center">
              <Compass className="w-8 h-8 mb-2 opacity-50" />
              <span>Aún no hay clics para compilar estadísticas de dispositivos.</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 h-full">
              {/* Dispositivos */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-[#516f90] uppercase border-b border-[#f5f8fa] pb-1.5">Dispositivo</p>
                <div className="space-y-2 text-xs font-semibold text-[#33475b]">
                  {metrics.technology.devices.map(item => (
                    <div key={item.name} className="flex justify-between items-center bg-[#f6f9fc] p-2 rounded-lg">
                      <span className="truncate" title={item.name}>{item.name}</span>
                      <span className="font-bold text-[#2d544c] ml-1">{item.clicks}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sistemas Operativos */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-[#516f90] uppercase border-b border-[#f5f8fa] pb-1.5">Sist. Operativo</p>
                <div className="space-y-2 text-xs font-semibold text-[#33475b]">
                  {metrics.technology.operatingSystems.map(item => (
                    <div key={item.name} className="flex justify-between items-center bg-[#f6f9fc] p-2 rounded-lg">
                      <span className="truncate" title={item.name}>{item.name}</span>
                      <span className="font-bold text-[#2d544c] ml-1">{item.clicks}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Navegadores */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-[#516f90] uppercase border-b border-[#f5f8fa] pb-1.5">Navegador</p>
                <div className="space-y-2 text-xs font-semibold text-[#33475b]">
                  {metrics.technology.browsers.map(item => (
                    <div key={item.name} className="flex justify-between items-center bg-[#f6f9fc] p-2 rounded-lg">
                      <span className="truncate" title={item.name}>{item.name}</span>
                      <span className="font-bold text-[#2d544c] ml-1">{item.clicks}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
