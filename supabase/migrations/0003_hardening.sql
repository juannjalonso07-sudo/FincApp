-- 0003 · Endurecimiento tras la auditoría
--  1. Orden de sincronización seguro: un candado por empresa durante sync_push. Así el número `seq` se asigna en el
--     mismo orden en que se confirman las transacciones y un pull nunca "saltea" un registro.
--  2. Cada operación se valida antes de convertir tipos: un id o un `del` mal formado se rechaza solo, sin trabar el lote.
--  3. Relojes: formato estricto y como máximo 5 minutos por delante del reloj del servidor.
--  4. Plan Gratis: no se puede "desborrar" una finca para saltear el límite, ni crear empresas gratis ilimitadas.
--  5. El Encargado no puede desborrar fincas ni cuadros.

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

-- Una sola empresa propia en plan Gratis por usuario (las demás requieren Pro).
create or replace function create_org(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid; begin
  if auth_uid() is null then raise exception 'no_auth' using errcode = '28000'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or length(p_name) > 120 then raise exception 'bad_name'; end if;
  if exists (select 1 from memberships m join organizations o on o.id = m.org_id
             where m.user_id = auth_uid() and m.role = 'owner' and not org_is_pro(o.id)) then
    raise exception 'plan_limit_orgs' using errcode = 'P0001';
  end if;
  insert into organizations(name, created_by) values (trim(p_name), auth_uid()) returning id into v;
  insert into memberships(org_id, user_id, role) values (v, auth_uid(), 'owner');
  return v;
end $$;
revoke all on function create_org(text) from public;
grant execute on function create_org(text) to authenticated;
