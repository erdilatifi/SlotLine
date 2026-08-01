/**
 * A half-open interval [start, end) on the epoch-millisecond timeline —
 * start included, end excluded, everywhere in this module. See
 * docs/HANDBOOK_SUMMARY.md §6: this is what makes adjacency and overlap the
 * same comparison, and what makes a booking ending at 10:00 and one
 * starting at 10:00 not overlap.
 */
export interface Interval {
  start: number;
  end: number;
}

export function isEmpty(interval: Interval): boolean {
  return interval.start >= interval.end;
}

/**
 * Sorts by start and merges overlapping or touching intervals into the
 * fewest disjoint intervals, in ascending order.
 */
export function merge(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((interval) => !isEmpty(interval))
    .sort((a, b) => a.start - b.start);

  const result: Interval[] = [];
  for (const current of sorted) {
    const last = result.at(-1);
    if (last && current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      result.push({ ...current });
    }
  }
  return result;
}

export function intersect(a: Interval, b: Interval): Interval | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return start < end ? { start, end } : null;
}

/**
 * Subtracts `remove` from `from`. The five relations this must handle:
 * disjoint (returns `from` unchanged), overlapping the left edge (returns
 * the trailing remainder), fully contained (splits `from` into two),
 * overlapping the right edge (returns the leading remainder), and fully
 * covering `from` (returns nothing).
 */
export function subtract(from: Interval, remove: Interval): Interval[] {
  if (isEmpty(from)) return [];

  const overlap = intersect(from, remove);
  if (!overlap) return [from];

  const result: Interval[] = [];
  if (from.start < overlap.start) result.push({ start: from.start, end: overlap.start });
  if (overlap.end < from.end) result.push({ start: overlap.end, end: from.end });
  return result;
}

/** Subtracts every interval in `removals` from every interval in `from`. */
export function subtractAll(from: Interval[], removals: Interval[]): Interval[] {
  const mergedRemovals = merge(removals);
  let remaining = from.filter((interval) => !isEmpty(interval));
  for (const removal of mergedRemovals) {
    remaining = remaining.flatMap((interval) => subtract(interval, removal));
  }
  return remaining;
}

/** Does a duration starting at `start` fit entirely inside `container`? */
export function fits(container: Interval, start: number, durationMs: number): boolean {
  return start >= container.start && start + durationMs <= container.end;
}
