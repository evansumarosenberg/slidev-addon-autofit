/** Returns whether each prospective managed CSS pixel value is finite. */
export function areFiniteAutoImageValues(values: readonly number[]): boolean {
  return values.every(Number.isFinite)
}
