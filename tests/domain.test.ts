import { describe, it, expect } from 'vitest'
import { addDays, diffDays, temporada, isISO } from '../src/domain/dates'
import { diasCarencia, libreDe, estadoFinca, chequeoCosecha, validarProducto } from '../src/domain/carencia'
import { calcRiego } from '../src/domain/riego'
import { tendencia, agrupar, validarPrecio } from '../src/domain/mercado'
import { fruitSvg } from '../src/domain/fruit'
import { ESP, VARS } from '../src/domain/catalog'

const prods = { a: { n: 'Spinosad', t: '', c: 7, e: 10, d: 1, u: 'L/ha', pr: null }, b: { n: 'Abamectina', t: '', c: 21, e: 28, d: 1, u: 'L/ha', pr: null } }
const cura = (id: string, fecha: string, cu: string[], p: string) => ({ id, f: { fecha, cu, items: [{ p, dosis: 1 }], nota: '' } })

describe('fechas', () => {
  it('suma y resta días sin errores de huso ni de fin de mes', () => {
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02'); expect(addDays('2026-12-30', 3)).toBe('2027-01-02'); expect(diffDays('2026-11-19', '2026-11-23')).toBe(4)
  })
  it('temporada de julio a junio', () => { expect(temporada('2026-11-19')).toBe('2026/27'); expect(temporada('2027-03-01')).toBe('2026/27') })
  it('valida fechas', () => { expect(isISO('2026-02-30')).toBe(true) /* JS normaliza */; expect(isISO('hoy')).toBe(false) })
})
describe('carencia', () => {
  it('exportación usa el mayor valor', () => { expect(diasCarencia(prods.a, 'exportacion')).toBe(10); expect(diasCarencia(prods.a, 'mercado_interno')).toBe(7) })
  it('queda libre cuando termina la carencia MÁS larga', () => {
    const curas = [cura('1', '2026-11-10', ['f1'], 'a'), cura('2', '2026-11-12', ['f1'], 'b'), cura('3', '2026-11-12', ['f2'], 'a')]
    const L = libreDe('f1', 'mercado_interno', curas, prods)!; expect(L.fecha).toBe('2026-12-03'); expect(L.producto).toBe('Abamectina')
    expect(libreDe('f9', 'mercado_interno', curas, prods)).toBeNull()
  })
  it('estado: faltan días y progreso; listo cuando vence', () => {
    const L = libreDe('f1', 'mercado_interno', [cura('1', '2026-11-10', ['f1'], 'b')], prods)!   // libre 2026-12-01
    const e = estadoFinca(L, '2026-11-19'); expect(e.libre).toBe(false); expect(e.faltan).toBe(12); expect(e.progreso).toBe(43)
    expect(estadoFinca(L, '2026-12-01').libre).toBe(true); expect(estadoFinca(null, '2026-11-19').libre).toBe(true)
  })
  it('una cura posterior a la cosecha no la bloquea (cosecha con fecha pasada)', () => {
    const curas = [cura('1', '2026-11-10', ['f1'], 'a'), cura('2', '2026-11-20', ['f1'], 'b')]
    expect(chequeoCosecha('f1', 'mercado_interno', '2026-11-18', curas, prods).dentro).toBe(false)   // libre el 17; la cura del 20 es posterior y no cuenta
  })
  it('cosechar dentro de carencia se detecta', () => {
    expect(chequeoCosecha('f1', 'mercado_interno', '2026-11-12', [cura('1', '2026-11-10', ['f1'], 'a')], prods).dentro).toBe(true)
    expect(chequeoCosecha('f1', 'mercado_interno', '2026-11-17', [cura('1', '2026-11-10', ['f1'], 'a')], prods).dentro).toBe(false)
  })
  it('valida productos: la carencia debe venir de la etiqueta', () => {
    expect(validarProducto({ n: 'X', c: 1, e: 1, d: 1 })).toMatch(/nombre/); expect(validarProducto({ n: 'Ok', c: -1, e: 1, d: 1 })).toMatch(/interno/)
    expect(validarProducto({ n: 'Ok', c: 7, e: 400, d: 1 })).toMatch(/exportación/); expect(validarProducto({ n: 'Ok', c: 7, e: 7, d: 0 })).toMatch(/dosis/); expect(validarProducto({ n: 'Ok', c: 7, e: 7, d: 1 })).toBeNull()
  })
})
describe('riego y mercado', () => {
  it('m³ y mm', () => { expect(calcRiego(4, 10, 2)).toEqual({ m3: 144, mm: 7.2 }); expect(calcRiego(1, 1, 0).mm).toBe(0) })
  it('tendencias', () => {
    const P = (p: number, fecha: string) => ({ f: { esp: 'durazno', zona: 'Z', dest: 'mercado_interno' as const, moneda: 'ARS' as const, p, fecha, temp: '2026/27' } })
    expect(tendencia([P(100, '2026-11-01'), P(110, '2026-11-10')]).dir).toBe('sube'); expect(tendencia([P(100, '2026-11-01'), P(90, '2026-11-10')]).dir).toBe('baja')
    expect(tendencia([P(100, '2026-11-01'), P(100.3, '2026-11-10')]).dir).toBe('estable'); expect(tendencia([P(100, '2026-11-01')]).dir).toBe('nuevo')
    expect(agrupar([P(1, '2026-11-01'), P(2, '2026-11-02')]).length).toBe(1)
  })
  it('valida precios', () => { expect(validarPrecio({ p: '0', zona: 'x' })).toMatch(/mayor/); expect(validarPrecio({ p: '12,5', zona: '' })).toMatch(/zona/); expect(validarPrecio({ p: '12,5', zona: 'x' })).toBeNull() })
})
describe('catálogo', () => {
  it('cada cultivo con variedades existe y tiene ícono', () => { for (const k of Object.keys(VARS)) { expect(ESP[k]).toBeTruthy(); expect(fruitSvg(k)).toContain('<svg') } expect(Object.keys(ESP).length).toBeGreaterThanOrEqual(23) })
})

