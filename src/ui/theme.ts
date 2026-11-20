/** Tema automático por hora local (claro 07:00–19:59, oscuro 20:00–06:59) con preferencia manual hasta el próximo cambio. */
export const autoTheme = (d = new Date()): 'light' | 'dark' => (d.getHours() >= 7 && d.getHours() < 20 ? 'light' : 'dark')
export function nextBoundary(d: Date): number {
  const n = new Date(d.getTime()); n.setMinutes(0, 0, 0); const h = d.getHours(); n.setHours(h < 7 ? 7 : h < 20 ? 20 : 31); return n.getTime()
}
const KEY = 'fincapp.theme'
export function themePref(now = Date.now()): { v: 'light' | 'dark'; until: number } | null {
  try { const p = JSON.parse(localStorage.getItem(KEY) || 'null'); return p && now < p.until ? p : null } catch { return null }
}
export function applyTheme() { document.documentElement.dataset.theme = themePref()?.v ?? autoTheme() }
export function setTheme(mode: 'auto' | 'light' | 'dark') {
  try { if (mode === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, JSON.stringify({ v: mode, until: nextBoundary(new Date()) })) } catch { /* sin almacenamiento */ }
  applyTheme()
}
