"use client";

import React, { useState, useEffect } from 'react';
import { BellRing, X, CheckCircle2 } from 'lucide-react';
import { requestForToken } from '@/lib/firebase-client';
import clsx from 'clsx';

export default function NotificationBanner() {
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  useEffect(() => {
    // Check if browser supports notifications
    if (!("Notification" in window)) return;

    // Show if permission is not granted and not explicitly denied (default)
    if (Notification.permission === 'default') {
      // Small delay for better UX
      const timer = setTimeout(() => setShow(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleEnable = async () => {
    setStatus('loading');
    try {
      const token = await requestForToken();
      if (token) {
        setStatus('success');
        // Hide after success
        setTimeout(() => setShow(false), 3000);
      } else {
        setStatus('idle');
      }
    } catch (error) {
      console.error("Error enabling notifications:", error);
      setStatus('idle');
    }
  };

  if (!show) return null;

  return (
    <div className="px-6 py-2 animate-in slide-in-from-top-4 duration-500">
      <div className={clsx(
        "relative overflow-hidden rounded-3xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 transition-all border shadow-lg shadow-teal-500/10",
        status === 'success' ? "bg-green-50 border-green-200" : "bg-primary/5 border-primary/10"
      )}>
        <div className="flex items-center gap-4">
          <div className={clsx(
            "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 animate-bounce shadow-inner",
            status === 'success' ? "bg-green-500 text-white" : "bg-primary text-white"
          )}>
            {status === 'success' ? <CheckCircle2 size={24} /> : <BellRing size={24} />}
          </div>
          <div>
            <h4 className={clsx(
              "font-black text-xs uppercase tracking-widest mb-0.5",
              status === 'success' ? "text-green-800" : "text-primary"
            )}>
              {status === 'success' ? "¡Zumbidos Activados!" : "¡Activa los Zumbidos! 📱"}
            </h4>
            <p className={clsx(
              "text-[11px] font-bold leading-tight max-w-[280px]",
              status === 'success' ? "text-green-600" : "text-slate-500"
            )}>
              {status === 'success' 
                ? "Ahora recibirás una alerta en tu teléfono cada vez que se te asigne un cliente."
                : "Haz clic para permitir que el celular suene/vibre cuando te llegue un nuevo lead de campaña."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {status !== 'success' && (
            <>
              <button 
                onClick={handleEnable}
                disabled={status === 'loading'}
                className="flex-1 md:flex-none bg-primary text-white font-black px-6 py-3 rounded-2xl text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50"
              >
                {status === 'loading' ? "Cargando..." : "ACTIVAR AHORA"}
              </button>
              <button 
                onClick={() => setShow(false)}
                className="p-3 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </>
          )}
        </div>

        {/* Decorative elements */}
        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
      </div>
    </div>
  );
}
