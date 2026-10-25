import { json } from './_brush/http.js'
import image from './_brush/routes/image.js'
import recipe from './_brush/routes/recipe.js'
import suggest from './_brush/routes/suggest.js'
import sync from './_brush/routes/sync.js'
import retireScreenshots from './_brush/routes/retire-screenshots.js'
import syncDaily from './_brush/routes/sync-daily.js'
import thumb from './_brush/routes/thumb.js'
import faceBackfill from './_brush/routes/face-backfill.js'
import uploadChunk from './_brush/routes/upload-chunk.js'
import uploadFinish from './_brush/routes/upload-finish.js'
import uploadSession from './_brush/routes/upload-session.js'
import upload from './_brush/routes/upload.js'
import vision from './_brush/routes/vision.js'

export const maxDuration = 60

type BrushRoute = {
  fetch: (request: Request) => Promise<Response> | Response
}

const routes: Record<string, BrushRoute> = {
  sync,
  'sync-daily': syncDaily,
  'retire-screenshots': retireScreenshots,
  upload,
  'upload-session': uploadSession,
  'upload-chunk': uploadChunk,
  'upload-finish': uploadFinish,
  image,
  thumb,
  'face-backfill': faceBackfill,
  vision,
  suggest,
  recipe,
}

export function brushAction(url: URL) {
  const query = url.searchParams.get('action')?.trim()
  if (query) return query
  const path = url.pathname.replace(/\/+$/, '')
  if (path.startsWith('/api/brush-')) return path.slice('/api/brush-'.length)
  if (path.startsWith('/api/brush/')) return path.slice('/api/brush/'.length)
  return ''
}

export default {
  async fetch(request: Request) {
    const action = brushAction(new URL(request.url))
    const route = routes[action]
    if (!route) return json({ error: 'Unknown Brush route.' }, 404)
    return route.fetch(request)
  },
}
