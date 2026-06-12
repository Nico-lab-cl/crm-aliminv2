'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  PenTool, 
  Trash2, 
  BarChart3, 
  Copy, 
  Check, 
  Plus, 
  Mail, 
  Calendar, 
  Activity, 
  Clock, 
  ExternalLink 
} from 'lucide-react';

interface EmailSignature {
  id: string;
  name: string;
  personal_info: {
    name?: string;
    job_title?: string;
    company?: string;
  };
  contact_info: {
    email?: string;
    phone?: string;
  };
  html_content: string;
  created_at: string;
  updated_at: string;
  total_clicks: number;
}

export default function SignaturesListPage() {
  const [signatures, setSignatures] = useState<EmailSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchSignatures = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/signatures');
      if (!res.ok) {
        throw new Error('No se pudieron cargar las firmas.');
      }
      const data = await res.json();
      setSignatures(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Ocurrió un error al obtener la lista de firmas de correo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSignatures();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar la firma "${name}"? Esta acción borrará todas las estadísticas de clics asociadas.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/signatures/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Error al eliminar la firma.');
      }

      setSignatures(prev => prev.filter(sig => sig.id !== id));
      alert('Firma eliminada con éxito.');
    } catch (err) {
      console.error(err);
      alert('Error al intentar eliminar la firma.');
    }
  };

  const handleCopyHtml = async (id: string, htmlContent: string) => {
    try {
      // Reemplazar el placeholder con el origen actual de la app
      const origin = window.location.origin;
      const compiledHtml = htmlContent.replaceAll('__TRACKING_ORIGIN__', origin);

      await navigator.clipboard.writeText(compiledHtml);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch (err) {
      console.error('Error al copiar al portapapeles:', err);
      alert('No se pudo copiar el HTML. Cópialo manualmente desde el editor.');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#2d544c] tracking-tight">Firmas de Email</h1>
          <p className="text-[#516f90] mt-1 text-sm">
            Diseña firmas profesionales en HTML y mide las interacciones con enlaces, teléfonos y redes sociales.
          </p>
        </div>
        <Link
          href="/campaigns/signatures/new"
          className="flex items-center gap-2 bg-[#2d544c] hover:bg-[#203c36] text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-all active:scale-95 text-sm"
        >
          <Plus className="w-4 h-4" />
          Nueva Firma HTML
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-10 h-10 border-4 border-[#2d544c] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-[#516f90] font-medium">Cargando firmas de correo...</p>
        </div>
      ) : signatures.length === 0 ? (
        /* Estado Vacío */
        <div className="bg-white border border-[#cbd6e2] rounded-2xl p-12 text-center shadow-sm max-w-xl mx-auto mt-8">
          <div className="w-16 h-16 bg-[#eaf0f6] rounded-full flex items-center justify-center mx-auto mb-5 text-[#2d544c]">
            <PenTool className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-[#33475b] mb-2">No tienes firmas creadas</h3>
          <p className="text-[#516f90] text-sm mb-6 max-w-md mx-auto">
            Crea una firma de correo adaptada a tus necesidades. Las redes sociales, sitios web, correos y números telefónicos se rastrearán automáticamente.
          </p>
          <Link
            href="/campaigns/signatures/new"
            className="inline-flex items-center gap-2 bg-[#2d544c] hover:bg-[#203c36] text-white font-semibold py-2.5 px-6 rounded-lg transition-all text-sm"
          >
            <Plus className="w-4 h-4" />
            Crear mi primera firma
          </Link>
        </div>
      ) : (
        /* Lista de Firmas */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {signatures.map((sig) => {
            const userName = sig.personal_info?.name || 'Sin Nombre';
            const userJob = sig.personal_info?.job_title || 'Sin Cargo';
            const userCompany = sig.personal_info?.company || 'Alimin';
            const displayDate = new Date(sig.updated_at).toLocaleDateString('es-ES', {
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            });

            return (
              <div 
                key={sig.id} 
                className="bg-white border border-[#cbd6e2] rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col group relative"
              >
                {/* Badge de Clics Totales */}
                <div className="absolute top-4 right-4 bg-[#eaf0f6] text-[#2d544c] px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5" />
                  <span>{sig.total_clicks} clics</span>
                </div>

                {/* Card Body */}
                <div className="p-6 flex-1 space-y-4">
                  <div className="pr-20">
                    <h3 className="font-bold text-[#33475b] text-lg truncate group-hover:text-[#2d544c] transition-colors">
                      {sig.name}
                    </h3>
                    <p className="text-xs text-[#516f90] mt-1 font-medium flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#cbd6e2]" />
                      Actualizado el {displayDate}
                    </p>
                  </div>

                  <div className="border-t border-[#f5f8fa] pt-4 space-y-2">
                    <div className="bg-[#f6f9fc] rounded-lg p-3 space-y-1">
                      <p className="text-xs font-semibold text-[#516f90] uppercase tracking-wider">Vista Previa Datos</p>
                      <p className="text-sm font-bold text-[#33475b]">{userName}</p>
                      <p className="text-xs text-[#516f90] font-medium">{userJob} | {userCompany}</p>
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="bg-[#f6f9fc] border-t border-[#cbd6e2] p-4 flex gap-2 justify-between">
                  <div className="flex gap-2">
                    <Link
                      href={`/campaigns/signatures/${sig.id}/edit`}
                      className="p-2 hover:bg-[#eaf0f6] text-[#516f90] hover:text-[#2d544c] rounded-lg border border-[#cbd6e2] bg-white transition-colors"
                      title="Editar firma"
                    >
                      <PenTool className="w-4.5 h-4.5" />
                    </Link>

                    <Link
                      href={`/campaigns/signatures/${sig.id}/metrics`}
                      className="p-2 hover:bg-[#eaf0f6] text-[#516f90] hover:text-[#2d544c] rounded-lg border border-[#cbd6e2] bg-white transition-colors flex items-center gap-1.5 text-xs font-semibold"
                      title="Ver métricas de clics"
                    >
                      <BarChart3 className="w-4.5 h-4.5" />
                      <span>Reporte</span>
                    </Link>

                    <button
                      onClick={() => handleDelete(sig.id, sig.name)}
                      className="p-2 hover:bg-red-50 text-[#516f90] hover:text-red-600 rounded-lg border border-[#cbd6e2] bg-white transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4.5 h-4.5" />
                    </button>
                  </div>

                  <button
                    onClick={() => handleCopyHtml(sig.id, sig.html_content)}
                    className={`flex items-center gap-1.5 py-2 px-3 text-xs font-bold rounded-lg shadow-sm border transition-all ${
                      copiedId === sig.id 
                        ? 'bg-[#2d544c] border-[#2d544c] text-white' 
                        : 'bg-white border-[#cbd6e2] hover:bg-[#f5f8fa] text-[#2d544c]'
                    }`}
                  >
                    {copiedId === sig.id ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar HTML</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
