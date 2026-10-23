import { useEffect, useMemo, useState } from 'react'
import './brush.css'
import { BrushError, createLiveClient, loadDriveImage } from './brush/client'
import { Matchup, REST_ZOOM, type Zoom } from './brush/Matchup'
import { createPreviewClient } from './brush/preview'
import { BackfillOffer, DetailSheet, InsightsScreen, Leaderboard, LibraryScreen, PinScreen, ReasonSheet } from './brush/Sheets'
import { TrashReview } from './brush/TrashReview'
import type { BrushApi, BrushImage, BrushTag, Insights, PairResult, TrashImage } from './brush/types'

type Screen = 'match' | 'board' | 'love' | 'library' | 'trash'
type Pending = { kind: 'like' | 'bad', leftId: string, rightId: string, winnerId: string | null, trashLeft: boolean, trashRight: boolean, started: number }

const EMPTY_INSIGHTS: Insights = {
  images: 0, active: 0, trashed: 0, matches: 0, tags: [], attributes: [], combinations: [],
  turn_offs: { trashed: 0, tags: [] }, recipe: null,
}

function messageOf(error: unknown) {
  if (error instanceof BrushError) return error.message
  return error instanceof Error ? error.message : 'Something went wrong.'
}

export function Brush({ pin, onExit, preview = false }: { pin: string, onExit: () => void, preview?: boolean }) {
  const [brushPin, setBrushPin] = useState('')
  const [phase, setPhase] = useState<'boot' | 'set' | 'enter' | 'change' | 'app'>(preview ? 'app' : 'boot')
  const client = useMemo<BrushApi>(() => preview ? createPreviewClient() : createLiveClient(pin, brushPin), [preview, pin, brushPin])
  const [screen, setScreen] = useState<Screen>('match')
  const [portrait, setPortrait] = useState(() => window.matchMedia('(orientation: portrait)').matches)
  const [front, setFront] = useState<'left' | 'right'>('left')
  const [zoom, setZoom] = useState<Zoom>(REST_ZOOM)
  const [pair, setPair] = useState<PairResult | null>(null)
  const [tags, setTags] = useState<BrushTag[]>([])
  const [board, setBoard] = useState<BrushImage[]>([])
  const [library, setLibrary] = useState<BrushImage[]>([])
  const [insights, setInsights] = useState<Insights>(EMPTY_INSIGHTS)
  const [trashed, setTrashed] = useState<TrashImage[]>([])
  const [trashIndex, setTrashIndex] = useState(0)
  const [trashSelected, setTrashSelected] = useState<string[]>([])
  const [pending, setPending] = useState<Pending | null>(null)
  const [pickedTags, setPickedTags] = useState<string[]>([])
  const [offer, setOffer] = useState<BrushTag | null>(null)
  const [progress, setProgress] = useState('')
  const [message, setMessage] = useState('')
  const [country, setCountry] = useState('')
  const [detail, setDetail] = useState<{ image: BrushImage, attributes: { trait: string, value: string, source: string, confidence: number | null }[], prompt: string } | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [phrasing, setPhrasing] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(orientation: portrait)')
    const apply = () => setPortrait(media.matches)
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (preview) return
    let gone = false
    createLiveClient(pin, '').status().then(status => {
      if (!gone) setPhase(status.pin_set ? 'enter' : 'set')
    }).catch(error => { if (!gone) setMessage(messageOf(error)) })
    return () => { gone = true }
  }, [preview, pin])

  async function refresh(api = client) {
    const [nextPair, nextTags, nextBoard, nextLibrary, nextInsights, nextTrashed] = await Promise.all([
      api.nextPair(), api.tags(), api.leaderboard(), api.library(), api.insights(), api.trashed(),
    ])
    setPair(nextPair)
    setTags(nextTags)
    setBoard(nextBoard)
    setLibrary(nextLibrary)
    setInsights(nextInsights)
    setTrashed(nextTrashed)
  }

  useEffect(() => {
    if (phase !== 'app') return
    let gone = false
    refresh(client).catch(error => { if (!gone) setMessage(messageOf(error)) })
    return () => { gone = true }
  }, [phase, brushPin, preview])

  useEffect(() => {
    const image = trashed[trashIndex]
    setTrashSelected(image?.bad_tag_ids || [])
  }, [trashIndex, trashed])

  useEffect(() => {
    if (preview) return
    const wanted = [
      ...(pair && pair.ready ? [pair.left, pair.right] : []),
      ...library.slice(0, 24),
      ...trashed.slice(0, 8),
    ]
    let gone = false
    for (const image of wanted) {
      if (image.preview_url || urls[image.drive_file_id]) continue
      loadDriveImage(image.drive_file_id, pin, brushPin).then(url => {
        if (!gone) setUrls(current => ({ ...current, [image.drive_file_id]: url }))
      }).catch(() => {})
    }
    return () => { gone = true }
  }, [pair, library, trashed, preview, pin, brushPin, urls])

  function srcFor(image: BrushImage) {
    return image.preview_url || urls[image.drive_file_id] || null
  }

  async function saveDecision(tagsToSave: string[]) {
    if (!pending || !pair || !pair.ready) return
    await client.record({
      leftId: pending.leftId,
      rightId: pending.rightId,
      decision: pending.kind === 'like' ? 'pick' : 'trash',
      winnerId: pending.winnerId,
      trashLeft: pending.trashLeft,
      trashRight: pending.trashRight,
      tagIds: tagsToSave,
      decidedMs: Date.now() - pending.started,
    })
    setPending(null)
    setPickedTags([])
    setZoom(REST_ZOOM)
    setFront('left')
    await refresh()
  }

  function openChoice(id: string) {
    if (!pair || !pair.ready) return
    setPickedTags([])
    setPending({ kind: 'like', leftId: pair.left.id, rightId: pair.right.id, winnerId: id, trashLeft: false, trashRight: false, started: Date.now() })
  }

  function openTrash(ids: string[]) {
    if (!pair || !pair.ready) return
    setPickedTags([])
    setPending({
      kind: 'bad',
      leftId: pair.left.id,
      rightId: pair.right.id,
      winnerId: null,
      trashLeft: ids.includes(pair.left.id),
      trashRight: ids.includes(pair.right.id),
      started: Date.now(),
    })
  }

  async function approve(tag: BrushTag) {
    await client.reviewTag(tag.id, 'approve')
    await refresh()
    setOffer({ ...tag, status: 'live' })
  }

  async function runBackfill() {
    if (!offer) return
    const tag = offer
    setOffer(null)
    try {
      await client.backfill(tag, (done, total) => setProgress(`Noting ${tag.label} · ${done} of ${total}`))
      setProgress('')
      setMessage(`Noted “${tag.label}” where the vision pass could see it.`)
      await refresh()
    } catch (error) {
      setProgress('')
      setMessage(messageOf(error))
    }
  }

  async function saveTrash(step = 0) {
    const image = trashed[trashIndex]
    if (!image) return
    await client.saveTrashTags(image.id, trashSelected)
    if (step) setTrashIndex(index => Math.min(trashed.length - 1, Math.max(0, index + step)))
    else setMessage('Tags saved on the flagged image. The Drive file was not moved.')
    await refresh()
  }

  const countries = [...new Set(library.map(image => image.country).filter(Boolean))]

  return (
    <main className={`brush${portrait ? ' is-portrait' : ' is-landscape'}`}>
      <nav className="brush-nav">
        <button type="button" onClick={onExit}>Hub</button>
        {phase === 'app' && (
          <>
            {(['match', 'board', 'love', 'trash', 'library'] as Screen[]).map(item => (
              <button key={item} type="button" aria-current={screen === item ? 'page' : undefined} onClick={() => { setScreen(item); setPending(null) }}>
                {item === 'match' ? 'Match' : item === 'board' ? 'Board' : item === 'love' ? 'Love' : item === 'trash' ? 'Trash' : 'Library'}
              </button>
            ))}
          </>
        )}
        {progress && <span className="brush-progress">{progress}</span>}
      </nav>

      {phase === 'boot' && <div className="brush-gate"><p>Opening Brush…</p></div>}
      {(phase === 'set' || phase === 'enter' || phase === 'change') && (
        <PinScreen
          mode={phase}
          message={message}
          onSubmit={(current, next) => {
            const run = async () => {
              if (!/^[0-9]{4,8}$/.test(next) && phase !== 'enter') throw new BrushError('22023', 'Use 4 to 8 digits.')
              if (phase === 'enter') {
                await client.unlock(next)
                setBrushPin(next)
                setPhase('app')
              } else {
                await createLiveClient(pin, brushPin || current).setPin(phase === 'set' ? null : current, next)
                setBrushPin(next)
                setPhase('app')
                setMessage('Brush PIN saved as a hash.')
              }
            }
            run().catch(error => setMessage(messageOf(error)))
          }}
        />
      )}

      {phase === 'app' && screen === 'match' && pair?.ready && (
        <Matchup
          left={pair.left}
          right={pair.right}
          front={front}
          portrait={portrait}
          zoom={zoom}
          onZoom={setZoom}
          onFlip={() => setFront(side => side === 'left' ? 'right' : 'left')}
          onChoose={openChoice}
          onTrash={id => openTrash([id])}
          onTrashBoth={() => openTrash([pair.left.id, pair.right.id])}
          srcFor={srcFor}
        />
      )}
      {phase === 'app' && screen === 'match' && pair && !pair.ready && (
        <div className="brush-scroll" data-screen="match">
          <h2>Need two portraits</h2>
          <p>{pair.active} active of {pair.total}. Sync the Beauty Contest folder or upload more. Trashed images stay in Drive and wait in Trash Review.</p>
          <button className="brush-upload" type="button" onClick={() => setScreen('library')}>Open library</button>
        </div>
      )}
      {phase === 'app' && screen === 'board' && <Leaderboard images={board} srcFor={srcFor} />}
      {phase === 'app' && screen === 'love' && (
        <InsightsScreen
          insights={insights}
          phrasing={phrasing}
          onApprove={tag => { approve(tag).catch(error => setMessage(messageOf(error))) }}
          onReject={tag => { client.reviewTag(tag.id, 'reject').then(() => refresh()).catch(error => setMessage(messageOf(error))) }}
          onPhrase={draft => {
            if (preview) { setMessage('Preview keeps the draft. The model is not called.'); return }
            setPhrasing(true)
            fetch('/api/brush-recipe', {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-lab-pin': pin, 'x-brush-pin': brushPin },
              body: JSON.stringify({ draft }),
            }).then(async response => {
              const body = await response.json() as { body?: string, error?: string }
              if (!response.ok) throw new Error(body.error || 'Could not phrase the recipe.')
              setMessage('Phrased recipe saved. It is still only a suggestion.')
              await refresh()
            }).catch(error => setMessage(messageOf(error))).finally(() => setPhrasing(false))
          }}
        />
      )}
      {phase === 'app' && screen === 'library' && (
        <LibraryScreen
          images={library}
          srcFor={srcFor}
          countries={countries}
          country={country}
          onCountry={setCountry}
          syncing={progress.startsWith('Sync') || progress.startsWith('Upload')}
          onSync={() => {
            setProgress('Syncing Beauty Contest')
            client.sync(setProgress).then(() => refresh()).catch(error => setMessage(messageOf(error))).finally(() => setProgress(''))
          }}
          onUpload={files => {
            setProgress('Uploading')
            client.upload(files, setProgress).then(() => refresh()).catch(error => setMessage(messageOf(error))).finally(() => setProgress(''))
          }}
          onOpen={image => {
            client.detail(image.id).then(result => setDetail({ ...result, prompt: result.image.prompt_text || '' })).catch(error => setMessage(messageOf(error)))
          }}
          onAutoTag={image => {
            setProgress(`Tagging ${image.name}`)
            client.autoTag(image.id).then(result => {
              setMessage(result.suggested ? `${result.suggested} new tag${result.suggested === 1 ? '' : 's'} suggested.` : 'Attributes updated.')
              return refresh()
            }).catch(error => setMessage(messageOf(error))).finally(() => setProgress(''))
          }}
          onChangePin={() => setPhase('change')}
        />
      )}
      {phase === 'app' && screen === 'trash' && (
        <TrashReview
          images={trashed}
          index={Math.min(trashIndex, Math.max(0, trashed.length - 1))}
          tags={tags}
          selected={trashSelected}
          src={trashed[trashIndex] ? srcFor(trashed[trashIndex]) : null}
          onToggle={id => setTrashSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])}
          onApprove={tag => { approve(tag).catch(error => setMessage(messageOf(error))) }}
          onReject={tag => { client.reviewTag(tag.id, 'reject').then(() => refresh()).catch(error => setMessage(messageOf(error))) }}
          onSave={() => { saveTrash(0).catch(error => setMessage(messageOf(error))) }}
          onStep={delta => { saveTrash(delta).catch(error => setMessage(messageOf(error))) }}
          onRestore={() => {
            const image = trashed[trashIndex]
            if (!image) return
            client.restore(image.id).then(() => refresh()).catch(error => setMessage(messageOf(error)))
          }}
        />
      )}

      {pending && (
        <ReasonSheet
          kind={pending.kind}
          tags={tags}
          selected={pickedTags}
          onToggle={id => setPickedTags(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])}
          onApprove={tag => { approve(tag).catch(error => setMessage(messageOf(error))) }}
          onReject={tag => { client.reviewTag(tag.id, 'reject').then(() => refresh()).catch(error => setMessage(messageOf(error))) }}
          onSkip={() => { saveDecision([]).catch(error => setMessage(messageOf(error))) }}
          onDone={() => { saveDecision(pickedTags).catch(error => setMessage(messageOf(error))) }}
        />
      )}
      {offer && <BackfillOffer label={offer.label} onSkip={() => setOffer(null)} onRun={() => { runBackfill().catch(error => setMessage(messageOf(error))) }} />}
      {detail && (
        <DetailSheet
          image={detail.image}
          attributes={detail.attributes}
          prompt={detail.prompt}
          onPrompt={prompt => setDetail(current => current ? { ...current, prompt } : current)}
          onSave={() => { client.setPrompt(detail.image.id, detail.prompt).then(() => { setMessage('Prompt saved.'); setDetail(null) }).catch(error => setMessage(messageOf(error))) }}
          onClose={() => setDetail(null)}
          onAutoTag={() => {
            client.autoTag(detail.image.id).then(() => client.detail(detail.image.id)).then(result => {
              setDetail({ ...result, prompt: result.image.prompt_text || detail.prompt })
              return refresh()
            }).catch(error => setMessage(messageOf(error)))
          }}
        />
      )}
      {message && phase === 'app' && <p className="brush-note" style={{ position: 'absolute', left: 12, right: 12, bottom: 8, zIndex: 7 }}>{message}</p>}
    </main>
  )
}
