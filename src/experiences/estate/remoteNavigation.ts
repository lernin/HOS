// Resolve a remote request against the canonical destination list.
// Never accept coordinates or arbitrary route names from an untrusted phone.
export function findRemoteDestination<T extends { name: string }>(
  destinations: readonly T[],
  requested: unknown,
): T | null {
  if (typeof requested !== 'string') return null
  return destinations.find(destination => destination.name === requested) ?? null
}
