"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  Upload,
  FileCheck,
  User,
  Mail,
  Phone,
  CreditCard,
  Briefcase,
  Heart,
  Globe,
  MapPin,
  Hash,
  Map,
  Building,
  CheckCircle2,
  AlertCircle,
  FileText,
  X,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import clsx from "clsx";
import {
  CHILE_REGIONS,
  CIVIL_STATUS_OPTIONS,
  NATIONALITY_OPTIONS,
} from "@/lib/chileData";

interface LeadInfo {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

export default function ReservationPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [lead, setLead] = useState<LeadInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);

  // Form state
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    rut: "",
    profession: "",
    civilStatus: "",
    nationality: "Chilena",
    street: "",
    streetNumber: "",
    region: "",
    commune: "",
  });

  // File state
  const [proofFile, setProofFile] = useState<{
    name: string;
    type: string;
    base64: string;
    preview: string | null;
  } | null>(null);

  // Available communes based on selected region
  const availableCommunes =
    CHILE_REGIONS.find((r) => r.name === form.region)?.communes || [];

  // Load lead data
  useEffect(() => {
    fetch(`/api/leads/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        setLead(data);
        // Pre-fill form with lead data
        setForm((prev) => ({
          ...prev,
          fullName: `${data.firstName || ""} ${data.lastName || ""}`.trim(),
          email: data.email || "",
          phone: data.phone || "",
        }));
      })
      .catch(() => setError("Error al cargar datos del lead"))
      .finally(() => setLoading(false));
  }, [params.id]);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "application/pdf",
    ];
    if (!allowedTypes.includes(file.type)) {
      setError("Solo se permiten archivos PNG, JPG o PDF");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("El archivo no puede superar los 5MB");
      return;
    }

    setError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Extract base64 from data URL (remove "data:image/png;base64," prefix)
      const base64 = result.split(",")[1];
      const preview = file.type.startsWith("image/") ? result : null;

      setProofFile({
        name: file.name,
        type: file.type,
        base64,
        preview,
      });
    };
    reader.readAsDataURL(file);
  };

  // Remove selected file
  const handleRemoveFile = () => {
    setProofFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // RUT formatting (XX.XXX.XXX-X)
  const formatRut = (value: string) => {
    // Remove everything except digits and K/k
    let clean = value.replace(/[^0-9kK]/g, "").toUpperCase();
    if (clean.length === 0) return "";

    // Separate body and check digit
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);

    // Format with dots
    let formatted = "";
    for (let i = body.length - 1, count = 0; i >= 0; i--, count++) {
      if (count > 0 && count % 3 === 0) formatted = "." + formatted;
      formatted = body[i] + formatted;
    }

    return clean.length > 1 ? `${formatted}-${dv}` : clean;
  };

  const handleRutChange = (value: string) => {
    setForm({ ...form, rut: formatRut(value) });
  };

  // Submit reservation
  const handleSubmit = async () => {
    // Validate required fields
    if (!form.fullName || !form.email || !form.phone || !form.rut) {
      setError("Nombre, email, teléfono y RUT son obligatorios");
      return;
    }

    if (!proofFile) {
      setError("Debes adjuntar el comprobante de pago");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        leadId: params.id,
        ...form,
        proofFileName: proofFile.name,
        proofMimeType: proofFile.type,
        proofData: proofFile.base64,
      };

      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Error al crear la reservación");
      }

      setSuccess(true);

      // Redirect after 2s
      setTimeout(() => {
        router.push(`/dashboard/leads/${params.id}`);
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Step validation
  const isStep1Valid =
    form.fullName && form.email && form.phone && form.rut;
  const isStep2Valid = true; // Address fields are optional
  const isStep3Valid = !!proofFile;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F5F7F9]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Success screen
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F5F7F9] px-8">
        <div className="relative">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center animate-in zoom-in duration-500">
            <CheckCircle2 size={48} className="text-green-600" />
          </div>
          <div className="absolute -inset-4 bg-green-200/30 rounded-full animate-ping" />
        </div>
        <h2 className="text-2xl font-black text-slate-800 mt-8 text-center">
          ¡Reserva Registrada!
        </h2>
        <p className="text-sm text-slate-500 font-medium mt-2 text-center">
          La reserva de{" "}
          <span className="font-bold text-primary">{form.fullName}</span> se ha
          guardado exitosamente.
        </p>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-4 animate-pulse">
          Redirigiendo...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7F9] pb-8">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-20">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary active:scale-95 transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="text-center flex-1 mx-4">
            <h2 className="text-base font-black text-slate-800 tracking-tight">
              Nueva Reserva
            </h2>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
              {lead?.firstName} {lead?.lastName}
            </p>
          </div>
          <div className="w-10" />
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-1 px-6 pb-4">
          {[
            { n: 1, label: "Datos" },
            { n: 2, label: "Dirección" },
            { n: 3, label: "Comprobante" },
          ].map((step) => (
            <button
              key={step.n}
              onClick={() => {
                if (step.n < currentStep) setCurrentStep(step.n);
              }}
              className="flex-1 flex flex-col items-center gap-1.5"
            >
              <div
                className={clsx(
                  "h-1.5 w-full rounded-full transition-all duration-300",
                  currentStep >= step.n
                    ? "bg-primary shadow-sm shadow-primary/20"
                    : "bg-slate-200"
                )}
              />
              <span
                className={clsx(
                  "text-[9px] font-black uppercase tracking-widest transition-colors",
                  currentStep === step.n ? "text-primary" : "text-slate-400"
                )}
              >
                {step.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-4 bg-red-50 border-2 border-red-100 rounded-2xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-700">{error}</p>
          </div>
          <button onClick={() => setError(null)}>
            <X size={16} className="text-red-400" />
          </button>
        </div>
      )}

      {/* Step Content */}
      <div className="px-4 mt-6">
        {/* ===== STEP 1: DATOS PERSONALES ===== */}
        {currentStep === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <User size={24} className="text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800">
                  Datos Personales
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  Información del cliente
                </p>
              </div>
            </div>

            <FormField
              icon={User}
              label="Nombre Completo *"
              value={form.fullName}
              onChange={(v) => setForm({ ...form, fullName: v })}
              placeholder="Nombre y Apellido"
            />
            <FormField
              icon={Mail}
              label="Correo Electrónico *"
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
              placeholder="correo@ejemplo.cl"
              type="email"
            />
            <FormField
              icon={Phone}
              label="Número de Teléfono *"
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
              placeholder="+56 9 1234 5678"
              type="tel"
            />
            <FormField
              icon={CreditCard}
              label="RUT *"
              value={form.rut}
              onChange={handleRutChange}
              placeholder="12.345.678-9"
            />
            <FormField
              icon={Briefcase}
              label="Profesión u Oficio"
              value={form.profession}
              onChange={(v) => setForm({ ...form, profession: v })}
              placeholder="Ej: Ingeniero, Comerciante..."
            />

            <FormSelect
              icon={Heart}
              label="Estado Civil"
              value={form.civilStatus}
              onChange={(v) => setForm({ ...form, civilStatus: v })}
              options={CIVIL_STATUS_OPTIONS}
              placeholder="Seleccionar..."
            />

            <FormSelect
              icon={Globe}
              label="Nacionalidad"
              value={form.nationality}
              onChange={(v) => setForm({ ...form, nationality: v })}
              options={NATIONALITY_OPTIONS}
              placeholder="Seleccionar..."
            />

            <button
              onClick={() => setCurrentStep(2)}
              disabled={!isStep1Valid}
              className={clsx(
                "w-full py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl transition-all flex items-center justify-center gap-3 mt-6",
                isStep1Valid
                  ? "bg-primary text-white shadow-primary/20 active:scale-[0.98]"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              )}
            >
              Siguiente: Dirección
              <ArrowLeft size={18} className="rotate-180" />
            </button>
          </div>
        )}

        {/* ===== STEP 2: DIRECCIÓN ===== */}
        {currentStep === 2 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/10 flex items-center justify-center">
                <MapPin size={24} className="text-[#D4AF37]" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800">Dirección</h3>
                <p className="text-xs text-slate-400 font-medium">
                  Domicilio del cliente (opcional)
                </p>
              </div>
            </div>

            <FormField
              icon={MapPin}
              label="Calle / Pasaje"
              value={form.street}
              onChange={(v) => setForm({ ...form, street: v })}
              placeholder="Nombre de la calle"
            />
            <FormField
              icon={Hash}
              label="Número"
              value={form.streetNumber}
              onChange={(v) => setForm({ ...form, streetNumber: v })}
              placeholder="1234"
            />

            <FormSelect
              icon={Map}
              label="Región"
              value={form.region}
              onChange={(v) =>
                setForm({ ...form, region: v, commune: "" })
              }
              options={CHILE_REGIONS.map((r) => r.name)}
              placeholder="Seleccionar región..."
            />

            <FormSelect
              icon={Building}
              label="Comuna"
              value={form.commune}
              onChange={(v) => setForm({ ...form, commune: v })}
              options={availableCommunes}
              placeholder={
                form.region
                  ? "Seleccionar comuna..."
                  : "Primero selecciona una región"
              }
              disabled={!form.region}
            />

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setCurrentStep(1)}
                className="flex-1 py-5 rounded-2xl font-black text-sm uppercase tracking-widest border-2 border-slate-200 text-slate-500 active:scale-[0.98] transition-all"
              >
                Atrás
              </button>
              <button
                onClick={() => setCurrentStep(3)}
                className="flex-[2] py-5 rounded-2xl font-black text-sm uppercase tracking-widest bg-primary text-white shadow-xl shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
              >
                Siguiente: Comprobante
                <ArrowLeft size={18} className="rotate-180" />
              </button>
            </div>
          </div>
        )}

        {/* ===== STEP 3: COMPROBANTE ===== */}
        {currentStep === 3 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center">
                <FileCheck size={24} className="text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800">
                  Comprobante de Pago
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  Adjunta la foto o PDF de la transferencia
                </p>
              </div>
            </div>

            {/* Upload Zone */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,application/pdf"
              onChange={handleFileSelect}
              className="hidden"
            />

            {!proofFile ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-primary/30 rounded-3xl p-8 flex flex-col items-center gap-4 bg-primary/5 hover:bg-primary/10 transition-all active:scale-[0.98]"
              >
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <Upload size={32} className="text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-black text-slate-700">
                    Toca para subir comprobante
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                    PNG • JPG • PDF (máx. 5MB)
                  </p>
                </div>
              </button>
            ) : (
              <div className="bg-white rounded-3xl border-2 border-green-200 p-4 shadow-lg shadow-green-100/20">
                {/* Preview */}
                {proofFile.preview ? (
                  <div className="relative rounded-2xl overflow-hidden bg-slate-100 mb-4">
                    <img
                      src={proofFile.preview}
                      alt="Comprobante"
                      className="w-full max-h-[300px] object-contain"
                    />
                    <button
                      onClick={handleRemoveFile}
                      className="absolute top-3 right-3 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="relative flex items-center gap-4 p-4 bg-slate-50 rounded-2xl mb-4">
                    <div className="w-14 h-14 bg-red-50 rounded-xl flex items-center justify-center">
                      <FileText size={28} className="text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-700 truncate">
                        {proofFile.name}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">
                        Documento PDF
                      </p>
                    </div>
                    <button
                      onClick={handleRemoveFile}
                      className="w-8 h-8 bg-red-50 text-red-500 rounded-full flex items-center justify-center active:scale-95 transition-all"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}

                {/* File Info */}
                <div className="flex items-center gap-2 px-2">
                  <CheckCircle2 size={16} className="text-green-500" />
                  <span className="text-xs font-bold text-green-600">
                    Comprobante adjunto correctamente
                  </span>
                </div>
              </div>
            )}

            {/* Summary Card */}
            <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm mt-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                Resumen de la Reserva
              </p>
              <div className="space-y-2">
                <SummaryRow label="Cliente" value={form.fullName} />
                <SummaryRow label="RUT" value={form.rut} />
                <SummaryRow label="Email" value={form.email} />
                <SummaryRow label="Teléfono" value={form.phone} />
                {form.profession && (
                  <SummaryRow label="Profesión" value={form.profession} />
                )}
                {form.civilStatus && (
                  <SummaryRow label="Estado Civil" value={form.civilStatus} />
                )}
                {form.region && (
                  <SummaryRow
                    label="Ubicación"
                    value={`${form.commune}, ${form.region}`}
                  />
                )}
                {form.street && (
                  <SummaryRow
                    label="Dirección"
                    value={`${form.street} ${form.streetNumber}`}
                  />
                )}
                <SummaryRow
                  label="Comprobante"
                  value={proofFile?.name || "Sin adjuntar"}
                  highlight={!!proofFile}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setCurrentStep(2)}
                className="flex-1 py-5 rounded-2xl font-black text-sm uppercase tracking-widest border-2 border-slate-200 text-slate-500 active:scale-[0.98] transition-all"
              >
                Atrás
              </button>
              <button
                onClick={handleSubmit}
                disabled={!isStep3Valid || submitting}
                className={clsx(
                  "flex-[2] py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl transition-all flex items-center justify-center gap-3",
                  isStep3Valid && !submitting
                    ? "bg-green-600 text-white shadow-green-200 active:scale-[0.98]"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                )}
              >
                {submitting ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={20} />
                    Registrar Reserva
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Subcomponents ============

function FormField({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  icon: any;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
        <Icon size={10} />
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-4 text-sm font-medium text-slate-800 outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all placeholder:text-slate-300"
      />
    </div>
  );
}

function FormSelect({
  icon: Icon,
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  icon: any;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
        <Icon size={10} />
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={clsx(
          "w-full bg-white border border-slate-200 rounded-2xl px-4 py-4 text-sm font-medium outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all appearance-none",
          value ? "text-slate-800" : "text-slate-300",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
        {label}
      </span>
      <span
        className={clsx(
          "text-xs font-bold truncate max-w-[200px] text-right",
          highlight ? "text-green-600" : "text-slate-700"
        )}
      >
        {value || "—"}
      </span>
    </div>
  );
}
