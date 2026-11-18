import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Town from './town/Town'
import './town/town.css'

createRoot(document.getElementById('root')!).render(<StrictMode><Town /></StrictMode>)
