import { openDB, type IDBPDatabase } from 'idb'
import { Hlc, newer } from '../lib/hlc'
import { uuidv7 } from '../lib/ids'
import type { Fields, LocalRecord, Op, RemoteRecord } from './types'

const VERSION = 2
export const BACKUP_FORMAT = 'fincapp-backup/1'

/** Almacenamiento local (IndexedDB), una base por usuario + empresa: nada se mezcla en equipos compartidos. */
export class Store {
  private listeners = new Set<(changed: Set<string>) => void>()
  private cache = new Map<string, LocalRecord[]>()        // lecturas en memoria por tipo; se invalida solo el tipo que cambió
  private constructor(private db: IDBPDatabase, private hlc: Hlc, readonly name: string) {}

  static dbName(userId: string, orgId: string) { return `fincapp:${userId}:${orgId}` }

  static async open(name: string, clock?: () => number): Promise<Store> {
    const db = await openDB(name, VERSION, {
      upgrade(d, old, _new, tx) {
        if (old < 1) {
          d.createObjectStore('records', { keyPath: 'key' }).createIndex('entity', 'entity')
          d.createObjectStore('outbox', { keyPath: 'op' })
          d.createObjectStore('meta', { keyPath: 'k' })
        }
        if (old < 2) tx.objectStore('outbox').createIndex('rec', ['entity', 'id'])   // buscar ediciones pendientes de un registro sin recorrer toda la cola
      },
    })
    let node = (await db.get('meta', 'node'))?.v as string | undefined
    if (!node) { node = uuidv7().slice(-12); await db.put('meta', { k: 'node', v: node }) }
    const saved = (await db.get('meta', 'hlc'))?.v
    return new Store(db, new Hlc(node, saved, clock), name)
  }

  /** `entity` opcional: solo avisa cuando cambia ese tipo de registro (las pantallas no se recargan por cambios ajenos). */
  subscribe(fn: () => void, entity?: string) {
    const l = (ch: Set<string>) => { if (!entity || ch.has(entity) || ch.has('*')) fn() }
    this.listeners.add(l); return () => { this.listeners.delete(l) }
  }
  private emit(...entities: string[]) {
    const ch = new Set(entities.length ? entities : ['*'])
    if (ch.has('*')) this.cache.clear(); else ch.forEach((e) => this.cache.delete(e))
    this.listeners.forEach((f) => f(ch))
  }
  close() { this.db.close() }

  // ---------- lectura ----------
  async get(entity: string, id: string): Promise<LocalRecord | undefined> { return this.db.get('records', `${entity}:${id}`) }
  async list(entity: string): Promise<LocalRecord[]> {
    const c = this.cache.get(entity); if (c) return c
    const rows = (await this.db.getAllFromIndex('records', 'entity', entity)).filter((r: LocalRecord) => !r.deleted)
    this.cache.set(entity, rows); return rows
  }

  // ---------- escritura local (siempre funciona, con o sin conexión) ----------
  /** Crea o modifica campos de un registro. Una sola transacción: registro + cola + reloj. Nada queda a medias. */
  async patch(entity: string, id: string, fields: Fields): Promise<void> { await this.patchMany([{ entity, id, fields }]) }

  /** Varias escrituras en UNA transacción (p. ej. una finca con sus 100 cuadros): o se guardan todas o ninguna. */
  async patchMany(items: { entity: string; id: string; fields: Fields }[]): Promise<void> {
    if (!items.length) return
    const tx = this.db.transaction(['records', 'outbox', 'meta'], 'readwrite')
    for (const { entity, id, fields } of items) {
      const key = `${entity}:${id}`, hlc = this.hlc.tick()
      const rec: LocalRecord = (await tx.objectStore('records').get(key)) ?? { key, entity, id, fields: {}, clocks: {}, deleted: false, serverKnown: false }
      for (const [k, v] of Object.entries(fields)) { rec.fields[k] = v; rec.clocks[k] = hlc }
      await tx.objectStore('records').put(rec)
      await this.enqueue(tx.objectStore('outbox'), { op: `${this.hlc.node}-${hlc}-${uuidv7().slice(-6)}`, entity, id, hlc, set: fields, at: Date.now() })
    }
    await tx.objectStore('meta').put({ k: 'hlc', v: this.hlc.state() })
    await tx.done; this.emit(...new Set(items.map((i) => i.entity)))
  }

