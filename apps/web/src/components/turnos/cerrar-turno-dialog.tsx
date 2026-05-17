'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('turnos');
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
          <DialogTitle>{t('cerrarTitle')}</DialogTitle>
          <DialogDescription>
            {t.rich('cerrarDescription', {
              nombre: turno.nombre,
              b: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
            })}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive mt-2">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            {t('cancelar')}
          </Button>
          <Button variant="destructive" onClick={handleCerrar} disabled={isLoading}>
            {isLoading ? t('cerrando') : t('cerrar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
