import { createRoot } from 'react-dom/client'
import { EstatePlan } from '../src/experiences/EstatePlan'
createRoot(document.getElementById('root')!).render(<EstatePlan onBack={()=>{}} onEstate={()=>{}}/>)
