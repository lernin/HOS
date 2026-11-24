import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EstatePhoneRemote } from './experiences/estate/EstatePhoneRemote'

const root = document.getElementById('root')
if (!root) throw new Error('Lab root not found')
createRoot(root).render(<StrictMode><EstatePhoneRemote /></StrictMode>)
