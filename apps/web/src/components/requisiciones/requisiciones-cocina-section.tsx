'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { PedirInsumosDialog, type InsumoOption } from './pedir-insumos-dialog';
import { RequisicionesPanel } from './requisiciones-panel';
import type {
  AreaSolicitante,
  RequisicionWithItems,
} from '@/modules/requisiciones/domain/requisicion';

interface RequisicionesCocinaSectionProps {
  area: AreaSolicitante;
  insumos: InsumoOption[];
  initialRequisiciones: RequisicionWithItems[];
}

// Sección montada en cada KDS: botón "Pedir insumos" + mis requisiciones al almacén.
export function RequisicionesCocinaSection({
  area,
  insumos,
  initialRequisiciones,
}: RequisicionesCocinaSectionProps) {
  const t = useTranslations('requisiciones');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <section className="space-y-3 p-4 border-t border-border">
      <div className="flex items-center justify-between">
        <h2 className="text-headline font-semibold tracking-tight">{t('panel.tituloCocina')}</h2>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          {t('pedir.boton')}
        </Button>
      </div>

      <RequisicionesPanel
        key={refreshKey}
        mode="cocina"
        area={area}
        initialRequisiciones={initialRequisiciones}
      />

      <PedirInsumosDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => {
          setDialogOpen(false);
          setRefreshKey((k) => k + 1);
        }}
        area={area}
        insumos={insumos}
      />
    </section>
  );
}
