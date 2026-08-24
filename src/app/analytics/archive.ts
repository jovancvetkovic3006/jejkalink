import { SgReading } from '../services/sgs-history.service';
import { periodMetrics, MetricTargets } from './metrics';
import { detectHypoEpisodes } from './episodes';
import { detectTrendPatterns, formatTrendPattern } from './trend-patterns';

export interface MonthlyArchive {
  month: string;
  periodStart: string;
  periodEnd: string;
  readingCount: number;
  coveragePct: number;
  tirPct: number;
  gmiLabel: string;
  cvLabel: string;
  meanLabel: string;
  veryLowPct: number;
  hypoEpisodes: number;
  hypoMinutes: number;
  patternLines: string[];
  archivedAt: string;
}

/** Local calendar month key YYYY-MM (DST-safe when utcOffsetMin present). */
export function monthKeyForReading(r: SgReading): string {
  const ts = new Date(r.timestamp).getTime();
  const offsetMin =
    r.utcOffsetMin ?? -new Date(r.timestamp).getTimezoneOffset();
  const d = new Date(ts + offsetMin * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function monthBounds(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}

/** Pure monthly rollup for readings fully rolling off hot storage. */
export function buildMonthlySummary(
  readings: SgReading[],
  month: string,
  targets?: MetricTargets
): MonthlyArchive | null {
  if (!readings.length) return null;
  const { start, end } = monthBounds(month);
  const m = periodMetrics(readings, start, end, targets);
  if (m.count === 0) return null;

  const hypos = detectHypoEpisodes(readings, start, end, targets?.low ?? 3.9);
  const hypoMinutes = hypos.reduce((a, e) => a + e.durationMin, 0);
  const patterns = detectTrendPatterns(
    readings,
    start,
    end,
    targets?.low ?? 3.9,
    targets?.high ?? 10.0
  );

  return {
    month,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    readingCount: m.count,
    coveragePct: m.coverage.coveragePct,
    tirPct: m.tirPct,
    gmiLabel: m.gmiLabel,
    cvLabel: m.cvLabel,
    meanLabel: m.meanLabel,
    veryLowPct: m.veryLowPct,
    hypoEpisodes: hypos.length,
    hypoMinutes,
    patternLines: patterns.map(formatTrendPattern),
    archivedAt: new Date().toISOString(),
  };
}
