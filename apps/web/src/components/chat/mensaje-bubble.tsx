import { cn } from '@/lib/utils';
import type { Mensaje } from '@/modules/chat/domain/mensaje';

interface MensajeBubbleProps {
  mensaje: Mensaje;
  esPropio: boolean;
}

function formatHora(date: Date): string {
  return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

export function MensajeBubble({ mensaje, esPropio }: MensajeBubbleProps) {
  const esAlerta = mensaje.tipo === 'alert' || mensaje.tipo === 'broadcast';

  if (esAlerta) {
    return (
      <div className="flex justify-center my-1">
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-md px-3 py-1.5 text-xs max-w-[85%] text-center">
          <span className="font-medium">{mensaje.remitenteNombre}:</span> {mensaje.contenido}
          <span className="ml-2 opacity-60">{formatHora(mensaje.createdAt)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex gap-2 mb-1', esPropio ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar inicial */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground mt-1">
        {mensaje.remitenteNombre.charAt(0).toUpperCase()}
      </div>

      <div className={cn('flex flex-col max-w-[75%]', esPropio ? 'items-end' : 'items-start')}>
        {!esPropio && (
          <span className="text-[11px] text-muted-foreground mb-0.5 px-1">
            {mensaje.remitenteNombre}
          </span>
        )}
        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-sm leading-relaxed break-words',
            esPropio
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted text-foreground rounded-tl-sm',
          )}
        >
          {mensaje.contenido}
        </div>
        <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
          {formatHora(mensaje.createdAt)}
        </span>
      </div>
    </div>
  );
}
