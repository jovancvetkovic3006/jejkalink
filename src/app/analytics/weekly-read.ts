import { SgReading } from '../services/sgs-history.service';
import { PeriodMetrics } from './metrics';
import {
  detectTrendPatterns,
  formatTrendPattern,
  TrendPattern,
} from './trend-patterns';

export interface WeeklyReadCopy {
  /** One sentence per line for readability. */
  lines: string[];
  q: string;
  patterns: TrendPattern[];
}

/**
 * Descriptive weekly read from period metrics + time-of-day patterns.
 * Plain language — no LLM required.
 */
export function buildWeeklyRead(
  metrics: PeriodMetrics,
  days: number,
  enabled: boolean,
  readings: SgReading[] = [],
  periodStart?: Date,
  periodEnd?: Date,
  bandLow = 3.9,
  bandHigh = 10.0
): WeeklyReadCopy | null {
  if (!enabled || metrics.count === 0) return null;

  const cov = metrics.coverage.coveragePct;
  const covNote =
    cov < 70
      ? `The sensor was only working about ${cov}% of the time, so these percentages may not tell the full ${days}-day story.`
      : `The sensor was working ${cov}% of the time in this period.`;

  let patterns: TrendPattern[] = [];
  if (readings.length && periodStart && periodEnd) {
    patterns = detectTrendPatterns(
      readings,
      periodStart,
      periodEnd,
      bandLow,
      bandHigh
    );
  }

  const lines: string[] = [];

  if (patterns.length) {
    const high = patterns.filter((p) => p.kind === 'high').slice(0, 2);
    const low = patterns.filter((p) => p.kind === 'low').slice(0, 2);
    const parts = [...high, ...low].map(formatTrendPattern);
    lines.push(`Glucose often repeated the same pattern at certain times: ${parts.join('; ')}.`);
  } else if (metrics.veryLowPct >= 5) {
    lines.push(
      `Very low readings (under 3.0) happened ${metrics.veryLowPct}% of the time — spread across the day rather than one time slot.`
    );
  } else if (metrics.belowPct >= 15) {
    lines.push(
      `Readings below your target happened ${metrics.belowPct}% of the time — spread across the day.`
    );
  } else if (metrics.abovePct >= 25) {
    lines.push(
      `Readings above your target happened ${metrics.abovePct}% of the time — spread across the day.`
    );
  } else if (metrics.tirPct >= 70) {
    lines.push(
      `${metrics.tirPct}% of readings were in your target range (average ${metrics.meanLabel} mmol/L) with no strong repeating high or low windows.`
    );
  } else {
    lines.push(
      `Average glucose was ${metrics.meanLabel} mmol/L with ${metrics.tirPct}% in your target range.`
    );
  }

  if (metrics.overnightTirPct != null) {
    lines.push(
      `Overnight (22:00–07:00), ${metrics.overnightTirPct}% of readings were in range.`
    );
  } else {
    lines.push('Not enough overnight data to summarise.');
  }

  if (metrics.tightTirPct > 0) {
    lines.push(
      `In the tighter 3.9–7.8 band, ${metrics.tightTirPct}% of readings were in range.`
    );
  }

  lines.push(
    metrics.cv >= 36
      ? `Glucose swung up and down more than usual (variability ${metrics.cvLabel}% — aim is under 36%).`
      : `Glucose stayed fairly steady (variability ${metrics.cvLabel}%, under the 36% aim).`
  );
  lines.push(covNote);

  const q =
    patterns.some((p) => p.kind === 'low')
      ? 'Worth asking your care team: do the recurring low times match meals, activity, or sleep on your pump reports?'
      : patterns.some((p) => p.kind === 'high')
        ? 'Worth asking your care team: do the recurring high times match meals or timing on your pump reports?'
        : 'Worth asking your care team: does this match what you see on your pump or CGM reports for the same dates?';

  return { lines, q, patterns };
}
