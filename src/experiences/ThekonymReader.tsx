import { useMemo } from 'react'
import { createThekonymLiveSource } from '../lib/thekonymLiveSource'
import { ThekonymViewer } from './ThekonymViewer'
export function ThekonymReader({ pin, onExit }: { pin: string; onExit: () => void }) {
  const source = useMemo(() => createThekonymLiveSource(pin), [pin])
  return <ThekonymViewer source={source} onExit={onExit} />
}
