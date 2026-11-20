// Webhook de Mercado Pago (topics: subscription_preapproval y subscription_authorized_payment).
// Verifica la firma, consulta el estado real en la API de MP (nunca confía en el cuerpo) y actualiza el plan.
// Variables: MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET. Desplegar con --no-verify-jwt (MP no manda la sesión de Supabase).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import { normStatus, verifyMpSignature } from '../_shared/mp.ts'
import { env, json } from '../_shared/http.ts'

const mpGet = async (path: string) => {
  const r = await fetch(`https://api.mercadopago.com${path}`, { headers: { Authorization: `Bearer ${env('MP_ACCESS_TOKEN')}` } })
  if (!r.ok) throw new Error(`MP ${path} → ${r.status}`); return r.json()
}

Deno.serve(async (req) => {
  const url = new URL(req.url), body = await req.json().catch(() => ({} as any))
  const dataId = url.searchParams.get('data.id') ?? body?.data?.id ?? null
  const type = url.searchParams.get('type') ?? body?.type ?? ''
  const ok = await verifyMpSignature({ signature: req.headers.get('x-signature'), requestId: req.headers.get('x-request-id'), dataId: dataId && String(dataId), secret: env('MP_WEBHOOK_SECRET'), toleranceSec: 900 })
  if (!ok) return json({ error: 'firma inválida' }, 401)
  try {
    let preapprovalId: string | null = null
    if (type === 'subscription_preapproval') preapprovalId = String(dataId)
    else if (type === 'subscription_authorized_payment') preapprovalId = (await mpGet(`/authorized_payments/${dataId}`)).preapproval_id ?? null
    if (!preapprovalId) return json({ ignored: type })
    const p = await mpGet(`/preapproval/${preapprovalId}`)
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))
    const { error } = await admin.rpc('apply_subscription', { p_provider_id: p.id, p_status: normStatus(p.status), p_next: p.next_payment_date ?? null })
    if (error) { console.error(error); return json({ error: 'no aplicado' }, 500) }   // 500 → MP reintenta
    return json({ ok: true })
  } catch (e) { console.error(e); return json({ error: 'reintentar' }, 500) }
})
