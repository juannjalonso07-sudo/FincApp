// POST { org_id } con la sesión del usuario → crea la suscripción en Mercado Pago y devuelve el link de pago.
// Variables: MP_ACCESS_TOKEN, PRO_PRICE_ARS, APP_URL (SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY las pone Supabase).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import { preapprovalBody } from '../_shared/mp.ts'
import { cors, env, json } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const auth = req.headers.get('Authorization'); if (!auth) return json({ error: 'Iniciá sesión.' }, 401)
    const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } })
    const { data: { user } } = await asUser.auth.getUser(); if (!user?.email) return json({ error: 'Iniciá sesión.' }, 401)
    const { org_id } = await req.json().catch(() => ({}))
    const { data: m } = await asUser.from('memberships').select('role').eq('org_id', org_id).eq('user_id', user.id).maybeSingle()
    if (m?.role !== 'owner') return json({ error: 'Solo el Dueño puede contratar el plan.' }, 403)

    const amount = Number(env('PRO_PRICE_ARS'))
    const r = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('MP_ACCESS_TOKEN')}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(preapprovalBody({ orgId: org_id, email: user.email, amount, backUrl: `${env('APP_URL')}/#/plan?pago=volviste` })),
    })
    const mp = await r.json()
    if (!r.ok || !mp.init_point) { console.error('MP preapproval', r.status, mp); return json({ error: 'Mercado Pago no respondió. Probá de nuevo en unos minutos.' }, 502) }

    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))
    const { error } = await admin.from('subscriptions').insert({ org_id, provider_id: mp.id, status: 'pending', payer_email: user.email, amount, created_by: user.id })
    if (error) { console.error(error); return json({ error: 'No se pudo registrar la suscripción.' }, 500) }
    return json({ init_point: mp.init_point })
  } catch (e) { console.error(e); return json({ error: 'Error interno.' }, 500) }
})
