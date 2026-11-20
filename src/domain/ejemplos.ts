import type { Producto } from './types'
/**
 * PRODUCTOS DE EJEMPLO para empezar. Las carencias son orientativas:
 * el productor DEBE verificarlas en la etiqueta del producto y en la normativa vigente (SENASA / país de destino).
 */
export const PRODUCTOS_EJEMPLO: Producto[] = [
  { n: 'Spinosad', t: 'Insecticida', c: 7, e: 10, d: 0.15, u: 'L/ha', pr: null },
  { n: 'Oxicloruro de cobre', t: 'Fungicida cúprico', c: 7, e: 7, d: 2, u: 'kg/ha', pr: null },
  { n: 'Abamectina', t: 'Acaricida', c: 21, e: 28, d: 0.5, u: 'L/ha', pr: null },
  { n: 'Azufre mojable', t: 'Fungicida', c: 1, e: 3, d: 3, u: 'kg/ha', pr: null },
  { n: 'Tebuconazol', t: 'Fungicida sistémico', c: 14, e: 21, d: 0.8, u: 'L/ha', pr: null },
  { n: 'Aceite mineral', t: 'Coadyuvante', c: 0, e: 0, d: 5, u: 'L/ha', pr: null },
]
