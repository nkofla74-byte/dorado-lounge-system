'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { generateMesaToken } from '@/lib/qr/token';
import { ok, err, toAppError } from '@/lib/result';
import type { Result } from '@/lib/result';
import type { ZonaServicio } from '@dorado/shared-types';

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

    const baseUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? '';
    const url = `${baseUrl}/qr/${input.locale}?t=${token}`;

    return ok({ url, token });
  } catch (e) {
    return err(toAppError(e));
  }
}
