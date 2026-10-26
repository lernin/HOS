import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import './brush.css'
import { BrushError, createLiveClient, loadDriveImage, loadThumb } from './brush/client'
import { offerNewKnockout, stageKey, stageLabel, stageMoment } from './brush/arc'
import { applyDecision, bootDeck, continueRanking, currentMatch, dropUnreadable, mergeLibrary, progressOf, rememberHash, replayPending, startFinals, undoDecision, type Deck, type Decision } from './brush/deck'
import { Matchup, REST_ZOOM, type Zoom } from './brush/Matchup'
import { cancelPending, enqueueResult, flushOutbox, readOutbox, sentMatch, tagOutbox, type OutboxItem } from './brush/outbox'
import { attachUndoMatch, popUndo, pushUndo, readUndo, writeUndo, type RatingSnap, type UndoFrame } from './brush/undo'
import { holdTop16, matchMoments, standingOf, type BrushMoment } from './brush/level'
import { DEFAULT_CATEGORIES, OVERALL_CATEGORY, preferLocalRatings, rankingLine, rankingProgress, readPlayingCategory, rememberRatings, scopeImages, writePlayingCategory, type BrushCategory, type CategoryRating } from './brush/ranking'
import { hashImage } from './brush/pair'
import { createPreviewClient } from './brush/preview'
import { BackfillOffer, DetailSheet, InsightsScreen, Leaderboard, LibraryScreen, PinScreen, ReasonSheet, UploadIcon, UploadProgressSheet } from './brush/Sheets'
import { TrashReview } from './brush/TrashReview'
import type { BrushApi, BrushImage, BrushTag, ChampionRecord, Insights, Margin, TrashImage, UploadSnapshot } from './brush/types'
import { EMPTY_UPLOADS, retryLoad } from './brush/uploads'

type Screen = 'match' | 'board' | 'love' | 'library' | 'trash' | 'champions'
type Reason = { id: string, kind: 'like' | 'bad', open: boolean }

const EMPTY_INSIGHTS: Insights = {
  images: 0, active: 0, trashed: 0, matches: 0, tags: [], attributes: [], combinations: [],
  turn_offs: { trashed: 0, tags: [] }, recipe: null,
}

function messageOf(error: unknown) {
  if (error instanceof BrushError) return error.message
  return error instanceof Error ? error.message : 'Something went wrong.'
}

function downloadName(name: string) {
  const cleaned = (name || 'brush-picture').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'brush-picture'
  return /\.(jpe?g|png|webp|gif|avif)$/i.test(cleaned) ? cleaned : `${cleaned}.jpg`
}

function dataUrlToBlob(dataUrl: string) {
  const comma = dataUrl.indexOf(',')
  const header = dataUrl.slice(0, Math.max(0, comma))
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const mime = /data:([^;,]+)/.exec(header)?.[1] || 'image/jpeg'
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: mime })
}

