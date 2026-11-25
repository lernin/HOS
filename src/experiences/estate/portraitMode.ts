// Keep portrait exploration off by default until a person explicitly opts in.
// Old saved preferences without the field continue to use landscape mode.
export function readPortraitPreference(raw: unknown): boolean {
  return raw === true
}
export function nextPortraitPreference(enabled: boolean): boolean {
  return !enabled
}
