'use client';

import { useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getAuditLog } from '@/modules/audit/actions';
import type { AuditEntry, AuditFilters } from '@/modules/audit/domain/audit-entry';

const PAGE_SIZE = 100;

const RESOURCE_TYPES = [
  'insumo',
  'lote',
  'receta',
  'tanda',
  'pedido',
  'turno',
  'proveedor',
  'tenant',
  'user',
];

function shortHash(h: string | null): string {
  return h ? h.slice(-8) : '—';
}

function actionColor(action: string): string {
  if (action.includes('create') || action.includes('crear') || action.includes('iniciar'))
    return 'text-emerald-600 dark:text-emerald-400';
  if (action.includes('delete') || action.includes('cancel') || action.includes('cerrar'))
    return 'text-red-500';
  if (action.includes('update') || action.includes('marcar') || action.includes('dispatch'))
    return 'text-amber-500';
  return 'text-foreground';
}

// El hash chain es per-tenant: cada tenant tiene su propia secuencia. Cuando
// el listado es cross-tenant (superuser) hay que verificar por grupo, no la
// secuencia mezclada — el orden global por fecha no garantiza prev_hash contiguo.
function verifyChain(entries: AuditEntry[]): boolean {
  const byTenant = new Map<string, AuditEntry[]>();
  for (const e of entries) {
    const key = e.tenantId ?? '__global__';
    const list = byTenant.get(key) ?? [];
    list.push(e);
    byTenant.set(key, list);
  }
  for (const list of byTenant.values()) {
    const asc = [...list].reverse();
    for (let i = 1; i < asc.length; i++) {
      if (asc[i]!.prevHash !== asc[i - 1]!.hash) return false;
    }
  }
  return true;
}

interface ExpandedRowProps {
  entry: AuditEntry;
  colSpan: number;
}

