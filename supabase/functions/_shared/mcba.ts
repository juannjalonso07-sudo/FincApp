// Lector del informe mensual "Monitoreo Federal" del Mercado Central de Buenos Aires (PDF).
// Son precios MAYORISTAS de referencia en $/kg por especie (no por variedad, no precio al productor).

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
/** Especies del informe que usa FincApp, con su clave interna. */
export const ESPECIES: Record<string, string> = { manzana: 'manzana', pera: 'pera', durazno: 'durazno', ciruela: 'ciruela', uva: 'vid', kiwi: 'kiwi', frutilla: 'frutilla', palta: 'palta', naranja: 'naranja', mandarina: 'mandarina', 'limón': 'limon', limon: 'limon', pomelo: 'pomelo' }

/** URLs posibles del informe de un mes (el nombre del archivo varía: a veces lleva sufijo). */
export function urlsMes(year: number, month1: number): string[] {
  const base = `https://mercadocentral.gob.ar/sites/default/files/docs/MonitoreoFederal-${MESES[month1 - 1]}${String(year).slice(2)}`
  return ['', 'a', '_c', '_0', '-0'].map((s) => `${base}${s}.pdf`)
}

const num = (t: string) => Number(t.replace(/\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.'))
/** Busca, para cada especie, los dos primeros precios que le siguen (mes anterior, mes actual) en la tabla mensual.
 *  Tolera texto desordenado: solo acepta pares cuya variación coincida con el % informado (si está), o con un salto < 60 %. */
export function parseMonitoreo(text: string): { esp: string; prev: number; price: number }[] {
  const t = text.replace(/\s+/g, ' ')
  const out: { esp: string; prev: number; price: number }[] = [], seen = new Set<string>()
  for (const [name, key] of Object.entries(ESPECIES)) {
    if (seen.has(key)) continue
    const re = new RegExp(`${name}\\s+\\$?\\s?([\\d.]+,\\d{1,2})\\s+\\$?\\s?([\\d.]+,\\d{1,2})(?:\\s+([+-−]?\\s?[\\d.,]+)\\s?%)?`, 'i')
    const m = re.exec(t); if (!m) continue
    const prev = num(m[1]), price = num(m[2]); if (!(prev > 0 && price > 0)) continue
    const pct = m[3] ? num(m[3].replace('−', '-')) : null, real = ((price - prev) / prev) * 100
    if (pct != null ? Math.abs(real - pct) > 0.6 : Math.abs(real) > 60) continue
    out.push({ esp: key, prev, price }); seen.add(key)
  }
  return out
}
