import { CoverageResult, CoverageSegment } from './coverage';

export interface PollEvent {
  ts: number;
  ok: boolean;
}

/** Build collector uptime coverage from poll success/failure log (not glucose gaps). */
export function collectorPollCoverage(
  events: PollEvent[],
  periodStart: Date,
  periodEnd: Date,
  intervalMin = 5
): CoverageResult {
  const startMs = periodStart.getTime();
  const endMs = periodEnd.getTime();
  const periodMs = Math.max(1, endMs - startMs);
  const graceMs = intervalMin * 3 * 60 * 1000;

  const okTimes = events
    .filter((e) => e.ok && e.ts >= startMs && e.ts <= endMs)
    .map((e) => e.ts)
    .sort((a, b) => a - b);

  const segments: CoverageSegment[] = [];
  let coveredMs = 0;
  let gapMs = 0;
  let gapCount = 0;

  if (!okTimes.length) {
    segments.push({ from: periodStart, to: periodEnd, covered: false });
    return {
      segments,
      coveredMs: 0,
      gapMs: periodMs,
      gapCount: 1,
      coveragePct: 0,
      period: [periodStart, periodEnd],
    };
  }

  let cursor = startMs;
  let clusterStart = okTimes[0];
  let clusterEnd = okTimes[0];

  for (let i = 1; i < okTimes.length; i++) {
    if (okTimes[i] - clusterEnd <= graceMs) {
      clusterEnd = okTimes[i];
    } else {
      if (clusterStart > cursor) {
        segments.push({ from: new Date(cursor), to: new Date(clusterStart), covered: false });
        gapMs += clusterStart - cursor;
        gapCount++;
      }
      segments.push({
        from: new Date(clusterStart),
        to: new Date(Math.min(clusterEnd + graceMs, endMs)),
        covered: true,
      });
      coveredMs += Math.min(clusterEnd + graceMs, endMs) - clusterStart;
      cursor = Math.min(clusterEnd + graceMs, endMs);
      clusterStart = okTimes[i];
      clusterEnd = okTimes[i];
    }
  }

  if (clusterStart > cursor) {
    segments.push({ from: new Date(cursor), to: new Date(clusterStart), covered: false });
    gapMs += clusterStart - cursor;
    gapCount++;
  }
  const clusterTo = Math.min(clusterEnd + graceMs, endMs);
  segments.push({ from: new Date(clusterStart), to: new Date(clusterTo), covered: true });
  coveredMs += clusterTo - clusterStart;
  cursor = clusterTo;

  if (endMs > cursor) {
    segments.push({ from: new Date(cursor), to: periodEnd, covered: false });
    gapMs += endMs - cursor;
    gapCount++;
  }

  coveredMs = Math.min(coveredMs, periodMs);
  gapMs = Math.max(0, periodMs - coveredMs);

  return {
    segments,
    coveredMs,
    gapMs,
    gapCount,
    coveragePct: Math.round((coveredMs / periodMs) * 1000) / 10,
    period: [periodStart, periodEnd],
  };
}
