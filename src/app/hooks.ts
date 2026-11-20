import { useMemo } from 'react'
import { useRecords } from './DataProvider'
import type { Row } from '../domain/carencia'
import type { Finca, Cuadro, Producto, Curacion, Cosecha, Riego, Tarea, Precio, Turno, Cuadrilla, Entrega } from '../domain/types'

export function useRows<T>(entity: string): Row<T>[] {
  const r = useRecords(entity)
  return useMemo(() => r.map((x) => ({ id: x.id, f: x.fields as unknown as T })), [r])
}
export const useFincas = () => useRows<Finca>('finca')
export const useCuadros = () => useRows<Cuadro>('cuadro')
export const useCuras = () => useRows<Curacion>('curacion')
export const useCosechas = () => useRows<Cosecha>('cosecha')
export const useRiegos = () => useRows<Riego>('riego')
export const useTareas = () => useRows<Tarea>('tarea')
export const usePrecios = () => useRows<Precio>('precio')
export const useTurnos = () => useRows<Turno>('turno')
export const useCuadrillas = () => useRows<Cuadrilla>('cuadrilla')
export const useEntregas = () => useRows<Entrega>('entrega')
export function useProductos() {
  const rows = useRows<Producto>('producto')
  const map = useMemo(() => Object.fromEntries(rows.map((r) => [r.id, r.f])), [rows])
  return { rows, map }
}
/** Cultivo principal de una finca (el que más cuadros ocupa). */
export function topEsp(cuadros: Row<Cuadro>[], fincaId: string): string | null {
  const n: Record<string, number> = {}
  for (const c of cuadros) if (c.f.finca_id === fincaId && c.f.esp && c.f.estado !== 'vacio') n[c.f.esp] = (n[c.f.esp] ?? 0) + 1
  return Object.keys(n).sort((a, b) => n[b] - n[a])[0] ?? null
}
export interface Nav { go(page: string, preset?: { fincaId?: string }): void; preset?: { fincaId?: string } }
