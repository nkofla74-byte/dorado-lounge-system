export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

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

export function err<E = AppError>(error: E): Result<never, E> {
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
export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  const message = e instanceof Error ? e.message : String(e);
  return new AppError('INTERNAL_ERROR', 500, message);
}
