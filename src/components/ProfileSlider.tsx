"use client";

import { signOut, useSession } from "next-auth/react";
import {
  X, LogOut, Settings, User as UserIcon, Bell,
  Shield, HelpCircle, ChevronRight, Moon, Camera, Save, Phone,
  TrendingUp, LayoutGrid, FileCheck
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import clsx from "clsx";
import Image from "next/image";

interface ProfileSliderProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileSlider({ isOpen, onClose }: ProfileSliderProps) {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    image: ""
  });

  useEffect(() => {
    if (session?.user) {
      setFormData({
        name: session.user.name || "",
        phone: (session.user as any).phone || "",
        image: session.user.image || ""
      });
    }
  }, [session]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        // Update local session
        await update({
          ...session,
          user: {
            ...session?.user,
            ...formData
          }
        });
        setIsEditing(false);
      }
    } catch (error) {
      console.error("Error updating profile:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div
        className={clsx(
          "fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        style={{ zIndex: 99990 }}
        onClick={onClose}
      />

      <div
        className={clsx(
          "fixed top-0 right-0 h-full w-[85%] max-w-[400px] bg-white shadow-2xl transition-transform duration-500 ease-out flex flex-col",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
        style={{ zIndex: 99999 }}
      >
        {/* Header */}
        <div className="bg-primary px-6 pt-12 pb-8 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={24} />
          </button>

          <div className="flex flex-col items-center text-center">
            <div className="relative group">
              <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mb-4 border-2 border-white/30 overflow-hidden">
                {formData.image ? (
                  <Image src={formData.image} alt="Profile" fill className="object-cover" />
                ) : (
                  <UserIcon size={48} className="text-white" />
                )}
              </div>
              {isEditing && (
                <button className="absolute bottom-4 right-0 p-2 bg-accent text-white rounded-full shadow-lg hover:scale-110 transition-all border-2 border-white">
                  <Camera size={14} />
                </button>
              )}
            </div>
            {isEditing ? (
              <input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-center font-black text-white outline-none focus:bg-white/20"
                placeholder="Tu nombre"
              />
            ) : (
              <h2 className="text-xl font-black">{session?.user?.name || "Asesor Alimin"}</h2>
            )}
            <p className="text-sm font-bold text-white/70 uppercase tracking-widest mt-1">
              {(session?.user as any)?.role || "ASESOR"}
            </p>
          </div>
        </div>

        {/* Menu Items */}
        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-2">
          {isEditing ? (
            <div className="space-y-4 px-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Información de Contacto</p>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Teléfono</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+56 9 ..."
                    className="w-full bg-slate-100 border-none rounded-2xl py-4 pl-12 pr-4 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">URL de Foto</label>
                <div className="relative">
                  <Camera className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    value={formData.image}
                    onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                    placeholder="https://..."
                    className="w-full bg-slate-100 border-none rounded-2xl py-4 pl-12 pr-4 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={loading}
                className="w-full bg-accent text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl shadow-accent/20 active:scale-95 transition-all mt-6"
              >
                {loading ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Save size={18} />}
                GUARDAR CAMBIOS
              </button>

              <button
                onClick={() => setIsEditing(false)}
                className="w-full py-4 text-slate-400 text-xs font-black uppercase tracking-widest"
              >
                CANCELAR
              </button>
            </div>
          ) : (
            <>
              <p className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Cuenta & Seguridad</p>

              <MenuButton
                icon={UserIcon}
                label="Editar Perfil"
                onClick={() => setIsEditing(true)}
              />
              <MenuButton icon={Shield} label="Seguridad & Privacidad" />
              <MenuButton 
                icon={Bell} 
                label="Notificaciones Push" 
                badge="Sincronizar" 
                onClick={async () => {
                  try {
                    if (typeof window !== "undefined" && (window as any).AndroidBridge) {
                      const bridge = (window as any).AndroidBridge;
                      
                      // 1. Get Token from Android
                      if (typeof bridge.getFcmToken === "function") {
                        const token = bridge.getFcmToken();
                        if (token) {
                          // 2. Save it to Database explicitly
                          const res = await fetch("/api/user/fcm-token", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ token })
                          });
                          
                          if (res.ok) {
                            alert("¡Dispositivo registrado exitosamente en la Base de Datos! Las notificaciones ya deberían funcionar.");
                          } else {
                            alert("Error guardando el token en el servidor: " + res.status);
                          }
                        } else {
                          alert("Firebase aún está generando el token. Cierra la app y vuelve a abrirla en unos segundos.");
                        }
                      }
                      
                      // 3. Open settings as a bonus
                      if (typeof bridge.openNotificationSettings === "function") {
                        bridge.openNotificationSettings();
                      }
                    } else {
                      alert("Estás en el navegador web. Instala y usa la App de Android para activar las notificaciones nativas.");
                    }
                  } catch (e) {
                    console.error(e);
                    alert("Error sinconizando: " + e);
                  }
                }}
              />

              <div className="h-px bg-slate-100 my-4" />

              <p className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Preferencias</p>
              <MenuButton icon={Moon} label="Modo Oscuro" toggle />
              
              {session?.user && (session.user as any).role === "ADMIN" && (
                <>
                  <div className="h-px bg-slate-100 my-4" />
                  <p className="px-4 text-[10px] font-black text-primary uppercase tracking-widest mb-2">Administración</p>
                  <MenuButton 
                    icon={TrendingUp} 
                    label="Reservaciones LDM" 
                    onClick={() => {
                        router.push("/dashboard/admin/reservations");
                        onClose();
                    }}
                  />
                  <MenuButton 
                    icon={FileCheck} 
                    label="Reservas CRM" 
                    badge="NUEVO"
                    onClick={() => {
                        router.push("/dashboard/admin/crm-reservations");
                        onClose();
                    }}
                  />
                </>
              )}

              <MenuButton icon={HelpCircle} label="Ayuda & Soporte" />

              <div className="mt-8">
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="w-full flex items-center gap-4 px-4 py-4 text-red-500 font-bold hover:bg-red-50 rounded-2xl transition-all"
                >
                  <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                    <LogOut size={20} />
                  </div>
                  <span>Cerrar Sesión</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer Branding */}
        <div className="p-8 text-center border-t border-slate-50 mt-auto">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Image src="/logo-alimin.png" alt="Logo" width={24} height={24} className="opacity-40" />
            <span className="text-[10px] font-black text-slate-300 tracking-tighter uppercase">CRM ALIMIN v2.0.4</span>
          </div>
          <p className="text-[9px] text-slate-300 font-medium whitespace-nowrap">Desarrollado para Alimin Lomas del Mar © 2026</p>
        </div>
      </div>
    </>
  );
}

function MenuButton({ icon: Icon, label, badge, toggle, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-4 hover:bg-slate-50 rounded-2xl transition-all group"
    >
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
          <Icon size={20} />
        </div>
        <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900">{label}</span>
      </div>

      {badge && (
        <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-black rounded-lg">
          {badge}
        </span>
      )}

      {toggle ? (
        <div className="w-10 h-5 bg-slate-200 rounded-full relative">
          <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full shadow-sm" />
        </div>
      ) : (
        <ChevronRight size={18} className="text-slate-300" />
      )}
    </button>
  );
}
