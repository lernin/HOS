import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CombinedWorld } from './experiences/combined/CombinedWorld'

const node=document.getElementById('root')
if(node)createRoot(node).render(<StrictMode><CombinedWorld/></StrictMode>)
