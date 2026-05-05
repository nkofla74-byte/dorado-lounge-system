import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getPersonal } from './actions';
import { PersonalPanel } from '@/components/admin/personal-panel';

export default async function PersonalPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const role = user.app_metadata?.role as string | undefined;
  if (role !== 'admin' && role !== 'superuser') redirect('/');

  const result = await getPersonal();
  const users = result.ok ? result.value : [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Personal</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestiona los usuarios y roles de tu organización
        </p>
      </div>

      {!result.ok && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3">
          Error al cargar usuarios: {result.error.message}
        </div>
      )}

      <PersonalPanel initialUsers={users} currentUserId={user.id} />
    </div>
  );
}
