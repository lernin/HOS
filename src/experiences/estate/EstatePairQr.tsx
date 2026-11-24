import { useEffect, useRef, useState } from 'react'
import './tv-remote.css'

type QRClass = new (element: HTMLElement, options: {
  text: string; width: number; height: number; colorDark: string; colorLight: string
}) => unknown

declare global {
  interface Window { QRCode?: QRClass }
}

// Keep the pairing URL on this site; a third-party QR API would leak the room secret.
export function EstatePairQr({ url }: { url: string }) {
  const slot = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('Generating QR…')

  useEffect(() => {
    let live = true
    const render = () => {
      if (!live || !slot.current || !window.QRCode) return
      slot.current.replaceChildren()
      new window.QRCode(slot.current, {
        text: url, width: 184, height: 184, colorDark: '#101c19', colorLight: '#ffffff',
      })
      setStatus('')
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-estate-qr]')
    if (window.QRCode) render()
    else {
      const script = existing ?? document.createElement('script')
      script.addEventListener('load', render)
      const error = () => { if (live) setStatus('QR unavailable — use the phone link below.') }
      script.addEventListener('error', error)
      if (!existing) {
        script.dataset.estateQr = '1'
        script.src = '/estate-remote/vendor/qrcode.min.js'
        script.async = true
        document.head.appendChild(script)
      }
      return () => {
        live = false
        script.removeEventListener('load', render)
        script.removeEventListener('error', error)
      }
    }
    return () => { live = false }
  }, [url])

  return <div className="oe-remote-qr-wrapper">
    <div ref={slot} className="oe-remote-qr" aria-label="QR code to connect your phone" />
    {status && <small role="status">{status}</small>}
  </div>
}
