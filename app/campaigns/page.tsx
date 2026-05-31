'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  Mail, 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal,
  ChevronRight,
  Zap,
  Calendar
} from 'lucide-react';

interface Campaign {
  id: string;
  title: string;
  subject: string;
  status: string;
  created_at: string;
  is_automation: boolean;
  automation_formid: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/campaigns');
      if (res.ok) {
        setCampaigns(await res.json());
      }
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCampaigns = campaigns.filter(c => 
    c.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.subject.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto text-[#33475b]">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-[#2d544c]">Campañas de Email</h1>
          <p className="text-[#516f90] mt-1">Administra tus diseños, borradores y envíos masivos.</p>
        </div>
        <Link 
          href="/campaigns/builder"
          className="bg-[#2d544c] hover:bg-[#1f3a35] text-white px-5 py-2.5 rounded-lg font-bold shadow-sm transition-all flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Crear Campaña
        </Link>
      </div>

      {/* Filters & Search */}
      <div className="bg-white border border-[#cbd6e2] rounded-xl p-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1 max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#516f90]" />
            <input 
              type="text" 
              placeholder="Buscar por título o asunto..." 
              className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d544c]/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 border border-[#cbd6e2] rounded-lg text-sm font-semibold hover:bg-[#f5f8fa] transition-all">
            <Filter className="w-4 h-4" />
            <span>Filtros avanzados</span>
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm font-medium text-[#516f90]">
          Total: <span className="text-[#2d544c]">{filteredCampaigns.length}</span>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#f5f8fa] text-[#516f90] text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-4 w-12">
                   <input type="checkbox" className="rounded border-[#cbd6e2] text-[#2d544c] focus:ring-[#2d544c]" />
                </th>
                <th className="px-6 py-4">Nombre de Campaña</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Última Modificación</th>
                <th className="px-6 py-4 text-center">Auto</th>
                <th className="px-6 py-4 text-right">Métricas</th>
                <th className="px-6 py-4 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#cbd6e2]">
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-6" colSpan={7}>
                      <div className="h-4 bg-[#f5f8fa] rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : filteredCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-[#516f90]">
                     No se encontraron campañas.
                  </td>
                </tr>
              ) : (
                filteredCampaigns.map((campaign) => (
                  <tr key={campaign.id} className="hover:bg-[#f5f8fa] transition-all group">
                    <td className="px-6 py-4">
                       <input type="checkbox" className="rounded border-[#cbd6e2] text-[#2d544c] focus:ring-[#2d544c]" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded bg-orange-100 text-orange-600">
                          <Mail className="w-4 h-4" />
                        </div>
                        <div>
                          <Link href={`/campaigns/builder/${campaign.id}`} className="font-bold text-[#33475b] hover:text-[#2d544c] hover:underline">
                            {campaign.title}
                          </Link>
                          <p className="text-xs text-[#516f90] truncate max-w-[250px]">{campaign.subject}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        campaign.status === 'READY' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {campaign.status || 'DRAFT'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-[#516f90]">
                        <Calendar className="w-4 h-4" />
                        {new Date(campaign.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${
                        campaign.is_automation ? 'bg-[#eaf0f6] text-[#2d544c]' : 'bg-gray-50 text-gray-300'
                      }`}>
                        <Zap className={`w-4 h-4 ${campaign.is_automation ? 'fill-current' : ''}`} />
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <Link 
                         href={`/campaigns/metrics?campaignId=${campaign.id}`}
                         className="flex items-center justify-end gap-3 text-[#516f90] hover:text-[#2d544c] group/metrics transition-all"
                       >
                         <div className="flex flex-col items-end">
                            <span className="text-xs font-bold text-[#33475b] group-hover/metrics:text-[#2d544c]">Ver</span>
                            <span className="text-[10px] group-hover/metrics:underline">Métricas</span>
                         </div>
                         <ChevronRight className="w-4 h-4 text-[#cbd6e2] group-hover/metrics:translate-x-0.5 transition-transform" />
                       </Link>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-2 rounded-lg hover:bg-[#cbd6e2]/20 text-[#516f90] opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex justify-center py-4">
        <button className="text-sm font-bold text-[#2d544c] hover:underline flex items-center gap-1">
          Cargar más campañas
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
