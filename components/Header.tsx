'use client';

import { Search, Bell, HelpCircle, Plus, Mail, Globe, Trash2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface NotificationItem {
  id: number;
  lead_id: string | null;
  email: string | null;
  event_type: 'EMAIL_OPENED' | 'PAGE_VISIT' | string;
  title: string;
  message: string;
  created_at: string;
  read: boolean;
}

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const lastUnreadCountRef = useRef(0);
  const isFirstLoadRef = useRef(true);

  const playNotificationSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      
      // Tone 1: G#5
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(830.61, now);
      gain1.gain.setValueAtTime(0.08, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Tone 2: C6 (delayed slightly for chime effect)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1046.50, now + 0.08);
      gain2.gain.setValueAtTime(0.06, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.43);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.43);
    } catch (e) {
      console.warn('Audio playback failed:', e);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        const list: NotificationItem[] = data.notifications || [];
        setNotifications(list);
        
        const newUnread = list.filter((n: NotificationItem) => !n.read).length;
        if (!isFirstLoadRef.current && newUnread > lastUnreadCountRef.current) {
          playNotificationSound();
        }
        
        isFirstLoadRef.current = false;
        lastUnreadCountRef.current = newUnread;
        setUnreadCount(newUnread);
      }
    } catch (e) {
      console.error('Error fetching notifications:', e);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 8000); // Poll every 8 seconds
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenDropdown = async () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState && unreadCount > 0) {
      try {
        await fetch('/api/notifications', { method: 'PUT' });
        setUnreadCount(0);
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      } catch (e) {
        console.error('Error marking notifications as read:', e);
      }
    }
  };

  const handleClearHistory = async () => {
    if (!confirm('¿Estás seguro de limpiar todo el historial de notificaciones?')) return;
    try {
      const res = await fetch('/api/notifications', { method: 'DELETE' });
      if (res.ok) {
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (e) {
      console.error('Error clearing notifications:', e);
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 1) return 'Ahora';
      if (diffMins < 60) return `Hace ${diffMins}m`;
      
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `Hace ${diffHours}h`;
      
      return date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  return (
    <header className="h-16 border-b border-[#cbd6e2] bg-white flex items-center justify-between px-8 sticky top-0 z-30">
      {/* Search Bar */}
      <div className="flex-1 max-w-xl">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#516f90] group-focus-within:text-[#2d544c] transition-colors" />
          <input 
            type="text" 
            placeholder="Buscar contactos, campañas..." 
            className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d544c]/20 focus:border-[#2d544c] transition-all"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-4">
        <button className="flex items-center gap-2 bg-[#c49a00] hover:bg-[#a68200] text-white px-4 py-2 rounded-md text-sm font-semibold transition-all shadow-sm active:scale-95">
          <Plus className="w-4 h-4" />
          <span>Acción Rápida</span>
        </button>

        <div className="h-6 w-px bg-[#cbd6e2] mx-2" />

        {/* Notifications Bell Dropdown */}
        <div className="relative">
          <button 
            onClick={handleOpenDropdown}
            className="p-2 text-[#516f90] hover:bg-[#f5f8fa] rounded-full transition-all relative"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-4 h-4 bg-[#ff4747] text-white rounded-full text-[9px] font-bold flex items-center justify-center px-1 border-2 border-white">
                {unreadCount}
              </span>
            )}
          </button>

          {isOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
              <div className="absolute right-0 mt-2 w-80 bg-white border border-[#cbd6e2] rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-[#f5f8fa] border-b border-[#cbd6e2]">
                  <span className="text-xs font-bold text-[#2d544c] uppercase tracking-wider">Notificaciones</span>
                  {notifications.length > 0 && (
                    <button 
                      onClick={handleClearHistory}
                      className="flex items-center gap-1 text-[10px] font-bold text-red-600 hover:text-red-800 transition-colors uppercase tracking-wider"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Limpiar</span>
                    </button>
                  )}
                </div>

                {/* Internal scrollable list */}
                <div className="max-h-72 overflow-y-auto divide-y divide-[#cbd6e2]/60">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 flex flex-col items-center justify-center">
                      <Bell className="w-8 h-8 text-slate-300 mb-1.5 animate-bounce" />
                      <p className="text-[11px] font-medium">Historial vacío</p>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div 
                        key={n.id} 
                        className={`px-4 py-3 flex gap-3 hover:bg-[#f5f8fa]/50 transition-colors ${!n.read ? 'bg-amber-50/10' : ''}`}
                      >
                        <div className="mt-0.5 flex-shrink-0">
                          {n.event_type === 'EMAIL_OPENED' ? (
                            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                              <Mail className="w-3.5 h-3.5" />
                            </div>
                          ) : (
                            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                              <Globe className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-1">
                            <span className="text-[11px] font-bold text-slate-700 truncate">{n.title}</span>
                            <span className="text-[9px] text-slate-400 whitespace-nowrap">{formatTime(n.created_at)}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed break-words">{n.message}</p>
                        </div>
                        {!n.read && (
                          <div className="w-1.5 h-1.5 bg-[#ff4747] rounded-full self-center flex-shrink-0" />
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <button className="p-2 text-[#516f90] hover:bg-[#f5f8fa] rounded-full transition-all">
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}

