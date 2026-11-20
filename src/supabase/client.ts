import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** null = modo local (sin nube). La clave "anon" es pública por diseño: la seguridad real está en RLS. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null
export const cloudEnabled = supabase !== null

/** ¿Se puede llegar al servidor? (4 s máximo). Distingue "sin internet" de "sesión cerrada". */
export async function serverReachable(): Promise<boolean> {
  if (!url || !key) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  try { const c = new AbortController(); const t = setTimeout(() => c.abort(), 4000); const r = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key }, signal: c.signal }); clearTimeout(t); return r.status < 500 } catch { return false }
}
