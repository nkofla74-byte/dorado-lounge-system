'use client';

import { useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TabDef<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface TabBarProps<T extends string> {
  tabs: TabDef<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Nombre del grupo para lectores de pantalla. */
  ariaLabel: string;
  /** Prefijo de los `id`, para que dos barras en la misma página no colisionen. */
  idPrefix: string;
  className?: string;
}

/**
 * Barra de pestañas con el contrato ARIA completo.
 *
 * Existía dos veces escrita a mano —en el hub de inventario y en pedidos— y
 * cada copia estaba rota de una forma distinta: una anunciaba `role="tablist"`
 * sin implementar la navegación por flechas que ese rol promete, y la otra no
 * declaraba rol ninguno, así que un lector de pantalla leía botones sueltos sin
 * decir cuál estaba activo. Ninguna de las dos enlazaba pestaña con panel.
 *
 * El panel lo pinta quien la usa, con `panelProps(value)`.
 */
export function TabBar<T extends string>({
  tabs,
  value,
  onValueChange,
  ariaLabel,
  idPrefix,
  className,
}: TabBarProps<T>) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function alPulsarTecla(e: React.KeyboardEvent) {
    const i = tabs.findIndex((t) => t.value === value);
    let destino: T | undefined;
    if (e.key === 'ArrowRight') destino = tabs[(i + 1) % tabs.length]?.value;
    else if (e.key === 'ArrowLeft') destino = tabs[(i - 1 + tabs.length) % tabs.length]?.value;
    else if (e.key === 'Home') destino = tabs[0]?.value;
    else if (e.key === 'End') destino = tabs[tabs.length - 1]?.value;
    if (!destino) return;
    e.preventDefault();
    onValueChange(destino);
    refs.current[destino]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={alPulsarTecla}
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1',
        className,
      )}
    >
      {tabs.map(({ value: v, label, icon: Icon }) => {
        const activa = v === value;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${v}`}
            aria-selected={activa}
            aria-controls={`${idPrefix}-panel-${v}`}
            // Tabindex móvil: el tabulador entra al grupo por la pestaña activa
            // en lugar de recorrerlas todas una por una.
            tabIndex={activa ? 0 : -1}
            ref={(el) => {
              refs.current[v] = el;
            }}
            onClick={() => onValueChange(v)}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-body font-medium',
              'transition-colors duration-200 ease-smooth',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              activa
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {Icon && <Icon className="size-5" aria-hidden="true" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Atributos del panel asociado a una pestaña. */
export function panelProps(idPrefix: string, value: string, activa: boolean) {
  return {
    role: 'tabpanel' as const,
    id: `${idPrefix}-panel-${value}`,
    'aria-labelledby': `${idPrefix}-tab-${value}`,
    hidden: !activa,
  };
}