describe('carencia guardada en la cura', () => {
  it('si se borra o se edita el producto, la cura conserva su carencia original', () => {
    const curas = [{ id: 'a', f: { fecha: '2026-11-01', cu: ['f1'], items: [{ p: 'gone', dosis: 1, car: { n: 'X', c: 20, e: 30 } }], nota: '' } }]
    expect(libreDe('f1', 'exportacion', curas, {})?.fecha).toBe('2026-12-01')
    expect(libreDe('f1', 'exportacion', curas, { gone: { n: 'X', c: 1, e: 1, t: '', d: 1, u: '', pr: 0 } as any })?.fecha).toBe('2026-12-01')
  })
})

import { areaHa } from '../src/domain/geo'
import { validarTurno, turnosDelDia, choques, stockBines, validarEntrega, resumenEntregas, resumenCuadrillas } from '../src/domain/operaciones'
describe('mapa', () => {
  it('un cuadrado de ~100 m de lado mide ~1 ha', () => {
    const d = 100 / 111_320, la = -33, lo = -68.8, dl = d / Math.cos(la * Math.PI / 180)
    expect(areaHa([[la, lo], [la, lo + dl], [la + d, lo + dl], [la + d, lo]])).toBeCloseTo(1, 1)
    expect(areaHa([[0, 0], [1, 1]])).toBe(0)
  })
})
describe('turnos de riego', () => {
  const T = (id: string, cu: string, dias: number[], hora: string, horas: number) => ({ id, f: { cu, dias, hora, horas, resp: '', activo: true } })
  it('valida y ordena los turnos del día', () => {
    expect(validarTurno({ cu: 'a', dias: [], hora: '06:00', horas: 2 })).toMatch(/día/)
    expect(validarTurno({ cu: 'a', dias: [1], hora: '25:00', horas: 2 })).toMatch(/hora/)
    const ts = [T('1', 'a', [5], '18:00', 2), T('2', 'b', [5], '06:30', 4), T('3', 'c', [1], '06:00', 1)]
    expect(turnosDelDia(ts, '2026-11-20').map((t) => t.id)).toEqual(['2', '1'])   // 20/11/2026 es viernes
  })
  it('avisa si dos turnos de la misma finca se pisan', () => {
    const ts = [T('1', 'a', [1, 3], '06:00', 4)]
    expect(choques(ts, { cu: 'a', dias: [3], hora: '09:00', horas: 2, resp: '', activo: true }).length).toBe(1)
    expect(choques(ts, { cu: 'a', dias: [3], hora: '10:00', horas: 2, resp: '', activo: true }).length).toBe(0)
    expect(choques(ts, { cu: 'b', dias: [3], hora: '09:00', horas: 2, resp: '', activo: true }).length).toBe(0)
  })
})
describe('cuadrillas y entregas', () => {
  const cos = [{ id: 'c1', f: { cu: 'a', fecha: '2026-12-02', dest: 'exportacion' as const, n: 10, kgBin: 400, carencia: null, cuadrilla: 'q1' } }, { id: 'c2', f: { cu: 'a', fecha: '2026-12-03', dest: 'exportacion' as const, n: 6, kgBin: 400, carencia: null, cuadrilla: 'q1' } }]
  const ent = [{ id: 'e1', f: { fecha: '2026-12-04', cu: 'a', dest: 'exportacion' as const, comprador: 'Empaque Sur', remito: '0001', bins: 12, kg: 4700, precio: 500, moneda: 'ARS' as const, estado: 'recibida' as const } }]
  it('stock de bines = cosechados − entregados', () => { expect(stockBines(cos, ent)).toEqual({ a: 4 }) })
  it('resumen de cuadrilla: bines, días y pago por bin', () => {
    expect(resumenCuadrillas(cos, [{ id: 'q1', f: { n: 'Los Pérez', jefe: 'Juan', personas: 8, tarifa: 1500, activa: true } }], '2026/27')[0]).toMatchObject({ bins: 16, dias: 2, pago: 24000 })
  })
  it('entregas: validación y lo pendiente de liquidar', () => {
    expect(validarEntrega({ cu: 'a', comprador: 'XY', bins: 0, kg: 1 })).toMatch(/bines/)
    expect(resumenEntregas(ent, '2026/27')).toMatchObject({ kg: 4700, bins: 12, monto: { ARS: 2_350_000 }, pendiente: { ARS: 2_350_000 } })
  })
})

