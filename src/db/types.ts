export type Fields = Record<string, unknown>

export interface LocalRecord {
  key: string              // `${entity}:${id}`
  entity: string
  id: string
  fields: Fields
  clocks: Record<string, string>   // campo -> HLC
  deleted: boolean
  serverKnown: boolean     // false = creado acá y todavía no aceptado por el servidor
}

export interface Op {
  op: string               // id único de la operación (idempotencia)
  entity: string
  id: string
  hlc: string
  set?: Fields
  del?: boolean
  failed?: string          // motivo si el servidor la rechazó
  at: number
}

export interface RemoteRecord { id: string; entity: string; fields: Fields; clocks: Record<string, string>; deleted: boolean; seq: number }

export interface Transport {
  push(org: string, ops: Omit<Op, 'failed' | 'at'>[]): Promise<{ applied: string[]; rejected: { op: string; reason: string }[] }>
  pull(org: string, since: number, limit: number): Promise<{ records: RemoteRecord[]; cursor: number; more: boolean }>
}
