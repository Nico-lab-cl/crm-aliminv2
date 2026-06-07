'use client';

import Link from 'next/link';
import { Settings, Shield, Bell, Database, Globe, Zap } from 'lucide-react';

export default function SettingsPage() {
  const settingsSections = [
    { title: 'Perfil y Cuenta', icon: Settings, desc: 'Gestiona tu información personal y acceso.', href: '#' },
    { title: 'Seguridad', icon: Shield, desc: 'Configuración de contraseñas y autenticación.', href: '#' },
    { title: 'Notificaciones', icon: Bell, desc: 'Elige qué alertas recibir y por qué medio.', href: '#' },
    { title: 'Conexiones DB', icon: Database, desc: 'Configuración de MARKETING_DB y MAIN_DB.', href: '#' },
    { title: 'Integraciones', icon: Globe, desc: 'Conecta con Meta, Google y otras APIs.', href: '#' },
    { title: 'Automatizaciones Meta', icon: Zap, desc: 'Configura el envío automático de campañas para leads de Meta.', href: '/settings/meta-automations' },
  ];

  return (
    <div className="p-8 space-y-8 max-w-[1200px] mx-auto animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-bold text-[#2d544c]">Configuración</h1>
        <p className="text-[#516f90] mt-1">Ajusta las preferencias generales de tu CRM de Alimin.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {settingsSections.map((section, i) => {
          const CardContent = (
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-[#f5f8fa] text-[#516f90] group-hover:bg-[#eaf0f6] group-hover:text-[#2d544c] transition-all">
                <section.icon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-[#33475b] group-hover:text-[#2d544c]">{section.title}</h3>
                <p className="text-sm text-[#516f90]">{section.desc}</p>
              </div>
            </div>
          );

          if (section.href && section.href !== '#') {
            return (
              <Link 
                key={i} 
                href={section.href}
                className="bg-white border border-[#cbd6e2] rounded-2xl p-6 shadow-sm hover:border-[#2d544c] hover:shadow-md transition-all cursor-pointer group block"
              >
                {CardContent}
              </Link>
            );
          }

          return (
            <div key={i} className="bg-white border border-[#cbd6e2] rounded-2xl p-6 shadow-sm hover:border-[#2d544c] hover:shadow-md transition-all cursor-pointer group">
              {CardContent}
            </div>
          );
        })}
      </div>

      <div className="bg-[#eaf0f6] border border-[#2d544c]/10 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
        <h2 className="text-xl font-bold text-[#2d544c]">Versión Alimin CRM v1.5</h2>
        <p className="text-sm text-[#516f90] mt-1 italic">Diseñado por Antigravity para Nico-lab-cl</p>
      </div>
    </div>
  );
}
