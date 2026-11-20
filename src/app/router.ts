import { useEffect, useState } from 'react'

/** Rutas por hash (`#/cosecha?f=<finca>`): funcionan igual en la web, en la PWA instalada y en Tauri,
 *  sin configurar el servidor. Recargar deja al productor donde estaba y los enlaces se pueden compartir. */
export interface Route { page: string; params: Record<string, string> }
export function parse(hash: string): Route {
  const h = hash.replace(/^#\/?/, ''), [p, q = ''] = h.split('?')
  return { page: decodeURIComponent(p || 'inicio'), params: Object.fromEntries(new URLSearchParams(q)) }
}
export function href(page: string, params: Record<string, string | undefined> = {}) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString()
  return `#/${page}${q ? `?${q}` : ''}`
}
export function go(page: string, params: Record<string, string | undefined> = {}) {
  const h = href(page, params); if (location.hash !== h) location.hash = h
  window.scrollTo({ top: 0 })
}
export function useRoute(): Route {
  const [r, setR] = useState(() => parse(location.hash))
  useEffect(() => { const f = () => setR(parse(location.hash)); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f) }, [])
  return r
}
