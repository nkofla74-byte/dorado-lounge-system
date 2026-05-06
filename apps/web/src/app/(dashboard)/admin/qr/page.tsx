import { assertCan } from '@/lib/auth/assertCan';
import { redirect } from 'next/navigation';
import { QRGeneratorClient } from '@/components/qr/qr-generator-client';

export default async function QRGeneratorPage() {
  try {
    await assertCan('orders:create');
  } catch {
    redirect('/inventario');
  }

  return (
    <div className="p-6 max-w-lg space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Generador de QR</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Genera e imprime el código QR para cada mesa. Escaneable directamente por el pasajero.
        </p>
      </div>
      <QRGeneratorClient />
    </div>
  );
}
