import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
const dir=await mkdtemp(path.resolve('node_modules/.estate-test-'))
try {
  const outfile=path.join(dir,'geometry.mjs')
  await build({entryPoints:['tests/ocean-estate-geometry.spec.ts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external'})
  await import(pathToFileURL(outfile).href)
} finally {await rm(dir,{recursive:true,force:true})}
