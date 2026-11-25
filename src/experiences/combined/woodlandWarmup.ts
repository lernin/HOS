// Lightweight, bounded network prefetch for the Combined Estate -> Woodland
// crossing. No renderer, meshes, GLTF parser, or GPU resources are created here.
// The GLB bytes are reused by the real Woodland loader on entry.
export const WOODLAND_MODEL_KINDS = ['tree', 'tree-b', 'pine', 'bush', 'fern', 'grass', 'rock', 'clover'] as const
export type WoodlandModelKind = typeof WOODLAND_MODEL_KINDS[number]

const MAX_WARM_BYTES = 8_000_000
type WarmEntry = { task: Promise<ArrayBuffer | null>; bytes: number }
const warm = new Map<WoodlandModelKind, WarmEntry>()
let retainedBytes = 0

function aborted(): DOMException {
  return new DOMException('Aborted', 'AbortError')
}

async function download(kind: WoodlandModelKind, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch('/woodland/' + kind + '.glb', { signal })
  if (!response.ok) throw new Error('Could not load ' + kind)
  return response.arrayBuffer()
}

function queue(kind: WoodlandModelKind, signal: AbortSignal): Promise<ArrayBuffer | null> {
  const existing = warm.get(kind)
  if (existing) return existing.task

  const entry: WarmEntry = { task: Promise.resolve(null), bytes: 0 }
  warm.set(kind, entry)
  entry.task = download(kind, signal).then(buffer => {
    if (signal.aborted || warm.get(kind) !== entry) return null
    if (retainedBytes + buffer.byteLength > MAX_WARM_BYTES) {
      warm.delete(kind)
      return null // Normal foreground loading remains available.
    }
    entry.bytes = buffer.byteLength
    retainedBytes += entry.bytes
    return buffer
  }).catch(() => {
    if (warm.get(kind) === entry) warm.delete(kind)
    return null // A failed prefetch must never block the actual forest.
  })
  return entry.task
}

// Two simultaneous downloads keep the warmup useful on a phone without
// competing with the active Estate renderer for eight requests at once.
export async function warmWoodlandModels(signal: AbortSignal): Promise<number> {
  let next = 0
  let successful = 0
  async function worker() {
    while (!signal.aborted && next < WOODLAND_MODEL_KINDS.length) {
      const kind = WOODLAND_MODEL_KINDS[next++]
      if (await queue(kind, signal)) successful++
    }
  }
  await Promise.all([worker(), worker()])
  return successful
}

// Called only by the real Woodland scene. A warm file is consumed (and
// removed from this buffer cache); standalone Woodland keeps its normal fetch.
export async function loadWoodlandModelBuffer(
  kind: WoodlandModelKind,
  signal: AbortSignal,
  combined: boolean,
): Promise<ArrayBuffer> {
  if (signal.aborted) throw aborted()
  const entry = combined ? warm.get(kind) : undefined
  if (entry) {
    const buffer = await entry.task
    if (signal.aborted) throw aborted()
    if (warm.get(kind) === entry) {
      warm.delete(kind)
      retainedBytes = Math.max(0, retainedBytes - entry.bytes)
    }
    if (buffer) return buffer
  }
  return download(kind, signal)
}

// Only invoked when the Combined route leaves, not while crossing worlds.
export function clearWoodlandWarmup(): void {
  warm.clear()
  retainedBytes = 0
}