  async remove(entity: string, id: string): Promise<void> {
    const tx = this.db.transaction(['records', 'outbox', 'meta'], 'readwrite')
    const key = `${entity}:${id}`, hlc = this.hlc.tick()
    const rec = await tx.objectStore('records').get(key); if (!rec) { await tx.done; return }
    rec.deleted = true; rec.clocks._del = hlc
    await tx.objectStore('records').put(rec)
    await this.enqueue(tx.objectStore('outbox'), { op: `${this.hlc.node}-${hlc}-${uuidv7().slice(-6)}`, entity, id, hlc, del: true, at: Date.now() })
    await tx.objectStore('meta').put({ k: 'hlc', v: this.hlc.state() })
    await tx.done; this.emit(entity)
  }

  /** Une ediciones consecutivas del mismo registro todavía no enviadas (menos tráfico, mismo resultado). */
  private async enqueue(os: any, op: Op) {
    const mine: Op[] = await os.index('rec').getAll([op.entity, op.id])
    const prev = mine.sort((a, b) => (a.hlc < b.hlc ? -1 : 1)).pop()
    // Solo si la edición nueva cubre todos los campos de la anterior: así ningún campo viejo viaja con un reloj más nuevo que el suyo.
    if (prev && !prev.failed && prev.set && op.set && !prev.del && !op.del && Object.keys(prev.set).every((k) => k in op.set!)) {
      await os.delete(prev.op)
      await os.put({ ...op, set: { ...prev.set, ...op.set } })
    } else await os.put(op)
  }

  // ---------- cola de salida ----------
  async pending(limit = 50): Promise<Op[]> {
    return (await this.db.getAll('outbox')).filter((o: Op) => !o.failed).sort((a: Op, b: Op) => (a.hlc < b.hlc ? -1 : 1)).slice(0, limit)
  }
  async pendingCount(): Promise<number> { return (await this.counts()).pending }
  async counts(): Promise<{ pending: number; failed: number }> {
    let pending = 0, failed = 0
    for (const o of (await this.db.getAll('outbox')) as Op[]) o.failed ? failed++ : pending++
    return { pending, failed }
  }
  async failed(): Promise<Op[]> { return (await this.db.getAll('outbox')).filter((o: Op) => o.failed) }
  /** Descarta un cambio rechazado, a pedido del productor. Si el registro nunca llegó al servidor, se quita del equipo;
   *  si ya existía allá, se vuelve a bajar su versión del servidor. */
  async discardFailed(opId: string): Promise<{ resync: boolean }> {
    const tx = this.db.transaction(['outbox', 'records'], 'readwrite')
    const o: Op | undefined = await tx.objectStore('outbox').get(opId); if (!o) { await tx.done; return { resync: false } }
    await tx.objectStore('outbox').delete(opId)
    const key = `${o.entity}:${o.id}`, r: LocalRecord | undefined = await tx.objectStore('records').get(key)
    const others = ((await tx.objectStore('outbox').index('rec').getAll([o.entity, o.id])) as Op[]).length > 0
    let resync = false
    if (r && !others) { if (r.serverKnown) resync = true; await tx.objectStore('records').delete(key) }
    await tx.done; if (resync) await this.setCursor(0); this.emit('_outbox', o.entity); return { resync }
  }

  async ack(opIds: string[]): Promise<void> {
    const tx = this.db.transaction(['outbox', 'records'], 'readwrite')
    for (const id of opIds) {
      const o: Op | undefined = await tx.objectStore('outbox').get(id); if (!o) continue
      await tx.objectStore('outbox').delete(id)
      const r: LocalRecord | undefined = await tx.objectStore('records').get(`${o.entity}:${o.id}`)
      if (r && !r.serverKnown) { r.serverKnown = true; await tx.objectStore('records').put(r) }
    }
    await tx.done; this.emit('_outbox')
  }

  /** El servidor rechazó la operación: queda marcada con el motivo y NADA se borra. El productor decide después
   *  (reintentar, por ejemplo tras pasar a Pro, o descartar). Nunca perdemos un dato sin que la persona lo elija. */
  async reject(items: { op: string; reason: string }[]): Promise<void> {
    const tx = this.db.transaction(['outbox'], 'readwrite')
    for (const { op, reason } of items) {
      const o: Op | undefined = await tx.objectStore('outbox').get(op); if (o) await tx.objectStore('outbox').put({ ...o, failed: reason })
    }
    await tx.done; this.emit('_outbox')
  }
  /** Vuelve a poner en la cola las operaciones rechazadas (por ejemplo, después de pasar a Pro). */
  async retryFailed(): Promise<void> {
    const tx = this.db.transaction(['outbox'], 'readwrite')
    for (const o of (await tx.objectStore('outbox').getAll()) as Op[]) if (o.failed) { const { failed: _f, ...rest } = o; await tx.objectStore('outbox').put(rest) }
    await tx.done; this.emit('_outbox')
  }

