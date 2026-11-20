import type { Store } from '../db/store'
import type { Transport } from '../db/types'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'auth' | 'error'
export interface SyncInfo { status: SyncStatus; pending: number; failed: number; lastOk: number | null; error?: string }

export class AuthError extends Error {}
const BATCH = 50

/** Empuja la cola local y baja los cambios nuevos. Reintenta solo, con espera creciente. */
export class SyncEngine {
  private running = false
  private info: SyncInfo = { status: 'idle', pending: 0, failed: 0, lastOk: null }
  private listeners = new Set<(i: SyncInfo) => void>()
  private failures = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopFns: (() => void)[] = []
  private stopped = false

  constructor(private store: Store, private transport: Transport, private org: string, private rand: () => number = Math.random) {}

  subscribe(fn: (i: SyncInfo) => void) { this.listeners.add(fn); fn(this.info); return () => { this.listeners.delete(fn) } }
  get snapshot() { return this.info }
  private set(p: Partial<SyncInfo>) { this.info = { ...this.info, ...p }; this.listeners.forEach((f) => f(this.info)) }

  async refreshCounts() { const c = await this.store.counts(); if (c.pending !== this.info.pending || c.failed !== this.info.failed) this.set(c) }

  /** Un ciclo completo: enviar todo lo pendiente (de a 50) y luego bajar todo lo nuevo. Devuelve true si terminó bien. */
  async syncNow(): Promise<boolean> {
    if (this.running || this.stopped) return false
    this.running = true; this.set({ status: 'syncing', error: undefined })
    try {
      for (;;) {
        const ops = await this.store.pending(BATCH); if (!ops.length) break
        const res = await this.transport.push(this.org, ops.map(({ failed: _f, at: _a, ...o }) => o))
        if (res.applied.length) await this.store.ack(res.applied)
        if (res.rejected.length) await this.store.reject(res.rejected)
        if (!res.applied.length && !res.rejected.length) throw new Error('El servidor no respondió sobre las operaciones enviadas.')
      }
      for (;;) {
        const cur = await this.store.cursor()
        const page = await this.transport.pull(this.org, cur, 500)
        if (page.records.length) await this.store.applyRemote(page.records)
        await this.store.setCursor(page.cursor)
        if (!page.more) break
      }
      this.failures = 0; this.set({ status: 'idle', lastOk: Date.now() }); await this.refreshCounts(); return true
    } catch (e: any) {
      this.failures++
      const auth = e instanceof AuthError
      this.set({ status: auth ? 'auth' : this.isOffline(e) ? 'offline' : 'error', error: e?.message })
      await this.refreshCounts(); return false
    } finally { this.running = false }
  }

  private isOffline(e: any) { return (typeof navigator !== 'undefined' && navigator.onLine === false) || /fetch|network|offline|Failed/i.test(String(e?.message)) }

  /** Espera 1, 2, 4… hasta 300 s, con variación al azar para que miles de equipos no pidan a la vez. */
  backoffMs() { const base = Math.min(300, 2 ** Math.max(0, this.failures - 1)); return Math.round(base * 1000 * (0.75 + this.rand() * 0.5)) }

  start(intervalMs = 30_000) {
    const loop = async () => {
      const ok = await this.syncNow()
      if (this.stopped || this.info.status === 'auth') return    // detenido, o hace falta volver a iniciar sesión
      this.timer = setTimeout(loop, ok ? intervalMs : this.backoffMs())
    }
    const kick = () => { if (this.timer) clearTimeout(this.timer); void loop() }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', kick); this.stopFns.push(() => window.removeEventListener('online', kick))
      const vis = () => { if (document.visibilityState === 'visible') kick() }
      document.addEventListener('visibilitychange', vis); this.stopFns.push(() => document.removeEventListener('visibilitychange', vis))
    }
    // Contadores con un pequeño retardo: cargar 100 cuadros no dispara 100 lecturas de la cola.
    let t: ReturnType<typeof setTimeout> | null = null
    this.stopFns.push(this.store.subscribe(() => { if (t) clearTimeout(t); t = setTimeout(() => { t = null; if (!this.stopped) void this.refreshCounts() }, 150) }), () => { if (t) clearTimeout(t) })
    void loop()
  }
  stop() { this.stopped = true; if (this.timer) clearTimeout(this.timer); this.stopFns.forEach((f) => f()); this.stopFns = [] }
}
