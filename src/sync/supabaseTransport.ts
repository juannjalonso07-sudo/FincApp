import type { SupabaseClient } from '@supabase/supabase-js'
import type { Transport } from '../db/types'
import { AuthError } from './engine'

const authCodes = new Set(['42501', '28000', 'PGRST301', 'PGRST303'])

export function supabaseTransport(sb: SupabaseClient): Transport {
  const check = (error: any) => {
    if (!error) return
    if (error.code === '42501' && /forbidden/i.test(error.message ?? '')) throw new Error('Ya no tenés acceso a esta empresa. Pedile al Dueño que te vuelva a invitar.')
    if (authCodes.has(error.code) || /JWT|not authenticated/i.test(error.message ?? '')) throw new AuthError('Tu sesión venció. Volvé a iniciar sesión.')
    throw new Error(error.message ?? 'Error de red')
  }
  return {
    async push(org, ops) { const { data, error } = await sb.rpc('sync_push', { p_org: org, p_ops: ops }); check(error); return data },
    async pull(org, since, limit) { const { data, error } = await sb.rpc('sync_pull', { p_org: org, p_since: since, p_limit: limit }); check(error); return data },
  }
}
