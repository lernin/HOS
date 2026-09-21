import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const engineDir = join(root, 'public/logyq/js/engine')
const manifestPath = join(engineDir, 'MANIFEST')
const outPath = join(root, 'public/logyq/js/engine.js')

export function assembleLogyqEngine() {
  const names = readFileSync(manifestPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
  const source = names.map((name) => readFileSync(join(engineDir, name), 'utf8')).join('')
  return { names, source, outPath }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { names, source } = assembleLogyqEngine()
  writeFileSync(outPath, source)
  console.log(`assembled ${names.length} fragments -> ${outPath} (${source.length} chars)`)
}
