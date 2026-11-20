import { describe, it, expect } from 'vitest'
import { validateFinca, validEmail, validPassword, friendlyAuthError } from '../src/ui/validate'
import { canUse, fincasLeft, can } from '../src/plans/plans'

describe('validaciones con mensajes claros', () => {
  it('acepta datos correctos y normaliza', () => {
    const r = validateFinca({ n: '  Lote   del río ', ha: '4,5' }); expect(r.ok && r.value).toEqual({ n: 'Lote del río', ha: 4.5 })
  })
  it('explica cada error', () => {
    const r = validateFinca({ n: 'a', ha: '' }); expect(!r.ok && r.errors.n).toMatch(/nombre/); expect(!r.ok && r.errors.ha).toMatch(/hectáreas/)
    expect(!validateFinca({ n: 'Ok', ha: '-3' }).ok).toBe(true); expect(!validateFinca({ n: 'Ok', ha: 'abc' }).ok).toBe(true)
    expect(!validateFinca({ n: 'Ok', ha: '999999' }).ok).toBe(true)
  })
  it('correo y contraseña', () => { expect(validEmail('a@b.co')).toBe(true); expect(validEmail('a@b')).toBe(false); expect(validPassword('1234567')).toBe(false) })
  it('traduce errores de acceso', () => { expect(friendlyAuthError('Invalid login credentials')).toMatch(/incorrectos/) })
})
describe('planes y roles', () => {
  it('Gratis: 1 finca, sin pizarra ni reportes. Pro: todo', () => {
    expect(fincasLeft('free', 1)).toBe(0); expect(fincasLeft('pro', 50)).toBe(Infinity)
    expect(canUse('free', 'regionalPrices')).toBe(false); expect(canUse('pro', 'exportReports')).toBe(true)
  })
  it('el Encargado no administra', () => { expect(can.manageFincas('manager')).toBe(false); expect(can.loadOperations('manager')).toBe(true) })
})
