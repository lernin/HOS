import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WaterfallVillage } from '../src/experiences/WaterfallVillage'
// Development-only component harness, excluded from production build inputs.
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<StrictMode><WaterfallVillage onBack={() => { window.location.href = '/' }} /></StrictMode>)
