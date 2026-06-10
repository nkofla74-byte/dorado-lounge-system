import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Sidebar, MobileTopBar } from '@/components/layout/sidebar';
import { OfflineBanner } from '@/components/layout/offline-banner';
import { SocketProvider } from '@/lib/socket/socket-provider';
import { TurnoGuard } from '@/components/turnos/turno-guard';
import { getMiTurnoActivo } from '@/modules/turnos/actions';
import type { UserRole } from '@dorado/shared-types';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const [{ data: userData }, locale, tLayout] = await Promise.all([
    supabase.auth.getUser(),
    getLocale(),
    getTranslations('layout'),
  ]);

  const user = userData.user;
  if (!user) redirect('/login');

  const rawRole = user.app_metadata?.role as string | undefined;
  const tenantId = user.app_metadata?.tenant_id as string | undefined;

  if (!rawRole || !tenantId) redirect('/login');

  const role = rawRole as UserRole;
  const name =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email?.split('@')[0] ??
    tLayout('usuarioFallback');

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? '';

  const sidebarUser = { name, email: user.email ?? '', role };

  const miTurnoResult = await getMiTurnoActivo();
  const miTurno = miTurnoResult.ok ? miTurnoResult.value : null;

  return (
    <SocketProvider token={token}>
      <div className="flex min-h-screen bg-background">
        <Sidebar user={sidebarUser} locale={locale as 'es' | 'en'} />
        <div className="flex-1 min-w-0 flex flex-col">
          <MobileTopBar user={sidebarUser} locale={locale as 'es' | 'en'} />
          <OfflineBanner />
          <main className="flex-1 min-w-0 overflow-y-auto safe-pb">{children}</main>
        </div>
      </div>

      <TurnoGuard role={role} userName={name} initialTurno={miTurno} />
    </SocketProvider>
  );
}
