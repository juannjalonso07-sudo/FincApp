// Utilidades puras de Mercado Pago (sin dependencias de Deno: se testean con vitest).

/** Valida la firma `x-signature` de un webhook de Mercado Pago.
 *  Manifest: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` firmado con HMAC-SHA256 y la clave secreta del webhook.
 *  Confirmalo en la doc oficial de notificaciones al activar el webhook (ver docs/COBROS.md). */
export async function verifyMpSignature(opts: { signature: string | null; requestId: string | null; dataId: string | null; secret: string; now?: number; toleranceSec?: number }): Promise<boolean> {
  const { signature, requestId, dataId, secret } = opts
  if (!signature || !secret) return false
  const parts = Object.fromEntries(signature.split(',').map((p) => p.trim().split('=', 2) as [string, string]))
  const ts = parts.ts, v1 = parts.v1; if (!ts || !v1) return false
  const tsMs = ts.length > 10 ? Number(ts) : Number(ts) * 1000                       // puede venir en s o en ms
  if (opts.toleranceSec && Math.abs((opts.now ?? Date.now()) - tsMs) > opts.toleranceSec * 1000) return false   // evita repeticiones viejas
  let manifest = ''
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`
  if (requestId) manifest += `request-id:${requestId};`
  manifest += `ts:${ts};`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest)))
  const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (hex.length !== v1.length) return false
  let diff = 0; for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.toLowerCase().charCodeAt(i)   // comparación en tiempo constante
  return diff === 0
}

export type MpStatus = 'pending' | 'authorized' | 'paused' | 'cancelled'
export const normStatus = (s: string): MpStatus => (['pending', 'authorized', 'paused', 'cancelled'].includes(s) ? (s as MpStatus) : 'pending')

/** Cuerpo para crear la suscripción mensual (preapproval sin plan asociado). */
export function preapprovalBody(o: { orgId: string; email: string; amount: number; backUrl: string }) {
  return {
    reason: 'FincApp Pro · suscripción mensual',
    external_reference: o.orgId,
    payer_email: o.email,
    back_url: o.backUrl,
    status: 'pending',
    auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: o.amount, currency_id: 'ARS' },
  }
}
