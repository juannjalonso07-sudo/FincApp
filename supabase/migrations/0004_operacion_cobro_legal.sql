-- 0004 · Operación, cobro y legal
--  1. Nuevo tipo de dato: entregas (remitos a empaque/comprador).
--  2. El Encargado solo puede editar algunos campos de fincas y cuadros (variedad, estado, nota). Nada de la finca.
--  3. Pizarra regional: de dónde sale cada precio (fuente, tipo, enlace) y sin duplicados.
--  4. Suscripciones de Mercado Pago (las escribe solo el servidor, con la clave de servicio).
--  5. Consentimientos (términos y privacidad) y limpieza del registro de operaciones.

insert into entity_types(name, owner_only) values ('entrega', false) on conflict do nothing;

alter table entity_types add column if not exists manager_fields text[];
update entity_types set manager_fields = '{}' where name = 'finca';
update entity_types set manager_fields = '{estado,var,nota}' where name = 'cuadro';

create or replace function sync_push(p_org uuid, p_ops jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o jsonb; k text; v jsonb; r records; rl org_role; ent text; hlc text; et entity_types; d jsonb;
  applied jsonb := '[]'; rejected jsonb := '[]'; exists_rec boolean; fincas int; revive boolean;
  max_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint + 5 * 60 * 1000;
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  rl := role_in(p_org);
  if rl is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 200 then raise exception 'bad_batch'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sync:' || p_org::text, 0));

  for o in select * from jsonb_array_elements(p_ops) loop
    if jsonb_typeof(o) <> 'object' then rejected := rejected || jsonb_build_object('op', null, 'reason', 'invalid_op'); continue; end if;
    ent := o->>'entity'; hlc := o->>'hlc'; d := o->'del';
    select * into et from entity_types where name = ent;
    if (o->>'op') is null or length(o->>'op') > 200 or coalesce(o->>'id', '') !~ uuid_re or et.name is null
       or (d is not null and jsonb_typeof(d) <> 'boolean')
       or (o ? 'set' and jsonb_typeof(o->'set') <> 'object') then
      rejected := rejected || jsonb_build_object('op', o->>'op', 'reason', 'invalid_op'); continue; end if;
    if coalesce(hlc, '') !~ '^\d{13}-\d{5}-[A-Za-z0-9_-]{1,40}$' or left(hlc, 13)::bigint > max_ms then
      rejected := rejected || jsonb_build_object('op', o->>'op', 'reason', 'bad_clock'); continue; end if;
    if length(o::text) > 65536 then
      rejected := rejected || jsonb_build_object('op', o->>'op', 'reason', 'too_large'); continue; end if;
    if exists (select 1 from op_log where org_id = p_org and op_id = o->>'op') then
      applied := applied || to_jsonb(o->>'op'); continue; end if;
    if rl = 'manager' and et.owner_only and d is not null then
      rejected := rejected || jsonb_build_object('op', o->>'op', 'reason', 'role_forbidden'); continue; end if;

    if rl = 'manager' and et.owner_only and o ? 'set' and exists (
         select 1 from jsonb_object_keys(o->'set') as fk(name) where not (fk.name = any(coalesce(et.manager_fields, '{}')))) then
      rejected := rejected || jsonb_build_object('op', o->>'op', 'reason', 'role_forbidden'); continue; end if;

    select * into r from records where org_id = p_org and id = (o->>'id')::uuid for update;
    exists_rec := found;
    if exists_rec and r.entity <> ent then
      rejected := rejected || jsonb_build_object('op', o->>'op', 'reason', 'entity_mismatch'); continue; end if;
    if not exists_rec and rl = 'manager' and et.owner_only then
      rejected := rejected || jsonb_build_object('op', o->>'op', 'reason', 'role_forbidden'); continue; end if;
    -- Límite del plan Gratis: aplica al crear y también al desborrar.
    revive := exists_rec and r.deleted and d = 'false'::jsonb and coalesce(r.clocks->>'_del', '') < hlc;
    if ent = 'finca' and (not exists_rec or revive) and not org_is_pro(p_org) then
      select count(*) into fincas from records where org_id = p_org and entity = 'finca' and not deleted;
      if fincas >= 1 then
        rejected := rejected || jsonb_build_object('op', o->>'op', 'reason', 'plan_limit_fincas'); continue; end if;
    end if;
    if not exists_rec then
      insert into records(org_id, id, entity) values (p_org, (o->>'id')::uuid, ent) returning * into r;
    end if;

    if o ? 'set' then
      for k, v in select * from jsonb_each(o->'set') loop
        if coalesce(r.clocks->>k, '') < hlc then
          r.fields := jsonb_set(r.fields, array[k], v, true);
          r.clocks := jsonb_set(r.clocks, array[k], to_jsonb(hlc), true);
        end if;
      end loop;
    end if;
    if d is not null and coalesce(r.clocks->>'_del', '') < hlc then
      r.deleted := (d = 'true'::jsonb);
      r.clocks := jsonb_set(r.clocks, array['_del'], to_jsonb(hlc), true);
    end if;
    update records set fields = r.fields, clocks = r.clocks, deleted = r.deleted, seq = nextval('records_seq')
      where org_id = p_org and id = r.id;
    insert into op_log(org_id, op_id) values (p_org, o->>'op') on conflict do nothing;
    applied := applied || to_jsonb(o->>'op');
  end loop;
  return jsonb_build_object('applied', applied, 'rejected', rejected);
end $$;
revoke all on function sync_push(uuid, jsonb) from public;
grant execute on function sync_push(uuid, jsonb) to authenticated;

-- ---------- pizarra regional ----------
alter table regional_prices add column if not exists kind text not null default 'mayorista' check (kind in ('mayorista','productor','exportacion'));
alter table regional_prices add column if not exists prev_price numeric(14,2);
alter table regional_prices add column if not exists url text;
create unique index if not exists regional_prices_uq on regional_prices (region, esp, dest, week, coalesce(source, ''));

-- ---------- suscripciones (Mercado Pago) ----------
create table if not exists subscriptions (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  provider       text not null default 'mercadopago',
  provider_id    text unique,                 -- id de la preapproval de Mercado Pago
  status         text not null default 'pending' check (status in ('pending','authorized','paused','cancelled')),
  payer_email    text,
  amount         numeric(14,2),
  currency       text not null default 'ARS',
  next_payment   timestamptz,
  created_by     uuid not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists subscriptions_org on subscriptions(org_id);
alter table subscriptions enable row level security;
create policy subs_select on subscriptions for select using (role_in(org_id) = 'owner');
grant select on subscriptions to authenticated;    -- sin insert/update: solo las Edge Functions (service_role) escriben

-- Llamada solo desde el webhook (service_role): pasa la empresa a Pro mientras la suscripción esté al día.
create or replace function apply_subscription(p_provider_id text, p_status text, p_next timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare s subscriptions; begin
  update subscriptions set status = p_status, next_payment = p_next, updated_at = now() where provider_id = p_provider_id returning * into s;
  if not found then raise exception 'unknown_subscription'; end if;
  if p_status = 'authorized' then
    -- Pro hasta el próximo cobro + 5 días de gracia (si no se cobra, vuelve solo a Gratis).
    update organizations set plan = 'pro', plan_expires_at = coalesce(p_next, now() + interval '31 days') + interval '5 days' where id = s.org_id;
  elsif p_status in ('cancelled', 'paused') then
    -- Conserva Pro hasta el final del período ya pagado; después vence solo.
    update organizations set plan_expires_at = least(coalesce(plan_expires_at, now()), coalesce(p_next, now())) where id = s.org_id and plan = 'pro';
  end if;
end $$;
revoke all on function apply_subscription(text, text, timestamptz) from public, anon, authenticated;

-- ---------- consentimientos ----------
create table if not exists consents (
  user_id    uuid not null,
  doc        text not null check (doc in ('terminos','privacidad','transferencia')),
  version    text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, doc, version)
);
alter table consents enable row level security;
create policy consents_own on consents for select using (user_id = auth_uid());
create policy consents_ins on consents for insert with check (user_id = auth_uid());
grant select, insert on consents to authenticated;

-- ---------- mantenimiento ----------
-- op_log solo sirve para no aplicar dos veces la misma operación: alcanza con 120 días.
create or replace function purge_op_log() returns int language sql security definer set search_path = public as
$$ with d as (delete from op_log where applied_at < now() - interval '120 days' returning 1) select count(*)::int from d $$;
revoke all on function purge_op_log() from public, anon, authenticated;
