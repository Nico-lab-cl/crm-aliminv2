'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SignatureEditor from '@/components/SignatureEditor';
import { ArrowLeft } from 'lucide-react';

export default function EditSignaturePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [signatureData, setSignatureData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchSignature = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/signatures/${id}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('Firma de correo no encontrada.');
          }
          throw new Error('Error al cargar la firma de correo.');
        }
        const data = await res.json();
        setSignatureData(data);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Error al intentar obtener los datos de la firma.');
      } finally {
        setLoading(false);
      }
    };

    fetchSignature();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 space-y-4">
        <div className="w-10 h-10 border-4 border-[#2d544c] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-[#516f90] font-medium">Cargando datos de la firma...</p>
      </div>
    );
  }

  if (error || !signatureData) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4 mt-20 bg-white border border-[#cbd6e2] rounded-2xl shadow-sm">
        <div className="text-red-500 font-bold text-lg">Error</div>
        <p className="text-sm text-[#516f90]">{error || 'La firma de correo no existe.'}</p>
        <button
          onClick={() => router.push('/campaigns/signatures')}
          className="inline-flex items-center gap-2 bg-[#2d544c] hover:bg-[#203c36] text-white font-semibold py-2 px-4 rounded-lg text-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a la Lista
        </button>
      </div>
    );
  }

  return <SignatureEditor initialData={signatureData} />;
}
