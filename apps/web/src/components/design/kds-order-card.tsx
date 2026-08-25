'use client';

import { useTranslations } from 'next-intl';
import { Clock, Flame, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Implementación de referencia del sistema de diseño (skill `dorado-design-system`).
// Es la prueba de validación del stack Apple HIG y la semilla del rediseño del KDS.
// Cada requisito HIG está anotado en el punto donde se aplica.

type EstadoItem = 'pendiente' | 'en_preparacion' | 'listo';

export interface KdsOrderCardProps {
  numeroMesa: string;
  minutosTranscurridos: number;
  umbralDemoraMin: number;
  items: { id: string; nombre: string; cantidad: number; estado: EstadoItem }[];
  onAvanzar: (itemId: string) => void;
}

// El color NUNCA es el único canal: cada estado lleva icono propio (§4).
const ICONO_ESTADO = {
  pendiente: Clock,
  en_preparacion: Flame,
  listo: CheckCircle2,
} as const;

// Colores semánticos desde las variables de globals.css — ningún hex suelto.
const ESTILO_ESTADO: Record<EstadoItem, string> = {
  pendiente: 'text-muted-foreground',
  en_preparacion: 'text-primary',
  listo: 'text-senal-ok',
};

export function KdsOrderCard({
  numeroMesa,
  minutosTranscurridos,
  umbralDemoraMin,
  items,
  onAvanzar,
}: KdsOrderCardProps) {
  const t = useTranslations('higValidacion');
  const demorado = minutosTranscurridos >= umbralDemoraMin;

  return (
    <article
      // Espaciado en la escala de 8 pt (gap-2 = 8px, p-4 = 16px).
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm"
      aria-labelledby={`mesa-${numeroMesa}`}
    >
      {/* MATERIAL «Liquid Glass»: solo en la cabecera flotante, nunca tras los
          datos operativos. Fallback opaco si el navegador no soporta blur. */}
      <header
        className={cn(
          'sticky top-0 -mx-4 -mt-4 flex items-center justify-between gap-4',
          'rounded-t-xl border-b border-border/50 px-4 py-3',
          'bg-card/80 backdrop-blur-xl supports-[backdrop-filter]:bg-card/60',
          // Reduce Transparency: se cae a color sólido.
          'motion-reduce:backdrop-blur-none',
        )}
      >
        <h3 id={`mesa-${numeroMesa}`} className="text-base font-semibold tracking-tight">
          {t('mesa', { numero: numeroMesa })}
        </h3>

        {/* DYNAMIC TYPE: clamp() en rem — escala con la preferencia del sistema
            y sobrevive al zoom del navegador al 200 %. */}
        <span
          className={cn(
            'font-mono font-semibold tabular-nums',
            demorado ? 'text-destructive' : 'text-muted-foreground',
          )}
          style={{ fontSize: 'clamp(1.25rem, 1rem + 1.2vw, 2rem)' }}
          // VoiceOver: el cronómetro cambia solo; se anuncia sin robar el foco.
          aria-live="polite"
          aria-label={t('tiempoTranscurrido', { minutos: minutosTranscurridos })}
        >
          {minutosTranscurridos}′
        </span>
      </header>

      {demorado && (
        <p
          role="status"
          className={cn(
            'flex items-center gap-2 rounded-lg bg-destructive/10 p-3',
            'text-sm font-medium text-destructive',
            // MOTION: solo anima si el usuario no pidió menos movimiento.
            'motion-safe:animate-pulse motion-reduce:animate-none',
          )}
        >
          <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
          {t('demora', { umbral: umbralDemoraMin })}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const Icono = ICONO_ESTADO[item.estado];
          const esFinal = item.estado === 'listo';

          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onAvanzar(item.id)}
                disabled={esFinal}
                className={cn(
                  // TOUCH TARGET: 56 px. El mínimo HIG es 44, pero aquí se opera
                  // con guantes y con prisa (§4 de dorado-design-system).
                  'flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-left',
                  'transition-colors motion-reduce:transition-none',
                  'hover:bg-accent disabled:pointer-events-none disabled:opacity-60',
                  // Foco visible: navegable con teclado.
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
                // VoiceOver: la etiqueta describe la acción, no solo el contenido.
                aria-label={t('avanzarItem', { nombre: item.nombre, estado: t(item.estado) })}
              >
                <Icono className={cn('size-6 shrink-0', ESTILO_ESTADO[item.estado])} aria-hidden />
                <span className="flex-1 text-base">{item.nombre}</span>
                <span className="text-base font-semibold tabular-nums">×{item.cantidad}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