import { cuaderno, csv } from '../src/domain/reportes'
describe('reportes', () => {
  it('cuaderno de campo de la temporada, con la carencia guardada en la cura', () => {
    const t = cuaderno({ temp: '2026/27', fincas: [{ id: 'a', f: { n: 'Lote 1', dest: 'exportacion', cols: 1, rows: 1 } }],
      curas: [{ id: 'c', f: { fecha: '2026-11-01', cu: ['a'], items: [{ p: 'x', dosis: 0.5, car: { n: 'Captan', c: 7, e: 14 } }], nota: '' } }, { id: 'old', f: { fecha: '2026-05-01', cu: ['a'], items: [], nota: '' } }],
      cosechas: [], riegos: [], entregas: [], prods: {} })
    expect(t[0].filas).toEqual([['01/11/2026', 'Lote 1', 'Captan', '', '0.5', 14, '15/11/2026', '']])
  })
  it('CSV para Excel en español y sin fórmulas inyectadas', () => {
    const s = csv({ titulo: 'x', cols: ['A', 'B'], filas: [['=HYPERLINK("x")', 1.5], ['a;b', 2]] })
    expect(s.startsWith('﻿')).toBe(true); expect(s).toContain(`"'=HYPERLINK(""x"")";1,5`); expect(s).toContain('"a;b";2')
  })
})
