"use client";

import { Users, UserCircle, LayoutGrid, Plus, PenTool, MessageSquare } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import clsx from "clsx";

export default function BottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const currentMenu = searchParams.get("menu");

  const isLeadsActive = pathname === "/dashboard" && !currentMenu;
  const isVisitsActive = currentMenu === "visits";
  const isSigningsActive = currentMenu === "signings";
  const isInboxActive = pathname === "/inbox";
  const isProfileActive = currentMenu === "profile";

  const handleNav = (target: "leads" | "visits" | "signings" | "profile" | "inbox") => {
    if (target === "leads") {
      router.push("/dashboard");
    } else if (target === "visits") {
      router.push("/dashboard?menu=visits");
    } else if (target === "signings") {
      router.push("/dashboard?menu=signings");
    } else if (target === "inbox") {
      router.push("/inbox");
    } else {
      router.push("/dashboard?menu=profile");
    }
  };

  return (
    <>
      {/* Center FAB - fixed independently to prevent clipping */}
      <div 
        className="fixed bottom-8 left-1/2 -translate-x-1/2"
        style={{ zIndex: 99991 }}
      >
        <Link
          href="/dashboard/leads/new"
          className="w-14 h-14 bg-primary text-white rounded-full shadow-[0_10px_25px_-5px_rgba(16,123,122,0.5)] flex items-center justify-center border-4 border-[#F5F7F9] active:scale-95 transition-all"
        >
          <Plus size={28} strokeWidth={3} />
        </Link>
      </div>

      <nav 
        className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-white border-t border-slate-100 py-2 px-2 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]"
        style={{ zIndex: 99990 }}
      >
        <div className="flex justify-between items-end">
          <div className="flex-1 flex justify-around">
            <button
              onClick={() => handleNav("leads")}
              className={clsx(
                "flex flex-col items-center gap-1 transition-all rounded-xl p-2",
                isLeadsActive ? "text-[#D4AF37] scale-110" : "text-slate-400 opacity-60"
              )}
            >
              <Users size={24} strokeWidth={isLeadsActive ? 2.5 : 2} />
              <span className="text-[10px] font-bold tracking-wider">LEADS</span>
            </button>

            <button
              onClick={() => handleNav("visits")}
              className={clsx(
                "flex flex-col items-center gap-1 transition-all rounded-xl p-2",
                isVisitsActive ? "text-[#D4AF37] scale-110" : "text-slate-400 opacity-60"
              )}
            >
              <LayoutGrid size={24} strokeWidth={isVisitsActive ? 2.5 : 2} />
              <span className="text-[10px] font-bold tracking-wider">VISITAS</span>
            </button>
          </div>

          <div className="w-20 flex-shrink-0" /> {/* Larger Spacer for FAB */}

          <div className="flex-1 flex justify-around">
            <button
              onClick={() => handleNav("inbox")}
              className={clsx(
                "flex flex-col items-center gap-1 transition-all rounded-xl p-2",
                isInboxActive ? "text-[#D4AF37] scale-110" : "text-slate-400 opacity-60"
              )}
            >
              <MessageSquare size={24} strokeWidth={isInboxActive ? 2.5 : 2} />
              <span className="text-[10px] font-bold tracking-wider">MENSAJES</span>
            </button>

            <button
              onClick={() => handleNav("signings")}
              className={clsx(
                "flex flex-col items-center gap-1 transition-all rounded-xl p-2",
                isSigningsActive ? "text-[#D4AF37] scale-110" : "text-slate-400 opacity-60"
              )}
            >
              <PenTool size={24} strokeWidth={isSigningsActive ? 2.5 : 2} />
              <span className="text-[10px] font-bold tracking-wider">FIRMA</span>
            </button>

            <button
              onClick={() => handleNav("profile")}
              className={clsx(
                "flex flex-col items-center gap-1 transition-all rounded-xl p-2",
                isProfileActive ? "text-[#D4AF37] scale-110" : "text-slate-400 opacity-60"
              )}
            >
              <UserCircle size={24} strokeWidth={isProfileActive ? 2.5 : 2} />
              <span className="text-[10px] font-bold tracking-wider">PERFIL</span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
