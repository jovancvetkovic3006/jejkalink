import { PeriodMetrics } from './metrics';

/** Flag days that diverge sharply from the surrounding period. */
export function isUnusualDay(
  day: PeriodMetrics,
  period: PeriodMetrics
): boolean {
  if (day.count < 12 || period.count < 24) return false;
  const tirDelta = Math.abs(day.tirPct - period.tirPct);
  const meanDelta = Math.abs(day.mean - period.mean);
  return tirDelta >= 25 || meanDelta >= 2.0;
}
