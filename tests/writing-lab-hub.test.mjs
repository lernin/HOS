import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8')
test('The Lab dashboard exposes a discoverable Word Writing Lab experiment card',()=>{
  assert.match(html,/id = 'word-writing-hub-card'/)
  assert.match(html,/<strong>Word Writing Lab<\/strong>/)
  assert.match(html,/procedia-two\.vercel\.app\/lab\/writing/)
  assert.match(html,/grid\.querySelector\('\.experience-card'\)/)
})
