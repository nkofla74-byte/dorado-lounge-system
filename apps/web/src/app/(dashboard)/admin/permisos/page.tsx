import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { PermissionMatrix } from '@/components/rbac/permission-matrix';
import type { UserRole } from '@dorado/shared-types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.permisos');
  return { title: t('metaTitle') };
}

export default async function PermisosPage() {
  const t = await getTranslations('admin.permisos');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = user?.app_metadata?.role as UserRole | undefined;
  if (!role || !['admin', 'superuser'].includes(role)) redirect('/');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('pageSubtitleA')}
          <strong>{t('superuser')}</strong>
          {t('pageSubtitleB')}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">lib/auth/permissions.ts</code>.
        </p>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-emerald-500" />
          {t('permitido')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-muted-foreground/30" />
          {t('sinAcceso')}
        </span>
        <span className="ml-auto text-muted-foreground/60 italic">{t('superuserAccesoTotal')}</span>
      </div>

      <PermissionMatrix />
    </div>
  );
}
