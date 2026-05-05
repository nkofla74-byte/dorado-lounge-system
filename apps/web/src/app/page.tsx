import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const ROLE_HOME: Record<string, string> = {
  superuser: '/admin/tenants',
  admin: '/inventario',
  chef: '/cocina',
  sous_chef: '/cocina',
  mesero_amex: '/pedidos',
  personal_snack: '/snack',
  personal_buffet: '/buffet',
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
