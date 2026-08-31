import { useMemo, useRef, useState } from 'react'
import './book-vocab.css'

type VocabWord = { word: string; korean: string }

const STORAGE_KEY = 'book-vocab-latest-v1'
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function readSaved(): VocabWord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as VocabWord[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function compressImage(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const maxSide = 1800
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not prepare the photo.')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not prepare the photo.')), 'image/jpeg', 0.82)
  })

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read the photo.'))
    reader.readAsDataURL(blob)
  })

  if (dataUrl.length > 5_500_000) throw new Error('That photo is too large. Try taking it a little farther away.')
  return dataUrl
}

export function BookVocab({ onExit, pin }: { onExit: () => void; pin: string }) {
  const cameraRef = useRef<HTMLInputElement | null>(null)
  const galleryRef = useRef<HTMLInputElement | null>(null)
  const [words, setWords] = useState<VocabWord[]>(readSaved)
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  const sorted = useMemo(() => [...words].sort((a, b) => a.word.localeCompare(b.word, 'en', { sensitivity: 'base' })), [words])
  const byLetter = useMemo(() => {
    const map = new Map<string, VocabWord[]>()
    for (const letter of ALPHABET) map.set(letter, [])
    for (const item of sorted) {
      const first = item.word.trim().charAt(0).toUpperCase()
      if (map.has(first)) map.get(first)!.push(item)
    }
    return map
  }, [sorted])

  const visibleWords = selectedLetter ? byLetter.get(selectedLetter) || [] : []

  async function scan(file?: File) {
    if (!file || processing) return
    setProcessing(true)
    setError('')
    setSelectedLetter(null)

    try {
      const image = await compressImage(file)
      const response = await fetch('/api/book-vocab', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-review-pin': pin,
        },
        body: JSON.stringify({ image }),
      })
      const body = await response.json() as { words?: VocabWord[]; error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not read that page.')

      const cleaned = (body.words || [])
        .filter(item => item && typeof item.word === 'string' && typeof item.korean === 'string')
        .map(item => ({ word: item.word.trim(), korean: item.korean.trim() }))
        .filter(item => item.word && item.korean)

      if (!cleaned.length) throw new Error('I could not find readable English vocabulary on that page.')
      setWords(cleaned)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read that page.')
    } finally {
      setProcessing(false)
      if (cameraRef.current) cameraRef.current.value = ''
      if (galleryRef.current) galleryRef.current.value = ''
    }
  }

  function clear() {
    setWords([])
    setSelectedLetter(null)
    setError('')
    localStorage.removeItem(STORAGE_KEY)
  }

  function scanAnother() {
    clear()
    window.setTimeout(() => cameraRef.current?.click(), 0)
  }

  return (
    <main className="book-vocab-shell">
      <div className="book-vocab-orb orb-one" />
      <div className="book-vocab-orb orb-two" />

      <header className="book-vocab-header">
        <button
          className="book-vocab-back"
          onClick={() => selectedLetter ? setSelectedLetter(null) : onExit()}
          aria-label={selectedLetter ? 'Back to alphabet' : 'Back to The Lab'}
        >
          ←
        </button>
        <div>
          <div className="book-vocab-kicker">THE LAB · VISION EXPERIMENT</div>
          <h1>{selectedLetter ? selectedLetter + ' vocabulary' : 'Book Vocab'}</h1>
        </div>
        {words.length > 0 && !processing
          ? <button className="book-vocab-clear" onClick={clear}>Clear</button>
          : <span className="book-vocab-header-spacer" />}
      </header>

      <input ref={cameraRef} className="book-vocab-hidden" type="file" accept="image/*" capture="environment" onChange={e => void scan(e.target.files?.[0])} />
      <input ref={galleryRef} className="book-vocab-hidden" type="file" accept="image/*" onChange={e => void scan(e.target.files?.[0])} />

      {processing ? (
        <section className="book-vocab-scanning">
          <div className="scanner-frame">
            <div className="scanner-corners" />
            <div className="scanner-line" />
            <div className="scanner-glyph">Aa</div>
          </div>
          <h2>Reading the page</h2>
          <p>Extracting words, cleaning duplicates, and translating everything into Korean.</p>
        </section>
      ) : selectedLetter ? (
        <section className="book-vocab-letter-view">
          <button className="alphabet-return" onClick={() => setSelectedLetter(null)}>← Alphabet</button>
          <div className="letter-hero">
            <span>{selectedLetter}</span>
            <div><strong>{visibleWords.length}</strong><small>{visibleWords.length === 1 ? 'word' : 'words'}</small></div>
          </div>
          <div className="vocab-list">
            {visibleWords.map((item, index) => (
              <article className="vocab-row" key={item.word + index}>
                <div className="vocab-index">{String(index + 1).padStart(2, '0')}</div>
                <div className="vocab-copy">
                  <strong>{item.word}</strong>
                  <span lang="ko">{item.korean}</span>
                </div>
              </article>
            ))}
          </div>
          <button className="scan-another" onClick={scanAnother}>Scan another page</button>
        </section>
      ) : words.length > 0 ? (
        <section className="book-vocab-alphabet-view">
          <div className="book-vocab-summary">
            <div><strong>{words.length}</strong><span>translated words</span></div>
            <div className="summary-status"><i /> READY</div>
          </div>

          <div className="alphabet-label">Choose a letter</div>
          <div className="alphabet-grid">
            {ALPHABET.map(letter => {
              const count = byLetter.get(letter)?.length || 0
              return (
                <button key={letter} disabled={!count} onClick={() => setSelectedLetter(letter)}>
                  <strong>{letter}</strong>
                  <small>{count || '—'}</small>
                </button>
              )
            })}
          </div>

          <button className="scan-another" onClick={scanAnother}>Scan another page</button>
        </section>
      ) : (
        <section className="book-vocab-empty">
          <div className="capture-card">
            <div className="capture-grid" />
            <div className="capture-icon">
              <span className="capture-lens" />
            </div>
            <div className="capture-copy">
              <div className="capture-chip">AI OCR · EN → KO</div>
              <h2>Point. Shoot. Learn.</h2>
              <p>Photograph a book page. Every readable English word is cleaned, deduplicated, translated into Korean, and filed A–Z.</p>
            </div>
            <button className="primary-capture" onClick={() => cameraRef.current?.click()}>
              <span>◎</span> Take a picture
            </button>
            <button className="secondary-capture" onClick={() => galleryRef.current?.click()}>Choose existing photo</button>
          </div>
          {error && <div className="book-vocab-error">{error}</div>}
        </section>
      )}

      {error && words.length > 0 && <div className="book-vocab-error floating-error">{error}</div>}
    </main>
  )
}