function savePictureFile(src: string, name: string) {
  const fromData = src.startsWith('data:')
  const href = fromData ? URL.createObjectURL(dataUrlToBlob(src)) : src
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = downloadName(name)
  anchor.rel = 'noopener'
  anchor.style.position = 'fixed'
  anchor.style.left = '-9999px'
  document.body.appendChild(anchor)
  anchor.click()
  window.setTimeout(() => {
    anchor.remove()
    if (fromData) URL.revokeObjectURL(href)
  }, 2000)
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
  const [undoFrames, setUndoFrames] = useState<UndoFrame[]>(() => readUndo(preview))
  const undoRef = useRef(undoFrames)
  undoRef.current = undoFrames
  const [champions, setChampions] = useState<ChampionRecord[]>([])
  const [category, setCategory] = useState(readPlayingCategory)
  const [categories, setCategories] = useState<BrushCategory[]>(DEFAULT_CATEGORIES)
  const addedRef = useRef(0)
  const startedRef = useRef(Date.now())
  const hashedRef = useRef(new Set<string>())
  const deckRef = useRef<Deck | null>(null)
  deckRef.current = deck
  const libraryRef = useRef<BrushImage[]>([])
  const ratingRowsRef = useRef<CategoryRating[]>([])
  const categoryRef = useRef(category)
  categoryRef.current = category
  const heldTop = useRef<Record<string, string[]>>({})
  const categoryToken = useRef(0)
  const playingName = categories.find(item => item.id === category)?.label || 'Overall'
  const rankingText = rankingLine(rankingProgress(deck?.images || board))
  const match = deck ? currentMatch(deck) : null
  const matchKey = match ? `${match.left.id}:${match.right.id}` : ''
  const qualify = deck ? progressOf(deck) : null
  const showingMatch = phase === 'app' && screen === 'match' && deck?.phase !== 'champion' && !!match
  const matchFailed = phase === 'app' && screen === 'match' && !deck
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

  function scopeLibrary(categoryId: string, rows: CategoryRating[]) {
    const local = new Map((deckRef.current?.images || []).map(image => [image.id, image]))
    const base = libraryRef.current.map(image => {
      const current = local.get(image.id)
      if (!current) return image
      return {
        ...image,
        trashed: current.trashed || image.trashed,
        trash_count: Math.max(current.trash_count, image.trash_count),
        unreadable: current.unreadable || image.unreadable,
        perceptual_hash: current.perceptual_hash || image.perceptual_hash,
        face_box: image.face_box || current.face_box,
        face_scanned: image.face_scanned || current.face_scanned,
      }
    })
    return scopeImages(base, categoryId, rows)
  }

  async function loadAll(api = client) {
    const cat = categoryRef.current
    const [nextTags, nextLibrary, nextInsights, nextTrashed, contest, nextCategories, nextRatings] = await Promise.all([
      api.tags(), api.library(), api.insights(), api.trashed(), api.contest(cat), api.categories(), api.ratings(),
    ])
    setTags(nextTags)
    libraryRef.current = nextLibrary
    setLibrary(nextLibrary)
    setInsights(nextInsights)
    setTrashed(nextTrashed)
    setCategories(nextCategories.length ? [...nextCategories].sort((a, b) => a.sort - b.sort) : DEFAULT_CATEGORIES)
    const withDeck = deckRef.current ? rememberRatings(preferLocalRatings(ratingRowsRef.current, nextRatings), cat, deckRef.current.images) : preferLocalRatings(ratingRowsRef.current, nextRatings)
    ratingRowsRef.current = withDeck
    const scoped = scopeImages(nextLibrary, cat, withDeck)
    setBoard(scoped)
    setChampions(contest.champions || [])
    const previous = deckRef.current
    const pending = readOutbox(preview).filter(item => (item.category || OVERALL_CATEGORY) === cat)
    const base = previous ? mergeLibrary(previous, scoped) : replayPending(bootDeck(scoped, contest), pending)
    publishDeck(base, previous)
    persistIfDrifted(base, previous ? { phase: previous.phase, rounds: previous.rounds, championId: previous.championId } : contest)
    setDeck(base)
  }

  async function openCategory(id: string) {
    const token = categoryToken.current + 1
    categoryToken.current = token
    const [contest, remote] = await Promise.all([client.contest(id), client.ratings()])
    if (token !== categoryToken.current || categoryRef.current !== id) return
    const merged = preferLocalRatings(ratingRowsRef.current, remote)
    ratingRowsRef.current = merged
    const scoped = scopeLibrary(id, merged)
    setBoard(scoped)
    setChampions(contest.champions || [])
    const next = bootDeck(scoped, contest)
    publishDeck(next, null)
    persistIfDrifted(next, contest)
    setDeck(next)
    setFront('left')
    setZoom(REST_ZOOM)
  }

  function chooseCategory(id: string) {
    if (id === categoryRef.current) {
      setMenuOpen(false)
      return
    }
    const current = deckRef.current
    if (current) {
      ratingRowsRef.current = rememberRatings(ratingRowsRef.current, categoryRef.current, current.images)
      void client.saveContest({ phase: current.phase, rounds: current.rounds, championId: current.championId }, categoryRef.current).catch(error => setMessage(messageOf(error)))
    }
    writePlayingCategory(id)
    categoryRef.current = id
    setCategory(id)
    setMenuOpen(false)
    setZoom(REST_ZOOM)
    setFront('left')
    void openCategory(id).catch(error => setMessage(messageOf(error)))
  }

  function rememberUndo(frames: UndoFrame[]) {
    undoRef.current = frames
    setUndoFrames(frames)
    writeUndo(preview, frames)
  }

  function publishDeck(next: Deck, previous: Deck | null) {
    if (next.archive.length > (previous?.archive.length || 0)) {
      const parked = next.archive[next.archive.length - 1]
      void client.noteContest({ category: categoryRef.current, note: 'park', rounds: parked }).catch(() => {})
    }
    if (previous && next.phase === 'champion' && previous.phase !== 'champion' && next.championId) {
      void client.noteContest({ category: categoryRef.current, note: 'crown', imageId: next.championId, field: next.field }).then(record => {
        if (!record) return
        setChampions(list => [record, ...list.filter(item => item.id !== record.id)])
      }).catch(() => {})
    }
  }

  function momentKind(kind: BrushMoment['kind']) {
    if (kind === 'level' || kind === 'placement' || kind === 'stage') return kind
    return 'top16'
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
      category: item.category || OVERALL_CATEGORY,
    }).then(result => {
      if (result.match_id) rememberUndo(attachUndoMatch(undoRef.current, item.id, result.match_id))
      return result
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
      void flushOutbox(preview, sendResult, (matchId, tagIds) => client.annotate(matchId, tagIds), matchId => client.undo(matchId)).catch(error => {
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
    void client.saveContest({ phase: next.phase, rounds: next.rounds, championId: next.championId }, categoryRef.current).catch(error => setMessage(messageOf(error)))
  }

  function persistIfDrifted(next: Deck, saved: { phase: Deck['phase'], rounds: Deck['rounds'], championId: string | null }) {
    if (next.phase !== saved.phase || next.championId !== saved.championId || JSON.stringify(next.rounds) !== JSON.stringify(saved.rounds || [])) persistContest(next)
  }

  function ratingSnap(image: BrushImage): RatingSnap {
    return {
      elo: image.elo,
      sigma: image.sigma,
      volatility: image.volatility,
      games: image.games,
      wins: image.wins,
      losses: image.losses,
      close_wins: image.close_wins || 0,
      close_losses: image.close_losses || 0,
      trash_count: image.trash_count,
      trashed: Boolean(image.trashed),
    }
  }

  function commit(decision: Decision) {
    const current = deckRef.current
    if (!current) return
    const left = current.images.find(image => image.id === decision.leftId)
    const right = current.images.find(image => image.id === decision.rightId)
    const next = applyDecision(current, decision)
    const cat = categoryRef.current
    const release = holdTop16({ before: current.images, after: next.images, held: heldTop.current[cat] || [] })
    heldTop.current[cat] = release.held
    const toast = stageMoment(stageKey(current), stageKey(next))
    setMoments([...matchMoments(current.images, next.images), ...release.moments, ...(toast ? [{ kind: 'stage' as const, text: toast }] : [])])
    publishDeck(next, current)
    setDeck(next)
    setZoom(REST_ZOOM)
    if (decision.kind === 'trash' && decision.trashLeft !== decision.trashRight) setFront(decision.trashLeft ? 'left' : 'right')
    else setFront('left')
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
      category: categoryRef.current,
    }
    enqueueResult(preview, item)
    if (left && right) {
      rememberUndo(pushUndo(undoRef.current, {
        id: item.id,
        category: cat,
        matchId: null,
        leftId: left.id,
        rightId: right.id,
        left: ratingSnap(left),
        right: ratingSnap(right),
        queue: current.queue.map(slot => ({ ...slot })),
        recentKeys: [...current.recentKeys],
        phase: current.phase,
        focus: current.focus,
        rounds: current.rounds.map(round => round.map(match => ({ ...match }))),
        championId: current.championId,
      }))
    }
    setPickedTags([])
    setReason({ id: item.id, kind: decision.kind === 'pick' ? 'like' : 'bad', open: current.phase === 'finals' })
    if (next.phase !== current.phase || next.championId !== current.championId || JSON.stringify(next.rounds) !== JSON.stringify(current.rounds)) persistContest(next)
    startedRef.current = Date.now()
    void flushOutbox(preview, sendResult, (matchId, tagIds) => client.annotate(matchId, tagIds), matchId => client.undo(matchId)).catch(error => setMessage(messageOf(error)))
  }

  function undoLast() {
    const current = deckRef.current
    if (!current) return
    const popped = popUndo(undoRef.current, categoryRef.current)
    if (!popped.frame) return
    const frame = popped.frame
    rememberUndo(popped.frames)
    setMenuOpen(false)
    setReason(null)
    setZoom(REST_ZOOM)
    setFront('left')
    setScreen('match')
    const pending = readOutbox(preview).find(item => item.id === frame.id)
    const matchId = frame.matchId || pending?.matchId || null
    if (!matchId) cancelPending(preview, frame.id)
    const restored = undoDecision(current, frame)
    if (current.phase === 'champion' && restored.phase !== 'champion' && current.championId) {
      void client.noteContest({ category: categoryRef.current, note: 'uncrown', imageId: current.championId }).then(() => {
        setChampions(list => {
          const index = list.findIndex(item => item.imageId === current.championId && item.category === categoryRef.current)
          return index < 0 ? list : list.filter((_, itemIndex) => itemIndex !== index)
        })
      }).catch(() => {})
    }
    setDeck(restored)
    if (restored.phase !== current.phase || restored.championId !== current.championId || JSON.stringify(restored.rounds) !== JSON.stringify(current.rounds)) persistContest(restored)
    if (!matchId) return
    void client.undo(matchId).catch(error => {
      rememberUndo(pushUndo(undoRef.current, frame))
      setDeck(current)
      setMessage(messageOf(error))
    })
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

  function startKnockout() {
    const current = deckRef.current
    if (!current) return
    const next = startFinals(current)
    if (next === current) {
      setMessage('The top 16 are not ready for a knockout.')
      return
    }
    const toast = stageMoment(stageKey(current), stageKey(next))
    if (toast) setMoments(queue => [...queue, { kind: 'stage', text: toast }])
    setDeck(next)
    setScreen('match')
    setZoom(REST_ZOOM)
    setFront('left')
    setReason(null)
    persistContest(next)
  }

  function keepRanking() {
    const current = deckRef.current
    if (!current) return
    const next = continueRanking(current)
    publishDeck(next, current)
    setDeck(next)
    setScreen('match')
    setReason(null)
    persistContest(next)
  }

  function saveReason(tagIds: string[]) {
    if (!reason) return
    const pending = readOutbox(preview).some(item => item.id === reason.id)
    if (pending) {
      tagOutbox(preview, reason.id, tagIds)
      void flushOutbox(preview, sendResult, (matchId, ids) => client.annotate(matchId, ids), matchId => client.undo(matchId)).catch(error => setMessage(messageOf(error)))
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
  const stageText = deck && deck.phase !== 'champion' ? stageLabel(deck) : ''
  const canStartKnockout = deck ? offerNewKnockout(deck) : false
  const crown = champions.find(item => item.imageId === deck?.championId && item.category === category)
  const crownDate = crown ? new Date(crown.crownedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

  function statusChrome() {
    return (
      <>
        {stageText && <span className="brush-progress" data-stage>{stageText}</span>}
        {champion && <span className="brush-progress" data-champion>{`Champion · ${champion.country || champion.name}`}</span>}
        {canStartKnockout && <button type="button" data-action="knockout" onClick={() => { setMenuOpen(false); startKnockout() }}>Start a new knockout</button>}
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

  function pictureSrc(image: BrushImage) {
    return image.preview_url || urls[image.drive_file_id] || srcFor(image)
  }

  function savePicture(image: BrushImage) {
    const src = pictureSrc(image)
    if (!src) {
      setMessage('That picture is still loading.')
      return
    }
    savePictureFile(src, image.name)
    setMenuOpen(false)
  }

  function syncDrive() {
    setMenuOpen(false)
    setProgress('Syncing Beauty Contest')
    client.sync(setProgress).then(() => loadAll()).catch(error => setMessage(messageOf(error))).finally(() => setProgress(''))
  }

  function menuSheet() {
    const open = (item: Screen) => { setMenuOpen(false); setScreen(item) }
    const focused = match ? (front === 'left' ? match.left : match.right) : null
    return (
      <>
        <section className="brush-menu-group" data-menu-group="navigation">
          <p className="brush-menu-label">Navigation</p>
          <button className="brush-menu-row" type="button" data-action="board" aria-current={screen === 'board' ? 'page' : undefined} onClick={() => open('board')}><MenuGlyph paths={['M4 19V9', 'M4 19h16', 'M9 19V5h6v14', 'M9 9h6']} /><span>Board</span></button>
          <button className="brush-menu-row" type="button" data-action="library" aria-current={screen === 'library' ? 'page' : undefined} onClick={() => open('library')}><MenuGlyph paths={['M5 5h6v6H5z', 'M13 5h6v6h-6z', 'M5 13h6v6H5z', 'M13 13h6v6h-6z']} /><span>Library</span></button>
          <button className="brush-menu-row" type="button" data-action="match" aria-current={screen === 'match' ? 'page' : undefined} onClick={() => open('match')}><MenuGlyph paths={['M4 6h7v12H4z', 'M13 6h7v12h-7z']} /><span>Match</span></button>
          <button className="brush-menu-row" type="button" data-action="love" aria-current={screen === 'love' ? 'page' : undefined} onClick={() => open('love')}><MenuGlyph paths={['M12 19s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z']} /><span>Love</span></button>
          <button className="brush-menu-row" type="button" data-action="trash" aria-current={screen === 'trash' ? 'page' : undefined} onClick={() => open('trash')}><MenuGlyph paths={['M5 7.6h14', 'M9.2 7.6V5.6h5.6v2', 'M7.4 7.6l.7 11.2h7.8l.7-11.2']} /><span>Trash</span></button>
          <button className="brush-menu-row" type="button" data-action="hub" onClick={() => { setMenuOpen(false); onExit() }}><MenuGlyph paths={['M5 12h14', 'M13 6l6 6-6 6']} /><span>Hub</span></button>
        </section>
        <section className="brush-menu-group" data-menu-group="contest">
          <p className="brush-menu-label">Contest</p>
          <button className="brush-menu-row" type="button" data-action="undo" disabled={!undoFrames.some(frame => frame.category === category)} onClick={undoLast}><MenuGlyph paths={['M8 7v4H4', 'M5 9a7 7 0 1 1-1 4']} /><span>Undo</span></button>
          <p className="brush-menu-label">Playing for</p>
          <div className="brush-menu-picks">
            {categories.map(item => (
              <button key={item.id} type="button" data-playing-for data-category={item.id} aria-pressed={item.id === category} onClick={() => chooseCategory(item.id)}>{item.label}</button>
            ))}
          </div>
          <p className="brush-menu-note" data-ranking>{rankingText}</p>
          {stageText && <p className="brush-menu-note" data-stage>{stageText}</p>}
          {champion && <p className="brush-menu-note" data-champion>{`Champion · ${champion.country || champion.name}`}</p>}
          {canStartKnockout && (
            <button className="brush-menu-row" type="button" data-action="knockout" onClick={() => { setMenuOpen(false); startKnockout() }}><MenuGlyph paths={['M7 4h10v3a5 5 0 0 1-10 0z', 'M12 12v6', 'M8 20h8']} /><span>Start a new knockout</span></button>
          )}
          <button className="brush-menu-row" type="button" data-action="champions" aria-current={screen === 'champions' ? 'page' : undefined} onClick={() => open('champions')}><MenuGlyph paths={['M7 4h10v3a5 5 0 0 1-10 0z', 'M12 12v6', 'M8 20h8']} /><span>Champions</span></button>
          {uploads.total > uploads.completed && (
            <button className="brush-menu-row" type="button" data-upload-nav onClick={() => { setMenuOpen(false); setUploadOpen(true) }}><UploadIcon /><span>{`Uploads ${uploads.completed}/${uploads.total}`}</span></button>
          )}
          {progress && <p className="brush-menu-note">{progress}</p>}
        </section>
        {match && focused && <section className="brush-menu-group" data-menu-group="pictures">
          <p className="brush-menu-label">Pictures</p>
          <button className="brush-menu-row" type="button" data-action="sync" onClick={syncDrive}><MenuGlyph paths={['M20 12a8 8 0 0 1-13.6 5.7L4 16', 'M4 12a8 8 0 0 1 13.6-5.7L20 8', 'M4 16v-3.5h3.5', 'M20 8v3.5h-3.5']} /><span>Sync Drive</span></button>
          {phase === 'app' && (
            <label htmlFor="brush-gallery" className="brush-menu-row" data-action="upload">
              <UploadIcon />
              <span>Upload</span>
            </label>
          )}
          {portrait ? (
            <button className="brush-menu-row" type="button" data-action="download" onClick={() => savePicture(focused)}><MenuGlyph paths={['M12 4v11', 'M7.5 11 12 15.5 16.5 11', 'M5 19h14']} /><span>Download</span></button>
          ) : (
            <>
              <button className="brush-menu-row" type="button" data-action="download-left" data-side="left" onClick={() => savePicture(match.left)}><MenuGlyph paths={['M12 4v11', 'M7.5 11 12 15.5 16.5 11', 'M5 19h14']} /><span>Download left</span></button>
              <button className="brush-menu-row" type="button" data-action="download-right" data-side="right" onClick={() => savePicture(match.right)}><MenuGlyph paths={['M12 4v11', 'M7.5 11 12 15.5 16.5 11', 'M5 19h14']} /><span>Download right</span></button>
            </>
          )}
          {portrait && <button className="brush-menu-row" type="button" data-action="flip" onClick={() => { setMenuOpen(false); setFront(side => side === 'left' ? 'right' : 'left') }}><MenuGlyph paths={['M7 7h6a4 4 0 0 1 0 8H8', 'M7 7 4.5 9.5', 'M17 17H11a4 4 0 0 1 0-8h5', 'M17 17l2.5-2.5']} /><span>Flip</span></button>}
          {zoom.scale > 1 && <button className="brush-menu-row" type="button" data-action="fit" onClick={() => { setMenuOpen(false); setZoom(REST_ZOOM) }}><MenuGlyph paths={['M9 4H5v4', 'M15 4h4v4', 'M9 20H5v-4', 'M15 20h4v-4']} /><span>Fit</span></button>}
          {showingMatch && deck?.phase === 'finals' && reason && !reason.open && (
            <button className="brush-menu-row" type="button" data-action="reason" onClick={() => { setMenuOpen(false); setReason(current => current ? { ...current, open: true } : current) }}><ReasonIcon /><span>Add reason</span></button>
          )}
        </section>}
      </>
    )
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
      {!showingMatch && !matchFailed && (
        <nav className="brush-nav" data-nav>
          <div className="brush-nav-row">{navLinks()}</div>
        </nav>
      )}
      <div className="brush-main">
      {(showingMatch && portrait || matchFailed) && (
        <div className="brush-portrait-menu">
          <button className="brush-float-menu" type="button" data-action="menu" aria-expanded={menuOpen} aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen(open => !open)}>
            <MenuIcon />
          </button>
          {menuOpen && (
            <div className="brush-menu is-portrait-menu" data-menu>
              {menuSheet()}
            </div>
          )}
        </div>
      )}
      {moment && !landscapeMatch && <button className={`brush-moment is-${momentKind(moment.kind)}${showingMatch && portrait ? ' is-overlay' : ''}`} type="button" data-moment={momentKind(moment.kind)} title={moment.text} onClick={() => setMoments(queue => queue.slice(1))}>{moment.text}</button>}

      {matchFailed && (
        <div className="brush-scroll" data-screen="match">
          <p className="brush-note" data-note>{message || 'Opening the contest…'}</p>
        </div>
      )}
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
        <div className="brush-champion" data-screen="champion">
          {champion && srcFor(champion) && <img className="brush-champion-photo" src={srcFor(champion) || ''} alt={champion.name} />}
          <h2>Champion</h2>
          <p>{`${playingName} · ${crownDate}`}</p>
          <button className="brush-upload" type="button" data-action="ladder" onClick={keepRanking}>Keep ranking</button>
        </div>
      )}
      {phase === 'app' && screen === 'champions' && (
        <div className="brush-scroll" data-screen="champions">
          <h2>Champions</h2>
          <div className="brush-champion-list">
            {champions.length === 0 && <p className="brush-note">No champion in {playingName} yet.</p>}
            {champions.map(item => {
              const picture = library.find(image => image.id === item.imageId) || deck?.images.find(image => image.id === item.imageId)
              const when = new Date(item.crownedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
              return (
                <article key={item.id} data-champion-row>
                  <strong>{picture?.country || picture?.name || 'Champion'}</strong>
                  <span>{`${categories.find(entry => entry.id === item.category)?.label || playingName} · ${when}`}</span>
                </article>
              )
            })}
          </div>
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
          playing={`Playing for ${playingName}`}
          stage={stageText}
          canUndo={undoFrames.some(frame => frame.category === category)}
          onUndo={undoLast}
          rankFor={id => standingOf(deck?.images || [], id)}
          celebrateId={moment && moment.kind !== 'top16' ? moment.imageId || null : null}
          notice={landscapeMatch ? (
            <>
              {moment && <button className={`brush-gutter-toast is-${momentKind(moment.kind)}`} type="button" data-moment={momentKind(moment.kind)} title={moment.text} onClick={() => setMoments(queue => queue.slice(1))}>{moment.text}</button>}
              {message && phase === 'app' && <p className="brush-note brush-gutter-toast is-note" data-note>{message}</p>}
            </>
          ) : null}
          menu={landscapeMatch ? (
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
              {menuOpen && <div className="brush-menu" data-menu>{menuSheet()}</div>}
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
      {phase === 'app' && screen === 'board' && (
        <Leaderboard
          images={deck?.images || board}
          srcFor={srcFor}
          categories={categories}
          category={category}
          ranking={rankingText}
          onCategory={chooseCategory}
        />
      )}
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

      {message && phase === 'app' && !landscapeMatch && !matchFailed && <p className="brush-note">{message}</p>}
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
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="currentColor" stroke="#14120e" strokeWidth="1.4">
        <circle cx="12" cy="5" r="1.7" />
        <circle cx="12" cy="12" r="1.7" />
        <circle cx="12" cy="19" r="1.7" />
      </g>
    </svg>
  )
}

function MenuGlyph({ paths }: { paths: string[] }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths.map(d => <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />)}
    </svg>
  )
}

function ReasonIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8.5h8.2L18 12l-3.8 3.5H6z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
}
