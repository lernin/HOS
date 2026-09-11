import { createRoot } from 'react-dom/client'
import { OceanEstate } from '../src/experiences/OceanEstate'
createRoot(document.getElementById('root')!).render(<OceanEstate onBack={()=>{location.href='/'}}/>)
