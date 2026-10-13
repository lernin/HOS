import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { IslandEstate } from './experiences/IslandEstate'

document.title='The Island Estate · The Lab'
createRoot(document.getElementById('root')!).render(<StrictMode><IslandEstate/></StrictMode>)
