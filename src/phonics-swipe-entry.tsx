import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PhonicsSwipeLab } from './phonics-swipe/PhonicsSwipeLab'
import './phonics-swipe/phonics-swipe.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <PhonicsSwipeLab />
  </StrictMode>,
)
