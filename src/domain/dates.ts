/** Fechas como texto ISO (AAAA-MM-DD), sin zonas horarias: así un día es el mismo día en todos los equipos. */
export const todayISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const toUTC = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
export const addDays = (s: string, n: number) => { const t = new Date(toUTC(s) + n * 864e5); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}` }
/** Días de a hasta b (positivo si b es posterior). */
export const diffDays = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / 864e5)
export const isISO = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUTC(s))
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const fmtDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return `${d} ${MES[m - 1]} ${y}` }
/** Temporada agrícola: de julio a junio (ej. 2026/27). */
export const temporada = (s: string) => { const y = +s.slice(0, 4), m = +s.slice(5, 7); return m >= 7 ? `${y}/${String(y + 1).slice(2)}` : `${y - 1}/${String(y).slice(2)}` }
