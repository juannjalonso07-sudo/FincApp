import type { Row } from './carencia'
import { addDays, temporada } from './dates'
import { DEST, ESTADO_ENTREGA, type Cosecha, type Curacion, type Entrega, type Finca, type Producto, type Riego } from './types'
import { diasCarencia } from './carencia'

export interface Tabla { titulo: string; cols: string[]; filas: (string | number)[][] }
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** Cuaderno de campo de una temporada: lo que pide un auditor (GlobalG.A.P., SENASA) y el empaque. */
export function cuaderno(o: { temp: string; fincaId?: string; fincas: Row<Finca>[]; curas: Row<Curacion>[]; cosechas: Row<Cosecha>[]; riegos: Row<Riego>[]; entregas: Row<Entrega>[]; prods: Record<string, Producto> }): Tabla[] {
  const fn = (id: string) => o.fincas.find((f) => f.id === id)?.f.n ?? '—', dest = (id: string) => o.fincas.find((f) => f.id === id)?.f.dest ?? 'mercado_interno'
  const enT = (d: string) => temporada(d) === o.temp, deF = (id: string) => !o.fincaId || id === o.fincaId, ord = <T extends { f: { fecha: string } }>(a: T, b: T) => (a.f.fecha < b.f.fecha ? -1 : 1)
  const curas: Tabla = { titulo: 'Aplicaciones fitosanitarias', cols: ['Fecha', 'Finca', 'Producto', 'Principio activo', 'Dosis', 'Carencia (días)', 'Libre desde', 'Nota'], filas: [] }
  for (const c of o.curas.filter((c) => enT(c.f.fecha)).sort(ord)) for (const cu of c.f.cu.filter(deF)) for (const it of c.f.items) {
    const p = o.prods[it.p], car = it.car ?? p; const d = car ? diasCarencia(car, dest(cu)) : 0
    curas.filas.push([dmy(c.f.fecha), fn(cu), car?.n ?? p?.n ?? '—', p?.t ?? '', `${it.dosis} ${p?.u ?? ''}`.trim(), d, dmy(addDays(c.f.fecha, d)), c.f.nota ?? ''])
  }
  const cos: Tabla = { titulo: 'Cosechas', cols: ['Fecha', 'Finca', 'Destino', 'Bines', 'Kg', 'Cosecha en carencia'], filas: o.cosechas.filter((c) => enT(c.f.fecha) && deF(c.f.cu)).sort(ord).map((c) => [dmy(c.f.fecha), fn(c.f.cu), DEST[c.f.dest], c.f.n, Math.round(c.f.n * c.f.kgBin), c.f.carencia ? `Sí: ${c.f.carencia.motivo}` : 'No']) }
  const rie: Tabla = { titulo: 'Riegos', cols: ['Fecha', 'Finca', 'Horas', 'm³', 'mm'], filas: o.riegos.filter((r) => enT(r.f.fecha) && deF(r.f.cu)).sort(ord).map((r) => [dmy(r.f.fecha), fn(r.f.cu), r.f.horas, r.f.m3, r.f.mm]) }
  const ent: Tabla = { titulo: 'Entregas', cols: ['Fecha', 'Finca', 'Comprador', 'Remito', 'Bines', 'Kg', 'Precio/kg', 'Moneda', 'Estado'], filas: o.entregas.filter((e) => enT(e.f.fecha) && deF(e.f.cu)).sort(ord).map((e) => [dmy(e.f.fecha), fn(e.f.cu), e.f.comprador, e.f.remito, e.f.bins, e.f.kg, e.f.precio ?? '', e.f.moneda, ESTADO_ENTREGA[e.f.estado]]) }
  return [curas, cos, rie, ent]
}

/** CSV que Excel en español abre bien: separador `;`, coma decimal y BOM UTF-8. Neutraliza fórmulas (=, +, -, @) por seguridad. */
export function csv(t: Tabla): string {
  const cell = (v: string | number) => {
    let s = typeof v === 'number' ? String(v).replace('.', ',') : v
    if (/^[=+\-@\t\r]/.test(s) && typeof v !== 'number') s = `'${s}`
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [t.cols, ...t.filas].map((r) => r.map(cell).join(';')).join('\r\n')
}
