// Local component-test harness, intentionally excluded from the production build.
// Does not import the Lab shell, credentials, data clients, or API routes.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { WaterGarden } from '../src/experiences/WaterGarden'
function Harness() {
  const [open, setOpen] = useState(true)
  return open ? <WaterGarden onExit={() => setOpen(false)} /> : <main><h1>Returned to The Lab (test harness)</h1><button onClick={() => setOpen(true)}>Reopen garden</button></main>
}
createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>)
