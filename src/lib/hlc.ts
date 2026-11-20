/** Reloj híbrido lógico (HLC). Formato ordenable como texto: 13 dígitos de ms + contador + nodo. */
const pad = (n: number, w: number) => String(n).padStart(w, '0')

export interface HlcState { wall: number; counter: number }

export class Hlc {
  constructor(public readonly node: string, private s: HlcState = { wall: 0, counter: 0 }, private clock: () => number = Date.now) {}
  state(): HlcState { return { ...this.s } }
  /** Nuevo timestamp para un evento local. Siempre mayor que cualquiera visto antes. */
  tick(): string {
    const pt = this.clock()
    if (pt > this.s.wall) { this.s = { wall: pt, counter: 0 } } else { this.s = { wall: this.s.wall, counter: this.s.counter + 1 } }
    return this.fmt()
  }
  /** Incorpora un reloj remoto, para que los eventos locales posteriores queden por encima. */
  recv(remote: string): void {
    const p = parse(remote); if (!p) return
    const pt = this.clock()
    const wall = Math.max(pt, this.s.wall, p.wall)
    let counter = 0
    if (wall === this.s.wall && wall === p.wall) counter = Math.max(this.s.counter, p.counter) + 1
    else if (wall === this.s.wall) counter = this.s.counter + 1
    else if (wall === p.wall) counter = p.counter + 1
    this.s = { wall, counter }
  }
  private fmt() { return `${pad(this.s.wall, 13)}-${pad(this.s.counter, 5)}-${this.node}` }
}

export function parse(h: string): { wall: number; counter: number; node: string } | null {
  const m = /^(\d{13})-(\d{5})-(.+)$/.exec(h); return m ? { wall: +m[1], counter: +m[2], node: m[3] } : null
}
/** Comparación de relojes (texto ordenable). */
export const newer = (a: string | undefined, b: string | undefined) => (a ?? '') > (b ?? '')
