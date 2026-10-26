import { extendQueue, MATCH_MEMORY } from './pair.ts'
import { DEFAULT_CATEGORIES, freshRating, ratingFromImage, scopeImages, type CategoryRating } from './ranking.ts'
import { conservativeRating, glickoUpdate, INITIAL_VOLATILITY } from './rank'
import { suggestRecipe } from './recipe'
import type { BrushApi, BrushAttribute, BrushImage, BrushTag, ContestState, Insights, Margin } from './types'
import { attachQueue, UploadQueue, type UploadTransport } from './uploads'

function portrait(title: string, country: string, ink: string, paper: string, accent: string, width = 540, height = 960) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return ''
  context.fillStyle = paper
  context.fillRect(0, 0, 540, 960)
  context.fillStyle = accent
  context.fillRect(70, 520, 400, 360)
  context.fillStyle = ink
  context.beginPath()
  context.ellipse(270, 250, 92, 118, 0, 0, Math.PI * 2)
  context.fill()
  context.fillRect(210, 340, 120, 200)
  context.fillStyle = paper
  context.font = '600 28px Georgia, serif'
  context.fillText(country, 36, 70)
  context.font = '500 22px sans-serif'
  context.fillText(title, 36, 108)
  return canvas.toDataURL('image/jpeg', 0.86)
}

function tag(id: string, category: string, label: string, status: BrushTag['status'], source: string, sort: number, likes = 0, bads = 0): BrushTag {
  return { id, category, label, status, source, sort, likes, bads }
}

const SEED: BrushTag[] = [
  tag('t-shine', 'Hair', 'hair shine', 'live', 'seed', 3, 2, 0),
  tag('t-silk', 'Hair', 'hair softness/silkiness', 'live', 'seed', 2, 1, 0),
  tag('t-light', 'Scene', 'lighting', 'live', 'seed', 22, 0, 2),
  tag('t-dress', 'Styling', 'clothes/dress colour', 'live', 'seed', 17, 1, 0),
  tag('t-volume', 'Hair', 'hair volume', 'suggested', 'ai', 1000),
  tag('t-scout', 'Face', 'fox eyes', 'suggested', 'scout', 1001),
]

const PREVIEW_FACE = { x: 178 / 540, y: 132 / 960, w: 184 / 540, h: 236 / 960 }

function blank(partial: Pick<BrushImage, 'id' | 'name' | 'country' | 'preview_url'> & Partial<BrushImage>): BrushImage {
  return {
    drive_file_id: partial.id,
    folder_path: partial.country,
    series: null,
    mime_type: 'image/jpeg',
    source: 'drive',
    prompt_text: partial.country === 'Japan' ? 'soft daylight, sage dress, glossy long hair, eye-level close portrait' : null,
    elo: 1500,
    sigma: 350,
    volatility: INITIAL_VOLATILITY,
    games: 0,
    wins: 0,
    losses: 0,
    close_wins: 0,
    close_losses: 0,
    trash_count: 0,
    trashed: false,
    face_box: PREVIEW_FACE,
    face_scanned: true,
    ...partial,
  }
}

