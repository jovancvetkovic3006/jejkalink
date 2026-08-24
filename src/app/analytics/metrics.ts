import { SgReading } from '../services/sgs-history.service';
import {
  cvPercent,
  formatMmol,
  gmiFromMean,
  HIGH,
  LOW,
  TIGHT_HIGH,
  VERY_HIGH,
  VERY_LOW,
} from '../domain/glucose';
import { CoverageResult, detectGaps } from './coverage';

export interface PeriodMetrics {
  count: number;
  mean: number;
  meanLabel: string;
  gmi: number;
  gmiLabel: string;
  cv: number;
  cvLabel: string;
  tirPct: number;
  belowPct: number;
  abovePct: number;
  veryLowPct: number;
  veryHighPct: number;
  /** Tight range 3.9–7.8 mmol/L over covered time. */
  tightTirPct: number;
  overnightTirPct: number | null;
  coverage: CoverageResult;
}

export interface MetricTargets {
  low?: number;
  high?: number;
}

const DEFAULT_GAP_MS = 10 * 60 * 1000;
const READING_SPAN_MS = 5 * 60 * 1000;

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

function segmentMs(
  readings: SgReading[],
  index: number,
  gapMs: number
): number {
  const t0 = new Date(readings[index].timestamp).getTime();
  if (index < readings.length - 1) {
    const t1 = new Date(readings[index + 1].timestamp).getTime();
    const dt = t1 - t0;
    if (dt <= 0) return READING_SPAN_MS;
    return Math.min(dt, gapMs);
  }
  return READING_SPAN_MS;
}

/** Time-weighted bucket ms over covered intervals (gaps capped). */
function timeWeightedMs(
  readings: SgReading[],
  gapMs: number,
  classify: (mmol: number) => boolean
): { coveredMs: number; bucketMs: number } {
  let coveredMs = 0;
  let bucketMs = 0;
  for (let i = 0; i < readings.length; i++) {
    const dt = segmentMs(readings, i, gapMs);
    coveredMs += dt;
    if (classify(readings[i].mmol)) bucketMs += dt;
  }
  return { coveredMs, bucketMs };
}

function pctOfCovered(bucketMs: number, coveredMs: number): number {
  if (coveredMs <= 0) return 0;
  return Math.round((bucketMs / coveredMs) * 1000) / 10;
}

/**
 * Pure metrics over readings in [periodStart, periodEnd].
 * Range percentages are over covered time (piecewise-constant between readings).
 */
export function periodMetrics(
  readings: SgReading[],
  periodStart: Date,
  periodEnd: Date,
  targets?: MetricTargets
): PeriodMetrics {
  const bandLow = targets?.low ?? LOW;
  const bandHigh = targets?.high ?? HIGH;
  const startMs = periodStart.getTime();
  const endMs = periodEnd.getTime();
  const inPeriod = readings
    .filter((r) => {
      const t = new Date(r.timestamp).getTime();
      return t >= startMs && t <= endMs && r.mmol > 0;
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const coverage = detectGaps(readings, periodStart, periodEnd);
  const values = inPeriod.map((r) => r.mmol);
  const n = values.length;
  const gapMs = DEFAULT_GAP_MS;

  const empty: PeriodMetrics = {
    count: 0,
    mean: 0,
    meanLabel: '--',
    gmi: 0,
    gmiLabel: '--',
    cv: 0,
    cvLabel: '--',
    tirPct: 0,
    belowPct: 0,
    abovePct: 0,
    veryLowPct: 0,
    veryHighPct: 0,
    tightTirPct: 0,
    overnightTirPct: null,
    coverage,
  };

  if (n === 0) return empty;

  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = stdev(values);
  const cv = cvPercent(sd, mean);
  const gmi = gmiFromMean(mean);

  const tir = timeWeightedMs(inPeriod, gapMs, (v) => v >= bandLow && v <= bandHigh);
  const below = timeWeightedMs(inPeriod, gapMs, (v) => v < bandLow);
  const above = timeWeightedMs(inPeriod, gapMs, (v) => v > bandHigh);
  const veryLow = timeWeightedMs(inPeriod, gapMs, (v) => v < VERY_LOW);
  const veryHigh = timeWeightedMs(inPeriod, gapMs, (v) => v > VERY_HIGH);
  const tight = timeWeightedMs(inPeriod, gapMs, (v) => v >= LOW && v <= TIGHT_HIGH);
  const coveredMs = tir.coveredMs;

  const overnight = inPeriod.filter((r) => {
    const h = new Date(r.timestamp).getHours();
    return h >= 22 || h < 7;
  });
  let overnightTirPct: number | null = null;
  if (overnight.length > 0) {
    const on = timeWeightedMs(overnight, gapMs, (v) => v >= bandLow && v <= bandHigh);
    overnightTirPct = pctOfCovered(on.bucketMs, on.coveredMs);
  }

  return {
    count: n,
    mean,
    meanLabel: formatMmol(mean),
    gmi,
    gmiLabel: formatMmol(gmi),
    cv,
    cvLabel: formatMmol(cv),
    tirPct: pctOfCovered(tir.bucketMs, coveredMs),
    belowPct: pctOfCovered(below.bucketMs, coveredMs),
    abovePct: pctOfCovered(above.bucketMs, coveredMs),
    veryLowPct: pctOfCovered(veryLow.bucketMs, coveredMs),
    veryHighPct: pctOfCovered(veryHigh.bucketMs, coveredMs),
    tightTirPct: pctOfCovered(tight.bucketMs, coveredMs),
    overnightTirPct,
    coverage,
  };
}
