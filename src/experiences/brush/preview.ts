import { eloUpdate, nextSigma } from './rank'
import { suggestRecipe } from './recipe'
import type { BrushApi, BrushAttribute, BrushImage, BrushTag, Insights } from './types'

function portrait(title: string, country: string, ink: string, paper: string, accent: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 540
  canvas.height = 960
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
    games: 0,
    wins: 0,
    losses: 0,
    trash_count: 0,
    trashed: false,
    ...partial,
  }
}

export function createPreviewClient(): BrushApi {
  const images: BrushImage[] = [
    blank({ id: 'jp', name: 'Japan_01.jpg', country: 'Japan', preview_url: portrait('Japan 01', 'Japan', '#2a2118', '#d7c4a1', '#7f8f78') }),
    blank({ id: 'kr', name: 'Korea_02.jpg', country: 'Korea', preview_url: portrait('Korea 02', 'Korea', '#1c2430', '#c5d0dc', '#6e88a8') }),
    blank({ id: 'st', name: 'Studio_03.jpg', country: 'Studio', preview_url: portrait('Studio 03', 'Studio', '#241c22', '#e6d5cf', '#c4a394') }),
    blank({ id: 'nt', name: 'Night_04.jpg', country: 'Night', preview_url: portrait('Night 04', 'Night', '#101114', '#9aa0a8', '#3d4450'), trashed: true, trash_count: 1, elo: 1464, games: 1, losses: 1 }),
  ]
  const tags = SEED.map(item => ({ ...item }))
  const badTags = new Map<string, string[]>([['nt', ['t-light']]])
  const attributes = new Map<string, BrushAttribute[]>([
    ['jp', [{ trait: 'hair shine', value: 'glossy', source: 'vision', confidence: 0.8, wins: 0, games: 0, trashes: 0 }]],
  ])
  let lastPair: [string, string] | null = null
  let savedRecipe: string | null = null

  function active() {
    return images.filter(image => !image.trashed)
  }

  function pair() {
    const pool = active()
    if (pool.length < 2) return { ready: false as const, reason: 'need_images', active: pool.length, total: images.length }
    const left = [...pool].sort((a, b) => a.games - b.games || b.sigma - a.sigma)[0]
    const key = (a: string, b: string) => [a, b].sort().join(':')
    const opponents = pool
      .filter(image => image.id !== left.id)
      .sort((a, b) => Math.abs(a.elo - left.elo) - Math.abs(b.elo - left.elo))
    const right = opponents.find(image => !lastPair || key(left.id, image.id) !== key(lastPair[0], lastPair[1])) || opponents[0]
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
      if (!left || !right) return
      if (input.decision === 'pick' && input.winnerId) {
        const rated = eloUpdate(left.elo, right.elo, left.games, right.games, input.winnerId === left.id)
        left.elo = rated.eloA
        right.elo = rated.eloB
        left.sigma = nextSigma(left.sigma)
        right.sigma = nextSigma(right.sigma)
        left.games += 1
        right.games += 1
        if (input.winnerId === left.id) { left.wins += 1; right.losses += 1 } else { right.wins += 1; left.losses += 1 }
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
      lastPair = [left.id, right.id]
    },
    async leaderboard() { return [...images].sort((a, b) => b.elo - a.elo) },
    async library() { return [...images] },
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
    async upload(_files, onProgress) { onProgress('Preview upload does not call Drive.') },
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
