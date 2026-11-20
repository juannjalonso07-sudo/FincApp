/** m³ aplicados = horas × caudal (L/s) × 3,6. mm = m³ / (ha × 10). */
export function calcRiego(horas: number, caudalLs: number, ha: number) {
  const m3 = horas * caudalLs * 3.6
  return { m3: Math.round(m3 * 10) / 10, mm: ha > 0 ? Math.round((m3 / (ha * 10)) * 10) / 10 : 0 }
}
