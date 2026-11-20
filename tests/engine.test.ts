import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll } from 'vitest'
import { makeDb, asUser, setEmail } from './pg-harness'
import { pgTransport } from './pg-transport'
import { Store } from '../src/db/store'
import { SyncEngine } from '../src/sync/engine'
import { uuidv7 } from '../src/lib/ids'
import { Hlc } from '../src/lib/hlc'

const OWNER = '11111111-1111-1111-1111-111111111111'
const MGR = '33333333-3333-3333-3333-333333333333'
let db: Awaited<ReturnType<typeof makeDb>>, org: string
let n = 0
const mk = async (uid: string, ctl: any = {}) => {
  const store = await Store.open(`t${++n}`)
  const eng = new SyncEngine(store, pgTransport(db, uid, ctl), org, () => 0.5)
  return { store, eng, ctl }
}

beforeAll(async () => {
  setEmail(MGR, 'e@x.com')
  db = await makeDb()
  org = (await asUser(db, OWNER, `select create_org('Empresa de prueba') id`)).rows[0].id
  const tok = (await asUser(db, OWNER, `select create_invite($1::uuid,'e@x.com','manager') t`, [org])).rows[0].t
  await asUser(db, MGR, `select accept_invite($1)`, [tok])
})

describe('Hlc / ids', () => {
  it('el reloj nunca retrocede, aunque el reloj del equipo se atrase', () => {
    let t = 1000; const h = new Hlc('n', undefined, () => t)
    const a = h.tick(); t = 500; const b = h.tick(); const c = h.tick()
    expect(a < b && b < c).toBe(true)
  })
  it('recibir un reloj remoto adelantado deja los eventos locales por encima', () => {
    const h = new Hlc('n', undefined, () => 1000); h.recv('0000000009999-00003-otro')
    expect(h.tick() > '0000000009999-00003-otro').toBe(true)
  })
  it('uuidv7 es válido y ordenable por tiempo', () => {
    const a = uuidv7(1000), b = uuidv7(2000)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/); expect(a < b).toBe(true)
  })
})

describe('trabajo sin conexión y sincronización entre dispositivos', () => {
  it('guarda sin conexión, no pierde nada y sube todo al volver la red', async () => {
    const d = await mk(OWNER, { offline: true }); const id = uuidv7()
    await d.store.patch('finca', id, { n: 'Lote Norte', ha: 4 })
    await d.store.patch('finca', id, { ha: 5 })                       // edición parcial: viaja aparte, con su propio reloj
    expect(await d.store.pendingCount()).toBe(2)
    expect(await d.eng.syncNow()).toBe(false); expect(d.eng.snapshot.status).toBe('offline')
    expect((await d.store.get('finca', id))!.fields).toEqual({ n: 'Lote Norte', ha: 5 })   // sigue ahí
    d.ctl.offline = false
    expect(await d.eng.syncNow()).toBe(true); expect(await d.store.pendingCount()).toBe(0)
    expect((await db.query(`select fields from records where id='${id}'`)).rows[0]).toEqual({ fields: { n: 'Lote Norte', ha: 5 } })
  })
  it('dos dispositivos convergen y sus ediciones en campos distintos se conservan', async () => {
    const a = await mk(OWNER), b = await mk(OWNER); const id = uuidv7()
    await a.store.patch('tarea', id, { t: 'Podar', f: '2026-11-20' }); await a.eng.syncNow(); await b.eng.syncNow()
    await a.store.patch('tarea', id, { t: 'Podar el lote 2' })        // A cambia el título
    await b.store.patch('tarea', id, { f: '2026-11-25' })             // B cambia la fecha (sin conexión entre medio)
    await a.eng.syncNow(); await b.eng.syncNow(); await a.eng.syncNow()
    expect((await a.store.get('tarea', id))!.fields).toEqual({ t: 'Podar el lote 2', f: '2026-11-25' })
    expect((await b.store.get('tarea', id))!.fields).toEqual({ t: 'Podar el lote 2', f: '2026-11-25' })
  })
  it('si se pierde la respuesta del servidor, reintentar no duplica ni pierde', async () => {
    const d = await mk(OWNER, { dropAckOnce: true }); const id = uuidv7()
    await d.store.patch('tarea', id, { t: 'Regar' })
    expect(await d.eng.syncNow()).toBe(false)              // el servidor aplicó pero no llegó el aviso
    expect(await d.store.pendingCount()).toBe(1)
    expect(await d.eng.syncNow()).toBe(true); expect(await d.store.pendingCount()).toBe(0)
    expect((await db.query(`select count(*)::int c from records where id='${id}'`)).rows[0]).toEqual({ c: 1 })
  })
  it('más de 50 cambios se envían en varios lotes', async () => {
    const d = await mk(OWNER)
    for (let i = 0; i < 120; i++) await d.store.patch('tarea', uuidv7(), { t: 'T' + i })
    expect(await d.eng.syncNow()).toBe(true); expect(await d.store.pendingCount()).toBe(0)
    const e = await mk(OWNER); await e.eng.syncNow(); expect((await e.store.list('tarea')).length).toBeGreaterThanOrEqual(120)
  })
  it('el borrado se propaga', async () => {
    const a = await mk(OWNER), b = await mk(OWNER); const id = uuidv7()
    await a.store.patch('tarea', id, { t: 'Borrar' }); await a.eng.syncNow(); await b.eng.syncNow()
    await a.store.remove('tarea', id); await a.eng.syncNow(); await b.eng.syncNow()
    expect((await b.store.list('tarea')).some((r) => r.id === id)).toBe(false)
  })
})

