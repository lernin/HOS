import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WaterfallVillageV2 } from './experiences/WaterfallVillageV2'

createRoot(document.getElementById('root')!).render(
  <StrictMode><WaterfallVillageV2 onBack={() => { window.location.href='/' }} /></StrictMode>
)
