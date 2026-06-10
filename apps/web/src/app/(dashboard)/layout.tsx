import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Sidebar, MobileTopBar } from '@/components/layout/sidebar';
import { OfflineBanner } from '@/components/layout/offline-banner';
import { SocketProvider } from '@/lib/socket/socket-provider';
import { ChatPanel } from '@/components/chat/chat-panel';
import { TurnoGuard } from '@/components/turnos/turno-guard';
import { getMiTurnoActivo } from '@/modules/turnos/actions';
import { CHANNELS, type UserRole, type Channel } from '@dorado/shared-types';

// Canal de chat por rol — cada nodo habla en su sala operativa
const ROLE_CHAT_CHANNEL: Partial<Record<UserRole, Channel>> = {
  chef: CHANNELS.COCINA,
  chef_cocina_fria: CHANNELS.COCINA_FRIA,
  chef_cocina_caliente: CHANNELS.COCINA_CALIENTE,
  sous_chef: CHANNELS.COCINA_AMEX,
  admin: CHANNELS.ADMIN,
  superuser: CHANNELS.ADMIN,
  mesero_amex: CHANNELS.AMEX,
  personal_pasteleria: CHANNELS.BROADCAST_COCINA,
  steward: CHANNELS.BROADCAST_COCINA,
  personal_almacen: CHANNELS.BROADCAST_ADMIN,
};

type ChatTituloKey =
  | 'chef'
  | 'chef_cocina_fria'
  | 'chef_cocina_caliente'
  | 'sous_chef'
  | 'admin'
  | 'mesero_amex'
  | 'personal_pasteleria'
  | 'steward'
  | 'personal_almacen'
  | 'default';

const CHAT_TITULO_KEYS: Partial<Record<UserRole, ChatTituloKey>> = {
  chef: 'chef',
  chef_cocina_fria: 'chef_cocina_fria',
  chef_cocina_caliente: 'chef_cocina_caliente',
  sous_chef: 'sous_chef',
  admin: 'admin',
  superuser: 'admin',
  mesero_amex: 'mesero_amex',
  personal_pasteleria: 'personal_pasteleria',
  steward: 'steward',
  personal_almacen: 'personal_almacen',
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const [{ data: userData }, locale, tLayout, tChatTitulo] = await Promise.all([
    supabase.auth.getUser(),
    getLocale(),
    getTranslations('layout'),
    getTranslations('layout.chatTitulo'),
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
  const chatCanal = ROLE_CHAT_CHANNEL[role] ?? null;
  const chatTitulo = tChatTitulo(CHAT_TITULO_KEYS[role] ?? 'default');

  const sidebarUser = { name, email: user.email ?? '', role };

  // Fetch del turno activo del usuario (null si no tiene). Solo aplica a roles
  // operativos — admin/superuser quedan excluidos dentro del TurnoGuard.
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

      {/* Chat flotante — solo para roles con canal de chat asignado */}
      {chatCanal && <ChatPanel canal={chatCanal} userId={user.id} titulo={chatTitulo} />}
    </SocketProvider>
  );
}
