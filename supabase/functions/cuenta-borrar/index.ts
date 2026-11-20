// Derecho de supresión (Ley 25.326): borra la cuenta del usuario que lo pide.
// - Empresas donde es el único Dueño y no hay otros miembros: se borran con todos sus datos.
// - Empresas con otros miembros donde es el único Dueño: se frena y se le pide pasar la titularidad (para no dejar a su equipo sin datos).
// - Membresías y consentimientos: se borran. Después se elimina el usuario de Auth.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import { cors, env, json } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const auth = req.headers.get('Authorization'); if (!auth) return json({ error: 'Iniciá sesión.' }, 401)
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } })
  const { data: { user } } = await asUser.auth.getUser(); if (!user) return json({ error: 'Iniciá sesión.' }, 401)
  const { confirm } = await req.json().catch(() => ({})); if (confirm !== 'BORRAR') return json({ error: 'Falta la confirmación.' }, 400)
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))
  const { data: mine } = await admin.from('memberships').select('org_id, role').eq('user_id', user.id)
  const bloquean: string[] = [], borrar: string[] = []
  for (const m of mine ?? []) {
    if (m.role !== 'owner') continue
    const { data: all } = await admin.from('memberships').select('user_id, role').eq('org_id', m.org_id)
    const otrosDuenos = (all ?? []).filter((x) => x.user_id !== user.id && x.role === 'owner').length, otros = (all ?? []).filter((x) => x.user_id !== user.id).length
    if (otrosDuenos) continue; if (otros) bloquean.push(m.org_id); else borrar.push(m.org_id)
  }
  if (bloquean.length) return json({ error: 'Sos el único Dueño de una empresa con más personas. Antes de borrar tu cuenta, pedile a otra persona que sea Dueña o quitá a los miembros.', orgs: bloquean }, 409)
  const { data: subs } = await admin.from('subscriptions').select('id').in('org_id', borrar).in('status', ['authorized', 'pending'])
  if (subs?.length) return json({ error: 'Tenés una suscripción activa. Dala de baja primero en "Plan" (botón de baja).' }, 409)
  if (borrar.length) await admin.from('organizations').delete().in('id', borrar)          // cascada: registros, op_log, invitaciones
  await admin.from('memberships').delete().eq('user_id', user.id)
  await admin.from('consents').delete().eq('user_id', user.id)
  const { error } = await admin.auth.admin.deleteUser(user.id); if (error) return json({ error: 'No se pudo borrar el usuario. Escribinos.' }, 500)
  return json({ ok: true, empresasBorradas: borrar.length })
})
