export type Point = { x: number; z: number }
export type Stage = 'hello' | 'can' | 'water' | 'flower' | 'done'
export type Target = 'mina' | 'can' | 'water' | 'red' | 'yellow'
export const stages: Stage[] = ['hello', 'can', 'water', 'flower', 'done']
export const targets: Record<Target, { name: string; point: Point; approach: Point }> = {
  mina: { name: 'Mina', point: { x: -7, z: 2 }, approach: { x: -7, z: 3.4 } },
  can: { name: 'Watering can', point: { x: -10, z: -3 }, approach: { x: -9, z: -2.4 } },
  water: { name: 'Stream', point: { x: -2.5, z: -5 }, approach: { x: -3.6, z: -4.8 } },
  red: { name: 'Red flower', point: { x: 7, z: -4 }, approach: { x: 7, z: -2.4 } },
  yellow: { name: 'Yellow flower', point: { x: 10, z: -1 }, approach: { x: 8.9, z: -0.5 } },
}
export const tasks: Record<Stage, { title: string; en: string; ko: string; target: Target }> = {
  hello: { title: 'Meet Mina', en: 'Say hello to the gardener.', ko: '정원사 미나에게 인사해요.', target: 'mina' },
  can: { title: 'Find the watering can', en: 'Bring me the watering can, please.', ko: '물뿌리개를 가져다주세요.', target: 'can' },
  water: { title: 'A little water', en: 'Fill the watering can at the stream.', ko: '시냇가에서 물뿌리개에 물을 담아요.', target: 'water' },
  flower: { title: 'Help a flower bloom', en: 'Water the red flower across the bridge.', ko: '다리를 건너 빨간 꽃에 물을 주세요.', target: 'red' },
  done: { title: 'You helped it bloom!', en: 'The flower is growing. Thank you!', ko: '꽃이 자라고 있어요. 고마워요!', target: 'red' },
}
export const lines: Record<Target, { question: string; ko: string; choices: string[]; answer: string }> = {
  mina: { question: 'Hello! Will you help my garden?', ko: '안녕! 내 정원을 도와줄래?', choices: ['Hello, Mina! I can help.', 'It is a blue car.', 'Good night, moon.'], answer: 'Hello, Mina! I can help.' },
  can: { question: 'What would you like?', ko: '무엇을 원하나요?', choices: ['A red apple, please.', 'The watering can, please.', 'A little bird, please.'], answer: 'The watering can, please.' },
  water: { question: 'What are you doing?', ko: '무엇을 하고 있나요?', choices: ['I am sleeping.', 'I am eating.', 'I am filling the watering can.'], answer: 'I am filling the watering can.' },
  red: { question: 'Which flower will you water?', ko: '어떤 꽃에 물을 줄 건가요?', choices: ['I will water the red flower.', 'I will water the blue flower.', 'I will water the yellow flower.'], answer: 'I will water the red flower.' },
  yellow: { question: 'This flower is yellow.', ko: '이 꽃은 노란색이에요.', choices: [], answer: '' },
}
export function respond(stage: Stage, target: Target, phrase: string): { stage: Stage; ok: boolean; message: string } {
  if (stage === 'done') return { stage, ok: false, message: 'Your red flower is blooming. You can keep exploring!' }
  if (tasks[stage].target !== target) return { stage, ok: false, message: target === 'yellow' ? 'This one is yellow. Look for the red flower.' : tasks[stage].en }
  if (lines[target].answer !== phrase) return { stage, ok: false, message: 'Listen again. Which words help you do this task?' }
  const next = stages[stages.indexOf(stage) + 1]
  return { stage: next, ok: true, message: tasks[next].en }
}
export function readStage(value: string | null): Stage { return stages.includes(value as Stage) ? value as Stage : 'hello' }
export const riverX = (z: number) => 0.7 + Math.sin(z * 0.24) * 1.25
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z)
export const obstacles: Array<Point & { radius: number }> = [
  { x: -12, z: 5, radius: 0.85 }, { x: -12, z: -7, radius: 0.85 },
  { x: -5, z: -9, radius: 0.8 }, { x: 7, z: -8, radius: 0.9 },
  { x: 13, z: 3, radius: 0.9 }, { x: 5, z: 8, radius: 0.8 },
  { x: -7, z: 2, radius: 0.55 }, { x: -10, z: -3, radius: 0.65 },
  { x: 7, z: -4, radius: 0.8 }, { x: 10, z: -1, radius: 0.8 },
  { x: -9.5, z: -7.5, radius: 1.65 },
]
export function canWalk(p: Point): boolean {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || (p.x / 16) ** 2 + (p.z / 12.5) ** 2 > 1) return false
  // The wooden bridge is the only crossing; no walking through water or rocks.
  if (Math.abs(p.x - riverX(p.z)) < 1.95 && Math.abs(p.z) > 1.1) return false
  if (p.z < -9.5 && Math.abs(p.x) < 4) return false
  return !obstacles.some(o => distance(o, p) < o.radius + 0.24)
}
const STEP = 0.5
const WIDTH = 69
const HEIGHT = 55
const gridPoint = (i: number): Point => ({ x: (i % WIDTH) * STEP - 17, z: Math.floor(i / WIDTH) * STEP - 13.5 })
const gridIndex = (p: Point) => Math.round((p.z + 13.5) / STEP) * WIDTH + Math.round((p.x + 17) / STEP)
// Small bounded breadth-first navigation grid. Deterministic and no external service.
export function findPath(start: Point, end: Point): Point[] {
  if (!canWalk(end)) return []
  const valid = new Uint8Array(WIDTH * HEIGHT)
  for (let i = 0; i < valid.length; i++) valid[i] = Number(canWalk(gridPoint(i)))
  const nearest = (p: Point) => {
    let best = -1, score = Infinity
    for (let i = 0; i < valid.length; i++) if (valid[i]) { const d = distance(p, gridPoint(i)); if (d < score) { best = i; score = d } }
    return best
  }
  const from = nearest(start), to = nearest(end)
  if (from < 0 || to < 0) return []
  const parent = new Int32Array(valid.length).fill(-1)
  const queue = [from]; parent[from] = from
  for (let h = 0; h < queue.length && parent[to] < 0; h++) {
    const n = queue[h], x = n % WIDTH, y = Math.floor(n / WIDTH)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy, next = ny * WIDTH + nx
      if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT || !valid[next] || parent[next] >= 0) continue
      if (dx && dy && (!valid[n + dx] || !valid[n + dy * WIDTH])) continue
      parent[next] = n; queue.push(next)
    }
  }
  if (parent[to] < 0) return []
  const route: Point[] = []
  for (let n = to; n !== from; n = parent[n]) route.push(gridPoint(n))
  route.push(gridPoint(from)); route.reverse(); route.push(end)
  return route.filter((p, i) => i > 0 || gridIndex(start) !== gridIndex(p))
}
