// Importa el informe mensual del Mercado Central (precios MAYORISTAS de referencia, $/kg por especie) a regional_prices.
// Programarla una vez por semana (ver docs/PRECIOS.md). Si el informe del mes todavía no salió, no hace nada.
// ⚠️ Antes de vender el plan Pro con estos datos, confirmá por escrito con el MCBA que se pueden usar comercialmente.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1'
import { parseMonitoreo, urlsMes } from '../_shared/mcba.ts'
import { env, json } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`) return json({ error: 'solo el servidor' }, 401)
  const now = new Date(), tries = [[now.getFullYear(), now.getMonth() + 1], [now.getFullYear() - (now.getMonth() === 0 ? 1 : 0), now.getMonth() === 0 ? 12 : now.getMonth()]]
  for (const [y, m] of tries) {
    for (const u of urlsMes(y, m)) {
      const r = await fetch(u); if (!r.ok) continue
      const pdf = await getDocumentProxy(new Uint8Array(await r.arrayBuffer()))
      const { text } = await extractText(pdf, { mergePages: true })
      const rows = parseMonitoreo(Array.isArray(text) ? text.join(' ') : text)
      if (!rows.length) return json({ error: 'No se pudo leer el informe: revisar el formato', url: u }, 422)
      const week = `${y}-${String(m).padStart(2, '0')}-01`
      const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))
      const { error } = await admin.from('regional_prices').upsert(rows.map((x) => ({
        region: 'Mercado Central (Bs. As.)', esp: x.esp, dest: 'mercado_interno', price: x.price, prev_price: x.prev, currency: 'ARS', week, source: 'MCBA · Monitoreo Federal', kind: 'mayorista', url: u,
      })), { onConflict: 'region,esp,dest,week,source', ignoreDuplicates: false })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, url: u, especies: rows.length })
    }
  }
  return json({ ok: true, nuevo: false, msg: 'Todavía no hay informe nuevo.' })
})
