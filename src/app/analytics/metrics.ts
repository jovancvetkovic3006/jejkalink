import { SgReading } from '../services/sgs-history.service';
import {
  cvPercent,
  formatMmol,
  gmiFromMean,
  HIGH,
  LOW,
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
  overnightTirPct: number | null;
  coverage: CoverageResult;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

/**
 * Pure metrics over readings in [periodStart, periodEnd].
 * Percentages are over reading count in period (covered samples).
 */
export function periodMetrics(
  readings: SgReading[],
  periodStart: Date,
  periodEnd: Date
): PeriodMetrics {
  const startMs = periodStart.getTime();
  const endMs = periodEnd.getTime();
  const inPeriod = readings.filter((r) => {
    const t = new Date(r.timestamp).getTime();
    return t >= startMs && t <= endMs && r.mmol > 0;
  });

  const coverage = detectGaps(readings, periodStart, periodEnd);
  const values = inPeriod.map((r) => r.mmol);
  const n = values.length;

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
    overnightTirPct: null,
    coverage,
  };

  if (n === 0) return empty;

  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = stdev(values);
  const cv = cvPercent(sd, mean);
  const gmi = gmiFromMean(mean);

  const pct = (count: number) => Math.round((count / n) * 1000) / 10;

  const tir = values.filter((v) => v >= LOW && v <= HIGH).length;
  const below = values.filter((v) => v < LOW).length;
  const above = values.filter((v) => v > HIGH).length;
  const veryLow = values.filter((v) => v < VERY_LOW).length;
  const veryHigh = values.filter((v) => v > VERY_HIGH).length;

  const overnight = inPeriod.filter((r) => {
    const h = new Date(r.timestamp).getHours();
    return h >= 22 || h < 7;
  });
  let overnightTirPct: number | null = null;
  if (overnight.length > 0) {
    const ok = overnight.filter((r) => r.mmol >= LOW && r.mmol <= HIGH).length;
    overnightTirPct = Math.round((ok / overnight.length) * 1000) / 10;
  }

  return {
    count: n,
    mean,
    meanLabel: formatMmol(mean),
    gmi,
    gmiLabel: formatMmol(gmi),
    cv,
    cvLabel: formatMmol(cv),
    tirPct: pct(tir),
    belowPct: pct(below),
    abovePct: pct(above),
    veryLowPct: pct(veryLow),
    veryHighPct: pct(veryHigh),
    overnightTirPct,
    coverage,
  };
}
