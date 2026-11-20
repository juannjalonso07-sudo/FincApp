/** Superficie de un polígono [lat, lng] en hectáreas (proyección local equirectangular: error < 0,5 % en lotes de campo). */
export function areaHa(pts: [number, number][]): number {
  if (pts.length < 3) return 0
  const R = 6371008.8, lat0 = (pts.reduce((s, p) => s + p[0], 0) / pts.length) * Math.PI / 180
  const xy = pts.map(([la, lo]) => [R * (lo * Math.PI / 180) * Math.cos(lat0), R * (la * Math.PI / 180)])
  let a = 0; for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length]; a += x1 * y2 - x2 * y1 }
  return Math.round((Math.abs(a) / 2 / 10_000) * 100) / 100
}
export function centro(pts: [number, number][]): [number, number] | null {
  if (!pts.length) return null
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
}
/** Fuentes de imagen satelital y su licencia (la app es comercial: importa). */
export const SATS = {
  eox: { n: 'Sentinel-2 · EOX 2016', url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2016_3857/default/g/{z}/{y}/{x}.jpg', max: 15, attr: 'Sentinel-2 cloudless — s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)', nota: 'Sin cuenta. Imagen de 2016 sin nubes, 10 m por píxel. Licencia CC BY 4.0: se puede usar comercialmente citando la fuente.' },
  sentinel: { n: 'Sentinel-2 · Copernicus', url: '', max: 16, attr: 'Contains modified Copernicus Sentinel data · Copernicus Data Space Ecosystem', nota: 'Imágenes recientes. Necesita una configuración gratuita en dataspace.copernicus.eu. Uso comercial permitido citando a Copernicus.' },
  esri: { n: 'Esri · alta resolución', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max: 19, attr: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics', nota: 'Se ven las plantas, pero su licencia NO permite uso comercial sin contrato con Esri. Solo para probar.' },
} as const
export type SatKey = keyof typeof SATS
export const copernicusUrl = (instance: string, layer = 'TRUE-COLOR') => `https://sh.dataspace.copernicus.eu/ogc/wmts/${encodeURIComponent(instance)}?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=${encodeURIComponent(layer)}&STYLE=default&FORMAT=image/jpeg&TILEMATRIXSET=PopularWebMercator256&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`
