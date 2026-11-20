import { describe, it, expect, beforeAll } from 'vitest'
import { makeDb, asUser, setEmail } from './pg-harness'

const U1 = '11111111-1111-1111-1111-111111111111' // dueño empresa A
const U2 = '22222222-2222-2222-2222-222222222222' // dueño empresa B
const U3 = '33333333-3333-3333-3333-333333333333' // encargado empresa A
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const H = (n: number) => `${String(1000 + n).padStart(13, '0')}-00000-nodoA`

let db: Awaited<ReturnType<typeof makeDb>>
let orgA: string, orgB: string

const push = async (uid: string, org: string, ops: any[]) =>
  (await asUser(db, uid, `select sync_push($1::uuid, $2::jsonb) r`, [org, JSON.stringify(ops)])).rows[0].r

beforeAll(async () => {
  setEmail(U3, 'encargado@x.com')
  db = await makeDb()
  orgA = (await asUser(db, U1, `select create_org('Finca Los Álamos') id`)).rows[0].id
  orgB = (await asUser(db, U2, `select create_org('Frutales del Sur') id`)).rows[0].id
  const tok = (await asUser(db, U1, `select create_invite($1::uuid,'encargado@x.com','manager') t`, [orgA])).rows[0].t
  await asUser(db, U3, `select accept_invite($1)`, [tok])
})

describe('aislamiento entre empresas (RLS)', () => {
  it('cada usuario ve solo su empresa', async () => {
    expect((await asUser(db, U1, `select id from organizations`)).rows.map((r: any) => r.id)).toEqual([orgA])
    expect((await asUser(db, U2, `select id from organizations`)).rows.map((r: any) => r.id)).toEqual([orgB])
  })
  it('no se puede escribir ni leer datos de otra empresa', async () => {
    await expect(push(U2, orgA, [{ op: 'x1', entity: 'finca', id: id(1), hlc: H(1), set: { n: 'hack' } }])).rejects.toThrow(/forbidden/)
    await expect(asUser(db, U2, `select sync_pull($1::uuid, 0)`, [orgA])).rejects.toThrow(/forbidden/)
  })
  it('escritura directa a la tabla está bloqueada (solo por sync_push)', async () => {
    await expect(asUser(db, U1, `insert into records(org_id,id,entity) values ($1,$2,'finca')`, [orgA, id(9)])).rejects.toThrow()
    await expect(asUser(db, U1, `update organizations set plan='pro' where id=$1`, [orgA])).rejects.toThrow()
  })
  it('un usuario sin sesión no ve nada', async () => {
    await expect(asUser(db, null, `select * from organizations`)).rejects.toThrow()
  })
})

describe('invitaciones', () => {
  it('solo las puede aceptar el correo invitado y una sola vez', async () => {
    const tok = (await asUser(db, U1, `select create_invite($1::uuid,'otra@x.com','manager') t`, [orgA])).rows[0].t
    await expect(asUser(db, U2, `select accept_invite($1)`, [tok])).rejects.toThrow(/invite_invalid/)   // otro usuario con el enlace
  })
})

describe('roles Dueño / Encargado', () => {
  it('el Encargado ve la empresa y puede cargar curaciones', async () => {
    const r = await push(U3, orgA, [{ op: 'c1', entity: 'curacion', id: id(20), hlc: H(2), set: { prod: 'Azufre' } }])
    expect(r.applied).toEqual(['c1'])
  })
  it('el Encargado NO puede crear fincas ni cuadros', async () => {
    const r = await push(U3, orgA, [{ op: 'c2', entity: 'finca', id: id(21), hlc: H(3), set: { n: 'X' } }])
    expect(r.rejected[0].reason).toBe('role_forbidden')
  })
  it('el Encargado NO puede invitar ni cambiar el nombre de la empresa', async () => {
    await expect(asUser(db, U3, `select create_invite($1::uuid,'a@b.c')`, [orgA])).rejects.toThrow(/forbidden/)
    const r = await asUser(db, U3, `update organizations set name='Nueva' where id=$1 returning id`, [orgA])
    expect(r.rows.length).toBe(0)
  })
})

