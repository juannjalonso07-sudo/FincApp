-- FincApp · núcleo multi-empresa (Supabase / PostgreSQL)
-- Cada empresa (organization) está aislada con Row Level Security.
-- Las escrituras de datos pasan SOLO por sync_push (security definer), nunca por INSERT/UPDATE directo.

create type org_role  as enum ('owner', 'manager');   -- Dueño / Encargado
create type plan_tier as enum ('free', 'pro');

create table organizations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 2 and 120),
  plan            plan_tier not null default 'free',
  plan_expires_at timestamptz,                       -- null = sin vencimiento (free) o lo maneja el proveedor de pagos
  created_by      uuid not null,
  created_at      timestamptz not null default now()
);

create table memberships (
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null,
  role       org_role not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on memberships(user_id);

create table invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  email       text not null,
  role        org_role not null default 'manager',
  token       text not null unique default encode(sha256((gen_random_uuid()::text || gen_random_uuid()::text)::bytea), 'hex'),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_by  uuid not null
);

-- Registros del cuaderno de campo: un solo formato genérico (entidad + campos con reloj por campo).
create sequence records_seq;
create table records (
  org_id  uuid   not null references organizations(id) on delete cascade,
  id      uuid   not null,
  entity  text   not null,
  fields  jsonb  not null default '{}'::jsonb,
  clocks  jsonb  not null default '{}'::jsonb,       -- campo -> HLC (gana el reloj mayor)
  deleted boolean not null default false,
  seq     bigint not null default nextval('records_seq'),
  primary key (org_id, id)
);
create index records_pull_idx on records (org_id, seq);
create index records_entity_idx on records (org_id, entity) where not deleted;

-- Idempotencia: una operación reenviada no se aplica dos veces.
create table op_log (
  org_id     uuid not null references organizations(id) on delete cascade,
  op_id      text not null,
  applied_at timestamptz not null default now(),
  primary key (org_id, op_id)
);

-- Pizarra de precios regionales (solo Plan Pro). Los carga el equipo de FincApp / un proveedor.
create table regional_prices (
  id       uuid primary key default gen_random_uuid(),
  region   text not null,
  esp      text not null,
  dest     text not null,
  price    numeric(14,2) not null check (price >= 0),
  currency text not null default 'ARS' check (currency in ('ARS','USD')),
  week     date not null,
  source   text
);
create index regional_prices_idx on regional_prices (region, esp, week desc);

-- ---------- helpers de seguridad ----------
create or replace function auth_uid() returns uuid language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                   (nullif(current_setting('request.jwt.claims', true), '')::jsonb)->>'sub')::uuid $$;
-- En Supabase real, auth.uid() existe; esta función lo envuelve para poder probar fuera de Supabase.

create or replace function auth_email() returns text language sql stable as
$$ select lower((nullif(current_setting('request.jwt.claims', true), '')::jsonb)->>'email') $$;

create or replace function is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from memberships where org_id = p_org and user_id = auth_uid()) $$;

create or replace function role_in(p_org uuid) returns org_role
language sql stable security definer set search_path = public as
$$ select role from memberships where org_id = p_org and user_id = auth_uid() $$;

create or replace function org_is_pro(p_org uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from organizations o where o.id = p_org and o.plan = 'pro'
                   and (o.plan_expires_at is null or o.plan_expires_at > now())) $$;

create or replace function user_has_pro() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from memberships m join organizations o on o.id = m.org_id
                   where m.user_id = auth_uid() and o.plan = 'pro'
                     and (o.plan_expires_at is null or o.plan_expires_at > now())) $$;

-- ---------- RLS ----------
alter table organizations   enable row level security;
alter table memberships     enable row level security;
alter table invites         enable row level security;
alter table records         enable row level security;
alter table op_log          enable row level security;
alter table regional_prices enable row level security;

create policy org_select  on organizations for select using (is_member(id));
create policy org_rename  on organizations for update using (role_in(id) = 'owner') with check (role_in(id) = 'owner');
create policy mem_select  on memberships   for select using (is_member(org_id));
create policy mem_delete  on memberships   for delete using (role_in(org_id) = 'owner' and user_id <> auth_uid());
create policy inv_select  on invites       for select using (role_in(org_id) = 'owner');
create policy rec_select  on records       for select using (is_member(org_id));
create policy price_select on regional_prices for select using (user_has_pro());
-- op_log: sin políticas = nadie accede directo. records: sin políticas de escritura = solo sync_push.

-- El dueño solo puede cambiar el nombre; el plan lo cambia el backend (webhook de pagos con service_role).
revoke update on organizations from authenticated;
grant  update (name) on organizations to authenticated;

