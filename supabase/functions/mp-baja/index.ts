// "Botón de baja" (Disp. 954/2025): el Dueño cancela la suscripción en un paso. Conserva Pro hasta el fin del período pagado.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import { cors, env, json } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const auth = req.headers.get('Authorization'); if (!auth) return json({ error: 'Iniciá sesión.' }, 401)
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } })
  const { data: { user } } = await asUser.auth.getUser(); if (!user) return json({ error: 'Iniciá sesión.' }, 401)
  const { org_id } = await req.json().catch(() => ({}))
  const { data: s } = await asUser.from('subscriptions').select('provider_id, status').eq('org_id', org_id).in('status', ['authorized', 'pending', 'paused']).maybeSingle()   // RLS: solo el Dueño la ve
  if (!s) return json({ error: 'No hay una suscripción activa.' }, 404)
  const r = await fetch(`https://api.mercadopago.com/preapproval/${s.provider_id}`, { method: 'PUT', headers: { Authorization: `Bearer ${env('MP_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) })
  if (!r.ok) return json({ error: 'Mercado Pago no respondió. Probá de nuevo; si sigue, escribinos y la damos de baja a mano.' }, 502)
  const p = await r.json()
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))
  await admin.rpc('apply_subscription', { p_provider_id: s.provider_id, p_status: 'cancelled', p_next: p.next_payment_date ?? null })
  const codigo = `BAJA-${Date.now().toString(36).toUpperCase()}`
  console.log('baja', org_id, codigo)
  return json({ ok: true, codigo })
})
