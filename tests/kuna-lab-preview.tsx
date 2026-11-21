import {createRoot} from 'react-dom/client'
import {KunaLab} from '../src/experiences/KunaLab'
// Test-only isolated render: the real /kuna-lab route remains PIN protected.
createRoot(document.getElementById('root')!).render(<KunaLab onBack={()=>{}}/>)
