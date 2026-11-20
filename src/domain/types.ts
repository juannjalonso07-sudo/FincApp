export type Dest = 'exportacion' | 'mercado_interno' | 'industria'
export const DEST: Record<Dest, string> = { exportacion: 'Exportación', mercado_interno: 'Mercado interno', industria: 'Industria' }

/** `geo`: contorno dibujado en el mapa, como [lat, lng]. */
export interface Finca { n: string; dest: Dest; cols: number; rows: number; ha?: number; geo?: [number, number][] }
export interface Cuadro { finca_id: string; i: number; j: number; ha: number; esp: string; var: string; anio: number; dens: number | null; estado: 'vacio' | 'joven' | 'produccion'; nota: string }
/** Producto fitosanitario del propio productor. La carencia sale de la ETIQUETA del producto. */
export interface Producto { n: string; t: string; c: number; e: number; d: number; u: string; pr: number | null }   // c: días carencia mercado interno · e: exportación
/** `car`: copia de la carencia del producto al momento de cargar la cura. Si después se edita o borra el producto, la cura no cambia. */
export interface ItemCura { p: string; dosis: number; car?: { n: string; c: number; e: number } }
export interface Curacion { fecha: string; cu: string[]; items: ItemCura[]; nota: string }
export interface Cosecha { cu: string; fecha: string; dest: Dest; n: number; kgBin: number; carencia: { motivo: string; libre: string } | null; cuadrilla?: string | null }
export interface Bin { cosecha_id: string; kg: number | null }
export interface Riego { cu: string; fecha: string; horas: number; m3: number; mm: number }
export interface Tarea { t: string; cu: string | null; fecha: string; hecha: boolean }
export interface Precio { esp: string; zona: string; dest: Dest; moneda: 'ARS' | 'USD'; p: number; fecha: string; temp: string }

/** Turno de riego semanal: qué finca, qué días (0 = domingo), a qué hora y cuántas horas. */
export interface Turno { cu: string; dias: number[]; hora: string; horas: number; resp: string; activo: boolean }
/** Cuadrilla de cosecha. Solo datos de trabajo: nombre, jefe, cantidad de personas y pago por bin. */
export interface Cuadrilla { n: string; jefe: string; personas: number; tarifa: number | null; activa: boolean }
export type EstadoEntrega = 'enviada' | 'recibida' | 'liquidada'
export const ESTADO_ENTREGA: Record<EstadoEntrega, string> = { enviada: 'Enviada', recibida: 'Recibida', liquidada: 'Liquidada' }
/** Entrega de bines a un empaque, comprador o industria, con su remito. */
export interface Entrega { fecha: string; cu: string; dest: Dest; comprador: string; remito: string; bins: number; kg: number; precio: number | null; moneda: 'ARS' | 'USD'; estado: EstadoEntrega }
