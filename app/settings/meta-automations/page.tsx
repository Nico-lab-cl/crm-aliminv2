'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Plus, Zap, Trash2, Edit2, Loader2, CheckCircle2, 
  AlertCircle, Search, Mail, Play, ToggleLeft, ToggleRight 
} from 'lucide-react';

interface Campaign {
  id: string;
  title: string;
  subject: string;
}

interface AutomationRule {
  id: number;
  name: string;
  form_id: string;
  campaign_ids: string[] | string;
  active: boolean;
  created_at: string;
}

export default function MetaAutomationsPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form & Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [formId, setFormId] = useState('');
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [ruleActive, setRuleActive] = useState(true);
  const [campaignSearch, setCampaignSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Test State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testRule, setTestRule] = useState<AutomationRule | null>(null);
  const [testEmail, setTestEmail] = useState('test_lead@alimin.cl');
  const [testName, setTestName] = useState('Juan Test Meta');
  const [testPhone, setTestPhone] = useState('+56999999999');
  const [testPie, setTestPie] = useState('5.500.000 CLP');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rulesRes, campaignsRes] = await Promise.all([
        fetch('/api/meta-automations'),
        fetch('/api/campaigns')
      ]);

      if (!rulesRes.ok || !campaignsRes.ok) {
        throw new Error('Error al cargar datos del servidor');
      }

      const rulesData = await rulesRes.json();
      const campaignsData = await campaignsRes.json();

      setRules(rulesData);
      setCampaigns(campaignsData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingRule(null);
    setRuleName('');
    setFormId('');
    setSelectedCampaignIds([]);
    setRuleActive(true);
    setCampaignSearch('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (rule: AutomationRule) => {
    setEditingRule(rule);
    setRuleName(rule.name);
    setFormId(rule.form_id);
    
    let ids: string[] = [];
    try {
      ids = Array.isArray(rule.campaign_ids) 
        ? rule.campaign_ids 
        : typeof rule.campaign_ids === 'string' 
          ? JSON.parse(rule.campaign_ids) 
          : [];
    } catch (e) {
      console.error('Error parsing campaign_ids:', e);
    }
    
    setSelectedCampaignIds(ids);
    setRuleActive(rule.active);
    setCampaignSearch('');
    setIsModalOpen(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim() || !formId.trim()) {
      setError('Por favor, completa los campos requeridos.');
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      name: ruleName,
      form_id: formId,
      campaign_ids: selectedCampaignIds,
      active: ruleActive
    };

    try {
      let res;
      if (editingRule) {
        res = await fetch(`/api/meta-automations/${editingRule.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/meta-automations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Error al guardar la regla');
      }

      setSuccess(editingRule ? 'Regla actualizada con éxito!' : 'Regla creada con éxito!');
      setIsModalOpen(false);
      fetchData();
      
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (id: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta regla de automatización?')) return;

    setError(null);
    try {
      const res = await fetch(`/api/meta-automations/${id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        throw new Error('No se pudo eliminar la regla');
      }

      setSuccess('Regla eliminada correctamente.');
      fetchData();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggleActive = async (rule: AutomationRule) => {
    setError(null);
    let ids: string[] = [];
    try {
      ids = Array.isArray(rule.campaign_ids) 
        ? rule.campaign_ids 
        : typeof rule.campaign_ids === 'string' 
          ? JSON.parse(rule.campaign_ids) 
          : [];
    } catch (e) {}

    const payload = {
      name: rule.name,
      form_id: rule.form_id,
      campaign_ids: ids,
      active: !rule.active
    };

    try {
      const res = await fetch(`/api/meta-automations/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Error al actualizar estado');
      
      // Update locally immediately for speed
      setRules(rules.map(r => r.id === rule.id ? { ...r, active: !r.active } : r));
    } catch (err) {
      setError((err as Error).message);
      fetchData();
    }
  };

  const handleOpenTestModal = (rule: AutomationRule) => {
    setTestRule(rule);
    setIsTestModalOpen(true);
  };

  const handleRunTest = async () => {
    if (!testRule) return;

    setTesting(true);
    setError(null);
    setSuccess(null);

    const payload = {
      email: testEmail,
      name: testName,
      phone: testPhone,
      formid: testRule.form_id,
      adname: 'Test Ad Campaign',
      pie: testPie
    };

    try {
      const res = await fetch('/api/leads/webhook/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Error al enviar lead de prueba');
      }

      setSuccess(`Prueba enviada! Lead ingresado y automatización ejecutada. Detalle: ${data.message || ''}`);
      setIsTestModalOpen(false);
      setTimeout(() => setSuccess(null), 6000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const getCampaignTitles = (campaignIdsData: string[] | string) => {
    let ids: string[] = [];
    try {
      ids = Array.isArray(campaignIdsData) 
        ? campaignIdsData 
        : typeof campaignIdsData === 'string' 
          ? JSON.parse(campaignIdsData) 
          : [];
    } catch (e) {
      return '-';
    }

    if (ids.length === 0) return 'Ninguna campaña';

    const matched = campaigns.filter(c => ids.includes(c.id));
    if (matched.length === 0) return `${ids.length} campañas (no encontradas)`;
    
    return matched.map(c => c.title).join(', ');
  };

  const getCampaignCount = (campaignIdsData: string[] | string) => {
    try {
      const ids = Array.isArray(campaignIdsData) 
        ? campaignIdsData 
        : typeof campaignIdsData === 'string' 
          ? JSON.parse(campaignIdsData) 
          : [];
      return ids.length;
    } catch (e) {
      return 0;
    }
  };

  const filteredCampaigns = campaigns.filter(c => 
    c.title.toLowerCase().includes(campaignSearch.toLowerCase()) ||
    c.subject.toLowerCase().includes(campaignSearch.toLowerCase())
  );

  const toggleCampaignSelection = (id: string) => {
    if (selectedCampaignIds.includes(id)) {
      setSelectedCampaignIds(selectedCampaignIds.filter(cid => cid !== id));
    } else {
      setSelectedCampaignIds([...selectedCampaignIds, id]);
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-[1200px] mx-auto animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link 
              href="/settings"
              className="p-1.5 border border-[#cbd6e2] rounded-lg text-[#516f90] hover:bg-[#f5f8fa] hover:text-[#2d544c] transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <span className="text-sm font-bold text-[#516f90] uppercase tracking-wider">Ajustes</span>
          </div>
          <h1 className="text-3xl font-bold text-[#2d544c] flex items-center gap-2">
            <Zap className="w-8 h-8 fill-current text-[#2d544c]" />
            Automatizaciones Meta
          </h1>
          <p className="text-[#516f90]">
            Mapea formularios de Facebook/Instagram Ads para despachar campañas de correo completas a tu webhook especial de n8n.
          </p>
        </div>

        <div>
          <button 
            onClick={handleOpenAddModal}
            className="w-full sm:w-auto bg-[#2d544c] hover:bg-[#1f3a35] text-white px-5 py-2.5 rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Nueva Regla
          </button>
        </div>
      </div>

      {/* Notifications */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex gap-3 text-sm text-green-800 font-medium animate-in slide-in-from-top-4 duration-300">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          <p>{success}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 text-sm text-red-800 font-medium animate-in slide-in-from-top-4 duration-300">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Main Table Section */}
      <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-[#516f90] animate-pulse">
            <Loader2 className="w-10 h-10 animate-spin text-[#2d544c]" />
            <span className="text-sm font-bold uppercase tracking-wider">Cargando reglas...</span>
          </div>
        ) : rules.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f5f8fa] text-[#516f90] text-xs font-bold uppercase tracking-wider border-b border-[#cbd6e2]">
                  <th className="px-6 py-4">Regla</th>
                  <th className="px-6 py-4">Meta Form ID</th>
                  <th className="px-6 py-4">Campañas Asociadas</th>
                  <th className="px-6 py-4 text-center">Estado</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#cbd6e2]">
                {rules.map((rule) => {
                  const count = getCampaignCount(rule.campaign_ids);
                  return (
                    <tr key={rule.id} className="hover:bg-[#f5f8fa]/50 transition-colors group">
                      <td className="px-6 py-4">
                        <p className="font-bold text-[#33475b] group-hover:text-[#2d544c] transition-colors">{rule.name}</p>
                        <p className="text-[10px] text-[#516f90] mt-0.5">
                          Creado: {new Date(rule.created_at).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <code className="bg-[#eaf0f6] text-[#2d544c] px-2.5 py-1 rounded-md text-xs font-mono font-bold">
                          {rule.form_id}
                        </code>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-[#eaf0f6] text-[#2d544c] text-[10px] font-bold rounded-full flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {count} {count === 1 ? 'campaña' : 'campañas'}
                          </span>
                          <span className="text-xs text-[#516f90] max-w-[280px] truncate block" title={getCampaignTitles(rule.campaign_ids)}>
                            {getCampaignTitles(rule.campaign_ids)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button 
                          onClick={() => handleToggleActive(rule)}
                          className="focus:outline-none hover:opacity-85 transition-opacity"
                        >
                          {rule.active ? (
                            <ToggleRight className="w-9 h-9 text-[#2d544c]" />
                          ) : (
                            <ToggleLeft className="w-9 h-9 text-[#cbd6e2]" />
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2.5">
                          <button 
                            onClick={() => handleOpenTestModal(rule)}
                            className="p-1.5 border border-[#cbd6e2] hover:border-[#2d544c] hover:bg-[#eaf0f6] text-[#516f90] hover:text-[#2d544c] rounded-lg transition-all"
                            title="Probar automatización"
                          >
                            <Play className="w-4 h-4 fill-current" />
                          </button>
                          <button 
                            onClick={() => handleOpenEditModal(rule)}
                            className="p-1.5 border border-[#cbd6e2] hover:border-[#2d544c] text-[#516f90] hover:text-[#2d544c] rounded-lg transition-all"
                            title="Editar regla"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteRule(rule.id)}
                            className="p-1.5 border border-[#cbd6e2] hover:border-red-500 hover:bg-red-50 text-[#516f90] hover:text-red-600 rounded-lg transition-all"
                            title="Eliminar regla"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-24 text-center space-y-4 max-w-sm mx-auto">
            <div className="p-4 bg-[#eaf0f6] text-[#2d544c] rounded-full w-16 h-16 flex items-center justify-center mx-auto shadow-inner">
              <Zap className="w-8 h-8 fill-current" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-[#33475b]">No hay automatizaciones configuradas</h3>
              <p className="text-sm text-[#516f90]">
                Crea tu primera regla para vincular leads de Meta con tus campañas de Email Marketing.
              </p>
            </div>
            <button 
              onClick={handleOpenAddModal}
              className="bg-[#2d544c] hover:bg-[#1f3a35] text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2 mx-auto"
            >
              <Plus className="w-4 h-4" />
              Crear mi primera regla
            </button>
          </div>
        )}
      </div>

      {/* Config Card / Explainer */}
      <div className="bg-[#eaf0f6] border border-[#2d544c]/10 rounded-2xl p-6 flex items-start gap-4">
        <div className="p-3 bg-white rounded-xl text-[#2d544c] shadow-sm">
          <Zap className="w-6 h-6 fill-current" />
        </div>
        <div className="space-y-2">
          <h4 className="font-bold text-[#2d544c]">¿Cómo funciona este webhook?</h4>
          <p className="text-sm text-[#516f90] leading-relaxed">
            Al registrarse una regla, cuando llega un lead desde Meta con el <strong>FormID</strong> configurado,
            el sistema recopila la información básica del cliente junto al listado completo de campañas seleccionadas
            (incluyendo su diseño HTML completo y MJML) y las despacha de inmediato en formato JSON al webhook especial de n8n.
          </p>
          <div className="text-xs font-mono bg-white border border-[#cbd6e2] p-2.5 rounded-lg text-[#33475b] select-all truncate">
            https://n8n.aliminlomasdelmar.com/webhook/cf17a03e-fd4c-4355-bc20-e007f73ee2a8
          </div>
        </div>
      </div>

      {/* CREATE & EDIT RULE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#33475b]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#cbd6e2] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in scale-in duration-200">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-[#cbd6e2] flex justify-between items-center text-[#2d544c]">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 fill-current" />
                <h3 className="text-xl font-bold">
                  {editingRule ? 'Editar Regla de Automatización' : 'Nueva Regla de Automatización'}
                </h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-[#516f90] hover:text-[#2d544c] text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSaveRule} className="p-6 space-y-5 max-h-[500px] overflow-y-auto">
              
              {/* Rule Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider block">
                  Nombre de la Regla <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej: Automatización Lomas del Mar FB Ads"
                  className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded-xl px-4 py-2.5 text-[#33475b] focus:ring-2 focus:ring-[#2d544c]/20 outline-none"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                />
              </div>

              {/* Form ID */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider block">
                  Meta Form ID <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej: 4410004195897067"
                  className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded-xl px-4 py-2.5 text-[#33475b] focus:ring-2 focus:ring-[#2d544c]/20 outline-none font-mono"
                  value={formId}
                  onChange={(e) => setFormId(e.target.value)}
                />
                <p className="text-[10px] text-[#516f90]">
                  Este ID debe coincidir exactamente con el campo `formid` enviado en el webhook de Meta.
                </p>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between p-4 bg-[#f5f8fa] rounded-xl border border-[#cbd6e2]">
                <div>
                  <span className="font-bold text-[#33475b] text-sm block">Regla Activa</span>
                  <span className="text-xs text-[#516f90]">Las reglas inactivas no procesarán leads entrantes.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setRuleActive(!ruleActive)}
                  className="focus:outline-none"
                >
                  {ruleActive ? (
                    <ToggleRight className="w-11 h-11 text-[#2d544c]" />
                  ) : (
                    <ToggleLeft className="w-11 h-11 text-[#cbd6e2]" />
                  )}
                </button>
              </div>

              {/* Campaigns Selector */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider block">
                    Seleccionar Campañas de Correo ({selectedCampaignIds.length})
                  </label>
                  <span className="text-[10px] text-[#516f90] font-medium">Se enviará el HTML de cada una en el JSON.</span>
                </div>
                
                {/* Search box */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-2.5 w-4.5 h-4.5 text-[#516f90]" />
                  <input 
                    type="text" 
                    placeholder="Buscar campañas..."
                    className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded-xl pl-10 pr-4 py-2 text-xs focus:ring-2 focus:ring-[#2d544c]/20 outline-none"
                    value={campaignSearch}
                    onChange={(e) => setCampaignSearch(e.target.value)}
                  />
                </div>

                {/* Campaigns Checklist */}
                <div className="border border-[#cbd6e2] rounded-xl max-h-[160px] overflow-y-auto divide-y divide-[#cbd6e2]">
                  {filteredCampaigns.length > 0 ? (
                    filteredCampaigns.map((c) => {
                      const isSelected = selectedCampaignIds.includes(c.id);
                      return (
                        <label 
                          key={c.id} 
                          className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-[#f5f8fa] transition-colors ${
                            isSelected ? 'bg-[#eaf0f6]/40' : ''
                          }`}
                        >
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded text-[#2d544c] border-[#cbd6e2] focus:ring-[#2d544c] mt-0.5"
                            checked={isSelected}
                            onChange={() => toggleCampaignSelection(c.id)}
                          />
                          <div className="min-w-0">
                            <p className={`text-xs font-bold ${isSelected ? 'text-[#2d544c]' : 'text-[#33475b]'}`}>
                              {c.title}
                            </p>
                            <p className="text-[10px] text-[#516f90] truncate">
                              Asunto: {c.subject}
                            </p>
                          </div>
                        </label>
                      );
                    })
                  ) : (
                    <div className="p-4 text-center text-xs text-[#516f90]">
                      No se encontraron campañas.
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 flex gap-3 border-t border-[#cbd6e2]">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-[#cbd6e2] rounded-xl font-bold text-sm text-[#33475b] hover:bg-[#f5f8fa] transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-[#2d544c] hover:bg-[#1f3a35] text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? 'Guardando...' : 'Guardar Regla'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* END-TO-END TEST MODAL */}
      {isTestModalOpen && testRule && (
        <div className="fixed inset-0 bg-[#33475b]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#cbd6e2] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in scale-in duration-200">
            
            <div className="p-6 border-b border-[#cbd6e2] flex justify-between items-center text-[#2d544c]">
              <div className="flex items-center gap-2">
                <Play className="w-5 h-5 fill-current" />
                <h3 className="text-xl font-bold">Probar Automatización</h3>
              </div>
              <button 
                onClick={() => setIsTestModalOpen(false)}
                className="text-[#516f90] hover:text-[#2d544c] text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-[#516f90]">
                Esto enviará un lead simulado con el FormID <strong>{testRule.form_id}</strong> a la API local de Meta,
                desencadenando el envío de las campañas seleccionadas al webhook de n8n.
              </p>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#516f90] uppercase block">Email de prueba</label>
                <input 
                  type="email" 
                  className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded-xl px-3 py-2 text-xs text-[#33475b] focus:ring-2 focus:ring-[#2d544c]/20 outline-none"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#516f90] uppercase block">Nombre de prueba</label>
                <input 
                  type="text" 
                  className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded-xl px-3 py-2 text-xs text-[#33475b] focus:ring-2 focus:ring-[#2d544c]/20 outline-none"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#516f90] uppercase block">Teléfono de prueba</label>
                <input 
                  type="text" 
                  className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded-xl px-3 py-2 text-xs text-[#33475b] focus:ring-2 focus:ring-[#2d544c]/20 outline-none"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#516f90] uppercase block">Pie de prueba</label>
                <input 
                  type="text" 
                  className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded-xl px-3 py-2 text-xs text-[#33475b] focus:ring-2 focus:ring-[#2d544c]/20 outline-none"
                  value={testPie}
                  onChange={(e) => setTestPie(e.target.value)}
                />
              </div>

              <div className="pt-4 flex gap-3 border-t border-[#cbd6e2]">
                <button 
                  type="button"
                  onClick={() => setIsTestModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-[#cbd6e2] rounded-xl font-bold text-xs text-[#33475b] hover:bg-[#f5f8fa] transition-all"
                >
                  Cerrar
                </button>
                <button 
                  type="button"
                  onClick={handleRunTest}
                  disabled={testing}
                  className="flex-1 px-4 py-2.5 bg-[#2d544c] hover:bg-[#1f3a35] text-white rounded-xl font-bold text-xs transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {testing ? 'Procesando...' : 'Iniciar Test'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
