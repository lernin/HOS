import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EstatePhoneRemote } from './experiences/estate/remote'

const node = document.getElementById('root')
if (node) createRoot(node).render(<StrictMode><EstatePhoneRemote /></StrictMode>)
