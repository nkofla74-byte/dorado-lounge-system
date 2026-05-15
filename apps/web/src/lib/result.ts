export interface AppErrorPayload {
  code: string;
  httpStatus: number;
  message: string;
  meta?: Record<string, unknown>;
}

export type Result<T, E = AppErrorPayload> = { ok: true; value: T } | { ok: false; error: E };

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
    message: string,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err(error: AppError): Result<never>;
export function err<E>(error: E): Result<never, E>;
export function err<E>(error: E): Result<never, E | AppErrorPayload> {
  if (isAppError(error)) {
    const payload: AppErrorPayload = {
      code: error.code,
      httpStatus: error.httpStatus,
      message: error.message,
    };
    if (error.meta) payload.meta = error.meta;

    return {
      ok: false,
      error: payload,
    };
  }

  return { ok: false, error };
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

// Extrae el valor o lanza el error. Solo usar cuando el error es irrecuperable.
export function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  throw result.error;
}

// Convierte cualquier excepción desconocida en AppError para devolución uniforme.
// Los errores inesperados (no AppError) se capturan en Sentry con el stacktrace completo.
export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;

  // Capturar en Sentry solo en runtime Node.js (no en tests ni en cliente)
  if (typeof process !== 'undefined' && process.env['NODE_ENV'] !== 'test') {
    try {
      // Import dinámico para evitar bundlear Sentry en paths que no lo necesitan
      void import('@sentry/nextjs').then(({ captureException }) => captureException(e));
    } catch {
      // Si Sentry no está disponible, continuar sin interrumpir
    }
  }

  const message = e instanceof Error ? e.message : String(e);
  return new AppError('INTERNAL_ERROR', 500, message);
}
