import type { Precio } from './types'
export type Tendencia = { dir: 'sube' | 'baja' | 'estable' | 'nuevo'; pct: number | null }
const UMBRAL = 0.5   // variaciones menores a 0,5 % se consideran "estable"

/** Compara el precio más nuevo con el anterior de la misma serie (cultivo + zona + destino + moneda). */
export function tendencia(serie: { f: Precio }[]): Tendencia {
  const s = [...serie].sort((a, b) => (a.f.fecha < b.f.fecha ? 1 : a.f.fecha > b.f.fecha ? -1 : 0))
  if (s.length < 2) return { dir: 'nuevo', pct: null }
  const pct = ((s[0].f.p - s[1].f.p) / s[1].f.p) * 100
  return { dir: Math.abs(pct) <= UMBRAL ? 'estable' : pct > 0 ? 'sube' : 'baja', pct }
}
export const serieKey = (p: Precio) => [p.esp, p.zona, p.dest, p.moneda].join('|')
export function agrupar<T extends { f: Precio }>(rows: T[]) {
  const g = new Map<string, T[]>(); for (const r of rows) { const k = serieKey(r.f); (g.get(k) ?? g.set(k, []).get(k)!).push(r) }
  return [...g.values()].map((s) => s.sort((a, b) => (a.f.fecha < b.f.fecha ? 1 : -1)))
}
export function validarPrecio(f: { p: string; zona: string }): string | null {
  const n = Number(f.p.replace(',', '.'))
  if (!f.zona.trim()) return 'Escribí la zona o mercado.'
  if (!Number.isFinite(n) || n <= 0) return 'El precio debe ser un número mayor que 0.'
  if (n > 1e9) return 'Ese precio parece un error. Revisalo.'
  return null
}
