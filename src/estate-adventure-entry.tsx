import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import EstateAdventure from './town/EstateAdventure'
import './town/town.css'
import './town/estate-adventure.css'

createRoot(document.getElementById('root')!).render(<StrictMode><EstateAdventure /></StrictMode>)
