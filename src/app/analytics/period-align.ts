export type WeekStart = 'monday' | 'sunday';

/** Align period start to week boundary when viewing multi-week windows. */
export function alignTrendPeriod(
  days: number,
  weekStart: WeekStart,
  end: Date = new Date()
): { start: Date; end: Date } {
  const periodEnd = new Date(end);
  let start = new Date(periodEnd.getTime() - days * 24 * 60 * 60 * 1000);

  if (days === 7 || days === 14) {
    const targetDow = weekStart === 'monday' ? 1 : 0;
    const dow = start.getDay();
    let delta = (dow - targetDow + 7) % 7;
    if (delta !== 0) {
      start = new Date(start.getTime() - delta * 24 * 60 * 60 * 1000);
    }
    start.setHours(0, 0, 0, 0);
  }

  return { start, end: periodEnd };
}
