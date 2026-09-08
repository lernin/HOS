export type RatingValue = 0 | 1 | 2 | 3 | null | undefined
export type TrashAction = 'trash' | 'untrash'
export type LeaveDecision = 'trash' | 'untrash' | 'keep'

export function hasZeroRating(piece: RatingValue, sound: RatingValue, performance: RatingValue) {
  return piece === 0 || sound === 0 || performance === 0
}

export function trashToggleVisible(piece: RatingValue, sound: RatingValue, performance: RatingValue) {
  return hasZeroRating(piece, sound, performance)
}

export function persistTrashToggle(nextOn: boolean, hasZero: boolean): TrashAction | null {
  if (!hasZero) return null
  return nextOn ? 'trash' : 'untrash'
}

export function isDurablyDumped(status?: string | null, pendingAction?: TrashAction) {
  if (pendingAction === 'untrash') return false
  if (pendingAction === 'trash') return true
  return status === 'rejected'
}

export function leaveDecision(hasZero: boolean, isTrashed: boolean, durablyDumped = false): LeaveDecision {
  if (hasZero) return 'trash'
  if (isTrashed || durablyDumped) return 'untrash'
  return 'keep'
}

export function ratingChangeDecision(hasZero: boolean, isTrashed: boolean, durablyDumped = false): 'untrash' | 'keep' {
  if (!hasZero && (isTrashed || durablyDumped)) return 'untrash'
  return 'keep'
}

export function nextIndexAfterRemoving(currentIndex: number, length: number, delta: number) {
  const remaining = length - 1
  if (remaining <= 0) return 0
  if (delta >= 0) return currentIndex >= remaining ? 0 : currentIndex
  return (currentIndex - 1 + remaining) % remaining
}

export function filterCatalogForBrowse<T extends { id: string }>(
  items: T[],
  trashedIds: Record<string, boolean>,
  dumpster: boolean,
) {
  return items.filter(item => Boolean(trashedIds[item.id]) === dumpster)
}

export function hydrateTrashedIds<T extends { id: string; status?: string | null }>(
  items: T[],
  pending: Record<string, { action?: TrashAction }>,
) {
  const next: Record<string, boolean> = {}
  for (const item of items) {
    const queued = pending[item.id]
    if (queued?.action === 'untrash') continue
    if (queued?.action === 'trash' || queued && !queued.action) {
      next[item.id] = true
      continue
    }
    if (item.status === 'rejected') next[item.id] = true
  }
  return next
}
