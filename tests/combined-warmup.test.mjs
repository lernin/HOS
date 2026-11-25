import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  WOODLAND_MODEL_KINDS, warmWoodlandModels,
  loadWoodlandModelBuffer, clearWoodlandWarmup,
} from '../src/experiences/combined/woodlandWarmup.ts'

test('Combined approach warms each model once and Woodland consumes the same bytes', async () => {
  clearWoodlandWarmup()
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(url)
    return {ok:true,arrayBuffer:async()=>Uint8Array.from([11,22,33]).buffer}
  }
  try {
    const signal = new AbortController().signal
    assert.equal(await warmWoodlandModels(signal), WOODLAND_MODEL_KINDS.length)
    assert.equal(calls.length, WOODLAND_MODEL_KINDS.length)
    const loaded = await loadWoodlandModelBuffer('tree', signal, true)
    assert.deepEqual([...new Uint8Array(loaded)], [11,22,33])
    assert.equal(calls.filter(url=>url==='/woodland/tree.glb').length,1,
      'crossing reuses prefetched bytes without a second network request')
    await loadWoodlandModelBuffer('tree', signal, true)
    assert.equal(calls.filter(url=>url==='/woodland/tree.glb').length,2,
      'consumed buffers are released, not kept indefinitely')
  } finally {
    globalThis.fetch=original
    clearWoodlandWarmup()
  }
})

test('failed prefetch falls back to a normal foreground load', async () => {
  clearWoodlandWarmup()
  const original=globalThis.fetch
  let failures=0
  globalThis.fetch=async url=>{
    if(url==='/woodland/pine.glb' && failures++===0) return {ok:false}
    return {ok:true,arrayBuffer:async()=>Uint8Array.from([42]).buffer}
  }
  try {
    const signal=new AbortController().signal
    assert.equal(await warmWoodlandModels(signal),WOODLAND_MODEL_KINDS.length-1)
    const loaded=await loadWoodlandModelBuffer('pine',signal,true)
    assert.deepEqual([...new Uint8Array(loaded)],[42])
  } finally {
    globalThis.fetch=original
    clearWoodlandWarmup()
  }
})

test('standalone Woodland never draws from the Combined buffer cache', async () => {
  clearWoodlandWarmup()
  const original=globalThis.fetch
  let requests=0
  globalThis.fetch=async ()=>{
    requests++
    return {ok:true,arrayBuffer:async()=>Uint8Array.from([requests]).buffer}
  }
  try {
    const signal=new AbortController().signal
    await warmWoodlandModels(signal)
    const loaded=await loadWoodlandModelBuffer('tree',signal,false)
    assert.deepEqual([...new Uint8Array(loaded)],[WOODLAND_MODEL_KINDS.length+1])
  } finally {
    globalThis.fetch=original
    clearWoodlandWarmup()
  }
})
