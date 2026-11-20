import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Store } from '../db/store'
import { SyncEngine, type SyncInfo } from '../sync/engine'
import { supabaseTransport } from '../sync/supabaseTransport'
import { supabase } from '../supabase/client'
import type { LocalRecord } from '../db/types'
import { useAuth } from './AuthProvider'

interface Ctx { store: Store; engine: SyncEngine | null }
const C = createContext<Ctx>(null as any)
const S = createContext<SyncInfo>({ status: 'idle', pending: 0, failed: 0, lastOk: null })
/** Store y motor: estables, no provocan re-render cuando cambia el estado de sincronización. */
export const useData = () => useContext(C)
/** Estado de sincronización: solo lo usan la barra superior y los avisos. */
export const useSync = () => useContext(S)

export function DataProvider({ children }: { children: ReactNode }) {
  const { user, org, mode } = useAuth()
  const [ctx, setCtx] = useState<Ctx | null>(null), [sync, setSync] = useState<SyncInfo>({ status: 'idle', pending: 0, failed: 0, lastOk: null })
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!user || !org) return
    let engine: SyncEngine | null = null, store: Store | null = null, off: (() => void) | undefined, dead = false
    ;(async () => {
      try {
        store = await Store.open(Store.dbName(user.id, org.id))
        if (mode === 'cloud' && supabase) { engine = new SyncEngine(store, supabaseTransport(supabase), org.id) }
        if (dead) { store.close(); return }
        setCtx({ store, engine })
        if (engine) { off = engine.subscribe(setSync); engine.start(); await engine.refreshCounts() }
        if (navigator.storage?.persist) void navigator.storage.persist()   // pide al navegador que no borre los datos locales
      } catch (e: any) { setErr('No se pudo abrir el almacenamiento de este equipo. Si usás una ventana privada, abrí FincApp en una ventana normal.') }
    })()
    return () => { dead = true; off?.(); engine?.stop(); store?.close(); setCtx(null) }
  }, [user?.id, org?.id, mode])

  if (err) return <div className="center"><div className="card"><h2>No se pudo abrir tus datos</h2><p>{err}</p></div></div>
  if (!ctx) return <div className="center"><p className="muted">Abriendo tus datos…</p></div>
  return <C.Provider value={ctx}><S.Provider value={sync}>{children}</S.Provider></C.Provider>
}

/** Lista reactiva de un tipo de registro. Se actualiza sola al guardar o al llegar cambios de la nube. */
export function useRecords(entity: string) {
  const { store } = useData()
  const [rows, setRows] = useState<LocalRecord[]>([])
  useEffect(() => {
    let alive = true; const load = () => store.list(entity).then((r) => { if (alive) setRows(r) })
    void load(); const off = store.subscribe(load, entity); return () => { alive = false; off() }
  }, [store, entity])
  return rows
}
