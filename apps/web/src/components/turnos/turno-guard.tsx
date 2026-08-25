'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Clock, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { iniciarTurno, cerrarTurno } from '@/modules/turnos/actions';
import { detectarBloqueActual, formatBloqueHorario } from '@/lib/turnos';
import type { UserRole } from '@dorado/shared-types';
import type { Turno } from '@/modules/turnos/domain/turno';

const ROLES_SIN_TURNO: ReadonlyArray<UserRole> = ['admin', 'superuser'];

interface Props {
  role: UserRole;
  userName: string;
  initialTurno: Turno | null;
}

export function TurnoGuard({ role, userName, initialTurno }: Props) {
  const t = useTranslations('turnoGuard');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nombre, setNombre] = useState(userName);
  const [error, setError] = useState<string | null>(null);

  const bloque = useMemo(() => detectarBloqueActual(), []);

  if (ROLES_SIN_TURNO.includes(role)) return null;

  const handleAbrir = () => {
    setError(null);
    const trimmed = nombre.trim();
    if (trimmed.length < 2) {
      setError(t('errorNombre'));
      return;
    }
    startTransition(async () => {
      const result = await iniciarTurno({ bloque, teamlider: trimmed });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(t('toastAbierto'));
      router.refresh();
    });
  };

  const handleCerrar = () => {
    if (!initialTurno) return;
    startTransition(async () => {
      const result = await cerrarTurno(initialTurno.id);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(t('toastCerrado'));
      router.refresh();
    });
  };

  // Pill flotante (esquina superior derecha) cuando hay turno activo.
  if (initialTurno) {
    return (
      <div className="fixed top-3 right-3 z-40 flex items-center gap-2 rounded-full border bg-card/95 backdrop-blur px-3 py-1.5 shadow-md">
        <span className="h-2 w-2 rounded-full bg-senal-ok animate-pulse shrink-0" />
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t(`bloque_${initialTurno.bloque ?? bloque}`)}
          </span>
          <span className="text-caption font-semibold truncate max-w-[140px]">
            {initialTurno.teamlider}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={handleCerrar}
          disabled={pending}
          aria-label={t('cerrarMiTurno')}
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  // Modal bloqueante full-screen — sin opción de cancelar.
  return (
    <Dialog open>
      <DialogContent
        showClose={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('bloque')}</Label>
            <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">{t(`bloque_${bloque}`)}</span>
              <span className="text-caption text-muted-foreground tabular-nums">
                {formatBloqueHorario(bloque)}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="empleado-nombre">{t('tuNombre')}</Label>
            <Input
              id="empleado-nombre"
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={t('tuNombrePlaceholder')}
              maxLength={120}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !pending) handleAbrir();
              }}
            />
            <p className="text-caption text-muted-foreground">{t('tuNombreHint')}</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button onClick={handleAbrir} disabled={pending} className="w-full">
            {pending ? t('abriendo') : t('abrir')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
