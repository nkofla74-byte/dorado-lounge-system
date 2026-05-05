import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getTenantById, getUsers } from '@/modules/superuser/actions';
import { UsersPanel } from '@/components/superuser/users-panel';

interface Props {
  params: { tenantId: string };
}

export default async function TenantDetailPage({ params }: Props) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.app_metadata?.role !== 'superuser') redirect('/');

  const [tenantResult, usersResult] = await Promise.all([
    getTenantById(params.tenantId),
    getUsers(params.tenantId),
  ]);

  if (!tenantResult.ok || !tenantResult.value) notFound();

  const tenant = tenantResult.value;
  const users = usersResult.ok ? usersResult.value : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/tenants"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tenant.nombre}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{tenant.slug}</code>
            <span className="ml-2">{tenant.activo ? '· Activo' : '· Inactivo'}</span>
          </p>
        </div>
      </div>

      {!usersResult.ok && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3">
          Error al cargar usuarios: {usersResult.error.message}
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Usuarios</h2>
        <UsersPanel tenantId={tenant.id} initialUsers={users} />
      </div>
    </div>
  );
}