  // ---------- datos que llegan del servidor ----------
  async applyRemote(records: RemoteRecord[]): Promise<void> {
    const tx = this.db.transaction(['records', 'meta'], 'readwrite')
    for (const rr of records) {
      const key = `${rr.entity}:${rr.id}`
      const cur: LocalRecord = (await tx.objectStore('records').get(key)) ?? { key, entity: rr.entity, id: rr.id, fields: {}, clocks: {}, deleted: false, serverKnown: true }
      for (const [k, v] of Object.entries(rr.fields)) if (newer(rr.clocks[k], cur.clocks[k])) { cur.fields[k] = v; cur.clocks[k] = rr.clocks[k] }
      if (newer(rr.clocks._del, cur.clocks._del)) { cur.deleted = rr.deleted; cur.clocks._del = rr.clocks._del }
      cur.serverKnown = true
      for (const c of Object.values(rr.clocks)) this.hlc.recv(c)
      await tx.objectStore('records').put(cur)
    }
    await tx.objectStore('meta').put({ k: 'hlc', v: this.hlc.state() })
    await tx.done; this.emit(...new Set(records.map((r) => r.entity)))
  }

  async cursor(): Promise<number> { return (await this.db.get('meta', 'cursor'))?.v ?? 0 }
  async setCursor(n: number) { await this.db.put('meta', { k: 'cursor', v: n }) }

  // ---------- copias de seguridad ----------
  async exportBackup(orgId: string): Promise<string> {
    const [records, outbox] = await Promise.all([this.db.getAll('records'), this.db.getAll('outbox')])
    return JSON.stringify({ format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), orgId, records, outbox })
  }
  /** Restaura una copia: solo si el formato es válido y es de la misma empresa. No pisa nada si algo falla. */
  async importBackup(json: string, orgId: string): Promise<{ records: number }> {
    let d: any; try { d = JSON.parse(json) } catch { throw new Error('El archivo no es una copia de seguridad válida.') }
    if (d?.format !== BACKUP_FORMAT || !Array.isArray(d.records) || !Array.isArray(d.outbox)) throw new Error('El archivo no es una copia de seguridad de FincApp.')
    if (d.orgId !== orgId) throw new Error('Esta copia pertenece a otra empresa.')
    for (const r of d.records) if (!r?.key || !r?.entity || typeof r.fields !== 'object') throw new Error('La copia está dañada.')
    const tx = this.db.transaction(['records', 'outbox'], 'readwrite')
    for (const r of d.records as LocalRecord[]) {
      const cur: LocalRecord | undefined = await tx.objectStore('records').get(r.key)
      if (!cur) { await tx.objectStore('records').put({ ...r, serverKnown: false }); continue }
      for (const [k, v] of Object.entries(r.fields)) if (newer(r.clocks[k], cur.clocks[k])) { cur.fields[k] = v; cur.clocks[k] = r.clocks[k] }
      if (newer(r.clocks._del, cur.clocks._del)) { cur.deleted = r.deleted; cur.clocks._del = r.clocks._del }
      await tx.objectStore('records').put(cur)
    }
    // Los registros restaurados se vuelven a enviar para que el servidor los reciba si los había perdido.
    // Una operación por reloj: cada campo viaja con SU reloj original, así nunca pisa un dato más nuevo del servidor.
    for (const r of d.records as LocalRecord[]) {
      const byClock = new Map<string, Fields>()
      for (const [k, v] of Object.entries(r.fields)) { const c = r.clocks[k]; if (!c) continue; byClock.set(c, { ...(byClock.get(c) ?? {}), [k]: v }) }
      let i = 0
      for (const [c, set] of byClock) await tx.objectStore('outbox').put({ op: `restore-${this.hlc.node}-${r.key}-${c}`, entity: r.entity, id: r.id, hlc: c, set, at: Date.now() + i++ } as Op)
      if (r.clocks._del) await tx.objectStore('outbox').put({ op: `restore-${this.hlc.node}-${r.key}-del-${r.clocks._del}`, entity: r.entity, id: r.id, hlc: r.clocks._del, del: r.deleted, at: Date.now() } as Op)
    }
    await tx.done; this.emit(); return { records: d.records.length }
  }
}
