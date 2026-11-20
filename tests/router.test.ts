import { describe, it, expect } from 'vitest'
import { parse, href } from '../src/app/router'
describe('rutas', () => {
  it('lee página y parámetros, con Inicio por defecto', () => {
    expect(parse('')).toEqual({ page: 'inicio', params: {} })
    expect(parse('#/cosecha?f=abc')).toEqual({ page: 'cosecha', params: { f: 'abc' } })
    expect(href('riego', { f: 'x', t: undefined })).toBe('#/riego?f=x')
  })
})