describe('límites de plan y roles: el usuario nunca se queda con datos fantasma', () => {
  it('2ª finca en plan Gratis: se rechaza, NO se borra sola y queda un aviso claro; se quita solo si el productor descarta', async () => {
    const d = await mk(OWNER); const f2 = uuidv7()   // la empresa ya tiene su 1 finca de los tests anteriores
    await d.store.patch('finca', f2, { n: 'Segunda' }); await d.eng.syncNow()
    expect((await d.store.get('finca', f2))?.fields.n).toBe('Segunda')
    const failed = await d.store.failed(); expect(failed[0].failed).toBe('plan_limit_fincas'); expect(d.eng.snapshot.failed).toBe(1)
    await d.store.discardFailed(failed[0].op); expect((await d.store.failed()).length).toBe(0)
    expect(await d.store.get('finca', f2)).toBeUndefined()
  })
  it('reintentar: una operación rechazada vuelve a la cola', async () => {
    const d = await mk(OWNER); await d.store.patch('finca', uuidv7(), { n: 'Tercera' }); await d.eng.syncNow()
    expect((await d.store.failed()).length).toBe(1); await d.store.retryFailed()
    expect((await d.store.failed()).length).toBe(0); expect(await d.store.pendingCount()).toBe(1)
  })
  it('el Encargado no puede borrar una finca: el cambio se revierte con el estado real', async () => {
    const o = await mk(OWNER), m = await mk(MGR)
    const f = (await db.query(`select id from records where entity='finca' and org_id='${org}' limit 1`)).rows[0] as any
    await o.eng.syncNow(); await m.eng.syncNow()
    expect((await m.store.list('finca')).some((r) => r.id === f.id)).toBe(true)
    await m.store.remove('finca', f.id); await m.eng.syncNow()
    const fl = await m.store.failed(); expect(fl[0].failed).toBe('role_forbidden')
    await m.store.discardFailed(fl[0].op); await m.eng.syncNow()
    expect((await m.store.list('finca')).some((r) => r.id === f.id)).toBe(true)   // al descartar, vuelve el estado real
  })
})

