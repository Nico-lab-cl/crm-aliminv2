"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Bell, Clock, User, CheckCheck } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { requestForToken, onMessageListener } from '@/lib/firebase-client';

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  leadId?: string;
  createdAt: string;
}

export default function NotificationBell() {
  const { data: session } = useSession();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
        setUnreadCount(data.filter((n: Notification) => !n.read).length);
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  useEffect(() => {
    if (session) {
      fetchNotifications();
      // Initialize Push Notifications
      requestForToken();
      onMessageListener().then((payload) => {
        fetchNotifications();
      });

      // Poll every 1 minute as fallback
      const interval = setInterval(fetchNotifications, 60000);
      return () => clearInterval(interval);
    }
  }, [session]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAllAsRead = async () => {
    try {
      const res = await fetch('/api/notifications', { method: 'POST' });
      if (res.ok) {
        setNotifications(notifications.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const getTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifications();
        }}
        className="p-2 text-slate-400 hover:text-primary transition-colors relative active:scale-90"
      >
        <Bell size={22} className={clsx(unreadCount > 0 && "text-primary")} />
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-slate-100 rounded-3xl shadow-2xl z-[300] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-4 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
            <h3 className="font-black text-slate-800 text-sm tracking-tight text-primary">NOTIFICACIONES</h3>
            {unreadCount > 0 && (
              <button 
                onClick={markAllAsRead}
                className="text-[10px] font-black text-primary hover:underline uppercase tracking-widest flex items-center gap-1"
              >
                <CheckCheck size={12} />
                Marcar leídas
              </button>
            )}
          </div>

          <div className="max-h-[350px] overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-200">
            {notifications.length === 0 ? (
              <div className="p-10 text-center flex flex-col items-center gap-3">
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center">
                   <Bell size={24} className="text-slate-300" />
                </div>
                <p className="text-xs font-bold text-slate-400">No tienes notificaciones aún</p>
              </div>
            ) : (
                  notifications.map((n) => (
                <div 
                  key={n.id}
                  onClick={() => {
                    if (n.leadId) {
                      router.push(`/dashboard/leads/${n.leadId}`);
                      setIsOpen(false);
                    }
                  }}
                  className={clsx(
                    "p-4 border-b border-slate-50 flex gap-3 transition-colors hover:bg-slate-100 cursor-pointer active:bg-slate-200",
                    !n.read && "bg-primary/5"
                  )}
                >
                  <div className={clsx(
                    "shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
                    n.type === 'ASSIGNMENT' ? "bg-primary/10 text-primary" : "bg-blue-100 text-blue-500"
                  )}>
                    {n.type === 'ASSIGNMENT' ? <User size={18} /> : <Bell size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-800 mb-0.5 tracking-tight leading-tight uppercase">{n.title}</p>
                    <p className="text-[11px] font-bold text-slate-500 leading-snug line-clamp-2">{n.body}</p>
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      <Clock size={10} />
                      {getTimeAgo(n.createdAt)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-3 bg-slate-50 text-center">
             <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fin de las notificaciones</span>
          </div>
        </div>
      )}
    </div>
  );
}
