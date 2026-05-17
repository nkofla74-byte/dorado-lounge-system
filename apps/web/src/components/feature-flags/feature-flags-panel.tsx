'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { setFeatureFlag, createFeatureFlag } from '@/modules/feature-flags/actions';
import { toast } from 'sonner';
import { Plus, Globe, Building2 } from 'lucide-react';
import type { FeatureFlag } from '@/modules/feature-flags/domain/feature-flag';

interface FeatureFlagsPanelProps {
  flags: FeatureFlag[];
  canWrite: boolean;
}

function FlagRow({ flag, canWrite }: { flag: FeatureFlag; canWrite: boolean }) {
  const t = useTranslations('admin.featureFlags');
  const [valor, setValor] = useState(flag.valor);
  const [pending, startTransition] = useTransition();

  const handleToggle = (checked: boolean) => {
    if (!canWrite) return;
    setValor(checked);
    startTransition(async () => {
      const result = await setFeatureFlag(flag.clave, checked);
      if (!result.ok) {
        setValor(!checked);
        toast.error(result.error.message);
      } else {
        toast.success(
          checked
            ? t('activadoToast', { clave: flag.clave })
            : t('desactivadoToast', { clave: flag.clave }),
        );
      }
    });
  };

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 shrink-0 text-muted-foreground">
          {flag.tenantId === null ? (
            <Globe className="h-4 w-4" aria-label={t('flagGlobal')} />
          ) : (
            <Building2 className="h-4 w-4" aria-label={t('flagTenant')} />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-mono font-medium truncate">{flag.clave}</p>
          {flag.descripcion && (
            <p className="text-xs text-muted-foreground mt-0.5">{flag.descripcion}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        <Badge variant={valor ? 'default' : 'secondary'} className="text-[10px]">
          {valor ? 'ON' : 'OFF'}
        </Badge>
        <Switch
          checked={valor}
          onCheckedChange={handleToggle}
          disabled={!canWrite || pending}
          aria-label={t('toggleAria', { clave: flag.clave })}
        />
      </div>
    </div>
  );
}

function CreateFlagDialog({ onCreated }: { onCreated: () => void }) {
  const t = useTranslations('admin.featureFlags');
  const tC = useTranslations('admin.featureFlags.create');
  const [open, setOpen] = useState(false);
  const [clave, setClave] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [pending, startTransition] = useTransition();

  const handleCreate = () => {
    if (!clave.trim()) return;
    startTransition(async () => {
      const trimmedDesc = descripcion.trim();
      const result = await createFeatureFlag({
        clave: clave.trim(),
        ...(trimmedDesc ? { descripcion: trimmedDesc } : {}),
      });
      if (!result.ok) {
        toast.error(result.error.message);
      } else {
        toast.success(t('creadoToast', { clave }));
        setClave('');
        setDescripcion('');
        setOpen(false);
        onCreated();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          {t('nuevoFlag')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tC('title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="clave">{tC('clave')}</Label>
            <Input
              id="clave"
              placeholder={tC('clavePlaceholder')}
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">{tC('claveHint')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">{tC('descripcion')}</Label>
            <Input
              id="desc"
              placeholder={tC('descripcionPlaceholder')}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
          <Button onClick={handleCreate} disabled={!clave.trim() || pending} className="w-full">
            {pending ? tC('creando') : tC('crear')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FeatureFlagsPanel({ flags: initialFlags, canWrite }: FeatureFlagsPanelProps) {
  const t = useTranslations('admin.featureFlags');
  const [flags] = useState(initialFlags);

  const globalFlags = flags.filter((f) => f.tenantId === null);
  const tenantFlags = flags.filter((f) => f.tenantId !== null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {t('count', { n: flags.length })}
            {!canWrite && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">{t('soloLectura')}</span>
            )}
          </p>
        </div>
        {canWrite && <CreateFlagDialog onCreated={() => window.location.reload()} />}
      </div>

      {tenantFlags.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {t('tenantFlagsTitle')}
            </CardTitle>
            <CardDescription>{t('tenantFlagsDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {tenantFlags.map((f) => (
              <FlagRow key={f.id} flag={f} canWrite={canWrite} />
            ))}
          </CardContent>
        </Card>
      )}

      {globalFlags.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" />
              {t('globalFlagsTitle')}
            </CardTitle>
            <CardDescription>{t('globalFlagsDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {globalFlags.map((f) => (
              <FlagRow key={f.id} flag={f} canWrite={canWrite} />
            ))}
          </CardContent>
        </Card>
      )}

      {flags.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t('emptyTitle')}
            {canWrite && ` ${t('emptyHint')}`}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
