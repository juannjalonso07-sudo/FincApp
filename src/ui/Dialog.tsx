import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export interface ConfirmOpts { title: string; body?: ReactNode; ok?: string; cancel?: string; danger?: boolean }
type Ask = (o: ConfirmOpts) => Promise<boolean>
const C = createContext<Ask>(async () => false)

/** Diálogo propio en lugar de `confirm()`: con el estilo de la app, accesible (foco, Esc, Tab) y que funciona en Tauri y en la PWA. */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [cur, setCur] = useState<(ConfirmOpts & { done: (v: boolean) => void }) | null>(null)
  const ask = useCallback<Ask>((o) => new Promise((done) => setCur({ ...o, done })), [])
  return <C.Provider value={ask}>{children}{cur && <Modal o={cur} close={(v) => { cur.done(v); setCur(null) }} />}</C.Provider>
}
export const useConfirm = () => useContext(C)

function Modal({ o, close }: { o: ConfirmOpts; close: (v: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null), back = useRef<Element | null>(document.activeElement)
  useEffect(() => {
    const first = box.current?.querySelector<HTMLButtonElement>(o.danger ? '[data-cancel]' : '[data-ok]'); first?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false) }
      if (e.key === 'Tab') {   // el foco no se escapa del diálogo
        const f = [...(box.current?.querySelectorAll<HTMLElement>('button') ?? [])]; if (!f.length) return
        const i = f.indexOf(document.activeElement as HTMLElement), n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i + 1) % f.length
        e.preventDefault(); f[n].focus()
      }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); (back.current as HTMLElement | null)?.focus?.() }
  }, [])
  return <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) close(false) }}>
    <div ref={box} className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-b">
      <h2 id="dlg-t">{o.title}</h2>{o.body && <div id="dlg-b" className="muted">{o.body}</div>}
      <div className="dialog-actions"><button className="btn" data-cancel onClick={() => close(false)}>{o.cancel ?? 'Cancelar'}</button>
        <button className={`btn ${o.danger ? 'danger' : 'primary'}`} data-ok onClick={() => close(true)}>{o.ok ?? 'Aceptar'}</button></div>
    </div></div>
}
