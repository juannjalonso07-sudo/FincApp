import { describe, it, expect } from 'vitest'
import { verifyMpSignature, preapprovalBody } from '../supabase/functions/_shared/mp'
import { parseMonitoreo, urlsMes } from '../supabase/functions/_shared/mcba'

async function sign(secret: string, manifest: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest)))].map((b) => b.toString(16).padStart(2, '0')).join('')
}
describe('webhook de Mercado Pago', () => {
  it('acepta una firma válida y rechaza una alterada, sin firma o vieja', async () => {
    const ts = String(Math.floor(Date.now() / 1000)), v1 = await sign('s3cr3t', `id:abc123;request-id:req-1;ts:${ts};`)
    const base = { requestId: 'req-1', dataId: 'ABC123', secret: 's3cr3t', toleranceSec: 600 }
    expect(await verifyMpSignature({ ...base, signature: `ts=${ts},v1=${v1}` })).toBe(true)
    expect(await verifyMpSignature({ ...base, signature: `ts=${ts},v1=${v1.replace(/.$/, '0')}` })).toBe(false)
    expect(await verifyMpSignature({ ...base, signature: null })).toBe(false)
    expect(await verifyMpSignature({ ...base, signature: `ts=${ts},v1=${v1}`, now: Date.now() + 3_600_000 })).toBe(false)
  })
  it('arma la suscripción mensual en pesos con la empresa como referencia', () => {
    const b = preapprovalBody({ orgId: 'org-1', email: 'a@b.com', amount: 9900, backUrl: 'https://x/#/plan' })
    expect(b.external_reference).toBe('org-1'); expect(b.auto_recurring).toEqual({ frequency: 1, frequency_type: 'months', transaction_amount: 9900, currency_id: 'ARS' })
  })
})
describe('informe del Mercado Central', () => {
  it('lee precio anterior y actual por especie, y descarta pares que no cierran con el %', () => {
    const txt = 'ESPECIE MARZO ABRIL DIF% Manzana $2.164,54 $2.180,02 0,72% Pera $1.437,94 $1.331,81 -7,38% Durazno $2.328,54 $2.551,80 9,59% Ciruela $2.320,12 $2.584,59 11,40% Kiwi $10,00 $99,00 1,00%'
    expect(parseMonitoreo(txt)).toEqual([
      { esp: 'manzana', prev: 2164.54, price: 2180.02 }, { esp: 'pera', prev: 1437.94, price: 1331.81 },
      { esp: 'durazno', prev: 2328.54, price: 2551.8 }, { esp: 'ciruela', prev: 2320.12, price: 2584.59 }])
  })
  it('prueba los nombres de archivo conocidos del mes', () => { expect(urlsMes(2026, 4)[0]).toMatch(/MonitoreoFederal-Abril26\.pdf$/) })
})
