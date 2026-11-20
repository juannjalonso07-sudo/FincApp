import type { ReactNode } from 'react'
import { fruitSvg } from '../domain/fruit'

export const Fruit = ({ esp, px = 20 }: { esp: string; px?: number }) => <span className="fruit" dangerouslySetInnerHTML={{ __html: fruitSvg(esp, px) }} />
export function Field({ label, error, children }: { label: string; error?: string | null; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{error && <small className="err">{error}</small>}</label>
}
export function Steps({ labels, step }: { labels: string[]; step: number }) {
  return <ol className="steps" aria-label="Pasos">{labels.map((l, i) => <li key={l} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}><b>{i + 1}</b>{l}</li>)}</ol>
}
export const Empty = ({ children }: { children: ReactNode }) => <p className="muted empty">{children}</p>
export const Pill = ({ k, children }: { k: 'ok' | 'warn' | 'bad' | 'neutral'; children: ReactNode }) => <span className={`pill2 ${k}`}>{children}</span>
