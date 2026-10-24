import sharp from 'sharp'
import * as tf from '@tensorflow/tfjs-core'
import '@tensorflow/tfjs-backend-cpu'
import { load } from '@tensorflow-models/blazeface'
import { boxFromPixels, type FaceBox } from '../../src/experiences/brush/face-box.js'

export type DetectedFace = FaceBox

let backendReady: Promise<void> | null = null
let modelReady: Promise<Awaited<ReturnType<typeof load>>> | null = null

async function model() {
  if (!backendReady) {
    backendReady = (async () => {
      await tf.setBackend('cpu')
      await tf.ready()
    })()
  }
  await backendReady
  if (!modelReady) modelReady = load({ maxFaces: 5, scoreThreshold: 0.5 })
  return modelReady
}

function scoreOf(probability: number | number[] | undefined) {
  if (typeof probability === 'number') return probability
  if (Array.isArray(probability)) return Number(probability[0]) || 0
  return 0
}

export async function detectFaceBoxFromBytes(bytes: Uint8Array): Promise<DetectedFace | null> {
  const source = Buffer.from(bytes)
  const meta = await sharp(source, { failOn: 'none' }).rotate().metadata()
  const width = meta.width || 0
  const height = meta.height || 0
  if (width < 8 || height < 8) return null
  const scale = Math.min(1, 384 / Math.max(width, height))
  const outW = Math.max(8, Math.round(width * scale))
  const outH = Math.max(8, Math.round(height * scale))
  const { data, info } = await sharp(source, { failOn: 'none' })
    .rotate()
    .resize(outW, outH, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const detector = await model()
  const tensor = tf.tensor3d(Int32Array.from(data), [info.height, info.width, 3])
  try {
    const faces = await detector.estimateFaces(tensor, false, false, true)
    let best: { box: DetectedFace, rank: number } | null = null
    for (const face of faces) {
      const box = boxFromPixels(info.width, info.height, face.topLeft, face.bottomRight)
      if (!box) continue
      const area = box.w * box.h
      const rank = scoreOf(face.probability) * 2 + area * (box.y < 0.55 ? 1 : 0.4)
      if (!best || rank > best.rank) best = { box, rank }
    }
    return best?.box || null
  } finally {
    tensor.dispose()
  }
}

declare module '@tensorflow-models/blazeface' {
  export function load(config?: { maxFaces?: number, scoreThreshold?: number }): Promise<{
    estimateFaces(
      input: unknown,
      returnTensors?: boolean,
      flipHorizontal?: boolean,
      annotateBoxes?: boolean,
    ): Promise<Array<{ topLeft: number[], bottomRight: number[], probability?: number | number[] }>>
  }>
}
