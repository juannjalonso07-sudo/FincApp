import type { Row } from './carencia'
import type { Cosecha, Cuadrilla, Entrega, Turno } from './types'
import { temporada } from './dates'

// ---------- turnos de riego ----------
const min = (h: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(h); return m ? +m[1] * 60 + +m[2] : NaN }
export const fmtHora = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
/** Día de la semana de una fecha ISO, sin depender de la zona horaria. */
export const diaSemana = (iso: string) => new Date(iso + 'T12:00:00').getDay()

export function validarTurno(t: Partial<Turno>): string | null {
  if (!t.cu) return 'Elegí la finca.'
  if (!t.dias?.length) return 'Elegí al menos un día de la semana.'
  if (!(min(t.hora ?? '') >= 0 && min(t.hora ?? '') < 1440)) return 'Escribí la hora de inicio como 06:30.'
  if (!(t.horas && t.horas > 0 && t.horas <= 24)) return 'La duración debe estar entre 0 y 24 horas.'
  return null
}
/** Turnos que tocan una fecha, ordenados por hora, con hora de fin. */
export function turnosDelDia(turnos: Row<Turno>[], fecha: string) {
  const d = diaSemana(fecha)
  return turnos.filter((t) => t.f.activo && t.f.dias.includes(d)).map((t) => ({ ...t, ini: min(t.f.hora), fin: min(t.f.hora) + Math.round(t.f.horas * 60) })).sort((a, b) => a.ini - b.ini)
}
/** Turnos de la misma finca que se pisan algún día (mismo día y horarios superpuestos). */
export function choques(turnos: Row<Turno>[], nuevo: Turno, ignorarId?: string): Row<Turno>[] {
  const a0 = min(nuevo.hora), a1 = a0 + nuevo.horas * 60
  return turnos.filter((t) => t.id !== ignorarId && t.f.activo && t.f.cu === nuevo.cu && t.f.dias.some((d) => nuevo.dias.includes(d)))
    .filter((t) => { const b0 = min(t.f.hora), b1 = b0 + t.f.horas * 60; return a0 < b1 && b0 < a1 })
}

// ---------- cuadrillas ----------
/** Bines y pago estimado por cuadrilla en una temporada (julio–junio). */
export function resumenCuadrillas(cos: Row<Cosecha>[], cuad: Row<Cuadrilla>[], temp: string) {
  return cuad.map((c) => {
    const mias = cos.filter((x) => x.f.cuadrilla === c.id && temporada(x.f.fecha) === temp)
    const bins = mias.reduce((s, x) => s + x.f.n, 0)
    return { id: c.id, f: c.f, bins, dias: new Set(mias.map((x) => x.f.fecha)).size, pago: c.f.tarifa ? bins * c.f.tarifa : null }
  })
}

// ---------- entregas ----------
/** Bines cosechados que todavía no salieron, por finca. */
export function stockBines(cos: Row<Cosecha>[], ent: Row<Entrega>[]): Record<string, number> {
  const s: Record<string, number> = {}
  for (const c of cos) s[c.f.cu] = (s[c.f.cu] ?? 0) + c.f.n
  for (const e of ent) s[e.f.cu] = (s[e.f.cu] ?? 0) - e.f.bins
  return s
}
export function validarEntrega(e: Partial<Entrega>): string | null {
  if (!e.cu) return 'Elegí de qué finca sale la fruta.'
  if (!e.comprador || e.comprador.trim().length < 2) return 'Escribí a quién le entregás (empaque, comprador o industria).'
  if (!Number.isInteger(e.bins) || e.bins! < 1 || e.bins! > 5000) return 'La cantidad de bines debe ser un número entero entre 1 y 5000.'
  if (!(e.kg! > 0)) return 'Indicá los kilos entregados (según balanza o remito).'
  if (e.precio != null && !(e.precio > 0)) return 'El precio por kilo debe ser mayor que 0, o dejalo vacío si todavía no lo sabés.'
  return null
}
/** Totales de la temporada: kg entregados, monto por moneda y cuánto falta liquidar. */
export function resumenEntregas(ent: Row<Entrega>[], temp: string) {
  const t = ent.filter((e) => temporada(e.f.fecha) === temp)
  const monto: Record<string, number> = {}, pendiente: Record<string, number> = {}
  for (const e of t) if (e.f.precio) { const m = e.f.kg * e.f.precio; monto[e.f.moneda] = (monto[e.f.moneda] ?? 0) + m; if (e.f.estado !== 'liquidada') pendiente[e.f.moneda] = (pendiente[e.f.moneda] ?? 0) + m }
  return { kg: t.reduce((s, e) => s + e.f.kg, 0), bins: t.reduce((s, e) => s + e.f.bins, 0), monto, pendiente, sinPrecio: t.filter((e) => !e.f.precio).length }
}
