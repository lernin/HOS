import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function assemble(dir, outRel) {
  const names = readFileSync(join(dir, 'MANIFEST'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
  const source = names.map((name) => readFileSync(join(dir, name), 'utf8')).join('')
  return { names, source, outPath: join(root, outRel) }
}

export function assembleLogyqEngine() {
  return assemble(join(root, 'public/logyq/js/engine'), 'public/logyq/js/engine.js')
}

export function assembleLogyqPreview() {
  return assemble(join(root, 'public/logyq/js/preview'), 'public/logyq/js/preview.js')
}

export function assembleLogyq() {
  return {
    engine: assembleLogyqEngine(),
    preview: assembleLogyqPreview(),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { engine, preview } = assembleLogyq()
  writeFileSync(engine.outPath, engine.source)
  writeFileSync(preview.outPath, preview.source)
  console.log(`assembled ${engine.names.length} engine fragments -> ${engine.outPath}`)
  console.log(`assembled ${preview.names.length} preview fragments -> ${preview.outPath}`)
}
