# FincApp (producto)
Cuaderno de campo offline-first para productores agrícolas. Ver `docs/ARQUITECTURA.md`.

    npm install
    npm run dev        # sin .env.local funciona en modo local (sin nube)
    npm test           # 39 pruebas (PostgreSQL real en WASM)
    npm run build
    node tests/e2e-local.cjs   # prueba de navegador (requiere `npm run preview` en el puerto 4173)
