'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cerrarTurno } from '@/modules/turnos/actions';
import type { Turno } from '@/modules/turnos/domain/turno';

interface CerrarTurnoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCerrado: () => void;
  turno: Turno;
}

export function CerrarTurnoDialog({
  open,
  onOpenChange,
  onCerrado,
  turno,
}: CerrarTurnoDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleCerrar = async () => {
    setError(null);
    setIsLoading(true);

    const result = await cerrarTurno(turno.id);
    setIsLoading(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    onOpenChange(false);
    onCerrado();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Cerrar turno?</DialogTitle>
          <DialogDescription>
            El turno <span className="font-medium text-foreground">{turno.nombre}</span> quedará
            cerrado y no podrá reabrirse. Esta acción queda registrada en el audit log.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive mt-2">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleCerrar} disabled={isLoading}>
            {isLoading ? 'Cerrando…' : 'Cerrar turno'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
