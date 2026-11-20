/** Descarga un archivo generado en el equipo. El enlace temporal se libera recién después de que empezó la descarga. */
export function download(name: string, data: BlobPart, type: string) {
  const u = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(u), 60_000)
}
