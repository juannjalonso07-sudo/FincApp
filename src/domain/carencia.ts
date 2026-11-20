import { addDays, diffDays } from './dates'
import type { Curacion, Dest, Producto } from './types'

export interface Row<T> { id: string; f: T }

/** Días de espera de un producto según el destino. Exportación usa el mayor entre ambos valores. */
export const diasCarencia = (p: Pick<Producto, 'c' | 'e'>, dest: Dest) => (dest === 'exportacion' ? Math.max(p.c, p.e) : p.c)

export interface Libre { fecha: string; producto: string; aplicada: string; dias: number }

/** Fecha en que la finca queda libre: la carencia más larga entre todo lo aplicado (hasta `upto`, si se indica). */
export function libreDe(fincaId: string, dest: Dest, curas: Row<Curacion>[], prods: Record<string, Producto>, upto?: string): Libre | null {
  let L: Libre | null = null
  for (const r of curas) {
    if (!r.f.cu.includes(fincaId) || (upto && r.f.fecha > upto)) continue
    for (const it of r.f.items) {
      const p = it.car ?? prods[it.p]; if (!p) continue
      const d = diasCarencia(p, dest), f = addDays(r.f.fecha, d)
      if (!L || f > L.fecha) L = { fecha: f, producto: p.n, aplicada: r.f.fecha, dias: d }
    }
  }
  return L
}

export interface Estado { libre: boolean; faltan: number; L: Libre | null; progreso: number }
/** Estado para mostrar: ¿se puede cosechar hoy? ¿cuántos días faltan? ¿cuánto de la espera ya pasó (0–100)? */
export function estadoFinca(L: Libre | null, hoy: string): Estado {
  if (!L) return { libre: true, faltan: 0, L, progreso: 100 }
  const faltan = diffDays(hoy, L.fecha)
  if (faltan <= 0) return { libre: true, faltan: 0, L, progreso: 100 }
  const total = Math.max(1, L.dias), pasados = total - faltan
  return { libre: false, faltan, L, progreso: Math.max(4, Math.min(99, Math.round((100 * pasados) / total))) }
}

/** ¿Se puede cosechar esa fecha? Considera solo curas hechas hasta esa fecha. */
export function chequeoCosecha(fincaId: string, dest: Dest, fecha: string, curas: Row<Curacion>[], prods: Record<string, Producto>) {
  const L = libreDe(fincaId, dest, curas, prods, fecha)
  return { dentro: !!L && L.fecha > fecha, L }
}

/** Valida el producto antes de guardarlo. */
export function validarProducto(p: Partial<Producto>): string | null {
  if (!p.n || p.n.trim().length < 2) return 'Escribí el nombre del producto.'
  for (const [k, lbl] of [['c', 'mercado interno'], ['e', 'exportación']] as const) {
    const v = p[k]; if (v == null || !Number.isInteger(v) || v < 0 || v > 365) return `La carencia para ${lbl} debe ser un número de días entre 0 y 365. Mirá la etiqueta del producto.`
  }
  if (p.d == null || !(p.d > 0)) return 'Indicá la dosis por hectárea (mayor que 0).'
  return null
}
