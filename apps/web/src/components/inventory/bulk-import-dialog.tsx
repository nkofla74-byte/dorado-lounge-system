'use client';

import { useState } from 'react';
import { Loader2, Upload, FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { createInsumosBulk } from '@/modules/inventory/actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ParsedRow {
  raw: Record<string, string>;
  parsed: {
    nombre: string;
    codigo: string | undefined;
    capa: string;
    unidadMedida: string;
    stockMinimo: number;
  };
  errors: string[];
}

const TEMPLATE_CSV =
  'nombre,codigo,capa,unidad_medida,stock_minimo\nHarina de maíz,HAR-001,capa_1,kg,10\nLeche entera,LECH-001,capa_1,l,5\nPandebono,PAN-001,capa_2,unidad,0\n';

const VALID_CAPAS = ['capa_1', 'capa_2'];
const VALID_UNIDADES = ['kg', 'g', 'l', 'ml', 'unidad', 'porcion'];

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"' && inQuotes) {
      current += '"';
      i++;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]!).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]!);
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = cells[idx] ?? '';
    });

    const errors: string[] = [];
    const nombre = raw['nombre'] ?? '';
    const codigo = raw['codigo'] ?? '';
    const capa = raw['capa'] ?? '';
    const unidad = raw['unidad_medida'] ?? '';
    const stockRaw = raw['stock_minimo'] ?? '0';

    if (!nombre) errors.push('Falta "nombre"');
    if (!VALID_CAPAS.includes(capa)) errors.push(`Capa inválida: "${capa}" (capa_1 o capa_2)`);
    if (!VALID_UNIDADES.includes(unidad))
      errors.push(`Unidad inválida: "${unidad}" (${VALID_UNIDADES.join(', ')})`);

    const stockNum = Number(stockRaw);
    if (!Number.isFinite(stockNum) || stockNum < 0)
      errors.push(`Stock mínimo inválido: "${stockRaw}"`);

    rows.push({
      raw,
      parsed: {
        nombre,
        codigo: codigo || undefined,
        capa,
        unidadMedida: unidad,
        stockMinimo: stockNum,
      },
      errors,
    });
  }

  return rows;
}

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function BulkImportDialog({ open, onOpenChange, onImported }: BulkImportDialogProps) {
  const [csvText, setCsvText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [result, setResult] = useState<{
    created: number;
    failed: { row: number; message: string }[];
  } | null>(null);

  const rows = csvText ? parseCSV(csvText) : [];
  const validRows = rows.filter((r) => r.errors.length === 0);
  const invalidRows = rows.filter((r) => r.errors.length > 0);

  const handleFile = async (file: File) => {
    const text = await file.text();
    setCsvText(text);
    setResult(null);
    setServerError('');
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setServerError('');
    const payload = validRows.map((r) => r.parsed);
    const res = await createInsumosBulk(payload);
    setSubmitting(false);
    if (!res.ok) {
      setServerError(res.error.message);
      return;
    }
    setResult(res.value);
    if (res.value.created > 0) onImported();
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      setCsvText('');
      setResult(null);
      setServerError('');
    }
    onOpenChange(next);
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-insumos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Carga masiva de insumos</DialogTitle>
          <DialogDescription>
            Importá múltiples insumos en una sola operación. Acepta archivo CSV o pegado directo.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            {/* Plantilla */}
            <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>
                  Encabezados:{' '}
                  <code className="text-xs">nombre, codigo, capa, unidad_medida, stock_minimo</code>
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                Plantilla
              </Button>
            </div>

            {/* Upload + paste */}
            <div className="space-y-2">
              <label className="flex flex-col items-center justify-center px-4 py-6 border-2 border-dashed rounded-md cursor-pointer hover:bg-accent/50 transition-colors">
                <Upload className="h-5 w-5 text-muted-foreground mb-2" />
                <span className="text-sm font-medium">Cargar archivo CSV</span>
                <span className="text-xs text-muted-foreground">o pegá el contenido abajo</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </label>

              <textarea
                value={csvText}
                onChange={(e) => {
                  setCsvText(e.target.value);
                  setResult(null);
                  setServerError('');
                }}
                rows={6}
                placeholder="nombre,codigo,capa,unidad_medida,stock_minimo&#10;Harina,HAR-001,capa_1,kg,10"
                className="w-full font-mono text-xs rounded-md border border-input bg-background px-3 py-2 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
              />
            </div>

            {/* Preview */}
            {rows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {validRows.length} válidas
                  </span>
                  {invalidRows.length > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {invalidRows.length} con errores
                    </span>
                  )}
                </div>

                {invalidRows.length > 0 && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 max-h-40 overflow-y-auto">
                    <ul className="space-y-1 text-xs">
                      {invalidRows.slice(0, 10).map((r, idx) => (
                        <li key={idx} className="text-destructive">
                          <span className="font-mono">[fila {rows.indexOf(r) + 2}]</span>{' '}
                          {r.errors.join('; ')}
                        </li>
                      ))}
                      {invalidRows.length > 10 && (
                        <li className="text-muted-foreground italic">
                          ...y {invalidRows.length - 10} más
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {serverError && (
              <Alert variant="destructive">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          // Resultado
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <p className="text-sm">
                <strong>{result.created}</strong> insumo{result.created !== 1 ? 's' : ''} creado
                {result.created !== 1 ? 's' : ''} correctamente
              </p>
            </div>
            {result.failed.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 max-h-40 overflow-y-auto">
                <p className="text-xs font-medium text-destructive mb-1.5">
                  {result.failed.length} fila{result.failed.length !== 1 ? 's' : ''} con error:
                </p>
                <ul className="space-y-0.5 text-xs">
                  {result.failed.map((f, idx) => (
                    <li key={idx} className="text-destructive">
                      <span className="font-mono">[fila {f.row + 1}]</span> {f.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
            {result ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!result && (
            <Button onClick={handleSubmit} disabled={submitting || validRows.length === 0}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando...
                </>
              ) : (
                `Importar ${validRows.length} insumo${validRows.length !== 1 ? 's' : ''}`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
