// Remote packets carry control inputs only: no child data, credentials or persistent storage.
export type RemoteInput =
  | { kind: 'motion'; x: number; z: number; dx: number; dy: number }
  | { kind: 'tap' }
  | { kind: 'stop' }

const hex = (length: number) => new RegExp('^[0-9a-f]{' + length + '}$')
export const validRoom = (v: unknown): v is string => typeof v === 'string' && hex(36).test(v)
export const validClient = (v: unknown): v is string => typeof v === 'string' && hex(24).test(v)

export function newRemoteCode(byteLength: 18 | 12 = 18): string {
  const values = crypto.getRandomValues(new Uint8Array(byteLength))
  return Array.from(values, b => b.toString(16).padStart(2, '0')).join('')
}

export function pairingUrl(origin: string, room: string): string {
  if (!validRoom(room)) throw new Error('Invalid room')
  return origin + '/estate-remote#pair=' + room
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const clamp = (n: number, range: number) => Math.max(-range, Math.min(range, n))

export function sanitizeInput(raw: unknown): RemoteInput | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const packet = raw as Record<string, unknown>
  if (packet.kind === 'tap' || packet.kind === 'stop') return { kind: packet.kind }
  if (packet.kind !== 'motion') return null
  if (![packet.x, packet.z, packet.dx, packet.dy].every(finite)) return null
  return { kind: 'motion', x: clamp(packet.x as number, 1), z: clamp(packet.z as number, 1),
    dx: clamp(packet.dx as number, 30), dy: clamp(packet.dy as number, 30) }
}

export function joystickAxes(dx: number, dy: number): { x: number; z: number } {
  const magnitude = Math.hypot(dx, dy)
  if (magnitude < 7) return { x: 0, z: 0 }
  const scale = Math.min(1, magnitude / 68) / magnitude
  return { x: dx * scale, z: dy * scale }
}

export const stopMotionAfter = (now: number, last: number) => now - last > 500
export const dropPairAfter = (now: number, last: number) => now - last > 3000
