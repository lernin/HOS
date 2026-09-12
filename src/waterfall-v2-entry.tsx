import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WaterfallVillageV2 } from './experiences/WaterfallVillageV2'

const root=document.getElementById('root')
if(!root)throw new Error('Missing root element')
createRoot(root).render(<StrictMode><WaterfallVillageV2 onBack={()=>{window.location.href='/'}} /></StrictMode>)
