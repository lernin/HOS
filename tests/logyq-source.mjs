import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
export const logyqDir = join(root, 'public/logyq')

export function engineSource() {
  const extracted = join(logyqDir, 'js/engine.js')
  if (existsSync(extracted)) return readFileSync(extracted, 'utf8')
  const html = readFileSync(join(logyqDir, 'index.html'), 'utf8')
  const match = html.match(/<script>([\s\S]*?)<\/script>/i)
  if (!match) throw new Error('expected LOGYQ engine source')
  return match[1]
}

export function extractBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  if (start < 0 || end <= start) throw new Error(`could not extract ${startMarker}`)
  return source.slice(start, end)
}
