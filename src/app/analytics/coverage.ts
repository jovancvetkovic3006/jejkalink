import { SgReading } from '../services/sgs-history.service';

export interface CoverageSegment {
  from: Date;
  to: Date;
  covered: boolean;
}

export interface CoverageResult {
  segments: CoverageSegment[];
  coveredMs: number;
  gapMs: number;
  gapCount: number;
  coveragePct: number;
  period: [Date, Date];
}

const DEFAULT_GAP_MS = 10 * 60 * 1000;

/**
 * Pure: build covered/gap segments for a period from readings.
 * Gaps longer than thresholdMin minutes are uncovered.
 */
export function detectGaps(
  readings: SgReading[],
  periodStart: Date,
  periodEnd: Date,
  thresholdMin = 10
): CoverageResult {
  const gapThresholdMs = thresholdMin * 60 * 1000 || DEFAULT_GAP_MS;
  const startMs = periodStart.getTime();
  const endMs = periodEnd.getTime();
  const periodMs = Math.max(1, endMs - startMs);

  const inPeriod = readings
    .map((r) => ({ r, t: new Date(r.timestamp).getTime() }))
    .filter((x) => x.t >= startMs && x.t <= endMs)
    .sort((a, b) => a.t - b.t);

  const segments: CoverageSegment[] = [];
  let coveredMs = 0;
  let gapMs = 0;
  let gapCount = 0;

  if (inPeriod.length === 0) {
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

  // Leading gap
  if (inPeriod[0].t - startMs > gapThresholdMs) {
    segments.push({
      from: periodStart,
      to: new Date(inPeriod[0].t),
      covered: false,
    });
    gapMs += inPeriod[0].t - startMs;
    gapCount++;
  } else if (inPeriod[0].t > startMs) {
    segments.push({
      from: periodStart,
      to: new Date(inPeriod[0].t),
      covered: true,
    });
    coveredMs += inPeriod[0].t - startMs;
  }

  for (let i = 0; i < inPeriod.length - 1; i++) {
    const a = inPeriod[i].t;
    const b = inPeriod[i + 1].t;
    const delta = b - a;
    if (delta > gapThresholdMs) {
      // covered up to a small half-interval then gap
      segments.push({ from: new Date(a), to: new Date(a), covered: true });
      segments.push({ from: new Date(a), to: new Date(b), covered: false });
      gapMs += delta;
      gapCount++;
    } else {
      segments.push({ from: new Date(a), to: new Date(b), covered: true });
      coveredMs += delta;
    }
  }

  const last = inPeriod[inPeriod.length - 1].t;
  if (endMs - last > gapThresholdMs) {
    segments.push({ from: new Date(last), to: periodEnd, covered: false });
    gapMs += endMs - last;
    gapCount++;
  } else if (endMs > last) {
    segments.push({ from: new Date(last), to: periodEnd, covered: true });
    coveredMs += endMs - last;
  }

  // Merge adjacent same-type segments for strip rendering
  const merged = mergeSegments(segments);
  const coveragePct = Math.round((coveredMs / periodMs) * 1000) / 10;

  return {
    segments: merged,
    coveredMs,
    gapMs,
    gapCount,
    coveragePct,
    period: [periodStart, periodEnd],
  };
}

function mergeSegments(segments: CoverageSegment[]): CoverageSegment[] {
  if (!segments.length) return [];
  const out: CoverageSegment[] = [{ ...segments[0] }];
  for (let i = 1; i < segments.length; i++) {
    const prev = out[out.length - 1];
    const cur = segments[i];
    if (prev.covered === cur.covered) {
      prev.to = cur.to;
    } else {
      out.push({ ...cur });
    }
  }
  return out.filter((s) => s.to.getTime() > s.from.getTime());
}

export function formatCoverageCaptionSr(cov: CoverageResult): string {
  const gapMin = Math.round(cov.gapMs / 60000);
  if (cov.gapCount > 0) {
    return `${cov.gapCount} praznina · ${gapMin} min · ${cov.coveragePct}%`;
  }
  return `${cov.coveragePct}%`;
}
