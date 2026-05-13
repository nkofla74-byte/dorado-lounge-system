-- Política de retención de datos 90 días (Habeas Data — Ley 1581/2012)
-- Purga registros de audit_log y mensajes_chat de usuarios inactivos > 90 días.
-- Se invoca diariamente via pg_cron (se configura en Supabase dashboard).

-- Función de purga de mensajes de chat antiguos (> 90 días)
create or replace function fn_purgar_mensajes_chat_antiguos()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from mensajes_chat
  where created_at < now() - interval '90 days';
end;
$$;

-- Función de purga de registros de afluencia (pasajeros anónimos) > 90 días
create or replace function fn_purgar_afluencia_antigua()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from afluencia_ingresos
  where created_at < now() - interval '90 days';
end;
$$;

-- Vista de estado de retención para monitoreo (solo superuser/admin la consulta vía RLS)
create or replace view v_retencion_estado as
select
  'mensajes_chat'      as tabla,
  count(*)             as registros_total,
  count(*) filter (where created_at < now() - interval '90 days') as registros_a_purgar,
  min(created_at)      as registro_mas_antiguo
from mensajes_chat
union all
select
  'afluencia_ingresos',
  count(*),
  count(*) filter (where created_at < now() - interval '90 days'),
  min(created_at)
from afluencia_ingresos;

comment on function fn_purgar_mensajes_chat_antiguos is
  'Purga mensajes_chat > 90 días. Invocar diariamente via pg_cron: select cron.schedule(''purga-chat'', ''0 3 * * *'', ''select fn_purgar_mensajes_chat_antiguos()'');';

comment on function fn_purgar_afluencia_antigua is
  'Purga afluencia_ingresos > 90 días. Invocar diariamente via pg_cron.';
