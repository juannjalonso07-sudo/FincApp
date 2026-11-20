/** UUID v7: ordenable por tiempo, generado en el dispositivo (funciona sin conexión). */
export function uuidv7(now = Date.now()): string {
  const b = new Uint8Array(16); crypto.getRandomValues(b)
  const ts = BigInt(now)
  b[0] = Number((ts >> 40n) & 0xffn); b[1] = Number((ts >> 32n) & 0xffn); b[2] = Number((ts >> 24n) & 0xffn)
  b[3] = Number((ts >> 16n) & 0xffn); b[4] = Number((ts >> 8n) & 0xffn); b[5] = Number(ts & 0xffn)
  b[6] = (b[6] & 0x0f) | 0x70; b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Id estable derivado de otro (p. ej. la configuración de riego de una finca): mismo resultado en todos los equipos y distinto del original. */
export function derivedId(base: string, salt: string): string {
  let h = 0x811c9dc5; for (const ch of salt) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0
  const tail = base.slice(-12), x = (BigInt('0x' + tail) ^ (BigInt(h) * 0x10001n | 1n)) & 0xffffffffffffn
  return base.slice(0, -12) + x.toString(16).padStart(12, '0')
}
