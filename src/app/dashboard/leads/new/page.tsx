"use client";

import { useState } from "react";
import { ArrowLeft, User, Mail, Phone, MapPin, Save, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function NewLeadPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    source: "Manual",
    interests: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        router.push("/dashboard");
      }
    } catch (error) {
      console.error("Error creating lead:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-[#f8f6f6]">
      <header className="flex items-center p-4 border-b border-slate-200 bg-white sticky top-0 z-10">
        <button 
          onClick={() => router.back()}
          className="p-2 -ml-2 text-[#D4AF37] hover:bg-[#D4AF37]/5 rounded-full transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="flex-1 flex justify-center items-center">
          <Image src="/logo-alimin.png" alt="Logo" width={100} height={32} className="h-8 w-auto" />
        </div>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 uppercase">Nuevo Lead</h1>
          <p className="text-slate-500 font-bold text-sm mt-2">Completa la información para registrar un nuevo cliente potencial.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <FormField 
            label="Nombres" 
            icon={User} 
            placeholder="Ej. Juan" 
            value={formData.firstName}
            onChange={(val: string) => setFormData({...formData, firstName: val})}
          />
          
          <FormField 
            label="Apellidos" 
            icon={User} 
            placeholder="Ej. Pérez" 
            value={formData.lastName}
            onChange={(val: string) => setFormData({...formData, lastName: val})}
          />

          <FormField 
            label="Correo electrónico" 
            icon={Mail} 
            type="email"
            placeholder="ejemplo@correo.com" 
            value={formData.email}
            onChange={(val: string) => setFormData({...formData, email: val})}
          />

          <FormField 
            label="Teléfono" 
            icon={Phone} 
            type="tel"
            placeholder="+56 9 ..." 
            value={formData.phone}
            onChange={(val: string) => setFormData({...formData, phone: val})}
          />

          {/* Fuente del Lead */}
          <div className="space-y-2">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fuente del Lead</label>
            <div className="relative">
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
              <select 
                value={formData.source}
                onChange={(e) => setFormData({...formData, source: e.target.value})}
                className="w-full pl-6 pr-12 py-5 bg-white border-2 border-slate-100 rounded-2xl text-sm font-bold appearance-none outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all text-slate-700"
              >
                <option value="Manual">Asignación Manual</option>
                <option value="META">Campaña Meta (FB/IG)</option>
                <option value="web aliminspa.cl">Web aliminspa.cl</option>
                <option value="lomasdelmar">Lomas del Mar</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Proyecto de interés</label>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={20} />
              <select 
                value={formData.interests}
                onChange={(e) => setFormData({...formData, interests: e.target.value})}
                className="w-full pl-12 pr-12 py-5 bg-white border-2 border-slate-100 rounded-2xl text-sm font-bold appearance-none outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all text-slate-700"
              >
                <option value="">Selecciona un proyecto</option>
                <option value="Lomas del Mar">Lomas del Mar</option>
                <option value="Valle Escondido">Valle Escondido</option>
                <option value="Sector Norte">Sector Norte</option>
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
            </div>
          </div>

          <div className="pt-4 pb-10">
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-[#22c55e] hover:bg-[#16a34a] text-white font-black py-5 rounded-2xl text-lg shadow-xl shadow-green-500/20 flex items-center justify-center gap-3 transition-all active:scale-[0.98] uppercase tracking-widest"
            >
              {loading ? <div className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin" /> : <Save size={24} />}
              Guardar Lead
            </button>
            <p className="text-center text-slate-400 text-[10px] font-bold mt-4 uppercase tracking-widest">
              Toda la información será almacenada de forma segura.
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}

interface FormFieldProps {
  label: string;
  icon: any;
  placeholder: string;
  type?: string;
  value: string;
  onChange: (val: string) => void;
}

function FormField({ label, icon: Icon, placeholder, type = "text", value, onChange }: FormFieldProps) {
  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
      <div className="relative">
        <Icon className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={20} />
        <input 
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-12 pr-4 py-5 bg-white border-2 border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all text-slate-700 placeholder:text-slate-300"
        />
      </div>
    </div>
  );
}