export function createPreviewClient(): BrushApi {
  const images: BrushImage[] = [
    blank({ id: 'jp', name: 'Japan_Model_01.jpg', country: 'Japan', folder_path: 'Japan/Models', perceptual_hash: '0000000000000000', preview_url: portrait('Japan 01', 'Japan', '#2a2118', '#d7c4a1', '#7f8f78'), createdAt: 1 }),
    blank({ id: 'jp2', name: 'Japan_Model_02.jpg', country: 'Japan', folder_path: 'Japan/Models', perceptual_hash: '00000000000000ff', preview_url: portrait('Japan 02', 'Japan', '#3a2a22', '#e4d2b4', '#8f7358'), createdAt: 2 }),
    blank({ id: 'kr', name: 'Korea_02.jpg', country: 'Korea', perceptual_hash: 'ffffffffffffffff', preview_url: portrait('Korea 02', 'Korea', '#1c2430', '#c5d0dc', '#6e88a8', 1400, 800), createdAt: 3, face_box: null, face_scanned: false }),
    blank({ id: 'st', name: 'Studio_03.jpg', country: 'Studio', perceptual_hash: '0f0f0f0f0f0f0f0f', preview_url: portrait('Studio 03', 'Studio', '#241c22', '#e6d5cf', '#c4a394'), createdAt: 4, face_box: null, face_scanned: false }),
    blank({ id: 'nt', name: 'Night_04.jpg', country: 'Night', perceptual_hash: '3333333333333333', preview_url: portrait('Night 04', 'Night', '#101114', '#9aa0a8', '#3d4450'), trashed: true, trash_count: 1, elo: 1464, games: 1, losses: 1, createdAt: 5 }),
  ]
  const tags = SEED.map(item => ({ ...item }))
  const badTags = new Map<string, string[]>([['nt', ['t-light']]])
  const attributes = new Map<string, BrushAttribute[]>([
    ['jp', [{ trait: 'hair shine', value: 'glossy', source: 'vision', confidence: 0.8, wins: 0, games: 0, trashes: 0 }]],
  ])
  let savedRecipe: string | null = null
  const faceSeed: Record<string, Partial<CategoryRating>> = {
    jp: { elo: 1720, sigma: 70, games: 12, wins: 9, losses: 3 },
    jp2: { elo: 1600, sigma: 90, games: 8, wins: 5, losses: 3 },
    kr: { elo: 1510, sigma: 140, games: 6, wins: 3, losses: 3 },
    st: { elo: 1490, sigma: 200, games: 2, wins: 1, losses: 1 },
  }
  const ratingRows: CategoryRating[] = images.flatMap(image => [
    ratingFromImage(image, 'overall'),
    { ...freshRating('face', image.id), ...faceSeed[image.id], imageId: image.id, category: 'face' },
    freshRating('hair', image.id),
  ])
  const contests = new Map<string, ContestState>(DEFAULT_CATEGORIES.map(item => [item.id, { phase: 'qualifying', rounds: [], championId: null }]))
  const recentByCategory = new Map<string, string[]>(DEFAULT_CATEGORIES.map(item => [item.id, []]))
  const known = new Set<string>()

  function categoryOf(category?: string) {
    return category && DEFAULT_CATEGORIES.some(item => item.id === category) ? category : 'overall'
  }

  function replaceRating(category: string, imageId: string, next: CategoryRating) {
    const index = ratingRows.findIndex(row => row.category === category && row.imageId === imageId)
    if (index >= 0) ratingRows[index] = next
    else ratingRows.push(next)
  }

  function ensureRating(category: string, image: BrushImage) {
    const found = ratingRows.find(row => row.category === category && row.imageId === image.id)
    if (found) return found
    const next = category === 'overall' ? ratingFromImage(image, 'overall') : freshRating(category, image.id)
    ratingRows.push(next)
    return next
  }

  function applyPick(left: CategoryRating, right: CategoryRating, winnerId: string, margin: Margin) {
    const rated = glickoUpdate(
      { rating: left.elo, rd: left.sigma, volatility: left.volatility },
      { rating: right.elo, rd: right.sigma, volatility: right.volatility },
      winnerId === left.imageId,
      margin,
    )
    const close = margin === 'close'
    left.elo = rated.eloA
    right.elo = rated.eloB
    left.sigma = rated.sigmaA
    right.sigma = rated.sigmaB
    left.volatility = rated.volatilityA
    right.volatility = rated.volatilityB
    left.games += 1
    right.games += 1
    if (winnerId === left.imageId) {
      left.wins += 1
      right.losses += 1
      if (close) { left.close_wins += 1; right.close_losses += 1 }
    } else {
      right.wins += 1
      left.losses += 1
      if (close) { right.close_wins += 1; left.close_losses += 1 }
    }
  }

  function wait(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, ms)
      const onAbort = () => {
        clearTimeout(timer)
        reject(new DOMException('The upload was paused.', 'AbortError'))
      }
      if (signal?.aborted) onAbort()
      else signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  const transport: UploadTransport = {
    async claim({ hash }) {
      await wait(15)
      if (known.has(hash)) return { duplicate: true, name: 'library' }
      return { duplicate: false, uploadUrl: `preview://${hash}` }
    },
    async put({ blob, uploadedBytes, signal, onBytes }) {
      const total = Math.max(1, blob.size)
      let sent = uploadedBytes
      for (let step = 1; step <= 4; step += 1) {
        await wait(160, signal)
        sent = Math.min(total, Math.max(sent, Math.round(total * step / 4)))
        onBytes(sent)
      }
      return { id: `up-${crypto.randomUUID()}`, name: '' }
    },
    async finish({ hash, name, driveFileId, thumbnail }) {
      if (known.has(hash)) return { duplicate: true }
      known.add(hash)
      const uploaded = blank({
        id: driveFileId,
        name,
        country: 'Uploads',
        folder_path: 'Brush Uploads',
        source: 'upload',
        games: 0,
        createdAt: Date.now(),
        has_thumbnail: Boolean(thumbnail),
        preview_url: thumbnail ? URL.createObjectURL(thumbnail) : portrait(name, 'Uploads', '#241c18', '#d9c7ae', '#8d735c'),
      })
      images.push(uploaded)
      for (const item of DEFAULT_CATEGORIES) ratingRows.push(item.id === 'overall' ? ratingFromImage(uploaded, 'overall') : freshRating(item.id, uploaded.id))
      return { duplicate: false }
    },
  }
  const queue = attachQueue(new UploadQueue(transport, 'brush-uploads-preview'))

  function active() {
    return images.filter(image => !image.trashed)
  }

  function pair() {
    const pool = active()
    if (pool.length < 2) return { ready: false as const, reason: 'need_images', active: pool.length, total: images.length }
    const [slot] = extendQueue(pool, [], recentByCategory.get('overall') || [], 1)
    if (!slot) return { ready: false as const, reason: 'need_images', active: pool.length, total: images.length }
    const left = pool.find(image => image.id === slot.leftId) || pool[0]
    const right = pool.find(image => image.id === slot.rightId) || pool[1]
    return { ready: true as const, active: pool.length, total: images.length, left, right }
  }

  function insights(): Insights {
    const turnOffCounts = new Map<string, number>()
    for (const [imageId, ids] of badTags) {
      if (!images.find(image => image.id === imageId)?.trashed) continue
      for (const id of ids) turnOffCounts.set(id, (turnOffCounts.get(id) || 0) + 1)
    }
    const turnOffTags = [...turnOffCounts.entries()]
      .map(([id, count]) => {
        const item = tags.find(tagItem => tagItem.id === id)
        return item ? { id, category: item.category, label: item.label, images: count } : null
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => b.images - a.images)
    const attributeRows = [...attributes.values()].flat()
    return {
      images: images.length,
      active: active().length,
      trashed: images.filter(image => image.trashed).length,
      matches: images.reduce((sum, image) => sum + image.games, 0) / 2,
      tags,
      attributes: attributeRows,
      combinations: [{ left: 'hair shine', right: 'hair softness/silkiness', together: 1 }],
      turn_offs: { trashed: images.filter(image => image.trashed).length, tags: turnOffTags },
      recipe: savedRecipe ? { body: savedRecipe, created_at: new Date().toISOString() } : null,
    }
  }

  return {
    status: async () => ({ pin_set: true }),
    async setPin() {},
    async unlock() {},
    async nextPair() { return pair() },
    async record(input) {
      const left = images.find(image => image.id === input.leftId)
      const right = images.find(image => image.id === input.rightId)
      if (!left || !right) return { match_id: null }
      const category = categoryOf(input.category)
      if (input.decision === 'pick' && input.winnerId) {
        if (category === 'overall') {
          const rated = glickoUpdate(
            { rating: left.elo, rd: left.sigma, volatility: left.volatility },
            { rating: right.elo, rd: right.sigma, volatility: right.volatility },
            input.winnerId === left.id,
            input.margin || 'clear',
          )
          left.elo = rated.eloA
          right.elo = rated.eloB
          left.sigma = rated.sigmaA
          right.sigma = rated.sigmaB
          left.volatility = rated.volatilityA
          right.volatility = rated.volatilityB
          left.games += 1
          right.games += 1
          const close = (input.margin || 'clear') === 'close'
          if (input.winnerId === left.id) {
            left.wins += 1
            right.losses += 1
            if (close) { left.close_wins = (left.close_wins || 0) + 1; right.close_losses = (right.close_losses || 0) + 1 }
          } else {
            right.wins += 1
            left.losses += 1
            if (close) { right.close_wins = (right.close_wins || 0) + 1; left.close_losses = (left.close_losses || 0) + 1 }
          }
          replaceRating('overall', left.id, ratingFromImage(left, 'overall'))
          replaceRating('overall', right.id, ratingFromImage(right, 'overall'))
        } else {
          applyPick(ensureRating(category, left), ensureRating(category, right), input.winnerId, input.margin || 'clear')
        }
      } else {
        if (input.trashLeft) { left.trashed = true; left.trash_count += 1 }
        if (input.trashRight) { right.trashed = true; right.trash_count += 1 }
        for (const image of [input.trashLeft ? left : null, input.trashRight ? right : null]) {
          if (!image) continue
          const existing = new Set(badTags.get(image.id) || [])
          input.tagIds.forEach(id => existing.add(id))
          badTags.set(image.id, [...existing])
        }
      }
      const recent = recentByCategory.get(category) || []
      recentByCategory.set(category, [...recent, [left.id, right.id].sort().join(':')].slice(-MATCH_MEMORY))
      return { match_id: `preview-${crypto.randomUUID()}` }
    },
    async annotate() {},
    async contest(category) {
      const id = categoryOf(category)
      return { ...(contests.get(id) || { phase: 'qualifying' as const, rounds: [], championId: null }), recentKeys: recentByCategory.get(id) || [] }
    },
    async saveContest(next, category) {
      const id = categoryOf(category)
      contests.set(id, { phase: next.phase, rounds: next.rounds, championId: next.championId })
    },
    async setPhash(imageId, hash) {
      const image = images.find(item => item.id === imageId)
      if (image) image.perceptual_hash = hash
    },
    async setFaceBox(imageId, faceBox) {
      const image = images.find(item => item.id === imageId)
      if (image) {
        image.face_box = faceBox
        image.face_scanned = true
      }
    },
    async flagUnreadable(imageId) {
      const image = images.find(item => item.id === imageId)
      if (image) image.unreadable = true
    },
    async leaderboard(category) {
      return scopeImages(images, categoryOf(category), ratingRows).sort((a, b) => conservativeRating(b.elo, b.sigma) - conservativeRating(a.elo, a.sigma))
    },
    async library() { return [...images] },
    async categories() { return DEFAULT_CATEGORIES.map(item => ({ ...item })) },
    async ratings() { return ratingRows.map(row => ({ ...row })) },
    async tags() { return tags.filter(item => item.status !== 'rejected') },
    async insights() { return insights() },
    async trashed() {
      return images.filter(image => image.trashed).map(image => ({ ...image, bad_tag_ids: badTags.get(image.id) || [] }))
    },
    async saveTrashTags(imageId, tagIds) { badTags.set(imageId, [...tagIds]) },
    async restore(imageId) {
      const image = images.find(item => item.id === imageId)
      if (image) image.trashed = false
    },
    async reviewTag(tagId, decision) {
      const item = tags.find(tagItem => tagItem.id === tagId)
      if (item) item.status = decision === 'approve' ? 'live' : 'rejected'
    },
    async suggestTag(category, label, source) {
      tags.push(tag(`t-${tags.length}`, category, label, 'suggested', source, 1000))
    },
    async detail(imageId) {
      const image = images.find(item => item.id === imageId) || images[0]
      return { image, attributes: attributes.get(image.id) || [] }
    },
    async setPrompt(imageId, prompt) {
      const image = images.find(item => item.id === imageId)
      if (image) image.prompt_text = prompt
    },
    async saveRecipe(body) { savedRecipe = body },
    async sync(onProgress) { onProgress('Preview sync does not call Drive.') },
    subscribeUploads: listener => queue.subscribe(listener),
    enqueueUploads: files => queue.enqueue(files),
    retryUpload: id => queue.retry(id),
    resumeUploads: () => queue.resume(),
    pauseUploads: () => { queue.pause() },
    async autoTag(imageId) {
      const current = attributes.get(imageId) || []
      current.push({ trait: 'expression', value: 'calm', source: 'vision', confidence: 0.7 })
      attributes.set(imageId, current)
      if (!tags.some(item => item.label === 'collar line')) {
        tags.push(tag('t-collar', 'Styling', 'collar line', 'suggested', 'ai', 1002))
      }
      return { suggested: 1 }
    },
    async backfill(tagItem, onProgress) {
      const pool = images
      for (let index = 0; index < pool.length; index += 1) {
        onProgress(index, pool.length)
        if (index < 2) {
          const current = attributes.get(pool[index].id) || []
          if (!current.some(attribute => attribute.trait === tagItem.label)) {
            current.push({ trait: tagItem.label, value: 'noted', source: 'vision', confidence: 0.66 })
            attributes.set(pool[index].id, current)
          }
        }
      }
      onProgress(pool.length, pool.length)
    },
  }
}

export function previewRecipe() {
  return suggestRecipe({
    tags: SEED,
    attributes: [],
    turnOffs: [{ label: 'lighting', images: 1 }],
  })
}