-- ---------- alta de empresa e invitaciones ----------
create or replace function create_org(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid; begin
  if auth_uid() is null then raise exception 'no_auth' using errcode = '28000'; end if;
  insert into organizations(name, created_by) values (trim(p_name), auth_uid()) returning id into v;
  insert into memberships(org_id, user_id, role) values (v, auth_uid(), 'owner');
  return v;
end $$;

create or replace function create_invite(p_org uuid, p_email text, p_role org_role default 'manager') returns text
language plpgsql security definer set search_path = public as $$
declare t text; begin
  if role_in(p_org) is distinct from 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into invites(org_id, email, role, created_by) values (p_org, lower(trim(p_email)), p_role, auth_uid()) returning token into t;
  return t;
end $$;

create or replace function accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare i invites; begin
  if auth_uid() is null then raise exception 'no_auth' using errcode = '28000'; end if;
  select * into i from invites where token = p_token and accepted_at is null and expires_at > now() for update;
  if not found or i.email is distinct from auth_email() then raise exception 'invite_invalid'; end if;   -- la invitación solo sirve para el correo invitado
  insert into memberships(org_id, user_id, role) values (i.org_id, auth_uid(), i.role) on conflict do nothing;
  update invites set accepted_at = now() where id = i.id;
  return i.org_id;
end $$;

-- ---------- sincronización ----------
-- Op: { "op": "<id único>", "entity": "finca", "id": "<uuid>", "hlc": "<reloj>", "set": {campo: valor}, "del": true|false }
-- Reglas por entidad: qué rol puede escribir y límites del plan.
create or replace function sync_push(p_org uuid, p_ops jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o jsonb; k text; v jsonb; r records; rl org_role; ent text; hlc text;
  applied jsonb := '[]'; rejected jsonb := '[]'; n int := 0; exists_rec boolean; fincas int;
  allowed text[] := array['finca','cuadro','curacion','cosecha','bin','riego','riegocfg','tarea','punto','precio','turno','variedad','usuario_pref'];
  owner_only text[] := array['finca','cuadro'];     -- el Encargado no crea/borra fincas ni cuadros
begin
  rl := role_in(p_org);
  if rl is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 200 then raise exception 'bad_batch'; end if;

  for o in select * from jsonb_array_elements(p_ops) loop
    n := n + 1; ent := o->>'entity'; hlc := o->>'hlc';
    -- validaciones de formato
    if (o->>'op') is null or (o->>'id') is null or hlc is null or not coalesce(ent = any(allowed), false) then
      rejected := rejected || jsonb_build_object('op', o->>'op', 'reason', 'invalid_op'); continue; end if;
    if length(o::text) > 65536 then
      rejected := rejected || jsonb_build_object('op', o->>'op', 'reason', 'too_large'); continue; end if;
    -- idempotencia
    if exists (select 1 from op_log where org_id = p_org and op_id = o->>'op') then
      applied := applied || to_jsonb(o->>'op'); continue; end if;
    -- permisos por rol
    if rl = 'manager' and ent = any(owner_only) and coalesce((o->>'del')::boolean, false) then
      rejected := rejected || jsonb_build_object('op', o->>'op', 'reason', 'role_forbidden'); continue; end if;

    select * into r from records where org_id = p_org and id = (o->>'id')::uuid for update;
    exists_rec := found;
    if exists_rec and r.entity <> ent then
      rejected := rejected || jsonb_build_object('op', o->>'op', 'reason', 'entity_mismatch'); continue; end if;
    if not exists_rec then
      if rl = 'manager' and ent = any(owner_only) then
        rejected := rejected || jsonb_build_object('op', o->>'op', 'reason', 'role_forbidden'); continue; end if;
      -- límite del plan Gratis: 1 finca activa
      if ent = 'finca' and not org_is_pro(p_org) then
        select count(*) into fincas from records where org_id = p_org and entity = 'finca' and not deleted;
        if fincas >= 1 then
          rejected := rejected || jsonb_build_object('op', o->>'op', 'reason', 'plan_limit_fincas'); continue; end if;
      end if;
      insert into records(org_id, id, entity) values (p_org, (o->>'id')::uuid, ent) returning * into r;
    end if;

    -- LWW por campo con reloj híbrido
    if o ? 'set' then
      for k, v in select * from jsonb_each(o->'set') loop
        if coalesce(r.clocks->>k, '') < hlc then
          r.fields := jsonb_set(r.fields, array[k], v, true);
          r.clocks := jsonb_set(r.clocks, array[k], to_jsonb(hlc), true);
        end if;
      end loop;
    end if;
    if o ? 'del' and coalesce(r.clocks->>'_del', '') < hlc then
      r.deleted := (o->>'del')::boolean;
      r.clocks := jsonb_set(r.clocks, array['_del'], to_jsonb(hlc), true);
    end if;
    update records set fields = r.fields, clocks = r.clocks, deleted = r.deleted, seq = nextval('records_seq')
      where org_id = p_org and id = r.id;
    insert into op_log(org_id, op_id) values (p_org, o->>'op') on conflict do nothing;
    applied := applied || to_jsonb(o->>'op');
  end loop;
  return jsonb_build_object('applied', applied, 'rejected', rejected);
end $$;

create or replace function sync_pull(p_org uuid, p_since bigint, p_limit int default 500) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rows jsonb; mx bigint; cnt int; begin
  if not is_member(p_org) then raise exception 'forbidden' using errcode = '42501'; end if;
  p_limit := least(greatest(p_limit, 1), 1000);
  select coalesce(jsonb_agg(x order by x.seq), '[]'), coalesce(max(x.seq), p_since), count(*)
    into rows, mx, cnt
    from (select id, entity, fields, clocks, deleted, seq from records
           where org_id = p_org and seq > p_since order by seq limit p_limit) x;
  return jsonb_build_object('records', rows, 'cursor', mx, 'more', cnt = p_limit);
end $$;

revoke all on function sync_push(uuid, jsonb), sync_pull(uuid, bigint, int), create_org(text), create_invite(uuid, text, org_role), accept_invite(text) from public;
grant execute on function sync_push(uuid, jsonb), sync_pull(uuid, bigint, int), create_org(text), create_invite(uuid, text, org_role), accept_invite(text) to authenticated;

-- ---------- privilegios mínimos ----------
-- En Supabase los roles anon/authenticated reciben permisos amplios por defecto: se recortan explícitamente.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select on organizations, memberships, invites, records, regional_prices to authenticated;
grant update (name) on organizations to authenticated;
grant delete on memberships to authenticated;
