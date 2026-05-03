import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const ROLE_HOME: Record<string, string> = {
  mesero_amex: '/pedidos',
};

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const role = user.app_metadata?.role as string | undefined;
  redirect(ROLE_HOME[role ?? ''] ?? '/inventario');
}
