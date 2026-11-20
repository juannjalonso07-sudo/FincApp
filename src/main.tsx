import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { applyTheme } from './ui/theme'
import '@fontsource-variable/plus-jakarta-sans'
import './ui/styles.css'

applyTheme(); setInterval(applyTheme, 60_000)
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
