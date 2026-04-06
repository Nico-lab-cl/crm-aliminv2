"use client";

import { useState } from "react";
import { ArrowLeft, MapPin, Save, CheckCircle2, ChevronDown, Calendar, Hash, Layers, ChevronRight, PenTool, XCircle, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import clsx from "clsx";

const PROJECTS = [
  { id: "libertad-alegria", name: "Libertad y Alegría", emoji: "🌿" },
  { id: "arena-sol", name: "Arena y Sol", emoji: "☀️" },
  { id: "lomas-del-mar", name: "Lomas del Mar", emoji: "🌊" },
];

const STATUS_OPTIONS = [
  { id: "FIRMÓ", name: "Sí, Firmará", icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50", border: "border-green-100" },
  { id: "NO FIRMÓ", name: "No Firmará", icon: XCircle, color: "text-red-600", bg: "bg-red-50", border: "border-red-100" },
  { id: "PENDIENTE", name: "Aún Pendiente", icon: Clock, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100" },
];

export default function SigningRegistrationPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Step management
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Status
  const [selectedStatus, setSelectedStatus] = useState("");

  // Step 2: Project
  const [selectedProject, setSelectedProject] = useState("");

  // Step 3: Lote & Etapa
  const [lote, setLote] = useState("");
  const [etapa, setEtapa] = useState("");

  // Step 4: Date & Time
  const [signingDate, setSigningDate] = useState("");
  const [signingTime, setSigningTime] = useState("");

  const canProceedStep1 = selectedStatus !== "";
  const canProceedStep2 = selectedProject !== "";
  const canProceedStep3 = lote.trim() !== "" && etapa.trim() !== "";
  const canSubmit = signingDate !== "" && signingTime !== "";

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const projectName = PROJECTS.find(p => p.id === selectedProject)?.name || selectedProject;
      const dateTime = new Date(`${signingDate}T${signingTime}`);

      const res = await fetch(`/api/leads/${params.id}/signing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          signingStatus: selectedStatus,
          signingProject: projectName,
          signingLote: lote,
          signingEtapa: etapa,
          signingDate: dateTime.toISOString(),
        }),
      });
      if (res.ok) {
        setShowSuccess(true);
        setTimeout(() => {
          router.push(`/dashboard/leads/${params.id}`);
        }, 2000);
      }
    } catch (error) {
      console.error("Error registering signing:", error);
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="font-display bg-[#f6f8f8] text-slate-900 min-h-screen relative">
      <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden max-w-lg mx-auto bg-white shadow-xl">
        <header className="flex items-center p-4 border-b border-primary/10 justify-between sticky top-0 bg-white/80 backdrop-blur-md z-10">
          <button 
            onClick={() => currentStep > 1 ? setCurrentStep(currentStep - 1) : router.back()}
            className="text-[#D4AF37] hover:bg-[#D4AF37]/10 p-2 rounded-full transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <h2 className="text-slate-900 text-lg font-black leading-tight tracking-tight flex-1 text-center uppercase">Registrar Firma</h2>
          <div className="w-10"></div>
        </header>

        {/* Step Indicator */}
        <div className="px-6 pt-4 pb-2">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="flex-1 flex items-center gap-2">
                <div className={clsx(
                  "h-1.5 rounded-full flex-1 transition-all duration-500",
                  currentStep >= step ? "bg-primary" : "bg-slate-100"
                )} />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2">
            <span className={clsx("text-[8px] font-black uppercase tracking-widest", currentStep >= 1 ? "text-primary" : "text-slate-300")}>Estado</span>
            <span className={clsx("text-[8px] font-black uppercase tracking-widest", currentStep >= 2 ? "text-primary" : "text-slate-300")}>Proyecto</span>
            <span className={clsx("text-[8px] font-black uppercase tracking-widest", currentStep >= 3 ? "text-primary" : "text-slate-300")}>Terreno</span>
            <span className={clsx("text-[8px] font-black uppercase tracking-widest", currentStep >= 4 ? "text-primary" : "text-slate-300")}>Fecha</span>
          </div>
        </div>

        <main className="flex-1 p-6 space-y-6">

          {/* ============ STEP 1: Status Selection ============ */}
          {currentStep === 1 && (
            <section className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <PenTool size={32} className="text-primary" />
                </div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Estado de la Firma</h3>
                <p className="text-slate-400 text-xs font-bold mt-1">¿Cuál es la decisión del cliente?</p>
              </div>

              <div className="space-y-3">
                {STATUS_OPTIONS.map((status) => (
                  <button
                    key={status.id}
                    onClick={() => setSelectedStatus(status.id)}
                    className={clsx(
                      "w-full flex items-center gap-4 p-5 rounded-2xl border-2 transition-all active:scale-[0.98]",
                      selectedStatus === status.id
                        ? `border-primary ${status.bg} shadow-lg shadow-primary/10`
                        : "border-slate-100 bg-white hover:border-slate-200"
                    )}
                  >
                    <status.icon size={32} className={selectedStatus === status.id ? status.color : "text-slate-300"} />
                    <span className={clsx(
                      "font-black text-lg uppercase tracking-tight flex-1 text-left",
                      selectedStatus === status.id ? "text-primary" : "text-slate-700"
                    )}>
                      {status.name}
                    </span>
                    {selectedStatus === status.id && (
                      <CheckCircle2 size={24} className="text-primary" />
                    )}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCurrentStep(2)}
                disabled={!canProceedStep1}
                className="w-full bg-primary text-white font-black text-lg py-5 rounded-2xl shadow-xl shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 uppercase tracking-widest disabled:opacity-40 disabled:grayscale mt-6"
              >
                SIGUIENTE
                <ChevronRight size={20} />
              </button>
            </section>
          )}

          {/* ============ STEP 2: Project Selection ============ */}
          {currentStep === 2 && (
            <section className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MapPin size={32} className="text-primary" />
                </div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Proyecto</h3>
                <p className="text-slate-400 text-xs font-bold mt-1">¿En qué proyecto se realizará la firma?</p>
              </div>

              <div className="space-y-3">
                {PROJECTS.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => setSelectedProject(project.id)}
                    className={clsx(
                      "w-full flex items-center gap-4 p-5 rounded-2xl border-2 transition-all active:scale-[0.98]",
                      selectedProject === project.id
                        ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                        : "border-slate-100 bg-white hover:border-slate-200"
                    )}
                  >
                    <span className="text-3xl">{project.emoji}</span>
                    <span className={clsx(
                      "font-black text-lg uppercase tracking-tight flex-1 text-left",
                      selectedProject === project.id ? "text-primary" : "text-slate-700"
                    )}>
                      {project.name}
                    </span>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCurrentStep(3)}
                disabled={!canProceedStep2}
                className="w-full bg-primary text-white font-black text-lg py-5 rounded-2xl shadow-xl shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 uppercase tracking-widest disabled:opacity-40 disabled:grayscale mt-6"
              >
                SIGUIENTE
                <ChevronRight size={20} />
              </button>
            </section>
          )}

          {/* ============ STEP 3: Lote & Etapa ============ */}
          {currentStep === 3 && (
            <section className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Layers size={32} className="text-primary" />
                </div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Terreno</h3>
              </div>

              <div className="space-y-2">
                <label className="text-slate-400 text-[10px] font-black uppercase tracking-widest px-1 block">Número de Lote</label>
                <div className="relative">
                  <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={20} />
                  <input
                    type="text"
                    value={lote}
                    onChange={(e) => setLote(e.target.value)}
                    placeholder="Ej: 45, A-12, etc."
                    className="w-full pl-12 pr-4 py-5 bg-white border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-slate-700 font-bold text-lg outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-slate-400 text-[10px] font-black uppercase tracking-widest px-1 block">Etapa</label>
                <div className="relative">
                  <Layers className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={20} />
                  <input
                    type="text"
                    value={etapa}
                    onChange={(e) => setEtapa(e.target.value)}
                    placeholder="Ej: Etapa 1"
                    className="w-full pl-12 pr-4 py-5 bg-white border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-slate-700 font-bold text-lg outline-none"
                  />
                </div>
              </div>

              <button
                onClick={() => setCurrentStep(4)}
                disabled={!canProceedStep3}
                className="w-full bg-primary text-white font-black text-lg py-5 rounded-2xl shadow-xl shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 uppercase tracking-widest disabled:opacity-40 disabled:grayscale mt-6"
              >
                SIGUIENTE
                <ChevronRight size={20} />
              </button>
            </section>
          )}

          {/* ============ STEP 4: Date & Time ============ */}
          {currentStep === 4 && (
            <section className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar size={32} className="text-primary" />
                </div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Fecha Compromiso</h3>
              </div>

              <div className="space-y-2">
                <label className="text-slate-400 text-[10px] font-black uppercase tracking-widest px-1 block">Fecha</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={20} />
                  <input
                    type="date"
                    value={signingDate}
                    onChange={(e) => setSigningDate(e.target.value)}
                    min={today}
                    className="w-full pl-12 pr-4 py-5 bg-white border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-slate-700 font-bold text-lg outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-slate-400 text-[10px] font-black uppercase tracking-widest px-1 block">Hora</label>
                <div className="relative">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={20} />
                  <input
                    type="time"
                    value={signingTime}
                    onChange={(e) => setSigningTime(e.target.value)}
                    className="w-full pl-12 pr-4 py-5 bg-white border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-slate-700 font-bold text-lg outline-none"
                  />
                </div>
              </div>

              <button 
                onClick={handleSubmit}
                disabled={loading || !canSubmit}
                className="w-full bg-[#32CD32] hover:brightness-95 text-white font-black text-xl py-6 rounded-2xl shadow-xl shadow-green-500/20 transform active:scale-[0.98] transition-all flex items-center justify-center gap-3 uppercase tracking-widest disabled:opacity-50 disabled:grayscale"
              >
                {loading ? <div className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin" /> : <Save size={24} />}
                REGISTRAR FIRMA
              </button>
            </section>
          )}
        </main>
      </div>

      {showSuccess && (
        <div className="fixed inset-x-0 bottom-10 px-4 flex justify-center z-[100] animate-bounce">
          <div className="bg-slate-900 shadow-2xl text-white px-8 py-4 rounded-full flex items-center gap-3 border border-white/10">
            <CheckCircle2 className="text-green-400" size={24} />
            <span className="font-black uppercase text-sm tracking-widest">¡Registro guardado con éxito!</span>
          </div>
        </div>
      )}
    </div>
  );
}
