import { redirect } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Sidebar, MobileTopBar } from '@/components/layout/sidebar';
import { OfflineBanner } from '@/components/layout/offline-banner';
import { SocketProvider } from '@/lib/socket/socket-provider';
import { ChatPanel } from '@/components/chat/chat-panel';
import { CHANNELS, type UserRole, type Channel } from '@dorado/shared-types';

// Canal de chat por rol — cada nodo habla en su sala operativa
const ROLE_CHAT_CHANNEL: Partial<Record<UserRole, Channel>> = {
  chef: CHANNELS.COCINA,
  sous_chef: CHANNELS.COCINA_AMEX,
  admin: CHANNELS.ADMIN,
  superuser: CHANNELS.ADMIN,
  mesero_amex: CHANNELS.AMEX,
  recepcion: CHANNELS.AMEX,
  personal_snack: CHANNELS.SNACK,
  personal_buffet: CHANNELS.BUFFET,
  personal_pasteleria: CHANNELS.BROADCAST_COCINA,
  steward: CHANNELS.BROADCAST_COCINA,
  personal_almacen: CHANNELS.BROADCAST_ADMIN,
};

const ROLE_CHAT_TITULO: Partial<Record<UserRole, string>> = {
  chef: 'Cocina',
  sous_chef: 'Cocina Amex',
  admin: 'Admin',
  superuser: 'Admin',
  mesero_amex: 'Sala Amex',
  recepcion: 'Sala Amex',
  personal_snack: 'Snack',
  personal_buffet: 'Buffet',
  personal_pasteleria: 'Producción',
  steward: 'Producción',
  personal_almacen: 'Almacén',
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const [{ data: userData }, { data: sessionData }, messages, locale] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
    getMessages(),
    getLocale(),
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
    'Usuario';

  const token = sessionData.session?.access_token ?? '';
  const chatCanal = ROLE_CHAT_CHANNEL[role] ?? null;
  const chatTitulo = ROLE_CHAT_TITULO[role] ?? 'Chat';

  const sidebarUser = { name, email: user.email ?? '', role };

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <SocketProvider token={token}>
        <div className="flex min-h-screen bg-background">
          <Sidebar user={sidebarUser} locale={locale as 'es' | 'en'} />
          <div className="flex-1 min-w-0 flex flex-col">
            <MobileTopBar user={sidebarUser} locale={locale as 'es' | 'en'} />
            <OfflineBanner />
            <main className="flex-1 min-w-0 overflow-y-auto safe-pb">{children}</main>
          </div>
        </div>

        {/* Chat flotante — solo para roles con canal de chat asignado */}
        {chatCanal && <ChatPanel canal={chatCanal} userId={user.id} titulo={chatTitulo} />}
      </SocketProvider>
    </NextIntlClientProvider>
  );
}
