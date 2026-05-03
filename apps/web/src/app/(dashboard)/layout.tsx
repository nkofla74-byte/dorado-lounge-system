import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';
import type { UserRole } from '@dorado/shared-types';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const rawRole = user.app_metadata?.role as string | undefined;
  const tenantId = user.app_metadata?.tenant_id as string | undefined;

  if (!rawRole || !tenantId) redirect('/login');

  const role = rawRole as UserRole;
  const name =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email?.split('@')[0] ??
    'Usuario';

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar user={{ name, email: user.email ?? '', role }} />
      <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
    </div>
  );
}
