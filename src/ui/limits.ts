/** Pictures a phone can usually hold at once; a 12 MP photo keeps about 60 MB in memory while it is open. */
export const PHONE_BATCH_LIMIT = 8;

/** A short warning when so many pictures are open that a phone may run out of memory; empty otherwise. */
export function batchWarning(count: number, isPhone: boolean): string {
  if (!isPhone || count <= PHONE_BATCH_LIMIT) return '';
  return `${count} large pictures can use up a phone's memory. If the page reloads, work in smaller groups of ${PHONE_BATCH_LIMIT} or fewer.`;
}
