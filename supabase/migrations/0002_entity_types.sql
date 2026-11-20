-- Tipos de dato permitidos en una tabla (en vez de una lista fija dentro de la función):
-- agregar un tipo nuevo = un INSERT, sin tocar sync_push.
create table entity_types (
  name       text primary key,
  owner_only boolean not null default false     -- true: el Encargado no puede crear ni borrar
);
alter table entity_types enable row level security;
create policy et_select on entity_types for select using (true);
grant select on entity_types to authenticated;

insert into entity_types(name, owner_only) values
  ('finca', true), ('cuadro', true),
  ('curacion', false), ('cosecha', false), ('bin', false), ('riego', false), ('riegocfg', false), ('turno', false),
  ('tarea', false), ('punto', false), ('precio', false), ('variedad', false), ('producto', false), ('cuadrilla', false), ('usuario_pref', false);

create or replace function sync_push(p_org uuid, p_ops jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o jsonb; k text; v jsonb; r records; rl org_role; ent text; hlc text; et entity_types;
  applied jsonb := '[]'; rejected jsonb := '[]'; exists_rec boolean; fincas int;
begin
  rl := role_in(p_org);
  if rl is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 200 then raise exception 'bad_batch'; end if;

  for o in select * from jsonb_array_elements(p_ops) loop
    ent := o->>'entity'; hlc := o->>'hlc';
    select * into et from entity_types where name = ent;
    if (o->>'op') is null or (o->>'id') is null or hlc is null or et.name is null then
      rejected := rejected || jsonb_build_object('op', o->>'op', 'reason', 'invalid_op'); continue; end if;
    if length(o::text) > 65536 then
      rejected := rejected || jsonb_build_object('op', o->>'op', 'reason', 'too_large'); continue; end if;
    if exists (select 1 from op_log where org_id = p_org and op_id = o->>'op') then
      applied := applied || to_jsonb(o->>'op'); continue; end if;
    if rl = 'manager' and et.owner_only and coalesce((o->>'del')::boolean, false) then
      rejected := rejected || jsonb_build_object('op', o->>'op', 'reason', 'role_forbidden'); continue; end if;

    select * into r from records where org_id = p_org and id = (o->>'id')::uuid for update;
    exists_rec := found;
    if exists_rec and r.entity <> ent then
      rejected := rejected || jsonb_build_object('op', o->>'op', 'reason', 'entity_mismatch'); continue; end if;
    if not exists_rec then
      if rl = 'manager' and et.owner_only then
        rejected := rejected || jsonb_build_object('op', o->>'op', 'reason', 'role_forbidden'); continue; end if;
      if ent = 'finca' and not org_is_pro(p_org) then
        select count(*) into fincas from records where org_id = p_org and entity = 'finca' and not deleted;
        if fincas >= 1 then
          rejected := rejected || jsonb_build_object('op', o->>'op', 'reason', 'plan_limit_fincas'); continue; end if;
      end if;
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
revoke all on function sync_push(uuid, jsonb) from public;
grant execute on function sync_push(uuid, jsonb) to authenticated;
