'use client';

import { useState, useEffect } from 'react';
import { Clock, ChefHat, Truck, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { iniciarPreparacion, despacharPedido } from '@/modules/orders/actions';
import { toast } from 'sonner';
import type { PedidoWithItems } from '@/modules/orders/domain/pedido';

const ZONA_LABEL: Record<string, string> = {
  amex: 'Amex',
  snack: 'Snack Bar',
  buffet: 'Buffet',
};

const ZONA_COLOR: Record<string, string> = {
  amex: 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300',
  snack: 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300',
  buffet: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
};

function useElapsed(since: Date): string {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    function calc() {
      const secs = Math.floor((Date.now() - since.getTime()) / 1000);
      if (secs < 60) return `${secs}s`;
      const mins = Math.floor(secs / 60);
      const s = secs % 60;
      return `${mins}m ${s.toString().padStart(2, '0')}s`;
    }
    setElapsed(calc());
    const id = setInterval(() => setElapsed(calc()), 1000);
    return () => clearInterval(id);
  }, [since]);

  return elapsed;
}

function urgencyClass(since: Date, estado: string): string {
  if (estado === 'despachado') return '';
  const mins = (Date.now() - since.getTime()) / 60000;
  if (mins > 15) return 'ring-2 ring-red-500 animate-pulse';
  if (mins > 8) return 'ring-2 ring-amber-500';
  return '';
}

interface PedidoCardProps {
  pedido: PedidoWithItems;
  onStateChange: (pedidoId: string, nuevoEstado: string) => void;
}

export function PedidoCard({ pedido, onStateChange }: PedidoCardProps) {
  const [loading, setLoading] = useState(false);
  const elapsed = useElapsed(
    pedido.estado === 'en_preparacion' ? pedido.updatedAt : pedido.createdAt,
  );

  const handleIniciar = async () => {
    setLoading(true);
    const result = await iniciarPreparacion(pedido.id, pedido.version);
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Preparación iniciada');
    onStateChange(pedido.id, 'en_preparacion');
  };

  const handleDespachar = async () => {
    setLoading(true);
    const result = await despacharPedido(pedido.id, pedido.version);
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Pedido despachado');
    onStateChange(pedido.id, 'despachado');
  };

  return (
    <div
      className={`rounded-lg border bg-card p-4 space-y-3 shadow-sm transition-all ${urgencyClass(pedido.createdAt, pedido.estado)}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="font-semibold text-sm leading-tight">
            {pedido.numeroMesa ? pedido.numeroMesa : 'Sin mesa'}
          </p>
          <span
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${ZONA_COLOR[pedido.zona] ?? ''}`}
          >
            <UtensilsCrossed className="h-3 w-3" />
            {ZONA_LABEL[pedido.zona] ?? pedido.zona}
          </span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground text-xs shrink-0">
          <Clock className="h-3 w-3" />
          <span className="font-mono tabular-nums">{elapsed}</span>
        </div>
      </div>

      {/* Items */}
      <ul className="space-y-1.5">
        {pedido.items.map((item) => (
          <li key={item.id} className="text-sm">
            <span className="font-medium">{item.cantidad}×</span> <span>{item.recetaNombre}</span>
            {item.notas && (
              <p className="text-xs text-muted-foreground ml-4 italic">↳ {item.notas}</p>
            )}
          </li>
        ))}
      </ul>

      {/* Notas del pedido */}
      {pedido.notas && (
        <p className="text-xs text-muted-foreground border-t pt-2 italic">{pedido.notas}</p>
      )}

      {/* Actions */}
      <div className="pt-1">
        {pedido.estado === 'creado' && (
          <Button size="sm" className="w-full" onClick={handleIniciar} disabled={loading}>
            <ChefHat className="h-4 w-4 mr-1.5" />
            Iniciar preparación
          </Button>
        )}
        {pedido.estado === 'en_preparacion' && (
          <Button
            size="sm"
            variant="secondary"
            className="w-full"
            onClick={handleDespachar}
            disabled={loading}
          >
            <Truck className="h-4 w-4 mr-1.5" />
            Despachar
          </Button>
        )}
        {pedido.estado === 'despachado' && (
          <Badge variant="outline" className="w-full justify-center py-1.5 text-xs">
            Esperando confirmación del mesero
          </Badge>
        )}
      </div>
    </div>
  );
}