describe('plan Gratis vs Pro', () => {
  it('Gratis permite 1 finca y rechaza la segunda con motivo claro', async () => {
    const a = await push(U1, orgA, [{ op: 'f1', entity: 'finca', id: id(30), hlc: H(4), set: { n: 'Lote 1' } }])
    expect(a.applied).toEqual(['f1'])
    const b = await push(U1, orgA, [{ op: 'f2', entity: 'finca', id: id(31), hlc: H(5), set: { n: 'Lote 2' } }])
    expect(b.rejected[0].reason).toBe('plan_limit_fincas')
  })
  it('editar la finca existente sí está permitido', async () => {
    const a = await push(U1, orgA, [{ op: 'f3', entity: 'finca', id: id(30), hlc: H(6), set: { n: 'Lote 1 renombrado' } }])
    expect(a.applied).toEqual(['f3'])
  })
  it('Pro permite varias fincas', async () => {
    await db.exec(`update organizations set plan='pro' where id='${orgA}'`) // lo hace el backend de pagos
    const b = await push(U1, orgA, [{ op: 'f4', entity: 'finca', id: id(31), hlc: H(7), set: { n: 'Lote 2' } }])
    expect(b.applied).toEqual(['f4'])
  })
  it('la pizarra de precios regionales es solo Pro', async () => {
    await db.exec(`insert into regional_prices(region,esp,dest,price,week) values ('Mendoza','durazno','industria',410,'2026-11-16')`)
    expect((await asUser(db, U1, `select * from regional_prices`)).rows.length).toBe(1)  // empresa A es Pro
    expect((await asUser(db, U2, `select * from regional_prices`)).rows.length).toBe(0)  // empresa B es Gratis
  })
  it('un plan Pro vencido vuelve a Gratis', async () => {
    await db.exec(`update organizations set plan_expires_at = now() - interval '1 day' where id='${orgA}'`)
    expect((await asUser(db, U1, `select * from regional_prices`)).rows.length).toBe(0)
    await db.exec(`update organizations set plan_expires_at = null where id='${orgA}'`)
  })
})

describe('sincronización: idempotencia y conflictos', () => {
  it('reenviar la misma operación no la duplica', async () => {
    const op = { op: 'dup1', entity: 'tarea', id: id(40), hlc: H(8), set: { t: 'Podar' } }
    await push(U1, orgA, [op]); await push(U1, orgA, [op])
    const n = (await db.query(`select count(*)::int c from op_log where op_id='dup1'`)).rows[0] as any
    expect(n.c).toBe(1)
  })
  it('gana el reloj mayor por campo, sin importar el orden de llegada', async () => {
    await push(U1, orgA, [{ op: 'l2', entity: 'tarea', id: id(41), hlc: H(20), set: { t: 'nuevo', f: 'A' } }])
    await push(U3, orgA, [{ op: 'l1', entity: 'tarea', id: id(41), hlc: H(10), set: { t: 'viejo', g: 'B' } }]) // llega tarde, reloj menor
    const r = (await asUser(db, U1, `select sync_pull($1::uuid,0) r`, [orgA])).rows[0] as any
    const rec = r.r.records.find((x: any) => x.id === id(41))
    expect(rec.fields).toEqual({ t: 'nuevo', f: 'A', g: 'B' }) // t gana el mayor; g (campo distinto) se conserva
  })
  it('el borrado es lógico y se sincroniza', async () => {
    await push(U1, orgA, [{ op: 'd1', entity: 'tarea', id: id(41), hlc: H(30), del: true }])
    const r = (await asUser(db, U3, `select sync_pull($1::uuid,0) r`, [orgA])).rows[0] as any
    expect(r.r.records.find((x: any) => x.id === id(41)).deleted).toBe(true)
  })
  it('el cursor permite bajar solo lo nuevo, y pagina', async () => {
    const all = (await asUser(db, U1, `select sync_pull($1::uuid,0,2) r`, [orgA])).rows[0] as any
    expect(all.r.records.length).toBe(2); expect(all.r.more).toBe(true)
    const rest = (await asUser(db, U1, `select sync_pull($1::uuid,$2::bigint,1000) r`, [orgA, all.r.cursor])).rows[0] as any
    expect(rest.r.records.every((x: any) => x.seq > all.r.cursor)).toBe(true)
  })
  it('rechaza entidades desconocidas y operaciones sin datos', async () => {
    const r = await push(U1, orgA, [{ op: 'z1', entity: 'tabla_rara', id: id(50), hlc: H(40), set: {} }, { op: 'z2', entity: 'tarea', id: id(51) }])
    expect(r.rejected.map((x: any) => x.reason)).toEqual(['invalid_op', 'bad_clock'])
  })
  it('lotes enormes se rechazan', async () => {
    const ops = Array.from({ length: 201 }, (_, i) => ({ op: 'b' + i, entity: 'tarea', id: id(100 + i), hlc: H(50), set: {} }))
    await expect(push(U1, orgA, ops)).rejects.toThrow(/bad_batch/)
  })
})
