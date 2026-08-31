import { useMemo, useRef, useState } from 'react'
import './book-vocab.css'

type VocabWord = { word: string; korean: string }

type Diagnostic = {
  scanId: string
  stage: string
  code: string
  status?: number
  uploadKb?: number
  dimensions?: string
  detail?: string
  model?: string
  elapsedMs?: number
  endpointVersion?: string
}

type ScanReport = Diagnostic & {
  message: string
  createdAt: string
  online: boolean
}

const STORAGE_KEY = 'book-vocab-latest-v1'
const REPORTS_KEY = 'book-vocab-scan-reports-v2'
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const TARGET_UPLOAD_BYTES = 1_700_000

function readSaved(): VocabWord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as VocabWord[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveReport(report: ScanReport) {
  try {
    const previous = JSON.parse(localStorage.getItem(REPORTS_KEY) || '[]') as ScanReport[]
    const next = [report, ...(Array.isArray(previous) ? previous : [])].slice(0, 5)
    localStorage.setItem(REPORTS_KEY, JSON.stringify(next))
  } catch {
    // Reporting must never block scanning.
  }
}

function stageLabel(stage: string) {
  if (stage === 'receive') return 'Image upload'
  if (stage === 'ocr') return 'OpenAI vision'
  if (stage === 'vocab') return 'Vocabulary translation'
  if (stage === 'parse') return 'Result processing'
  if (stage === 'response') return 'Server response'
  if (stage === 'client') return 'Phone preparation'
  return stage || 'Unknown'
}

async function prepareImage(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const maxSide = 1600
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Could not prepare the photo.')
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const qualities = [0.82, 0.72, 0.62, 0.52]
  let blob: Blob | null = null
  for (const quality of qualities) {
    blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob && blob.size <= TARGET_UPLOAD_BYTES) break
  }

  if (!blob) throw new Error('Could not prepare the photo.')
  if (blob.size > 2_400_000) throw new Error('The photo is still too large after compression.')

  return {
    file: new File([blob], 'book-page.jpg', { type: 'image/jpeg' }),
    uploadKb: Math.round(blob.size / 1024),
    dimensions: canvas.width + '×' + canvas.height,
  }
}