describe('copias de seguridad', () => {
  it('exporta y restaura sin pisar datos más nuevos', async () => {
    const d = await mk(OWNER); const id = uuidv7()
    await d.store.patch('cosecha', id, { kg: 100 }); await d.eng.syncNow()
    const backup = await d.store.exportBackup(org)
    await d.store.patch('cosecha', id, { kg: 250 })
    const r = await d.store.importBackup(backup, org); expect(r.records).toBeGreaterThan(0)
    expect((await d.store.get('cosecha', id))!.fields.kg).toBe(250)
  })
  it('restaura en un equipo vacío y sube todo al servidor', async () => {
    const d = await mk(OWNER); const id = uuidv7()
    await d.store.patch('cosecha', id, { kg: 77 }); await d.eng.syncNow()
    const backup = await d.store.exportBackup(org)
    await db.exec(`delete from records where id='${id}'`); await db.exec(`delete from op_log where op_id like '%'`)
    const fresh = await mk(OWNER); await fresh.store.importBackup(backup, org); await fresh.eng.syncNow()
    expect((await db.query(`select fields from records where id='${id}'`)).rows[0]).toEqual({ fields: { kg: 77 } })
  })
  it('rechaza archivos dañados o de otra empresa', async () => {
    const d = await mk(OWNER)
    await expect(d.store.importBackup('no es json', org)).rejects.toThrow(/válida/)
    await expect(d.store.importBackup(JSON.stringify({ format: 'otro' }), org)).rejects.toThrow(/FincApp/)
    await expect(d.store.importBackup(await d.store.exportBackup('otra-empresa'), org)).rejects.toThrow(/otra empresa/)
  })
})

describe('reintentos', () => {
  it('la espera crece 1, 2, 4… y se topa en 300 s', async () => {
    const d = await mk(OWNER, { offline: true }); const w: number[] = []
    for (let i = 0; i < 12; i++) { await d.eng.syncNow(); w.push(d.eng.backoffMs() / 1000) }
    expect(w[0]).toBe(1); expect(w[1]).toBe(2); expect(w[2]).toBe(4); expect(Math.max(...w)).toBe(300)
  })
})

describe('endurecimiento (migración 0003)', () => {
  const hl = () => `${String(Date.now()).padStart(13, '0')}-00000-t`
  it('un id o un del mal formado se rechaza solo, sin trabar el resto del lote', async () => {
    const r = (await asUser(db, OWNER, `select sync_push('${org}', $1::jsonb) r`, [JSON.stringify([
      { op: 'x1', entity: 'tarea', id: 'no-es-uuid', hlc: hl(), set: {} },
      { op: 'x2', entity: 'tarea', id: uuidv7(), hlc: hl(), del: 'si' },
      { op: 'x3', entity: 'tarea', id: uuidv7(), hlc: hl(), set: { t: 'ok' } }])])).rows[0] as any
    expect(r.r.applied).toEqual(['x3']); expect(r.r.rejected.map((x: any) => x.reason)).toEqual(['invalid_op', 'invalid_op'])
  })
  it('un reloj del futuro o mal formado se rechaza', async () => {
    const fut = `${Date.now() + 3_600_000}-00000-t`
    const r = (await asUser(db, OWNER, `select sync_push('${org}', $1::jsonb) r`, [JSON.stringify([
      { op: 'c1', entity: 'tarea', id: uuidv7(), hlc: fut, set: { t: 1 } }, { op: 'c2', entity: 'tarea', id: uuidv7(), hlc: 'zzz', set: { t: 1 } }])])).rows[0] as any
    expect(r.r.rejected.map((x: any) => x.reason)).toEqual(['bad_clock', 'bad_clock'])
  })
  it('plan Gratis: no se puede desborrar una finca para saltear el límite', async () => {
    const fs = (await db.query(`select id from records where org_id='${org}' and entity='finca' and not deleted`)).rows as any[]
    expect(fs.length).toBe(1)
    const borrada = uuidv7()
    await db.query(`insert into records(org_id,id,entity,deleted,clocks) values ('${org}','${borrada}','finca',true,'{"_del":"0000000000001-00000-a"}')`)
    const r = (await asUser(db, OWNER, `select sync_push('${org}', $1::jsonb) r`, [JSON.stringify([{ op: 'rv1', entity: 'finca', id: borrada, hlc: hl(), del: false }])])).rows[0] as any
    expect(r.r.rejected[0].reason).toBe('plan_limit_fincas')
  })
  it('plan Gratis: una sola empresa propia', async () => {
    await expect(asUser(db, OWNER, `select create_org('Otra empresa')`)).rejects.toThrow(/plan_limit_orgs/)
  })
  it('editar solo un campo no reenvía otros campos con un reloj más nuevo', async () => {
    const d = await mk(OWNER), id = uuidv7()
    await d.store.patch('tarea', id, { t: 'a', hecha: false }); await d.store.patch('tarea', id, { hecha: true })
    const ops = await d.store.pending(); expect(ops.length).toBe(2)
    await d.store.patch('tarea', id, { t: 'b', hecha: false }); expect((await d.store.pending()).length).toBe(2)
  })
})

