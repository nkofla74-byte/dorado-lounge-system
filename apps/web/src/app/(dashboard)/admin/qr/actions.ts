'use server';

import { headers } from 'next/headers';
import { assertCan } from '@/lib/auth/assertCan';
import { generateMesaToken } from '@/lib/qr/token';
import { ok, err, toAppError } from '@/lib/result';
import type { Result } from '@/lib/result';
import type { ZonaServicio } from '@dorado/shared-types';

function resolveBaseUrl(): string {
  const explicit = process.env['NEXT_PUBLIC_APP_URL'];
  if (explicit) return explicit.replace(/\/+$/, '');

  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (host) {
    const proto = h.get('x-forwarded-proto') ?? 'https';
    return `${proto}://${host}`;
  }

  const vercelUrl = process.env['VERCEL_URL'];
  if (vercelUrl) return `https://${vercelUrl}`;

  return '';
}

export async function generateQRLink(input: {
  mesaNumero: string;
  zona: ZonaServicio;
  locale: string;
}): Promise<Result<{ url: string; token: string }>> {
  try {
    const ctx = await assertCan('orders:create');

    const token = await generateMesaToken({
      tenantId: ctx.tenantId,
      zona: input.zona,
      mesaNumero: input.mesaNumero,
    });

    const baseUrl = resolveBaseUrl();
    const url = `${baseUrl}/qr/${input.locale}?t=${token}`;

    return ok({ url, token });
  } catch (e) {
    return err(toAppError(e));
  }
}