function ExpandedRow({ entry, colSpan }: ExpandedRowProps) {
  const t = useTranslations('admin.audit');
  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={colSpan} className="p-4">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <p className="font-medium text-muted-foreground uppercase tracking-wider text-[10px]">
              {t('labelPayload')}
            </p>
            <pre className="bg-muted rounded p-2 overflow-auto max-h-40 text-[11px] leading-relaxed">
              {JSON.stringify(entry.payload, null, 2)}
            </pre>
          </div>
          <div className="space-y-2">
            <div>
              <p className="font-medium text-muted-foreground uppercase tracking-wider text-[10px] mb-1">
                {t('labelIntegridad')}
              </p>
              <p className="font-mono break-all text-[10px] text-muted-foreground">
                hash: {entry.hash ?? '—'}
              </p>
              <p className="font-mono break-all text-[10px] text-muted-foreground">
                prev: {entry.prevHash ?? '—'}
              </p>
            </div>
            {entry.ipAddress && (
              <div>
                <p className="font-medium text-muted-foreground uppercase tracking-wider text-[10px] mb-1">
                  {t('labelIp')}
                </p>
                <p className="font-mono text-[11px]">{entry.ipAddress}</p>
              </div>
            )}
            {entry.resourceId && (
              <div>
                <p className="font-medium text-muted-foreground uppercase tracking-wider text-[10px] mb-1">
                  {t('labelResourceId')}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground break-all">
                  {entry.resourceId}
                </p>
              </div>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

interface AuditTableProps {
  initialData: AuditEntry[];
  initialTotal: number;
  showTenant?: boolean;
}

export function AuditTable({ initialData, initialTotal, showTenant = false }: AuditTableProps) {
  const t = useTranslations('admin.audit');
  const locale = useLocale();
  const [entries, setEntries] = useState<AuditEntry[]>(initialData);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(initialData.length);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [actionFilter, setActionFilter] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');

  const formatTs = (d: Date): string =>
    d.toLocaleString(locale === 'en' ? 'en-US' : 'es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  const loadMore = useCallback(async () => {
    setLoading(true);
    const filters: AuditFilters = { limit: PAGE_SIZE, offset };
    if (actionFilter) filters.action = actionFilter;
    if (resourceTypeFilter) filters.resourceType = resourceTypeFilter;
    const r = await getAuditLog(filters);
    if (r.ok) {
      setEntries((prev) => [...prev, ...r.value]);
      setOffset((prev) => prev + r.value.length);
    }
    setLoading(false);
  }, [offset, actionFilter, resourceTypeFilter]);

  const applyFilters = useCallback(async () => {
    setLoading(true);
    setOffset(0);
    const filters: AuditFilters = { limit: PAGE_SIZE, offset: 0 };
    if (actionFilter) filters.action = actionFilter;
    if (resourceTypeFilter) filters.resourceType = resourceTypeFilter;
    const r = await getAuditLog(filters);
    if (r.ok) {
      setEntries(r.value);
      setOffset(r.value.length);
      setTotal(r.value.length < PAGE_SIZE ? r.value.length : total);
    }
    setLoading(false);
  }, [actionFilter, resourceTypeFilter, total]);

  const chainOk = entries.length > 1 ? verifyChain(entries) : true;

  const displayed = entries;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={t('filtroAccion')}
            className="pl-8 h-8 text-sm"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
          />
        </div>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          value={resourceTypeFilter}
          onChange={(e) => setResourceTypeFilter(e.target.value)}
        >
          <option value="">{t('todosLosTipos')}</option>
          {RESOURCE_TYPES.map((rt) => (
            <option key={rt} value={rt}>
              {rt}
            </option>
          ))}
        </select>
        <Button size="sm" className="h-8" onClick={applyFilters} disabled={loading}>
          {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : t('aplicar')}
        </Button>
      </div>

      {/* Estado de la cadena */}
      <div
        className={cn(
          'flex items-center gap-2 text-xs px-3 py-2 rounded-md border',
          chainOk
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
            : 'bg-red-500/10 border-red-500/30 text-red-500',
        )}
      >
        {chainOk ? (
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        )}
        {chainOk ? t('cadenaOk', { n: entries.length }) : t('cadenaError')}
        <span className="ml-auto text-muted-foreground tabular-nums">
          {total > entries.length
            ? t('registrosCountMore', { n: entries.length, total })
            : t('registrosCount', { n: entries.length })}
        </span>
      </div>

      {/* Tabla */}
      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="w-8" />
              <TableHead className="text-xs">{t('colFecha')}</TableHead>
              {showTenant && <TableHead className="text-xs">{t('colTenant')}</TableHead>}
              <TableHead className="text-xs">{t('colAccion')}</TableHead>
              <TableHead className="text-xs">{t('colTipo')}</TableHead>
              <TableHead className="text-xs">{t('colUsuario')}</TableHead>
              <TableHead className="text-xs text-right">{t('colHash')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayed.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showTenant ? 7 : 6}
                  className="text-center py-10 text-sm text-muted-foreground"
                >
                  {t('sinRegistros')}
                </TableCell>
              </TableRow>
            ) : (
              displayed.map((entry) => (
                <>
                  <TableRow
                    key={entry.id}
                    className={cn(
                      'border-border cursor-pointer',
                      expanded === entry.id && 'bg-muted/20',
                    )}
                    onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                  >
                    <TableCell className="w-8 p-2">
                      {expanded === entry.id ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                      {formatTs(entry.createdAt)}
                    </TableCell>
                    {showTenant && (
                      <TableCell className="text-xs">
                        {entry.tenantNombre ? (
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">
                            {entry.tenantNombre}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs italic">global</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <span className={cn('text-xs font-mono', actionColor(entry.action))}>
                        {entry.action}
                      </span>
                    </TableCell>
                    <TableCell>
                      {entry.resourceType ? (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                          {entry.resourceType}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                      {entry.userNombre ?? (entry.userId ? entry.userId.slice(0, 8) + '…' : '—')}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono text-[10px] text-muted-foreground/60">
                        {shortHash(entry.hash)}
                      </span>
                    </TableCell>
                  </TableRow>
                  {expanded === entry.id && (
                    <ExpandedRow
                      key={`${entry.id}-exp`}
                      entry={entry}
                      colSpan={showTenant ? 7 : 6}
                    />
                  )}
                </>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Cargar más */}
      {entries.length > 0 && entries.length % PAGE_SIZE === 0 && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loading}>
            {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            {t('cargarMas')}
          </Button>
        </div>
      )}
    </div>
  );
}