describe('velocidad', () => {
  it('avisa solo a quien mira el tipo que cambió, y patchMany guarda 100 registros en una transacción', async () => {
    const s = await Store.open(`perf${++n}`); let fincas = 0, tareas = 0
    s.subscribe(() => fincas++, 'finca'); s.subscribe(() => tareas++, 'tarea')
    const items = [{ entity: 'finca', id: uuidv7(), fields: { n: 'F' } }, ...Array.from({ length: 100 }, () => ({ entity: 'cuadro', id: uuidv7(), fields: { i: 1 } }))]
    const t0 = performance.now(); await s.patchMany(items); const ms = performance.now() - t0
    expect(fincas).toBe(1); expect(tareas).toBe(0); expect((await s.list('cuadro')).length).toBe(100)
    expect(ms).toBeLessThan(2000)
    expect(await s.list('cuadro')).toBe(await s.list('cuadro'))   // segunda lectura sale de memoria
  })
})

describe('migración 0004', () => {
  const hl = () => `${String(Date.now()).padStart(13, '0')}-00000-t`
  it('el Encargado puede cambiar variedad/estado de un cuadro, pero no renombrar la finca', async () => {
    const f = (await db.query(`select id from records where entity='finca' and org_id='${org}' and not deleted limit 1`)).rows[0] as any
    const c = uuidv7(); await asUser(db, OWNER, `select sync_push('${org}', $1::jsonb)`, [JSON.stringify([{ op: 'q0', entity: 'cuadro', id: c, hlc: hl(), set: { finca_id: f.id, var: '' } }])])
    const r = (await asUser(db, MGR, `select sync_push('${org}', $1::jsonb) r`, [JSON.stringify([
      { op: 'q1', entity: 'cuadro', id: c, hlc: hl(), set: { var: 'Elegant Lady', estado: 'produccion' } },
      { op: 'q2', entity: 'finca', id: f.id, hlc: hl(), set: { n: 'Otro nombre' } },
      { op: 'q3', entity: 'cuadro', id: c, hlc: hl(), set: { ha: 99 } }])])).rows[0] as any
    expect(r.r.applied).toEqual(['q1']); expect(r.r.rejected.map((x: any) => x.reason)).toEqual(['role_forbidden', 'role_forbidden'])
  })
  it('entregas son un tipo válido', async () => {
    const r = (await asUser(db, MGR, `select sync_push('${org}', $1::jsonb) r`, [JSON.stringify([{ op: 'e1', entity: 'entrega', id: uuidv7(), hlc: hl(), set: { bins: 3 } }])])).rows[0] as any
    expect(r.r.applied).toEqual(['e1'])
  })
  it('suscripción autorizada pasa la empresa a Pro; cancelada conserva hasta fin del período; nadie más puede llamarla', async () => {
    await db.query(`insert into subscriptions(org_id, provider_id, created_by) values ('${org}', 'mp-1', '${OWNER}')`)
    await expect(asUser(db, OWNER, `select apply_subscription('mp-1','authorized', now() + interval '30 days')`)).rejects.toThrow()
    await db.query(`select apply_subscription('mp-1','authorized', now() + interval '30 days')`)
    expect(((await db.query(`select plan from organizations where id='${org}'`)).rows[0] as any).plan).toBe('pro')
    await db.query(`select apply_subscription('mp-1','cancelled', now() + interval '10 days')`)
    const o = (await db.query(`select plan, plan_expires_at > now() + interval '9 days' and plan_expires_at < now() + interval '11 days' ok from organizations where id='${org}'`)).rows[0] as any
    expect(o.plan).toBe('pro'); expect(o.ok).toBe(true)
    await db.query(`update organizations set plan='free', plan_expires_at=null where id='${org}'`)
  })
  it('consentimientos: cada uno guarda solo el suyo', async () => {
    await asUser(db, OWNER, `insert into consents(user_id, doc, version) values ('${OWNER}', 'terminos', '2026-11')`)
    await expect(asUser(db, OWNER, `insert into consents(user_id, doc, version) values ('${MGR}', 'terminos', '2026-11')`)).rejects.toThrow()
  })
})
