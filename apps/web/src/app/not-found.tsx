import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center p-6">
      <p className="text-6xl font-bold text-muted-foreground/30">404</p>
      <h2 className="text-lg font-semibold">Página no encontrada</h2>
      <Button asChild variant="outline" size="sm">
        <Link href="/inventario">Volver al inicio</Link>
      </Button>
    </div>
  );
}
