"use client";

import { signIn, useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { User, ChevronDown, ShieldCheck, Lock, Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import clsx from "clsx";

interface DBUser {
  username: string;
  name: string;
  role: string;
}

export default function LoginPage() {
  const { status } = useSession();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dbUsers, setDbUsers] = useState<DBUser[]>([]);
  const router = useRouter();

  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (status === "authenticated") {
      router.push("/dashboard");
    }
  }, [status, router]);

  // Fetch users for the profile selector
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/users");
        if (res.ok) {
          const data = await res.json();
          setDbUsers(data);
        }
      } catch (err) {
        console.error("Failed to fetch users for login", err);
      }
    };
    fetchUsers();
  }, []);

  const selectedProfile = dbUsers.find(p => p.username === selectedUser);

  const executeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    
    setLoading(true);
    setError("");
    
    const result = await signIn("credentials", {
      username: selectedUser,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Contraseña incorrecta. Por favor intente de nuevo.");
      setLoading(false);
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div className="p-8 flex flex-col h-full animate-in fade-in duration-700">
      {/* Brand Header with Logo */}
      <div className="flex flex-col items-center mb-10">
        <div className="relative w-20 h-20 mb-4 drop-shadow-sm">
          <Image 
            src="/logo-alimin.png" 
            alt="Alimin Logo" 
            fill 
            className="object-contain"
            priority
          />
        </div>
        <h1 className="text-3xl font-black tracking-tighter text-slate-800">
          CRM <span className="text-primary">ALIMIN</span>
        </h1>
      </div>

      <div className="mb-8 text-center">
        <h2 className="text-2xl font-black text-slate-800 mb-2">Bienvenido Asesor</h2>
        <p className="text-slate-500 font-medium">Selecciona tu perfil e ingresa tu contraseña</p>
      </div>

      <form onSubmit={executeLogin} className="space-y-5 flex-1 flex flex-col">
        {/* User Dropdown Selector */}
        <div className="relative">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Perfil</label>
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className={clsx(
              "w-full flex items-center justify-between bg-white border rounded-2xl px-4 py-4 text-left transition-all shadow-sm",
              isDropdownOpen ? "border-primary ring-4 ring-primary/10" : "border-slate-200 hover:border-slate-300"
            )}
          >
            <div className="flex items-center gap-3">
              <div className={clsx(
                "w-10 h-10 rounded-full flex items-center justify-center border",
                selectedUser ? "bg-primary/10 border-primary/20" : "bg-slate-50 border-slate-200"
              )}>
                <User className={clsx("w-5 h-5", selectedUser ? "text-primary" : "text-slate-400")} />
              </div>
              <div>
                <p className={clsx("font-bold text-sm", selectedUser ? "text-slate-800" : "text-slate-400")}>
                  {selectedProfile?.name || "Seleccionar asesor..."}
                </p>
                {selectedProfile && (
                  <p className="text-[10px] text-primary font-black uppercase tracking-widest">{selectedProfile.role}</p>
                )}
              </div>
            </div>
            <ChevronDown size={18} className={clsx("text-slate-400 transition-transform", isDropdownOpen && "rotate-180")} />
          </button>

          {isDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] ring-1 ring-slate-900/5 p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200 max-h-60 overflow-y-auto">
              {dbUsers.map((profile) => (
                <button
                  key={profile.username}
                  type="button"
                  onClick={() => { setSelectedUser(profile.username); setIsDropdownOpen(false); setError(""); }}
                  className={clsx(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all",
                    selectedUser === profile.username ? "bg-primary/5 text-primary" : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <div className={clsx(
                    "w-8 h-8 rounded-full flex items-center justify-center",
                    selectedUser === profile.username ? "bg-primary/10" : "bg-slate-100"
                  )}>
                    <User className={clsx("w-4 h-4", selectedUser === profile.username ? "text-primary" : "text-slate-400")} />
                  </div>
                  <div>
                    <p className="font-bold text-sm leading-tight">{profile.name}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-50">{profile.role}</p>
                  </div>
                </button>
              ))}

              {dbUsers.length === 0 && (
                <div className="flex flex-col items-center py-6 opacity-50">
                  <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin mb-2" />
                  <p className="text-[10px] font-bold text-slate-400">CARGANDO ASESORES...</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Password Input */}
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Contraseña</label>
          <div className="relative group">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-primary transition-colors" />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-12 text-lg tracking-widest font-medium focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all shadow-sm"
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-colors p-1"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        {error && <p className="text-red-500 text-sm text-center font-bold px-4">{error}</p>}

        {/* Login Button */}
        <button
          type="submit"
          disabled={loading || !selectedUser}
          className={clsx(
            "w-full py-4 rounded-2xl text-lg font-black uppercase tracking-wider transition-all shadow-lg active:scale-[0.98]",
            selectedUser
              ? "bg-primary text-white shadow-primary/20 hover:bg-primary/90"
              : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
          )}
        >
          {loading ? (
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
          ) : (
            "Ingresar al CRM"
          )}
        </button>

        {/* Footer */}
        <div className="mt-auto text-center space-y-4 pt-4">
          <p className="text-sm text-slate-400 font-medium">
            ¿No estás en la lista? <button type="button" className="text-primary font-bold hover:underline">Contactar soporte</button>
          </p>
          
          <div className="flex items-center justify-center gap-2 py-4 px-6 bg-slate-100 rounded-2xl text-[10px] text-slate-400 font-black uppercase tracking-widest">
            <ShieldCheck size={14} className="text-slate-300" />
            Acceso Restringido Pro
          </div>
        </div>
      </form>
    </div>
  );
}
