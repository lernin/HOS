import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

assert.ok(existsSync('src/experiences/island-estate/layout.ts'), 'The Island Estate needs its coordinated three-level layout')
const dir = await mkdtemp(path.resolve('node_modules/.island-test-'))
try {
  const outfile = path.join(dir, 'navigation.mjs')
  await build({ entryPoints: ['tests/island-estate.spec.ts'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external' })
  await import(pathToFileURL(outfile).href)
} finally { await rm(dir, { recursive: true, force: true }) }
