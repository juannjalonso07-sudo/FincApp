import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, cloudEnabled, serverReachable } from '../supabase/client'
import type { Plan, Role } from '../plans/plans'
import { friendlyAuthError } from '../ui/validate'

export interface OrgInfo { id: string; name: string; plan: Plan; role: Role }
export interface User { id: string; email: string; name?: string; offline?: boolean }
interface Ctx {
  mode: 'cloud' | 'local'; loading: boolean; user: User | null; orgs: OrgInfo[]; org: OrgInfo | null
  selectOrg(id: string): void; signIn(e: string, p: string): Promise<string | null>; signUp(e: string, p: string, name?: string): Promise<string | null>
  reset(e: string): Promise<string | null>; signOut(): Promise<void>; createOrg(name: string): Promise<string | null>; refresh(): Promise<void>
}
const C = createContext<Ctx>(null as any)
export const useAuth = () => useContext(C)

const LOCAL_USER: User = { id: 'local', email: 'este equipo' }
const LOCAL_ORG: OrgInfo = { id: 'local', name: 'Mi empresa', plan: 'free', role: 'owner' }
const cacheKey = (uid: string) => `fincapp.orgs:${uid}`
const readCache = (k: string) => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(cloudEnabled)
  const [user, setUser] = useState<User | null>(cloudEnabled ? null : LOCAL_USER)
  const [orgs, setOrgs] = useState<OrgInfo[]>(cloudEnabled ? [] : [LOCAL_ORG])
  const [orgId, setOrgId] = useState<string | null>(cloudEnabled ? localStorage.getItem('fincapp.org') : LOCAL_ORG.id)

  const loadOrgs = useCallback(async (u: User) => {
    if (!supabase) return
    const { data, error } = await supabase.from('memberships').select('role, organizations(id,name,plan,plan_expires_at)')
    if (error || !data) { const c = readCache(cacheKey(u.id)); if (c) setOrgs(c); return }   // sin conexión: usamos lo último que supimos
    const list: OrgInfo[] = data.map((m: any) => {
      const o = m.organizations, expired = o.plan_expires_at && new Date(o.plan_expires_at) < new Date()
      return { id: o.id, name: o.name, role: m.role, plan: expired ? 'free' : o.plan }
    })
    setOrgs(list); try { localStorage.setItem(cacheKey(u.id), JSON.stringify(list)) } catch { /* ok */ }
  }, [])

  useEffect(() => {
    if (!supabase) return
    let alive = true
    const apply = async (s: any) => {
      const u: User | null = s?.user ? { id: s.user.id, email: s.user.email, name: (s.user.user_metadata?.full_name as string | undefined) || undefined } : null
      if (!alive) return; setUser(u); if (u) { await loadOrgs(u); void savePendingConsent(u.id) } else setOrgs([]); if (alive) setLoading(false)
    }
    // Sin internet y con la sesión vencida, Supabase devuelve "sin sesión" (no un error). Si este equipo ya tenía un usuario
    // y no hay forma de llegar al servidor, entramos igual con sus datos locales: la nube se reengancha al volver la señal.
    const offlineFallback = () => {
      const last = readCache('fincapp.lastUser'); if (!last || !alive) return false
      setUser({ ...last, offline: true }); setOrgs(readCache(cacheKey(last.id)) ?? []); setLoading(false); return true
    }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session && !(await serverReachable()) && offlineFallback()) return
      await apply(data.session)
    }).catch(async () => { if (!offlineFallback()) await apply(null) })
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === 'INITIAL_SESSION') return                                   // ya lo resolvió getSession
      if (e === 'SIGNED_OUT') { try { localStorage.removeItem('fincapp.lastUser') } catch { /* ok */ } }
      void apply(s)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [loadOrgs])

  useEffect(() => { if (user && user.id !== 'local' && !user.offline) try { localStorage.setItem('fincapp.lastUser', JSON.stringify(user)) } catch { /* ok */ } }, [user])

  const org = useMemo(() => orgs.find((o) => o.id === orgId) ?? orgs[0] ?? null, [orgs, orgId])
  const wrap = async (fn: () => Promise<{ error: any }>) => { try { const { error } = await fn(); return error ? friendlyAuthError(error.message ?? '') : null } catch (e: any) { return friendlyAuthError(e?.message ?? '') } }

  const value: Ctx = {
    mode: cloudEnabled ? 'cloud' : 'local', loading, user, orgs, org,
    selectOrg: (id) => { setOrgId(id); try { localStorage.setItem('fincapp.org', id) } catch { /* ok */ } },
    signIn: (e, p) => wrap(() => supabase!.auth.signInWithPassword({ email: e.trim(), password: p })),
    signUp: (e, p, name) => wrap(() => supabase!.auth.signUp({ email: e.trim(), password: p, options: { data: { full_name: name?.trim().replace(/\s+/g, ' ') ?? '' } } })),
    reset: (e) => wrap(() => supabase!.auth.resetPasswordForEmail(e.trim())),
    signOut: async () => { try { localStorage.removeItem('fincapp.lastUser') } catch { /* ok */ } await supabase?.auth.signOut().catch(() => {}); setUser(null); setOrgs([]) },
    createOrg: async (name) => { const r = await wrap(async () => { const x = await supabase!.rpc('create_org', { p_name: name }); if (!x.error) { setOrgId(x.data); try { localStorage.setItem('fincapp.org', x.data) } catch { /* ok */ } } return x }); if (!r && user) await loadOrgs(user); return r },
    refresh: async () => { if (user) await loadOrgs(user) },
  }
  return <C.Provider value={value}>{children}</C.Provider>
}

/** Versión vigente de los textos legales. Si cambia, se vuelve a pedir el consentimiento. */
export const LEGAL_VERSION = '2026-11'
/** El consentimiento se marca al crear la cuenta y se guarda en el servidor apenas hay sesión (puede ser después de confirmar el correo). */
export function markPendingConsent() { try { localStorage.setItem('fincapp.consent', LEGAL_VERSION) } catch { /* ok */ } }
async function savePendingConsent(uid: string) {
  let v: string | null = null; try { v = localStorage.getItem('fincapp.consent') } catch { return }
  if (!v || !supabase) return
  const rows = (['terminos', 'privacidad', 'transferencia'] as const).map((doc) => ({ user_id: uid, doc, version: v }))
  const { error } = await supabase.from('consents').upsert(rows, { onConflict: 'user_id,doc,version', ignoreDuplicates: true })
  if (!error) try { localStorage.removeItem('fincapp.consent') } catch { /* ok */ }
}
