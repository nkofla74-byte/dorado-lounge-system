// Utilidades públicas del módulo inventory — funciones puras sin side effects.
// Otros módulos importan desde aquí en lugar de domain/ para preservar
// la dirección de dependencias hexagonales.

export {
  cantidadConMerma,
  mermaAbsoluta,
  aplicarMermaRecepcion,
  costoUnitarioNeto,
  MermaError,
} from './domain/merma';
export type { Lote, Insumo, CreateLoteInput, CreateInsumoInput } from './domain/insumo';