export function BookVocab({ onExit, pin }: { onExit: () => void; pin: string }) {
  const cameraRef = useRef<HTMLInputElement | null>(null)
  const galleryRef = useRef<HTMLInputElement | null>(null)
  const lastPhotoRef = useRef<File | null>(null)
  const [words, setWords] = useState<VocabWord[]>(readSaved)
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [report, setReport] = useState<ScanReport | null>(null)
  const [copyLabel, setCopyLabel] = useState('Copy report')

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

  async function scan(file?: File, preserveAsLast = true) {
    if (!file || processing) return
    if (preserveAsLast) lastPhotoRef.current = file

    const scanId = crypto.randomUUID().slice(0, 8)
    const startedAt = performance.now()
    setProcessing(true)
    setReport(null)
    setCopyLabel('Copy report')
    setSelectedLetter(null)

    let uploadKb: number | undefined
    let dimensions: string | undefined

    try {
      const prepared = await prepareImage(file)
      uploadKb = prepared.uploadKb
      dimensions = prepared.dimensions

      const form = new FormData()
      form.append('image', prepared.file)
      form.append('scan_id', scanId)

      const response = await fetch('/api/book-vocab', {
        method: 'POST',
        headers: { 'x-review-pin': pin },
        body: form,
      })

      const raw = await response.text()
      let body: {
        words?: VocabWord[]
        error?: string
        diagnostic?: Partial<Diagnostic>
      } = {}

      try {
        body = raw ? JSON.parse(raw) : {}
      } catch {
        throw Object.assign(new Error('The server returned an unreadable response.'), {
          diagnostic: {
            scanId,
            stage: 'response',
            code: 'INVALID_SERVER_RESPONSE',
            status: response.status,
            uploadKb,
            dimensions,
            elapsedMs: Math.round(performance.now() - startedAt),
          } satisfies Diagnostic,
        })
      }

      if (!response.ok) {
        throw Object.assign(new Error(body.error || 'The scan failed.'), {
          diagnostic: {
            scanId,
            stage: body.diagnostic?.stage || 'server',
            code: body.diagnostic?.code || 'SERVER_ERROR',
            status: response.status,
            uploadKb,
            dimensions,
            detail: body.diagnostic?.detail,
            model: body.diagnostic?.model,
            endpointVersion: body.diagnostic?.endpointVersion,
            elapsedMs: body.diagnostic?.elapsedMs || Math.round(performance.now() - startedAt),
          } satisfies Diagnostic,
        })
      }

      const cleaned = (body.words || [])
        .filter(item => item && typeof item.word === 'string' && typeof item.korean === 'string')
        .map(item => ({ word: item.word.trim(), korean: item.korean.trim() }))
        .filter(item => item.word && item.korean)

      if (!cleaned.length) {
        throw Object.assign(new Error('The scan finished, but no vocabulary came back.'), {
          diagnostic: {
            scanId,
            stage: 'result',
            code: 'EMPTY_RESULT',
            status: response.status,
            uploadKb,
            dimensions,
            elapsedMs: Math.round(performance.now() - startedAt),
          } satisfies Diagnostic,
        })
      }

      setWords(cleaned)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned))
    } catch (cause) {
      const maybe = cause as { message?: string; diagnostic?: Diagnostic }
      const diagnostic = maybe.diagnostic || {
        scanId,
        stage: 'client',
        code: 'CLIENT_ERROR',
        uploadKb,
        dimensions,
        elapsedMs: Math.round(performance.now() - startedAt),
      }
      const nextReport: ScanReport = {
        ...diagnostic,
        message: maybe.message || 'Could not scan that page.',
        createdAt: new Date().toISOString(),
        online: navigator.onLine,
      }
      setReport(nextReport)
      saveReport(nextReport)
    } finally {
      setProcessing(false)
      if (cameraRef.current) cameraRef.current.value = ''
      if (galleryRef.current) galleryRef.current.value = ''
    }
  }

  async function copyReport() {
    if (!report) return
    const payload = {
      app: 'The Lab / Book Vocab',
      ...report,
      browser: navigator.userAgent,
    }
    const text = JSON.stringify(payload, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setCopyLabel('Copied')
    } catch {
      setCopyLabel('Copy failed')
    }
  }

  function clear() {
    setWords([])
    setSelectedLetter(null)
    setReport(null)
    setCopyLabel('Copy report')
    lastPhotoRef.current = null
    localStorage.removeItem(STORAGE_KEY)
  }

  function scanAnother() {
    clear()
    window.setTimeout(() => cameraRef.current?.click(), 0)
  }

  function chooseAnother() {
    setReport(null)
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
          <div className="book-vocab-kicker">THE LAB · OPENAI VISION</div>
          <h1>{selectedLetter ? selectedLetter + ' vocabulary' : 'Book Vocab'}</h1>
        </div>
        {words.length > 0 && !processing
          ? <button className="book-vocab-clear" onClick={clear}>Clear</button>
          : <span className="book-vocab-header-spacer" />}
      </header>

      <input ref={cameraRef} className="book-vocab-hidden" type="file" accept="image/*" capture="environment" onChange={e => void scan(e.target.files?.[0])} />
      <input ref={galleryRef} className="book-vocab-hidden" type="file" accept="image/*" onChange={e => void scan(e.target.files?.[0])} />

      {report && !processing && (
        <section className="scan-report" aria-live="polite">
          <div className="scan-report-top">
            <div>
              <div className="scan-report-kicker">SCAN FAILED</div>
              <h2>{stageLabel(report.stage)}</h2>
            </div>
            <span className="scan-report-code">{report.code}</span>
          </div>

          <p className="scan-report-message">{report.message}</p>

          <div className="scan-report-grid">
            <div><span>Scan</span><strong>{report.scanId}</strong></div>
            <div><span>HTTP</span><strong>{report.status || '—'}</strong></div>
            <div><span>Image</span><strong>{report.dimensions || '—'}</strong></div>
            <div><span>Upload</span><strong>{report.uploadKb ? report.uploadKb + ' KB' : '—'}</strong></div>
            <div><span>Duration</span><strong>{report.elapsedMs ? (report.elapsedMs / 1000).toFixed(1) + ' s' : '—'}</strong></div>
            <div><span>Network</span><strong>{report.online ? 'Online' : 'Offline'}</strong></div>
          </div>

          {report.model && <div className="scan-report-model">{report.model}</div>}
          {report.detail && (
            <details className="scan-report-detail">
              <summary>Technical detail</summary>
              <pre>{report.detail}</pre>
            </details>
          )}

          <div className="scan-report-actions">
            <button className="report-primary" disabled={!lastPhotoRef.current} onClick={() => lastPhotoRef.current && void scan(lastPhotoRef.current, false)}>Retry same photo</button>
            <button onClick={() => void copyReport()}>{copyLabel}</button>
            <button onClick={chooseAnother}>New photo</button>
          </div>
        </section>
      )}

      {processing ? (
        <section className="book-vocab-scanning">
          <div className="scanner-frame">
            <div className="scanner-corners" />
            <div className="scanner-line" />
            <div className="scanner-glyph">Aa</div>
          </div>
          <h2>Reading the page</h2>
          <p>OpenAI is transcribing the page first, then cleaning and translating its vocabulary into Korean.</p>
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
              <div className="capture-chip">OPENAI VISION · EN → KO</div>
              <h2>Point. Shoot. Learn.</h2>
              <p>Photograph a book page. OpenAI reads the page, then the app cleans, deduplicates, translates, and files the vocabulary A–Z.</p>
            </div>
            <button className="primary-capture" onClick={() => cameraRef.current?.click()}>
              <span>◎</span> Take a picture
            </button>
            <button className="secondary-capture" onClick={() => galleryRef.current?.click()}>Choose existing photo</button>
          </div>
        </section>
      )}
    </main>
  )
}
