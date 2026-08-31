"use client";

import { useEffect, useState, useRef } from "react";
import {
  ArrowLeft, Send, User, Facebook, Instagram, ShieldCheck, MessageCircle, Globe,
  Paperclip, Mic, Trash2, Square, Loader2, AlertCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Formatos de audio que se intentan al grabar, en orden de preferencia.
 *
 * Android y Chrome graban en WEBM/Opus; iOS y Safari no lo soportan y caen a
 * MP4/AAC. Se prueban en orden porque MediaRecorder no negocia solo: si se le
 * pide un formato que no conoce, revienta en vez de elegir otro.
 */
const FORMATOS_DE_AUDIO = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function formatoDeAudioSoportado(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return FORMATOS_DE_AUDIO.find((f) => MediaRecorder.isTypeSupported(f)) || null;
}

/** "1:07" a partir de milisegundos. */
function duracion(ms: number) {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function ChatDetailPage({ params }: { params: { id: string } }) {
  const [conversation, setConversation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Grabación de voz
  const [grabando, setGrabando] = useState(false);
  const [msGrabados, setMsGrabados] = useState(0);
  const grabadora = useRef<MediaRecorder | null>(null);
  const trozos = useRef<Blob[]>([]);
  const inicioGrabacion = useRef(0);
  const cronometro = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelada = useRef(false);

  const inputArchivo = useRef<HTMLInputElement>(null);
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

  // Si el asesor sale de la pantalla con el micrófono abierto, hay que soltarlo:
  // el indicador de grabación quedaría encendido en el teléfono.
  useEffect(() => {
    return () => {
      if (cronometro.current) clearInterval(cronometro.current);
      grabadora.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
    setError(null);
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
      } else {
        setError("No se pudo enviar el mensaje. Intenta de nuevo.");
      }
    } catch (error) {
      console.error("Error sending message", error);
      setError("Sin conexión. El mensaje no se envió.");
    } finally {
      setSending(false);
    }
  };

  /** Sube un archivo (foto, video o audio grabado) al chat. */
  const enviarAdjunto = async (archivo: File, durationMs?: number) => {
    setSending(true);
    setError(null);

    try {
      const cuerpo = new FormData();
      cuerpo.append("conversationId", params.id);
      cuerpo.append("file", archivo);
      if (inputText.trim()) cuerpo.append("text", inputText.trim());
      if (durationMs) cuerpo.append("durationMs", String(Math.round(durationMs)));

      const res = await fetch("/api/messages/media", { method: "POST", body: cuerpo });
      const datos = await res.json().catch(() => ({}));

      if (res.ok) {
        setInputText("");
        fetchChat();
      } else {
        setError(datos.error || "No se pudo enviar el archivo.");
      }
    } catch (e) {
      console.error("Error enviando adjunto", e);
      setError("Sin conexión. El archivo no se envió.");
    } finally {
      setSending(false);
    }
  };

  const alElegirArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    // El input se limpia siempre: si no, elegir dos veces la misma foto no
    // dispara el evento la segunda vez.
    e.target.value = "";
    if (archivo) enviarAdjunto(archivo);
  };

  const empezarAGrabar = async () => {
    setError(null);

    const formato = formatoDeAudioSoportado();
    if (!formato) {
      setError("Este teléfono no puede grabar audio desde la app. Actualiza la aplicación.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: formato });

      trozos.current = [];
      cancelada.current = false;
      inicioGrabacion.current = Date.now();

      rec.ondataavailable = (evento) => {
        if (evento.data.size > 0) trozos.current.push(evento.data);
      };

      rec.onstop = () => {
        // Soltar el micrófono apaga el indicador rojo del sistema. Va acá y no
        // en el botón porque hay dos caminos hacia el stop (enviar y cancelar).
        stream.getTracks().forEach((t) => t.stop());

        const ms = Date.now() - inicioGrabacion.current;
        const trozosGrabados = trozos.current;
        trozos.current = [];

        if (cancelada.current || trozosGrabados.length === 0) return;

        // Menos de un segundo es casi siempre un toque accidental en el botón.
        if (ms < 1000) {
          setError("La grabación fue muy corta.");
          return;
        }

        // El tipo se recorta antes del ";codecs=..." porque el servidor valida
        // contra una lista de tipos base.
        const tipoBase = formato.split(";")[0];
        const extension = tipoBase.includes("mp4") ? "m4a" : tipoBase.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(trozosGrabados, { type: tipoBase });

        enviarAdjunto(new File([blob], `audio-${Date.now()}.${extension}`, { type: tipoBase }), ms);
      };

      rec.start();
      grabadora.current = rec;
      setGrabando(true);
      setMsGrabados(0);

      cronometro.current = setInterval(() => {
        const transcurrido = Date.now() - inicioGrabacion.current;
        setMsGrabados(transcurrido);
        // Corte de seguridad: a los 5 minutos se envía solo, antes de acercarse
        // al límite de tamaño del servidor.
        if (transcurrido > 5 * 60 * 1000) detenerGrabacion(false);
      }, 200);
    } catch (e) {
      console.error("No se pudo abrir el micrófono", e);
      setError(
        "No se pudo usar el micrófono. Revisa que la app tenga permiso de grabación en los ajustes del teléfono."
      );
    }
  };

  const detenerGrabacion = (cancelar: boolean) => {
    cancelada.current = cancelar;
    if (cronometro.current) {
      clearInterval(cronometro.current);
      cronometro.current = null;
    }
    grabadora.current?.stop();
    grabadora.current = null;
    setGrabando(false);
    setMsGrabados(0);
  };

  if (!conversation) return <div className="p-8 text-center text-slate-400">Cargando chat...</div>;

  // En el chat web sí sabemos si la persona sigue con la ventana abierta: el
  // widget marca su presencia cada vez que consulta por mensajes nuevos.
  const esChatWeb = conversation.platform === "web";
  const visitanteEnLinea =
    esChatWeb &&
    conversation.visitorLastSeenAt &&
    Date.now() - new Date(conversation.visitorLastSeenAt).getTime() < 60_000;

  // Los adjuntos solo viajan por el chat de la web. Messenger e Instagram
  // exigen subir el archivo a la API de Meta primero, que no está construido;
  // mostrar los botones ahí prometería algo que el servidor va a rechazar.
  const puedeAdjuntar = esChatWeb;

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
            {conversation.platform === "web" ? (
                <Globe size={10} className="text-emerald-600" />
            ) : conversation.platform === "facebook" ? (
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
             {esChatWeb ? (
               <>
                 <div className={`w-1.5 h-1.5 rounded-full ${visitanteEnLinea ? "bg-green-500 animate-pulse" : "bg-slate-300"}`} />
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                   {visitanteEnLinea ? "En la página ahora" : "Salió de la página"}
                 </span>
               </>
             ) : (
               <>
                 <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">En Línea</span>
               </>
             )}
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

          // El tipo del adjunto viene de la tabla MessageMedia. Los mensajes
          // antiguos de Instagram solo tienen mediaUrl y siempre son imágenes,
          // así que ese es el valor por omisión.
          const tipoAdjunto = msg.media?.kind || (msg.mediaUrl ? "image" : null);

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

                {tipoAdjunto === "image" && msg.mediaUrl && (
                  <div className="mb-2 rounded-xl overflow-hidden border border-slate-100 shadow-sm transition-all hover:scale-[1.02] cursor-zoom-in">
                    <img
                        src={msg.mediaUrl}
                        alt="Adjunto"
                        className="max-w-full h-auto object-contain bg-slate-50"
                        onClick={() => window.open(msg.mediaUrl, '_blank')}
                    />
                  </div>
                )}

                {tipoAdjunto === "audio" && msg.mediaUrl && (
                  <div className="mb-2 min-w-[220px]">
                    {/* Reproductor nativo a propósito: uno propio tendría que
                        resolver buffering, seek y formatos por su cuenta, y en
                        el WebView del APK el nativo es el que mejor se porta. */}
                    <audio
                      controls
                      preload="metadata"
                      src={msg.mediaUrl}
                      className="w-full h-10"
                    />
                    {msg.media?.durationMs ? (
                      <div className={`text-[10px] font-bold mt-1 ${isMe ? "text-white/70" : "text-slate-400"}`}>
                        {duracion(msg.media.durationMs)}
                      </div>
                    ) : null}
                  </div>
                )}

                {tipoAdjunto === "video" && msg.mediaUrl && (
                  <div className="mb-2 rounded-xl overflow-hidden border border-slate-100 shadow-sm">
                    <video
                      controls
                      preload="metadata"
                      src={msg.mediaUrl}
                      playsInline
                      className="max-w-full h-auto bg-black"
                    />
                  </div>
                )}

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

      {error && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2">
          <AlertCircle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-[12px] text-red-700 leading-snug flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-[10px] font-black text-red-400 uppercase">
            Ok
          </button>
        </div>
      )}

      {/* Input Bar */}
      {grabando ? (
        /* Barra de grabación: reemplaza la de escritura para que no quede
           ninguna duda de que el micrófono está abierto. */
        <div className="p-4 bg-white border-t border-slate-100 flex gap-3 items-center pb-8">
          <button
            type="button"
            onClick={() => detenerGrabacion(true)}
            aria-label="Descartar grabación"
            className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center active:scale-95 transition-all"
          >
            <Trash2 size={20} />
          </button>

          <div className="flex-1 flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl px-4 h-12">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <span className="text-sm font-bold text-red-700 tabular-nums">{duracion(msGrabados)}</span>
            <span className="text-[10px] font-black text-red-400 uppercase tracking-widest truncate">
              Grabando
            </span>
          </div>

          <button
            type="button"
            onClick={() => detenerGrabacion(false)}
            aria-label="Enviar grabación"
            className="w-12 h-12 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 active:scale-95 transition-all"
          >
            <Square size={18} fill="currentColor" />
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSend}
          className="p-4 bg-white border-t border-slate-100 flex gap-2 items-center pb-8"
        >
          {puedeAdjuntar && (
            <>
              <input
                ref={inputArchivo}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={alElegirArchivo}
              />
              <button
                type="button"
                onClick={() => inputArchivo.current?.click()}
                disabled={sending}
                aria-label="Adjuntar foto o video"
                className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center active:scale-95 transition-all disabled:opacity-50 flex-shrink-0"
              >
                <Paperclip size={20} />
              </button>
            </>
          )}

          <div className="flex-1 relative">
            <input
              type="text"
              placeholder={sending ? "Enviando..." : "Escribe tu respuesta..."}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all outline-none"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
          </div>

          {/* El micrófono se cambia por el avión de papel apenas hay texto
              escrito, igual que en WhatsApp: en un teclado de teléfono no caben
              los dos y la acción esperada es siempre la del texto. */}
          {puedeAdjuntar && !inputText.trim() ? (
            <button
              type="button"
              onClick={empezarAGrabar}
              disabled={sending}
              aria-label="Grabar mensaje de voz"
              className="w-12 h-12 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 flex-shrink-0"
            >
              {sending ? <Loader2 size={20} className="animate-spin" /> : <Mic size={20} />}
            </button>
          ) : (
            <button
              type="submit"
              disabled={!inputText.trim() || sending}
              className="w-12 h-12 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 flex-shrink-0"
            >
              {sending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
