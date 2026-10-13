// Request sequencing: only the most recently started request may apply its result.
export function createLatest() {
  let n = 0;
  return { next: () => ++n, isCurrent: (id) => id === n };
}
