import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getPersonal } from './actions';
import { PersonalPanel } from '@/components/admin/personal-panel';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.personal');
  return { title: t('metaTitle') };
}

export default async function PersonalPage() {
  const t = await getTranslations('admin.personal');
  const supabase = await createClient();
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
        <h1 className="text-display font-semibold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('pageSubtitle')}</p>
      </div>

      {!result.ok && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3">
          {t('errorCarga', { message: result.error.message })}
        </div>
      )}

      <PersonalPanel initialUsers={users} currentUserId={user.id} />
    </div>
  );
}
