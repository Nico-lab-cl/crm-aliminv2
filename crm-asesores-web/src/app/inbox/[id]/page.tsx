"use client";

import { useEffect, useState, useRef } from "react";
import { ArrowLeft, Send, User, Facebook, Instagram, ShieldCheck, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function ChatDetailPage({ params }: { params: { id: string } }) {
  const [conversation, setConversation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetchChat();
    const interval = setInterval(fetchChat, 5000); // Polling cada 5 seg
    return () => clearInterval(interval);
  }, [params.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchChat = async () => {
    try {
      const res = await fetch(`/api/messages/conversations/${params.id}`);
      const data = await res.json();
      setConversation(data);
      setMessages(data.messages || []);
    } catch (error) {
      console.error("Error loading chat", error);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || sending) return;

    setSending(true);
    try {
      // Usamos el sourceType del último mensaje recibido para responder
      const lastMetaMessage = [...messages].reverse().find(m => m.senderType === "meta");
      const sourceType = lastMetaMessage?.sourceType || "DIRECT";
      const sourceId = lastMetaMessage?.sourceId;

      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: params.id,
          text: inputText,
          sourceType,
          sourceId,
        }),
      });

      if (res.ok) {
        setInputText("");
        fetchChat();
      }
    } catch (error) {
      console.error("Error sending message", error);
    } finally {
      setSending(false);
    }
  };

  if (!conversation) return <div className="p-8 text-center text-slate-400">Cargando chat...</div>;

  const leadName = conversation.lead ? `${conversation.lead.firstName} ${conversation.lead.lastName}` : `Usuario Meta (${conversation.psid.slice(-4)})`;

  return (
    <div className="flex flex-col h-screen bg-[#F5F7F9]">
      {/* Header */}
      <header className="bg-white px-4 py-4 border-b border-slate-100 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={() => router.back()} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 relative overflow-hidden flex-shrink-0">
          {conversation.lead?.image || conversation.metaImage ? (
              <img src={conversation.lead?.image || conversation.metaImage} alt="Avatar" className="w-full h-full object-cover rounded-xl" />
          ) : (
              <User size={20} />
          )}
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-lg bg-white shadow-sm flex items-center justify-center ring-2 ring-white">
            {conversation.platform === "facebook" ? (
                <Facebook size={10} className="text-[#1877F2]" fill="currentColor" />
            ) : conversation.platform === "instagram" ? (
                <Instagram size={10} className="text-[#E4405F]" />
            ) : (
                <div className="text-black font-black text-[7px] leading-none">TT</div>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-slate-800 truncate leading-tight">
            {conversation.lead ? `${conversation.lead.firstName} ${conversation.lead.lastName}` : (conversation.metaName || `Usuario Meta (${conversation.psid.slice(-4)})`)}
          </h2>
          <div className="flex items-center gap-1">
             <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">En Línea</span>
          </div>
        </div>
      </header>

      {/* Messages List */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-opacity-5"
      >
        {messages.map((msg, i) => {
          if (!msg) return null;
          const isMe = msg.senderType === "advisor";
          
          let formattedTime = "";
          try {
            if (msg.createdAt) {
               formattedTime = format(new Date(msg.createdAt), "HH:mm", { locale: es });
            }
          } catch (e) {
            console.error("Error formatting date", e);
          }

          return (
            <div key={msg.id || i} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
              {/* Message Bubble */}
              <div className={`
                max-w-[85%] px-4 py-3 rounded-2xl text-sm shadow-sm
                ${isMe 
                  ? "bg-primary text-white rounded-tr-none" 
                  : "bg-white text-slate-800 rounded-tl-none border border-slate-100 text-[15px]"}
              `}>
                {msg.sourceType === "COMMENT" && !isMe && (
                   <div className="text-[10px] font-black uppercase text-pink-500 mb-2 flex items-center gap-1">
                      <MessageCircle size={10} /> Comentario Público
                   </div>
                )}
                
                {msg.postContent && !isMe && (
                  <div className="mb-3 rounded-xl overflow-hidden border border-slate-100 bg-slate-50 shadow-sm transition-all hover:shadow-md cursor-pointer group">
                    {(() => {
                      try {
                        const content = JSON.parse(msg.postContent);
                        return (
                          <div className="flex flex-col">
                            {content.image && (
                              <div className="w-full aspect-video bg-slate-200 overflow-hidden relative">
                                <img src={content.image} alt="Post" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                                   <p className="text-[10px] font-black text-white/90 uppercase tracking-widest">Publicación Referenciada</p>
                                </div>
                              </div>
                            )}
                            <div className="p-3">
                               <p className="text-[13px] text-slate-700 italic leading-relaxed border-l-2 border-slate-300 pl-3">
                                 "{content.text || "Publicación con imagen y sin texto"}"
                               </p>
                            </div>
                          </div>
                        );
                      } catch (e) {
                        return null;
                      }
                    })()}
                  </div>
                )}
                
                {msg.mediaUrl ? (
                  <div className="mb-2 rounded-xl overflow-hidden border border-slate-100 shadow-sm transition-all hover:scale-[1.02] cursor-zoom-in">
                    <img 
                        src={msg.mediaUrl} 
                        alt="Adjunto" 
                        className="max-w-full h-auto object-contain bg-slate-50" 
                        onDoubleClick={() => window.open(msg.mediaUrl, '_blank')}
                    />
                  </div>
                ) : null}

                <div className="leading-relaxed whitespace-pre-wrap break-words">
                  {msg.text}
                </div>
              </div>
              
              {/* Meta Info */}
              <div className="mt-1 flex items-center gap-2 px-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase">
                   {formattedTime}
                </span>
                {isMe && (
                  <div className="flex items-center gap-1 text-[9px] font-black text-primary uppercase">
                    <ShieldCheck size={10} /> {msg.sender?.name || "Asesor"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input Bar */}
      <form 
        onSubmit={handleSend}
        className="p-4 bg-white border-t border-slate-100 flex gap-2 items-center pb-8"
      >
        <div className="flex-1 relative">
          <input 
            type="text"
            placeholder="Escribe tu respuesta..."
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all outline-none"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
        </div>
        <button 
          type="submit"
          disabled={!inputText.trim() || sending}
          className="w-12 h-12 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50"
        >
          <Send size={20} />
        </button>
      </form>
    </div>
  );
}
