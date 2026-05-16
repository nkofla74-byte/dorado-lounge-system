'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { MessageSquare, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSocket } from '@/lib/socket/use-socket';
import { getMensajes, enviarMensaje } from '@/modules/chat/actions';
import { MensajeBubble } from './mensaje-bubble';
import { ChatInput } from './chat-input';
import { toast } from 'sonner';
import type { Mensaje } from '@/modules/chat/domain/mensaje';
import type { Channel, SocketEvent } from '@dorado/shared-types';

interface ChatPanelProps {
  canal: Channel;
  userId: string;
  titulo?: string;
}

export function ChatPanel({ canal, userId, titulo = 'Chat' }: ChatPanelProps) {
  const t = useTranslations('chat');
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [noLeidos, setNoLeidos] = useState(0);
  const [cargando, setCargando] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const socket = useSocket();

  const scrollAlFinal = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Carga inicial de mensajes al abrir el panel
  useEffect(() => {
    if (!abierto) return;
    setCargando(true);
    getMensajes(canal)
      .then((result) => {
        if (result.ok) setMensajes(result.value);
      })
      .finally(() => setCargando(false));
  }, [abierto, canal]);

  // Auto-scroll al recibir mensajes nuevos cuando el panel está abierto
  useEffect(() => {
    if (abierto && mensajes.length > 0) scrollAlFinal();
  }, [abierto, mensajes, scrollAlFinal]);

  // Socket.io: escucha MENSAJE_CHAT en el canal del panel
  useEffect(() => {
    if (!socket) return;

    socket.emit('join', canal);

    const handleEvent = (event: SocketEvent) => {
      if (event.type !== 'MENSAJE_CHAT' || event.payload.canal !== canal) return;

      const nuevo: Mensaje = {
        id: event.payload.mensajeId,
        tenantId: event.payload.tenantId,
        canal: event.payload.canal,
        remitenteId: event.payload.remitenteId,
        remitenteNombre: event.payload.remitenteNombre,
        contenido: event.payload.contenido,
        tipo: event.payload.tipo,
        createdAt: new Date(event.payload.createdAt),
      };

      setMensajes((prev) => {
        // Evita duplicados si ya lo tenemos en el estado (propio mensaje)
        if (prev.some((m) => m.id === nuevo.id)) return prev;
        return [...prev, nuevo];
      });

      if (!abierto) {
        setNoLeidos((n) => n + 1);
        toast.message(`${event.payload.remitenteNombre}: ${event.payload.contenido}`, {
          duration: 3000,
        });
      }
    };

    socket.on('event', handleEvent);
    return () => {
      socket.off('event', handleEvent);
      socket.emit('leave', canal);
    };
  }, [socket, canal, abierto]);

  const handleAbrir = () => {
    setAbierto(true);
    setNoLeidos(0);
  };

  const handleEnviar = async (contenido: string) => {
    const result = await enviarMensaje({ canal, contenido });
    if (!result.ok) {
      toast.error(t('errorEnviar'));
      return;
    }
    // El mensaje propio llega vía Socket.io broadcast (incluido el remitente)
    // Si no llega en 1s (offline), lo agregamos optimistamente
    setTimeout(() => {
      setMensajes((prev) => {
        if (prev.some((m) => m.id === result.value.id)) return prev;
        return [...prev, result.value];
      });
    }, 800);
  };

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={handleAbrir}
        className={cn(
          'fixed bottom-6 right-6 z-40 flex items-center justify-center',
          'w-12 h-12 rounded-full shadow-lg transition-all',
          'bg-primary text-primary-foreground hover:bg-primary/90',
          abierto && 'opacity-0 pointer-events-none',
        )}
        aria-label={t('abrirChat')}
      >
        <MessageSquare className="h-5 w-5" />
        {noLeidos > 0 && (
          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {noLeidos > 9 ? '9+' : noLeidos}
          </span>
        )}
      </button>

      {/* Panel de chat */}
      <div
        className={cn(
          'fixed bottom-6 right-6 z-50 flex flex-col',
          'w-80 h-[460px] rounded-xl border bg-background shadow-2xl',
          'transition-all duration-200 origin-bottom-right',
          abierto ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b rounded-t-xl bg-muted/50">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">{titulo}</span>
          </div>
          <button
            onClick={() => setAbierto(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('cerrarChat')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {cargando ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              {t('cargandoMensajes')}
            </div>
          ) : mensajes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <MessageSquare className="h-8 w-8 opacity-30" />
              <p className="text-sm">{t('sinMensajes')}</p>
            </div>
          ) : (
            mensajes.map((m) => (
              <MensajeBubble key={m.id} mensaje={m} esPropio={m.remitenteId === userId} />
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Scroll al final si hay mensajes sin ver */}
        {mensajes.length > 5 && (
          <button
            onClick={scrollAlFinal}
            className="absolute bottom-16 right-3 bg-background border rounded-full p-1 shadow-md text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('irAlFinal')}
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        )}

        {/* Input */}
        <ChatInput onEnviar={handleEnviar} />
      </div>
    </>
  );
}
