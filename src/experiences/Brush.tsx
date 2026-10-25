import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import './brush.css'
import { BrushError, createLiveClient, loadDriveImage, loadThumb } from './brush/client'
import { applyDecision, bootDeck, currentMatch, dropUnreadable, mergeLibrary, openPlacement, progressOf, rememberHash, replayPending, resumeQualifying, returnToBracket, startFinals, type Deck, type Decision } from './brush/deck'
import { Matchup, REST_ZOOM, type Zoom } from './brush/Matchup'
import { enqueueResult, flushOutbox, readOutbox, sentMatch, tagOutbox, type OutboxItem } from './brush/outbox'
import { matchMoments, standingOf, type BrushMoment } from './brush/level'
import { challengerCount, hashImage } from './brush/pair'
import { createPreviewClient } from './brush/preview'
import { BackfillOffer, DetailSheet, InsightsScreen, Leaderboard, LibraryScreen, PinScreen, ReasonSheet, UploadIcon, UploadProgressSheet } from './brush/Sheets'
import { TrashReview } from './brush/TrashReview'
import type { BrushApi, BrushImage, BrushTag, Insights, Margin, TrashImage, UploadSnapshot } from './brush/types'
import { EMPTY_UPLOADS, retryLoad } from './brush/uploads'

type Screen = 'match' | 'board' | 'love' | 'library' | 'trash'
type Reason = { id: string, kind: 'like' | 'bad', open: boolean }

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
  const [deck, setDeck] = useState<Deck | null>(null)
  const [tags, setTags] = useState<BrushTag[]>([])
  const [board, setBoard] = useState<BrushImage[]>([])
  const [library, setLibrary] = useState<BrushImage[]>([])
  const [insights, setInsights] = useState<Insights>(EMPTY_INSIGHTS)
  const [trashed, setTrashed] = useState<TrashImage[]>([])
  const [trashIndex, setTrashIndex] = useState(0)
  const [trashSelected, setTrashSelected] = useState<string[]>([])
  const [reason, setReason] = useState<Reason | null>(null)
  const [pickedTags, setPickedTags] = useState<string[]>([])
  const [offer, setOffer] = useState<BrushTag | null>(null)
  const [progress, setProgress] = useState('')
  const [message, setMessage] = useState('')
  const [moments, setMoments] = useState<BrushMoment[]>([])
  const moment = moments[0] || null
  const [country, setCountry] = useState('')
  const [detail, setDetail] = useState<{ image: BrushImage, attributes: { trait: string, value: string, source: string, confidence: number | null }[], prompt: string } | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [phrasing, setPhrasing] = useState(false)
  const [uploads, setUploads] = useState<UploadSnapshot>(EMPTY_UPLOADS)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const addedRef = useRef(0)
  const startedRef = useRef(Date.now())
  const hashedRef = useRef(new Set<string>())
  const deckRef = useRef<Deck | null>(null)
  deckRef.current = deck
  const match = deck ? currentMatch(deck) : null
  const matchKey = match ? `${match.left.id}:${match.right.id}` : ''
  const qualify = deck ? progressOf(deck) : null
  const showingMatch = phase === 'app' && screen === 'match' && deck?.phase !== 'champion' && !!match
  const landscapeMatch = showingMatch && !portrait

  useEffect(() => {
    const media = window.matchMedia('(orientation: portrait)')
    const apply = () => setPortrait(media.matches)
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (!moment) return
    const timer = window.setTimeout(() => setMoments(queue => queue.slice(1)), 3600)
    return () => window.clearTimeout(timer)
  }, [moment])

  useEffect(() => {
    setMenuOpen(false)
  }, [screen, portrait])

  useEffect(() => {
    if (preview) return
    let gone = false
    createLiveClient(pin, '').status().then(status => {
      if (!gone) setPhase(status.pin_set ? 'enter' : 'set')
    }).catch(error => { if (!gone) setMessage(messageOf(error)) })
    return () => { gone = true }
  }, [preview, pin])

  async function loadAll(api = client) {
    const [nextTags, nextBoard, nextLibrary, nextInsights, nextTrashed, contest] = await Promise.all([
      api.tags(), api.leaderboard(), api.library(), api.insights(), api.trashed(), api.contest(),
    ])
    setTags(nextTags)
    setBoard(nextBoard)
    setLibrary(nextLibrary)
    setInsights(nextInsights)
    setTrashed(nextTrashed)
    setDeck(current => {
      const base = current ? mergeLibrary(current, nextLibrary) : bootDeck(nextLibrary, contest)
      return current ? base : replayPending(base, readOutbox(preview))
    })
  }

  function sendResult(item: OutboxItem) {
    return client.record({
      leftId: item.leftId,
      rightId: item.rightId,
      decision: item.decision,
      winnerId: item.winnerId,
      trashLeft: item.trashLeft,
      trashRight: item.trashRight,
      tagIds: [],
      decidedMs: item.decidedMs ?? undefined,
      margin: item.margin,
    })
  }

  useEffect(() => {
    if (phase !== 'app' || preview) return
    let gone = false
    void client.sync(() => {}).then(() => {
      if (!gone) return loadAll(client)
    }).catch(error => {
      if (!gone) setMessage(messageOf(error))
    })
    return () => { gone = true }
  }, [phase, preview, client])

  useEffect(() => {
    if (phase !== 'app') return
    let gone = false
    loadAll(client).catch(error => { if (!gone) setMessage(messageOf(error)) })
    if (readOutbox(preview).length) {
      void flushOutbox(preview, sendResult, (matchId, tagIds) => client.annotate(matchId, tagIds)).catch(error => {
        if (!gone) setMessage(messageOf(error))
      })
    }
    const stop = client.subscribeUploads(setUploads)
    void client.resumeUploads()
    return () => {
      gone = true
      stop()
      client.pauseUploads()
    }
  }, [phase, brushPin, preview])

  useEffect(() => {
    if (phase !== 'app' || uploads.added <= addedRef.current) {
      addedRef.current = uploads.added
      return
    }
    addedRef.current = uploads.added
    loadAll(client).catch(error => setMessage(messageOf(error)))
  }, [uploads.added, phase])

  useEffect(() => {
    const image = trashed[trashIndex]
    setTrashSelected(image?.bad_tag_ids || [])
  }, [trashIndex, trashed])

  const urlsRef = useRef(urls)
  const portraitLoads = useRef(new Set<string>())
  urlsRef.current = urls

  useEffect(() => {
    if (preview || !deck) return
    const bufferedIds = new Set<string>()
    for (const slot of deck.queue.slice(0, 5)) {
      bufferedIds.add(slot.leftId)
      bufferedIds.add(slot.rightId)
      if (slot.standbyLeft) bufferedIds.add(slot.standbyLeft)
      if (slot.standbyRight) bufferedIds.add(slot.standbyRight)
    }
    const queued = deck.images.filter(image => bufferedIds.has(image.id))
    const finals = deck.rounds.flatMap(round => round.flatMap(slot => deck.images.filter(image => image.id === slot.leftId || image.id === slot.rightId)))
    const wanted = [...(match ? [match.left, match.right] : []), ...queued, ...finals.slice(0, 8), ...library.slice(0, 24), ...trashed.slice(0, 8)]
    for (const image of wanted) {
      if (image.preview_url || image.unreadable) continue
      const key = image.has_thumbnail ? `thumb:${image.id}` : image.drive_file_id
      if (urlsRef.current[key] || portraitLoads.current.has(key)) continue
      portraitLoads.current.add(key)
      const load = () => image.has_thumbnail
        ? loadThumb(image.id, pin, brushPin).catch(() => loadDriveImage(image.drive_file_id, pin, brushPin))
        : loadDriveImage(image.drive_file_id, pin, brushPin)
      void retryLoad(load, 3).then(url => {
        urlsRef.current = { ...urlsRef.current, [key]: url }
        setUrls(current => current[key] ? current : { ...current, [key]: url })
      }).catch(() => {
        setDeck(current => current ? dropUnreadable(current, image.id) : current)
        void client.flagUnreadable(image.id).catch(() => {})
      }).finally(() => { portraitLoads.current.delete(key) })
    }
  }, [deck, matchKey, library, trashed, preview, pin, brushPin, client])

  useEffect(() => {
    if (!deck) return
    const wanted = new Map<string, BrushImage>()
    if (match) { wanted.set(match.left.id, match.left); wanted.set(match.right.id, match.right) }
    for (const slot of deck.queue.slice(0, 5)) {
      for (const image of deck.images) {
        if (image.id === slot.leftId || image.id === slot.rightId || image.id === slot.standbyLeft || image.id === slot.standbyRight) wanted.set(image.id, image)
      }
    }
    for (const image of wanted.values()) {
      const src = image.preview_url || (image.has_thumbnail ? urls[`thumb:${image.id}`] : urls[image.drive_file_id])
      if (!src) continue
      const img = new Image()
      img.src = src
      void img.decode?.().catch(() => {})
    }
  }, [deck, matchKey, urls])

  useEffect(() => {
    if (!deck) return
    let mounted = true
    for (const image of deck.images) {
      if (image.perceptual_hash || image.trashed || hashedRef.current.has(image.id)) continue
      const src = image.preview_url || (image.has_thumbnail && urls[`thumb:${image.id}`]) || urls[image.drive_file_id]
      if (!src) continue
      hashedRef.current.add(image.id)
      const img = new Image()
      img.onload = () => {
        void hashImage(img).then(hash => {
          if (!mounted || !hash) return
          setDeck(current => current ? rememberHash(current, image.id, hash) : current)
          void client.setPhash(image.id, hash).catch(() => {})
        }).catch(() => {})
      }
      img.src = src
    }
    return () => { mounted = false }
  }, [deck, urls, client])

  function srcFor(image: BrushImage) {
    if (image.preview_url) return image.preview_url
    if (image.has_thumbnail && urls[`thumb:${image.id}`]) return urls[`thumb:${image.id}`]
    return urls[image.drive_file_id] || null
  }

  function persistContest(next: Deck) {
    void client.saveContest({ phase: next.phase, rounds: next.rounds, championId: next.championId }).catch(error => setMessage(messageOf(error)))
  }

  function commit(decision: Decision) {
    const current = deckRef.current
    if (!current) return
    const next = applyDecision(current, decision)
    setMoments(matchMoments(current.images, next.images))
    setDeck(next)
    setZoom(REST_ZOOM)
    setFront('left')
    const item: OutboxItem = {
      id: crypto.randomUUID(),
      leftId: decision.leftId,
      rightId: decision.rightId,
      decision: decision.kind,
      winnerId: decision.winnerId,
      trashLeft: decision.trashLeft,
      trashRight: decision.trashRight,
      margin: decision.margin,
      tagIds: [],
      decidedMs: Date.now() - startedRef.current,
      matchId: null,
      attempts: 0,
    }
    enqueueResult(preview, item)
    setPickedTags([])
    setReason({ id: item.id, kind: decision.kind === 'pick' ? 'like' : 'bad', open: current.phase === 'finals' })
    if (next.phase !== current.phase || next.championId !== current.championId || JSON.stringify(next.rounds) !== JSON.stringify(current.rounds)) persistContest(next)
    startedRef.current = Date.now()
    void flushOutbox(preview, sendResult, (matchId, tagIds) => client.annotate(matchId, tagIds)).catch(error => setMessage(messageOf(error)))
  }

  function pick(id: string, margin: Margin) {
    if (!match) return
    commit({
      leftId: match.left.id,
      rightId: match.right.id,
      kind: 'pick',
      winnerId: id,
      trashLeft: false,
      trashRight: false,
      margin,
    })
  }

  function trashOne(id: string) {
    if (!match) return
    commit({
      leftId: match.left.id,
      rightId: match.right.id,
      kind: 'trash',
      winnerId: null,
      trashLeft: id === match.left.id,
      trashRight: id === match.right.id,
      margin: 'clear',
    })
  }

  function goFinals() {
    const current = deckRef.current
    if (!current) return
    const next = startFinals(current)
    if (next === current) {
      setMessage('Need two active portraits before a final.')
      return
    }
    setDeck(next)
    setZoom(REST_ZOOM)
    setFront('left')
    setReason(null)
    persistContest(next)
  }

  function placeChallengers() {
    const current = deckRef.current
    if (!current) return
    setDeck(openPlacement(current))
    setScreen('match')
    setZoom(REST_ZOOM)
    setFront('left')
    setReason(null)
  }

  function backToBracket() {
    const current = deckRef.current
    if (!current) return
    setDeck(returnToBracket(current))
    setZoom(REST_ZOOM)
    setFront('left')
    setReason(null)
  }

  function keepQualifying() {
    const current = deckRef.current
    if (!current) return
    const next = resumeQualifying(current)
    setDeck(next)
    setReason(null)
    persistContest(next)
  }

  function saveReason(tagIds: string[]) {
    if (!reason) return
    const pending = readOutbox(preview).some(item => item.id === reason.id)
    if (pending) {
      tagOutbox(preview, reason.id, tagIds)
      void flushOutbox(preview, sendResult, (matchId, ids) => client.annotate(matchId, ids)).catch(error => setMessage(messageOf(error)))
    } else {
      const matchId = sentMatch(reason.id)
      if (matchId && tagIds.length) void client.annotate(matchId, tagIds).catch(error => setMessage(messageOf(error)))
    }
    setReason(current => current ? { ...current, open: false } : current)
    setPickedTags([])
  }

  async function approve(tag: BrushTag) {
    await client.reviewTag(tag.id, 'approve')
    await loadAll()
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
      await loadAll()
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
    await loadAll()
  }

  const countries = [...new Set(library.map(image => image.country).filter(Boolean))]
  const champion = deck?.championId ? deck.images.find(image => image.id === deck.championId) || null : null
  const challengers = deck ? challengerCount(deck.images) : 0

  function statusChrome() {
    return (
      <>
        {deck?.phase === 'qualifying' && qualify && <span className="brush-progress" data-qualify>{`Qualifying ${qualify.percent}%`}</span>}
        {deck?.phase === 'qualifying' && qualify && qualify.total >= 2 && <button type="button" data-action="finals" onClick={() => { setMenuOpen(false); goFinals() }}>Finals</button>}
        {deck?.phase === 'finals' && <span className="brush-progress" data-finals>{`Finals · round ${deck.rounds.length}`}</span>}
        {challengers > 0 && deck?.focus !== 'placement' && (
          deck?.phase === 'finals'
            ? <button type="button" data-challengers data-action="challengers" onClick={() => { setMenuOpen(false); placeChallengers() }}>{`New challengers: ${challengers}`}</button>
            : <span className="brush-progress" data-challengers>{`New challengers: ${challengers}`}</span>
        )}
        {deck?.phase === 'finals' && deck.focus === 'placement' && <button type="button" data-action="bracket" onClick={() => { setMenuOpen(false); backToBracket() }}>Back to finals</button>}
        {uploads.total > uploads.completed && <button type="button" className="brush-progress" data-upload-nav onClick={() => { setMenuOpen(false); setUploadOpen(true) }}>{`Uploads ${uploads.completed}/${uploads.total}`}</button>}
        {progress && <span className="brush-progress">{progress}</span>}
      </>
    )
  }

  function onGallery(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files || [])]
    event.target.value = ''
    if (!files.length) return
    setMenuOpen(false)
    setUploadOpen(true)
    client.enqueueUploads(files)
  }

  function navLinks() {
    return (
      <>
        {phase === 'app' && (
          <label htmlFor="brush-gallery" className="brush-menu-upload" data-action="upload">
            <UploadIcon />
            <span>Upload</span>
          </label>
        )}
        <button type="button" onClick={() => { setMenuOpen(false); onExit() }}>Hub</button>
        {phase === 'app' && (
          <>
            {(['match', 'board', 'love', 'trash', 'library'] as Screen[]).map(item => (
              <button key={item} type="button" aria-current={screen === item ? 'page' : undefined} onClick={() => { setMenuOpen(false); setScreen(item) }}>
                {item === 'match' ? 'Match' : item === 'board' ? 'Board' : item === 'love' ? 'Love' : item === 'trash' ? 'Trash' : 'Library'}
              </button>
            ))}
            {showingMatch && deck?.phase === 'finals' && reason && !reason.open && (
              <button className="brush-text-button" type="button" data-action="reason" onClick={() => { setMenuOpen(false); setReason(current => current ? { ...current, open: true } : current) }}>Add reason</button>
            )}
          </>
        )}
        {statusChrome()}
      </>
    )
  }

  return (
    <main className={`brush${portrait ? ' is-portrait' : ' is-landscape'}${showingMatch ? ' is-match' : ''}`}>
      {phase === 'app' && <input id="brush-gallery" className="brush-file-input" data-upload-input type="file" accept="image/*" multiple onChange={onGallery} />}
      {!landscapeMatch && (
        <nav className="brush-nav" data-nav>
          <div className="brush-nav-row">{navLinks()}</div>
          {showingMatch && portrait && (
            <button type="button" data-action="flip" onClick={() => setFront(side => side === 'left' ? 'right' : 'left')}>Flip</button>
          )}
          {showingMatch && portrait && zoom.scale > 1 && (
            <button type="button" data-action="fit" onClick={() => setZoom(REST_ZOOM)}>Fit</button>
          )}
        </nav>
      )}
      <div className="brush-main">
      {moment && !landscapeMatch && <button className={`brush-moment is-${moment.kind}`} type="button" data-moment={moment.kind === 'level' ? 'level' : moment.kind === 'placement' ? 'placement' : 'top16'} title={moment.text} onClick={() => setMoments(queue => queue.slice(1))}>{moment.text}</button>}

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

      {phase === 'app' && screen === 'match' && deck?.phase === 'champion' && (
        <div className="brush-scroll" data-screen="champion">
          <h2>Champion</h2>
          {champion && srcFor(champion) && <img src={srcFor(champion) || ''} alt={champion.name} style={{ width: 'min(100%, 280px)', aspectRatio: '9 / 16', objectFit: 'cover', borderRadius: 18 }} />}
          <p>{champion?.name || 'The bracket is finished.'} {champion ? `· ${Math.round(champion.elo)}` : ''}</p>
          <button className="brush-upload" type="button" data-action="requalify" onClick={keepQualifying}>Keep qualifying</button>
        </div>
      )}
      {phase === 'app' && screen === 'match' && deck?.phase !== 'champion' && match && (
        <Matchup
          left={match.left}
          right={match.right}
          front={front}
          portrait={portrait}
          zoom={zoom}
          onZoom={setZoom}
          onFlip={() => setFront(side => side === 'left' ? 'right' : 'left')}
          onPick={pick}
          onTrash={trashOne}
          srcFor={srcFor}
          rankFor={id => standingOf(deck?.images || [], id)}
          celebrateId={moment && moment.kind !== 'top16' ? moment.imageId || null : null}
          notice={landscapeMatch ? (
            <>
              {moment && <button className={`brush-gutter-toast is-${moment.kind}`} type="button" data-moment={moment.kind === 'level' ? 'level' : moment.kind === 'placement' ? 'placement' : 'top16'} title={moment.text} onClick={() => setMoments(queue => queue.slice(1))}>{moment.text}</button>}
              {message && phase === 'app' && <p className="brush-note brush-gutter-toast is-note" data-note>{message}</p>}
            </>
          ) : null}
          leftChrome={landscapeMatch ? (
            <>
              <button className="brush-menu-button brush-icon-button" type="button" data-action="menu" aria-expanded={menuOpen} aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen(open => !open)}>
                <MenuIcon />
              </button>
              {zoom.scale > 1 && <button className="brush-icon-button" type="button" data-action="fit" aria-label="Fit" onClick={() => setZoom(REST_ZOOM)}>1:1</button>}
              {deck?.phase === 'finals' && reason && !reason.open && (
                <button className="brush-icon-button" type="button" data-action="reason" aria-label="Add reason" onClick={() => setReason(current => current ? { ...current, open: true } : current)}>
                  <ReasonIcon />
                </button>
              )}
              {menuOpen && <div className="brush-menu" data-menu>{navLinks()}</div>}
            </>
          ) : null}
          rightChrome={landscapeMatch ? (
            <>
              {deck?.phase === 'qualifying' && qualify && <span className="brush-progress" data-qualify aria-label={`Qualifying ${qualify.percent}%`}>{`${qualify.percent}%`}</span>}
              {deck?.phase === 'qualifying' && qualify && qualify.total >= 2 && (
                <button className="brush-icon-button" type="button" data-action="finals" aria-label="Finals" onClick={() => { setMenuOpen(false); goFinals() }}>
                  <FlagIcon />
                </button>
              )}
              {deck?.phase === 'finals' && <span className="brush-progress" data-finals aria-label={`Finals round ${deck.rounds.length}`}>{deck.rounds.length}</span>}
              {challengers > 0 && deck?.focus !== 'placement' && (
                deck?.phase === 'finals'
                  ? <button className="brush-icon-button" type="button" data-challengers data-action="challengers" aria-label={`New challengers: ${challengers}`} onClick={() => { setMenuOpen(false); placeChallengers() }}>{challengers}</button>
                  : <span className="brush-progress" data-challengers aria-label={`New challengers: ${challengers}`}>{challengers}</span>
              )}
              {deck?.phase === 'finals' && deck.focus === 'placement' && (
                <button className="brush-icon-button" type="button" data-action="bracket" aria-label="Back to finals" onClick={() => { setMenuOpen(false); backToBracket() }}>↩</button>
              )}
              {uploads.total > uploads.completed && <button className="brush-progress" type="button" data-upload-nav aria-label={`Uploads ${uploads.completed} of ${uploads.total}`} onClick={() => setUploadOpen(true)}>{`${uploads.completed}/${uploads.total}`}</button>}
            </>
          ) : null}
        />
      )}
      {phase === 'app' && screen === 'match' && deck && deck.phase !== 'champion' && !match && (
        <div className="brush-scroll" data-screen="match">
          <h2>Need two portraits</h2>
          <p>{qualify?.total || 0} active. Sync the Beauty Contest folder or upload more. Trashed images stay in Drive and wait in Trash Review.</p>
          <button className="brush-upload" type="button" onClick={() => setScreen('library')}>Open library</button>
        </div>
      )}
      {phase === 'app' && screen === 'board' && <Leaderboard images={deck?.images || board} srcFor={srcFor} />}
      {phase === 'app' && screen === 'love' && (
        <InsightsScreen
          insights={insights}
          phrasing={phrasing}
          onApprove={tag => { approve(tag).catch(error => setMessage(messageOf(error))) }}
          onReject={tag => { client.reviewTag(tag.id, 'reject').then(() => loadAll()).catch(error => setMessage(messageOf(error))) }}
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
              await loadAll()
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
          syncing={progress.startsWith('Sync')}
          onSync={() => {
            setProgress('Syncing Beauty Contest')
            client.sync(setProgress).then(() => loadAll()).catch(error => setMessage(messageOf(error))).finally(() => setProgress(''))
          }}
          onOpen={image => {
            client.detail(image.id).then(result => setDetail({ ...result, prompt: result.image.prompt_text || '' })).catch(error => setMessage(messageOf(error)))
          }}
          onAutoTag={image => {
            setProgress(`Tagging ${image.name}`)
            client.autoTag(image.id).then(result => {
              setMessage(result.suggested ? `${result.suggested} new tag${result.suggested === 1 ? '' : 's'} suggested.` : 'Attributes updated.')
              return loadAll()
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
          onReject={tag => { client.reviewTag(tag.id, 'reject').then(() => loadAll()).catch(error => setMessage(messageOf(error))) }}
          onSave={() => { saveTrash(0).catch(error => setMessage(messageOf(error))) }}
          onStep={delta => { saveTrash(delta).catch(error => setMessage(messageOf(error))) }}
          onRestore={() => {
            const image = trashed[trashIndex]
            if (!image) return
            client.restore(image.id).then(() => loadAll()).catch(error => setMessage(messageOf(error)))
          }}
        />
      )}

      {message && phase === 'app' && !landscapeMatch && <p className="brush-note">{message}</p>}
      </div>
      {reason?.open && (
        <ReasonSheet
          kind={reason.kind}
          tags={tags}
          selected={pickedTags}
          onToggle={id => setPickedTags(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])}
          onApprove={tag => { approve(tag).catch(error => setMessage(messageOf(error))) }}
          onReject={tag => { client.reviewTag(tag.id, 'reject').then(() => loadAll()).catch(error => setMessage(messageOf(error))) }}
          onSkip={() => { setReason(current => current ? { ...current, open: false } : current); setPickedTags([]) }}
          onDone={() => saveReason(pickedTags)}
        />
      )}
      {uploadOpen && (
        <UploadProgressSheet uploads={uploads} onRetry={id => client.retryUpload(id)} onClose={() => setUploadOpen(false)} />
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
              return loadAll()
            }).catch(error => setMessage(messageOf(error)))
          }}
        />
      )}
    </main>
  )
}

function MenuIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
}

function FlagIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15M7 5.5h9.2l-2.1 3.4 2.1 3.4H7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" /></svg>
}

function ReasonIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8.5h8.2L18 12l-3.8 3.5H6z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
}
