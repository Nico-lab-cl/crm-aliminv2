"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  Plus, Search, Filter, Bell, User as UserIcon, 
  ChevronRight, Phone, MessageSquare, Clock,
  MoreVertical, Share2, Mail, ChevronLeft, ChevronDown,
  LayoutGrid, Globe, Megaphone, Calendar, MapPin,
  Meh, Smile, Laugh, UserMinus, PenTool, TrendingUp, X
} from "lucide-react";
import clsx from "clsx";
import Image from "next/image";
import ProfileSlider from "@/components/ProfileSlider";
import NotificationBell from "@/components/NotificationBell";
import NotificationBanner from "@/components/NotificationBanner";

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  status: string;
  rating?: string;
  createdAt: string;
  updatedAt: string;
  source: string;
  isExternal?: boolean;
}

interface Pagination {
  total: number;
  pages: number;
  currentPage: number;
  limit: number;
}

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Read initial state from URL params (persistence!)
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") || "");
  const [activeProject, setActiveProject] = useState(searchParams.get("project") || "TODOS");
  const [dateFilter, setDateFilter] = useState(searchParams.get("date") || "TODOS");
  const [customStartDate, setCustomStartDate] = useState(searchParams.get("startDate") || "");
  const [customEndDate, setCustomEndDate] = useState(searchParams.get("endDate") || "");
  const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(Number(searchParams.get("page")) || 1);
  const [activeStatus, setActiveStatus] = useState(searchParams.get("status") || "TODOS");
  const [activeRating, setActiveRating] = useState(searchParams.get("rating") || "TODOS");
  const [activeOwner, setActiveOwner] = useState(searchParams.get("ownerId") || "TODOS");
  const [advisors, setAdvisors] = useState<any[]>([]);
  const [isOwnerDropdownOpen, setIsOwnerDropdownOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isVisitsActive, setIsVisitsActive] = useState(searchParams.get("menu") === "visits");
  const [isSigningsActive, setIsSigningsActive] = useState(searchParams.get("menu") === "signings");
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isPeriodDropdownOpen, setIsPeriodDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isRatingDropdownOpen, setIsRatingDropdownOpen] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Calendar state for Visitas view
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [visits, setVisits] = useState<any[]>([]);
  const [signings, setSignings] = useState<any[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [loadingSignings, setLoadingSignings] = useState(false);

  // Helper to get date range (handles custom dates)
  const getDateRange = useCallback((filter: string) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    let start: string | null = null;
    let end: string | null = null;

    if (filter === "HOY") {
      start = todayStart.toISOString();
      end = tomorrowStart.toISOString();
    } else if (filter === "AYER") {
      start = yesterdayStart.toISOString();
      end = todayStart.toISOString();
    } else if (filter === "ESTA SEMANA") {
      const day = now.getDay();
      const diff = now.getDate() - (day === 0 ? 6 : day - 1);
      const monday = new Date(now.getFullYear(), now.getMonth(), diff);
      start = monday.toISOString();
      end = tomorrowStart.toISOString();
    } else if (filter === "30 DIAS") {
      const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
      start = thirtyDaysAgo.toISOString();
      end = tomorrowStart.toISOString();
    } else if (filter === "PERSONALIZADO") {
      if (customStartDate) {
        const [yr, mo, dy] = customStartDate.split('-').map(Number);
        start = new Date(yr, mo - 1, dy, 0, 0, 0).toISOString();
      }
      if (customEndDate) {
        const [yr, mo, dy] = customEndDate.split('-').map(Number);
        end = new Date(yr, mo - 1, dy, 23, 59, 59, 999).toISOString();
      }
    }

    return { start, end };
  }, [customStartDate, customEndDate]);

  // Helper to format date in short format DD/MM
  const formatDateShort = useCallback((dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  }, []);

  // Sync state → URL (so "Back" button restores position)
  const syncUrlParams = useCallback((page: number, q: string, project: string, date: string, statusF: string, ratingF: string, ownerIdF: string, visits: boolean, signings: boolean) => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (q) params.set("q", q);
    if (project !== "TODOS") params.set("project", project);
    if (date !== "TODOS") params.set("date", date);
    if (statusF !== "TODOS") params.set("status", statusF);
    if (ratingF !== "TODOS") params.set("rating", ratingF);
    if (ownerIdF !== "TODOS") params.set("ownerId", ownerIdF);
    if (visits) params.set("menu", "visits");
    if (signings) params.set("menu", "signings");
    
    if (date === "PERSONALIZADO") {
      if (customStartDate) params.set("startDate", customStartDate);
      if (customEndDate) params.set("endDate", customEndDate);
    }

    const qs = params.toString();
    router.replace(`/dashboard${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, customStartDate, customEndDate]);

  // Helper to fetch leads with all current filters
  const fetchLeads = useCallback(async (page: number, q: string, project: string, dateRange: string, statusFilter: string, ratingFilter: string, ownerIdFilter: string, visitsOnly: boolean) => {
    setLoading(true);
    try {
      const normalizedQuery = q.trim().replace(/\s+/g, ' ');

      let url = `/api/leads?page=${page}&limit=10`;
      if (normalizedQuery) url += `&q=${encodeURIComponent(normalizedQuery)}`;
      
      if (project === "UNASSIGNED") {
        url += `&unassigned=true`;
      } else if (project !== "TODOS") {
        url += `&source=${encodeURIComponent(project)}`;
      }
      
      if (statusFilter !== "TODOS") url += `&status=${encodeURIComponent(statusFilter)}`;
      if (ratingFilter !== "TODOS") url += `&rating=${encodeURIComponent(ratingFilter)}`;
      if (ownerIdFilter !== "TODOS") url += `&ownerId=${encodeURIComponent(ownerIdFilter)}`;
      if (visitsOnly) url += `&visited=true`;
      
      const { start, end } = getDateRange(dateRange);
      if (start) url += `&startDate=${start}`;
      if (end) url += `&endDate=${end}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads);
        setPagination(data.pagination);
        setFetchError(null);
      } else {
        const errorData = await res.json();
        setFetchError(errorData.details || errorData.error || "Error desconocido");
      }
    } catch (error) {
      console.error("Failed to fetch leads");
      setFetchError("Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  // Fetch visits for calendar
  const fetchVisits = useCallback(async (month: string) => {
    setLoadingVisits(true);
    try {
      const res = await fetch(`/api/leads/visits?month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setVisits(data.visits || []);
      }
    } catch (error) {
      console.error('Failed to fetch visits');
    } finally {
      setLoadingVisits(false);
    }
  }, []);

  // Fetch signings for calendar
  const fetchSignings = useCallback(async (month: string) => {
    setLoadingSignings(true);
    try {
      const res = await fetch(`/api/leads/signings?month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setSignings(data.signings || []);
      }
    } catch (error) {
      console.error('Failed to fetch signings');
    } finally {
      setLoadingSignings(false);
    }
  }, []);

  useEffect(() => {
    if ((session as any)?.user?.role === "ADMIN") {
      fetch('/api/users')
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data)) {
                const adv = data.filter((u: any) => u.role === "ASESOR" || u.role === "ADMIN");
                setAdvisors(adv);
            }
        })
        .catch(err => console.error("Error fetching advisors:", err));
    }
  }, [session]);

  // Fetch data when calendar month changes or tabs change
  useEffect(() => {
    if (status === 'authenticated') {
      if (isVisitsActive) {
        fetchVisits(calendarMonth);
        setSelectedDay(null);
      } else if (isSigningsActive) {
        fetchSignings(calendarMonth);
        setSelectedDay(null);
      }
    }
  }, [isVisitsActive, isSigningsActive, calendarMonth, status, fetchVisits, fetchSignings]);

  useEffect(() => {
    const menu = searchParams.get("menu");
    if (menu === "profile") {
      setIsProfileOpen(true);
      setIsVisitsActive(false);
      setIsSigningsActive(false);
    } else if (menu === "visits") {
      setIsVisitsActive(true);
      setIsSigningsActive(false);
      setIsProfileOpen(false);
    } else if (menu === "signings") {
      setIsSigningsActive(true);
      setIsVisitsActive(false);
      setIsProfileOpen(false);
    } else {
      setIsVisitsActive(false);
      setIsSigningsActive(false);
      setIsProfileOpen(false);
    }
  }, [searchParams]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      // Sync URL with current state
      syncUrlParams(currentPage, searchTerm, activeProject, dateFilter, activeStatus, activeRating, activeOwner, isVisitsActive, isSigningsActive);

      const delayDebounceFn = setTimeout(() => {
        if (!isVisitsActive && !isSigningsActive) {
          fetchLeads(currentPage, searchTerm, activeProject, dateFilter, activeStatus, activeRating, activeOwner, false);
        }
      }, 500);

      return () => clearTimeout(delayDebounceFn);
    }
  }, [status, router, currentPage, searchTerm, activeProject, dateFilter, activeStatus, activeRating, activeOwner, isVisitsActive, isSigningsActive, fetchLeads, syncUrlParams, customStartDate, customEndDate]);

  const getStatusColor = (status: string, rating?: string) => {
    const current = rating || status;
    if (['VENTA', 'MUY INTERESADO', 'HOT'].includes(current)) return 'hot';
    if (['INTERESADO', 'INTERES', 'WARM'].includes(current)) return 'warm';
    if (['FRIO', 'COLD', 'NUEVO'].includes(current)) return 'cold';
    return 'cold';
  };

  const projects = [
    { id: "TODOS", name: "Todos los Proyectos", icon: LayoutGrid },
    { id: "UNASSIGNED", name: "Sin Asignar", icon: UserMinus },
    { id: "META", name: "Campañas Meta", icon: Megaphone },
    { id: "web aliminspa.cl", name: "web aliminspa.cl", icon: Globe },
    { id: "lomasdelmar", name: "Lomas del Mar", icon: LayoutGrid },
  ];

  const dateFilters = [
    { id: "TODOS", name: "Todos los Periodos" },
    { id: "HOY", name: "Hoy" },
    { id: "AYER", name: "Ayer" },
    { id: "ESTA SEMANA", name: "Esta Semana" },
    { id: "30 DIAS", name: "Últimos 30 días" },
    { id: "PERSONALIZADO", name: "Personalizado" },
  ];

  const statusFilters = [
    { id: "TODOS", name: "Todos los Estados", color: "bg-slate-400" },
    { id: "NUEVO", name: "Nuevo", color: "bg-blue-400" },
    { id: "CONTACTADO", name: "Contactado", color: "bg-orange-400" },
    { id: "VISITA", name: "Visita", color: "bg-green-400" },
    { id: "RESERVADO", name: "Reservado", color: "bg-emerald-500" },
  ];

  const ratingFilters = [
    { id: "TODOS", name: "Todos los Intereses", icon: Meh, color: "text-slate-400" },
    { id: "FRIO", name: "Frio", icon: Meh, color: "text-[#94A3B8]" },
    { id: "INTERESADO", name: "Interesado", icon: Smile, color: "text-[#FB923C]" },
    { id: "VENTA", name: "Venta", icon: Laugh, color: "text-[#22C55E]" },
  ];

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#F5F7F9]">
      <ProfileSlider isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />

      {/* Dashboard Top Header */}
      <header className="bg-white px-6 pt-10 pb-6 border-b border-slate-100 sticky top-0 z-[120]">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
             {/* Profile Click Handler */}
            <button 
              onClick={() => setIsProfileOpen(true)}
              className="relative w-10 h-10 overflow-hidden group active:scale-95 transition-all"
            >
              <Image 
                src="/logo-alimin.png" 
                alt="Alimin Logo" 
                fill 
                className="object-contain group-hover:scale-110 transition-transform"
              />
            </button>
            <div>
              <p className="text-[10px] font-black text-primary uppercase tracking-widest leading-none mb-1">CRM ALIMIN</p>
              <h1 className="text-lg font-black text-slate-800 leading-none truncate max-w-[150px]">
                Hola, {session?.user?.name?.split(' ')[0]}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
               <input 
                  type="text"
                  placeholder="Buscar lead..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="bg-slate-100 border-none rounded-full py-2 pl-10 pr-4 text-xs font-medium w-40 focus:w-56 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
               />
               <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
            <NotificationBell />
          </div>
        </div>

        <div className="flex items-end justify-between mb-4 relative z-[60]">
          <div className="flex flex-col gap-1">
            <h2 className="text-3xl font-black text-primary">
              {isVisitsActive ? "Calendario de Visitas" : isSigningsActive ? "Calendario de Firmas" : "Mis Leads"}
            </h2>
            <div className="flex items-center gap-2">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                 {isVisitsActive ? `${visits.length} VISITAS ESTE MES` : isSigningsActive ? `${signings.length} COMPROMISOS ESTE MES` : `${pagination?.total || 0} REGISTROS ENCONTRADOS`}
               </span>
            </div>
          </div>
          
          {/* Project Dropdown Selector - only for leads view */}
          {!isVisitsActive && !isSigningsActive && (
          <div className="flex items-center gap-2">
            {(session as any)?.user?.role === "ADMIN" && (
              <button 
                onClick={() => router.push("/dashboard/admin/reservations")}
                className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-4 py-2 rounded-xl text-xs font-black text-primary hover:bg-primary/20 transition-all active:scale-95 shadow-sm"
              >
                <TrendingUp size={14} strokeWidth={3} />
                RESERVACIONES
              </button>
            )}
            
            <div className="relative">
              <button 
                onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-xs font-black text-slate-600 hover:bg-slate-100 transition-all active:scale-95"
              >
                {projects.find(p => p.id === activeProject)?.name || "Proyecto"}
                <ChevronDown size={14} className={clsx("transition-transform", isProjectDropdownOpen && "rotate-180")} />
              </button>

              {isProjectDropdownOpen && (
                <div className="absolute top-full right-0 mt-2 w-56 bg-white border border-slate-100 rounded-3xl shadow-2xl p-3 z-[200] animate-in fade-in slide-in-from-top-2 duration-200">
                  {projects
                    .filter(p => p.id !== "UNASSIGNED" || (session as any)?.user?.role === "ADMIN")
                    .map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { setActiveProject(p.id); setIsProjectDropdownOpen(false); setCurrentPage(1); }}
                        className={clsx(
                          "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-xs font-bold transition-all",
                          activeProject === p.id ? "bg-primary/5 text-primary" : "text-slate-500 hover:bg-slate-50"
                        )}
                      >
                        <p.icon size={16} />
                        {p.name}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      </header>
      
      <NotificationBanner />

      {isVisitsActive ? (
        /* ============ CALENDAR VIEW ============ */
        <main className="flex-1 px-4 pb-12 min-h-[500px]">
          {/* Month Navigator */}
          <div className="flex items-center justify-between py-4 px-2">
            <button
              onClick={() => {
                const [y, m] = calendarMonth.split('-').map(Number);
                const prev = new Date(y, m - 2, 1);
                setCalendarMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
              }}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 active:scale-95 transition-all shadow-sm"
            >
              <ChevronLeft size={18} />
            </button>
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-wider">
              {(() => {
                const [y, m] = calendarMonth.split('-').map(Number);
                const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                return `${monthNames[m - 1]} ${y}`;
              })()}
            </h3>
            <button
              onClick={() => {
                const [y, m] = calendarMonth.split('-').map(Number);
                const next = new Date(y, m, 1);
                setCalendarMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
              }}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 active:scale-95 transition-all shadow-sm"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {loadingVisits ? (
            <div className="flex flex-col items-center py-20 opacity-30">
              <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cargando visitas...</p>
            </div>
          ) : (
            <>
              {/* Calendar Grid */}
              <div className="bg-white rounded-3xl shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden">
                {/* Weekday headers */}
                <div className="grid grid-cols-7 border-b border-slate-100">
                  {['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'].map(day => (
                    <div key={day} className="text-center py-3 text-[9px] font-black text-slate-400 tracking-widest">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar days */}
                <div className="grid grid-cols-7">
                  {(() => {
                    const [y, m] = calendarMonth.split('-').map(Number);
                    const firstDay = new Date(y, m - 1, 1);
                    const lastDay = new Date(y, m, 0);
                    const daysInMonth = lastDay.getDate();
                    // getDay() returns 0 for Sunday. We want Monday=0
                    let startDow = firstDay.getDay() - 1;
                    if (startDow < 0) startDow = 6;

                    const today = new Date();
                    const isCurrentMonth = today.getFullYear() === y && today.getMonth() === m - 1;

                    // Build visit count per day
                    const visitsByDay: Record<number, number> = {};
                    visits.forEach((v: any) => {
                      if (v.visitDate) {
                        const d = new Date(v.visitDate).getDate();
                        visitsByDay[d] = (visitsByDay[d] || 0) + 1;
                      }
                    });

                    const cells = [];
                    // Empty cells before first day
                    for (let i = 0; i < startDow; i++) {
                      cells.push(<div key={`empty-${i}`} className="py-2" />);
                    }

                    for (let day = 1; day <= daysInMonth; day++) {
                      const hasVisits = visitsByDay[day] > 0;
                      const visitCount = visitsByDay[day] || 0;
                      const isToday = isCurrentMonth && today.getDate() === day;
                      const isSelected = selectedDay === day;

                      cells.push(
                        <button
                          key={day}
                          onClick={() => setSelectedDay(isSelected ? null : day)}
                          className={clsx(
                            "relative flex flex-col items-center justify-center py-2.5 transition-all active:scale-90",
                            isSelected && "bg-primary/10 rounded-xl",
                            isToday && !isSelected && "bg-[#D4AF37]/5 rounded-xl"
                          )}
                        >
                          <span className={clsx(
                            "text-sm font-black w-8 h-8 flex items-center justify-center rounded-full transition-all",
                            isSelected ? "bg-primary text-white shadow-md shadow-primary/30" :
                            isToday ? "bg-[#D4AF37] text-white shadow-md shadow-[#D4AF37]/30" :
                            hasVisits ? "text-slate-800" : "text-slate-400"
                          )}>
                            {day}
                          </span>
                          {hasVisits && (
                            <div className="flex gap-0.5 mt-1">
                              {Array.from({ length: Math.min(visitCount, 3) }).map((_, i) => (
                                <div key={i} className={clsx(
                                  "w-1.5 h-1.5 rounded-full",
                                  isSelected ? "bg-primary" : "bg-[#D4AF37]"
                                )} />
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    }

                    return cells;
                  })()}
                </div>
              </div>

              {/* Visit cards for selected day */}
              {selectedDay !== null && (
                <div className="mt-6 space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">
                    Visitas del {selectedDay} de {(() => {
                      const m = parseInt(calendarMonth.split('-')[1]);
                      const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                      return monthNames[m - 1];
                    })()}
                  </h4>
                  {visits
                    .filter((v: any) => v.visitDate && new Date(v.visitDate).getDate() === selectedDay)
                    .map((visit: any, idx: number) => (
                      <div
                        key={visit.id}
                        onClick={() => router.push(`/dashboard/leads/${visit.id}`)}
                        className="bg-white rounded-2xl border border-slate-100 p-4 shadow-md shadow-slate-100/50 cursor-pointer active:scale-[0.98] transition-all animate-in fade-in slide-in-from-bottom-2 duration-300"
                        style={{ animationDelay: `${idx * 80}ms` }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                            <Calendar size={20} className="text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h5 className="text-sm font-black text-slate-800 truncate">
                              {visit.firstName} {visit.lastName}
                            </h5>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-bold text-primary flex items-center gap-1">
                                <Clock size={10} />
                                {new Date(visit.visitDate).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {visit.visitProject && (
                                <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1 truncate">
                                  <MapPin size={10} />
                                  {visit.visitProject}
                                </span>
                              )}
                            </div>
                            {(visit.lote || visit.etapa) && (
                              <p className="text-[10px] font-bold text-slate-400 mt-1">
                                {visit.lote && `Lote ${visit.lote}`}{visit.lote && visit.etapa && ' — '}{visit.etapa}
                              </p>
                            )}
                          </div>
                          <div className="w-8 h-8 bg-primary/5 rounded-full flex items-center justify-center text-primary flex-shrink-0">
                            <ChevronRight size={14} />
                          </div>
                        </div>
                      </div>
                    ))
                  }
                  {visits.filter((v: any) => v.visitDate && new Date(v.visitDate).getDate() === selectedDay).length === 0 && (
                    <div className="py-10 text-center">
                      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Calendar className="text-slate-300" size={24} />
                      </div>
                      <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Sin visitas este día</p>
                    </div>
                  )}
                </div>
              )}

              {/* No visits at all */}
              {visits.length === 0 && selectedDay === null && (
                <div className="py-14 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Calendar className="text-slate-300" size={32} />
                  </div>
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No hay visitas programadas este mes</p>
                </div>
              )}
            </>
          )}
        </main>
      ) : isSigningsActive ? (
        /* ============ SIGNINGS VIEW ============ */
        <main className="flex-1 px-4 pb-12 min-h-[500px]">
          {/* Month Navigator */}
          <div className="flex items-center justify-between py-4 px-2">
            <button
              onClick={() => {
                const [y, m] = calendarMonth.split('-').map(Number);
                const prev = new Date(y, m - 2, 1);
                setCalendarMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
              }}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 active:scale-95 transition-all shadow-sm"
            >
              <ChevronLeft size={18} />
            </button>
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-wider">
              {(() => {
                const [y, m] = calendarMonth.split('-').map(Number);
                const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                return `${monthNames[m - 1]} ${y}`;
              })()}
            </h3>
            <button
              onClick={() => {
                const [y, m] = calendarMonth.split('-').map(Number);
                const next = new Date(y, m, 1);
                setCalendarMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
              }}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 active:scale-95 transition-all shadow-sm"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {loadingSignings ? (
            <div className="flex flex-col items-center py-20 opacity-30">
              <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cargando compromisos...</p>
            </div>
          ) : (
            <>
              {/* Calendar Grid */}
              <div className="bg-white rounded-3xl shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden">
                {/* Weekday headers */}
                <div className="grid grid-cols-7 border-b border-slate-100">
                  {['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'].map(day => (
                    <div key={day} className="text-center py-3 text-[9px] font-black text-slate-400 tracking-widest">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar days */}
                <div className="grid grid-cols-7">
                  {(() => {
                    const [y, m] = calendarMonth.split('-').map(Number);
                    const firstDay = new Date(y, m - 1, 1);
                    const lastDay = new Date(y, m, 0);
                    const daysInMonth = lastDay.getDate();
                    let startDow = firstDay.getDay() - 1;
                    if (startDow < 0) startDow = 6;

                    const today = new Date();
                    const isCurrentMonth = today.getFullYear() === y && today.getMonth() === m - 1;

                    const signingsByDay: Record<number, number> = {};
                    signings.forEach((s: any) => {
                      if (s.signingDate) {
                        const d = new Date(s.signingDate).getDate();
                        signingsByDay[d] = (signingsByDay[d] || 0) + 1;
                      }
                    });

                    const cells = [];
                    for (let i = 0; i < startDow; i++) {
                      cells.push(<div key={`empty-${i}`} className="py-2" />);
                    }

                    for (let day = 1; day <= daysInMonth; day++) {
                      const hasSignings = signingsByDay[day] > 0;
                      const count = signingsByDay[day] || 0;
                      const isToday = isCurrentMonth && today.getDate() === day;
                      const isSelected = selectedDay === day;

                      cells.push(
                        <button
                          key={day}
                          onClick={() => setSelectedDay(isSelected ? null : day)}
                          className={clsx(
                            "relative flex flex-col items-center justify-center py-2.5 transition-all active:scale-90",
                            isSelected && "bg-primary/10 rounded-xl",
                            isToday && !isSelected && "bg-[#D4AF37]/5 rounded-xl"
                          )}
                        >
                          <span className={clsx(
                            "text-sm font-black w-8 h-8 flex items-center justify-center rounded-full transition-all",
                            isSelected ? "bg-primary text-white shadow-md shadow-primary/30" :
                            isToday ? "bg-[#D4AF37] text-white shadow-md shadow-[#D4AF37]/30" :
                            hasSignings ? "text-slate-800" : "text-slate-400"
                          )}>
                            {day}
                          </span>
                          {hasSignings && (
                            <div className="flex gap-0.5 mt-1">
                              {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                                <div key={i} className={clsx(
                                  "w-1.5 h-1.5 rounded-full",
                                  isSelected ? "bg-primary" : "bg-blue-500"
                                )} />
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    }
                    return cells;
                  })()}
                </div>
              </div>

              {/* Signing cards for selected day */}
              {selectedDay !== null && (
                <div className="mt-6 space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">
                    Compromisos del {selectedDay} de {(() => {
                      const m = parseInt(calendarMonth.split('-')[1]);
                      const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                      return monthNames[m - 1];
                    })()}
                  </h4>
                  {signings
                    .filter((s: any) => s.signingDate && new Date(s.signingDate).getDate() === selectedDay)
                    .map((signing: any, idx: number) => (
                      <div
                        key={signing.id}
                        onClick={() => router.push(`/dashboard/leads/${signing.id}`)}
                        className="bg-white rounded-2xl border border-slate-100 p-4 shadow-md shadow-slate-100/50 cursor-pointer active:scale-[0.98] transition-all animate-in fade-in slide-in-from-bottom-2 duration-300"
                        style={{ animationDelay: `${idx * 80}ms` }}
                      >
                        <div className="flex items-start gap-3">
                          <div className={clsx(
                            "w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0",
                            signing.signingStatus === "FIRMÓ" ? "bg-green-100" : signing.signingStatus === "NO FIRMÓ" ? "bg-red-100" : "bg-blue-100"
                          )}>
                            <PenTool size={20} className={clsx(
                                signing.signingStatus === "FIRMÓ" ? "text-green-600" : signing.signingStatus === "NO FIRMÓ" ? "text-red-600" : "text-blue-600"
                            )} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                                <h5 className="text-sm font-black text-slate-800 truncate">
                                {signing.firstName} {signing.lastName}
                                </h5>
                                <span className={clsx(
                                    "text-[8px] font-black px-1.5 py-0.5 rounded-full",
                                    signing.signingStatus === "FIRMÓ" ? "bg-green-50 text-green-600" : signing.signingStatus === "NO FIRMÓ" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                                )}>
                                    {signing.signingStatus || "PENDIENTE"}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-bold text-primary flex items-center gap-1">
                                <Clock size={10} />
                                {new Date(signing.signingDate).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {signing.signingProject && (
                                <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1 truncate">
                                  <MapPin size={10} />
                                  {signing.signingProject}
                                </span>
                              )}
                            </div>
                            {(signing.signingLote || signing.signingEtapa) && (
                              <p className="text-[10px] font-bold text-slate-400 mt-1">
                                {signing.signingLote && `Lote ${signing.signingLote}`}{signing.signingLote && signing.signingEtapa && ' — '}{signing.signingEtapa}
                              </p>
                            )}
                          </div>
                          <div className="w-8 h-8 bg-primary/5 rounded-full flex items-center justify-center text-primary flex-shrink-0">
                            <ChevronRight size={14} />
                          </div>
                        </div>
                      </div>
                    ))
                  }
                  {signings.filter((s: any) => s.signingDate && new Date(s.signingDate).getDate() === selectedDay).length === 0 && (
                    <div className="py-10 text-center">
                      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <PenTool className="text-slate-300" size={24} />
                      </div>
                      <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Sin compromisos este día</p>
                    </div>
                  )}
                </div>
              )}

              {/* No signings at all */}
              {signings.length === 0 && selectedDay === null && (
                <div className="py-14 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <PenTool className="text-slate-300" size={32} />
                  </div>
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No hay compromisos de firma este mes</p>
                </div>
              )}
            </>
          )}
        </main>
      ) : (
        /* ============ LEADS VIEW ============ */
        <>
      {/* Dropdown Filters Row */}
      <div className="py-2 px-6 flex items-center gap-2 relative z-[80] overflow-visible">
        {/* Period Dropdown */}
        <div className="relative shrink-0">
          <button 
            onClick={() => {
              setIsPeriodDropdownOpen(!isPeriodDropdownOpen);
              setIsStatusDropdownOpen(false);
              setIsRatingDropdownOpen(false);
              setIsOwnerDropdownOpen(false);
            }}
            className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-2xl text-[10px] font-black text-slate-600 hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
          >
            <Calendar size={12} className="text-primary" />
            {dateFilter === "PERSONALIZADO" 
              ? `${customStartDate ? formatDateShort(customStartDate) : '...'} - ${customEndDate ? formatDateShort(customEndDate) : '...'}` 
              : (dateFilter === "TODOS" ? "Periodos" : dateFilters.find(f => f.id === dateFilter)?.name)}
            <ChevronDown size={12} className={clsx("transition-transform", isPeriodDropdownOpen && "rotate-180")} />
          </button>

          {isPeriodDropdownOpen && (
            <div className="absolute top-full left-0 mt-3 w-48 bg-white border border-slate-100 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] ring-1 ring-slate-900/5 p-2 z-[110] animate-in fade-in slide-in-from-top-2 duration-200">
              {dateFilters.map((f) => (
                <button
                  key={f.id}
                  onClick={() => { 
                    if (f.id === "PERSONALIZADO") {
                      setIsCustomDateModalOpen(true);
                    } else {
                      setDateFilter(f.id);
                    }
                    setIsPeriodDropdownOpen(false); 
                    setCurrentPage(1); 
                  }}
                  className={clsx(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-[11px] font-bold transition-all",
                    dateFilter === f.id ? "bg-primary/5 text-primary" : "text-slate-500 hover:bg-slate-50"
                  )}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Rating Dropdown (Interés) */}
        <div className="relative shrink-0">
          <button 
            onClick={() => {
              setIsRatingDropdownOpen(!isRatingDropdownOpen);
              setIsStatusDropdownOpen(false);
              setIsPeriodDropdownOpen(false);
              setIsOwnerDropdownOpen(false);
            }}
            className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-2xl text-[10px] font-black text-slate-600 hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
          >
            {activeRating === "TODOS" ? <Filter size={12} /> : React.createElement(ratingFilters.find(f => f.id === activeRating)?.icon || Meh, { size: 12, className: ratingFilters.find(f => f.id === activeRating)?.color })}
            {activeRating === "TODOS" ? "Intereses" : ratingFilters.find(f => f.id === activeRating)?.name}
            <ChevronDown size={12} className={clsx("transition-transform", isRatingDropdownOpen && "rotate-180")} />
          </button>

          {isRatingDropdownOpen && (
            <div className="absolute top-full left-0 mt-3 w-48 bg-white border border-slate-100 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] ring-1 ring-slate-900/5 p-2 z-[110] animate-in fade-in slide-in-from-top-2 duration-200">
              {ratingFilters.map((f) => (
                <button
                  key={f.id}
                  onClick={() => { setActiveRating(f.id); setIsRatingDropdownOpen(false); setCurrentPage(1); }}
                  className={clsx(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-[11px] font-bold transition-all",
                    activeRating === f.id ? "bg-primary/5 text-primary" : "text-slate-500 hover:bg-slate-50"
                  )}
                >
                  <f.icon size={16} className={f.color} />
                  {f.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Status Dropdown */}
        <div className="relative shrink-0">
          <button 
            onClick={() => {
              setIsStatusDropdownOpen(!isStatusDropdownOpen);
              setIsPeriodDropdownOpen(false);
              setIsRatingDropdownOpen(false);
              setIsOwnerDropdownOpen(false);
            }}
            className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-2xl text-[10px] font-black text-slate-600 hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
          >
            <div className={clsx("w-2 h-2 rounded-full", activeStatus === "TODOS" ? "bg-slate-300" : statusFilters.find(f => f.id === activeStatus)?.color)} />
            {activeStatus === "TODOS" ? "Estados" : statusFilters.find(f => f.id === activeStatus)?.name}
            <ChevronDown size={12} className={clsx("transition-transform", isStatusDropdownOpen && "rotate-180")} />
          </button>

          {isStatusDropdownOpen && (
            <div className="absolute top-full right-0 mt-3 w-48 bg-white border border-slate-100 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] ring-1 ring-slate-900/5 p-2 z-[110] animate-in fade-in slide-in-from-top-2 duration-200">
              {statusFilters.map((f) => (
                <button
                  key={f.id}
                  onClick={() => { setActiveStatus(f.id); setIsStatusDropdownOpen(false); setCurrentPage(1); }}
                  className={clsx(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-[11px] font-bold transition-all",
                    activeStatus === f.id ? "bg-primary/5 text-primary" : "text-slate-500 hover:bg-slate-50"
                  )}
                >
                  <div className={clsx("w-2 h-2 rounded-full", f.color)} />
                  {f.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Owner Dropdown (ADMIN ONLY) */}
        {(session as any)?.user?.role === "ADMIN" && (
          <div className="relative shrink-0">
            <button 
              onClick={() => {
                setIsOwnerDropdownOpen(!isOwnerDropdownOpen);
                setIsPeriodDropdownOpen(false);
                setIsRatingDropdownOpen(false);
                setIsStatusDropdownOpen(false);
              }}
              className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-2xl text-[10px] font-black text-slate-600 hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
            >
              <UserIcon size={12} className="text-primary" />
              {activeOwner === "TODOS" ? "Propietario" : advisors.find(a => a.id === activeOwner)?.name || "Propietario"}
              <ChevronDown size={12} className={clsx("transition-transform", isOwnerDropdownOpen && "rotate-180")} />
            </button>

            {isOwnerDropdownOpen && (
              <div className="absolute top-full right-0 mt-3 w-48 bg-white border border-slate-100 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] ring-1 ring-slate-900/5 p-2 z-[110] animate-in fade-in slide-in-from-top-2 duration-200 max-h-60 overflow-y-auto">
                <button
                  onClick={() => { setActiveOwner("TODOS"); setIsOwnerDropdownOpen(false); setCurrentPage(1); }}
                  className={clsx(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-[11px] font-bold transition-all",
                    activeOwner === "TODOS" ? "bg-primary/5 text-primary" : "text-slate-500 hover:bg-slate-50"
                  )}
                >
                  Todos
                </button>
                {advisors.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => { setActiveOwner(a.id); setIsOwnerDropdownOpen(false); setCurrentPage(1); }}
                    className={clsx(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-[11px] font-bold transition-all",
                      activeOwner === a.id ? "bg-primary/5 text-primary" : "text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Leads List */}
      <main className="flex-1 px-6 space-y-4 pb-12 min-h-[500px]">
        {loading ? (
          <div className="flex flex-col items-center py-20 opacity-30">
            <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Actualizando lista...</p>
          </div>
        ) : fetchError ? (
          <div className="py-20 text-center px-6">
            <div className="bg-red-50 border border-red-100 rounded-3xl p-8 max-w-sm mx-auto shadow-xl shadow-red-500/5">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Filter className="text-red-500" size={32} />
              </div>
              <h3 className="text-red-900 font-black text-xs uppercase tracking-widest mb-2">Error de Sincronización</h3>
              <p className="text-red-600/70 text-xs font-bold leading-relaxed mb-6">
                Faltan columnas en la base de datos. Por favor, ejecuta el contenido del archivo <code className="bg-red-100 px-1 rounded">scripts/sync_db.sql</code> en tu base de datos para corregir esto.
              </p>
              <button 
                onClick={() => fetchLeads(currentPage, searchTerm, activeProject, dateFilter, activeStatus, activeRating, activeOwner, isVisitsActive)}
                className="w-full bg-red-500 text-white font-black py-4 rounded-2xl text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-red-500/20 active:scale-95 transition-all mb-3"
              >
                Reintentar Después de Ejecutar SQL
              </button>
            </div>
          </div>
        ) : (
          <>
            {leads.map((lead, index) => {
              const statusType = getStatusColor(lead.status, lead.rating);
              const RatingIcon = lead.rating === 'VENTA' ? Laugh : lead.rating === 'INTERESADO' ? Smile : Meh;
              const ratingStyle = lead.rating === 'VENTA' 
                ? { color: 'text-green-600', bg: 'bg-green-100' } 
                : lead.rating === 'INTERESADO' 
                  ? { color: 'text-orange-500', bg: 'bg-orange-100' } 
                  : { color: 'text-slate-500', bg: 'bg-slate-100' };

              return (
                <div
                  key={lead.id}
                  onClick={() => {
                    router.push(`/dashboard/leads/${lead.id}`);
                  }}
                  className={clsx(
                    "card-stitch flex items-center gap-4 relative overflow-hidden group animate-in fade-in slide-in-from-bottom-4 duration-500 cursor-pointer",
                    statusType === 'hot' ? "status-edge-hot" : statusType === 'warm' ? "status-edge-warm" : "status-edge-cold"
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="w-12 h-12 bg-slate-50 flex-shrink-0 rounded-full flex items-center justify-center text-slate-400 border border-slate-100 group-hover:scale-110 transition-transform relative">
                    <UserIcon size={24} />
                    {lead.rating && (
                      <div className={clsx("absolute -top-1 -right-1 rounded-full p-1 shadow-sm border border-white", ratingStyle.bg)}>
                        <RatingIcon size={10} className={ratingStyle.color} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="text-sm font-black text-slate-800 truncate">{lead.firstName} {lead.lastName}</h3>
                      <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded leading-none">
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3 text-slate-500 text-[10px] font-bold">
                      <span className="flex items-center gap-1"><Clock size={10} />{new Date(lead.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="flex items-center gap-1 text-primary/70 uppercase tracking-tighter truncate max-w-[100px]">
                        <Share2 size={10} />{lead.source || 'WEB'}
                      </span>
                    </div>
                  </div>
                  
                  <button className="w-10 h-10 bg-primary/5 rounded-full flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                    <ChevronRight size={18} />
                  </button>
                </div>
              );
            })}

            {leads.length === 0 && (
              <div className="py-20 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="text-slate-300" size={32} />
                </div>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No hay leads para estos filtros</p>
              </div>
            )}

            {/* Pagination Controls */}
            {pagination && pagination.pages > 1 && (() => {
              const totalPages = pagination.pages;
              const pages: (number | string)[] = [];
              
              if (totalPages <= 7) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
              } else {
                pages.push(1);
                if (currentPage > 3) pages.push("...");
                
                const start = Math.max(2, currentPage - 1);
                const end = Math.min(totalPages - 1, currentPage + 1);
                for (let i = start; i <= end; i++) pages.push(i);
                
                if (currentPage < totalPages - 2) pages.push("...");
                pages.push(totalPages);
              }

              return (
                <div className="flex items-center justify-center gap-1.5 pt-6 pb-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  {pages.map((p, idx) => 
                    typeof p === "string" ? (
                      <span key={`ellipsis-${idx}`} className="w-9 h-9 flex items-center justify-center text-[10px] font-bold text-slate-300">
                        ···
                      </span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        className={clsx(
                          "w-9 h-9 flex items-center justify-center rounded-xl text-[11px] font-black transition-all active:scale-95",
                          currentPage === p
                            ? "bg-primary text-white shadow-lg shadow-primary/20"
                            : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
                        )}
                      >
                        {p}
                      </button>
                    )
                  )}

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(pagination.pages, prev + 1))}
                    disabled={currentPage === pagination.pages}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              );
            })()}
          </>
        )}
      </main>
        </>
      )}

      {/* Custom Date Selection Modal */}
      {isCustomDateModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-[320px] rounded-3xl p-6 shadow-2xl border border-slate-100 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-xs font-black text-primary uppercase tracking-widest">RANGO PERSONALIZADO</h3>
              <button 
                onClick={() => setIsCustomDateModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 active:scale-90 transition-all"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Fecha de Inicio</label>
                <input 
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 transition-all w-full"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Fecha de Fin</label>
                <input 
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 transition-all w-full"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-2">
              <button 
                onClick={() => {
                  setCustomStartDate("");
                  setCustomEndDate("");
                  setDateFilter("TODOS");
                  setIsCustomDateModalOpen(false);
                  setCurrentPage(1);
                }}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all text-center"
              >
                Limpiar
              </button>
              <button 
                onClick={() => {
                  setDateFilter("PERSONALIZADO");
                  setIsCustomDateModalOpen(false);
                  setCurrentPage(1);
                }}
                className="flex-1 bg-primary text-white py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all text-center"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
