import { SgReading } from '../services/sgs-history.service';
import { PeriodMetrics } from './metrics';
import {
  detectTrendPatterns,
  formatTrendPattern,
  TrendPattern,
} from './trend-patterns';

export interface WeeklyReadCopy {
  p1: string;
  p2: string;
  q: string;
  /** Time-of-day patterns (when readings provided). */
  patterns: TrendPattern[];
}

/**
 * Descriptive weekly read from period metrics + time-of-day patterns.
 * Pure code — no LLM, no API key. Optional LLM could phrase this later.
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
      ? `Coverage was ${cov}% — percentages may not represent a full ${days}-day picture.`
      : `Coverage ${cov}% over the period.`;

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

  let patternLine = '';
  if (patterns.length) {
    const high = patterns.filter((p) => p.kind === 'high').slice(0, 2);
    const low = patterns.filter((p) => p.kind === 'low').slice(0, 2);
    const lines = [...high, ...low].map(formatTrendPattern);
    patternLine = `Recurring windows: ${lines.join('; ')}.`;
  } else if (metrics.veryLowPct >= 5) {
    patternLine = `Very low time (< 3.0) was ${metrics.veryLowPct}% of covered time — no single time-of-day cluster stood out.`;
  } else if (metrics.belowPct >= 15) {
    patternLine = `Below-range time was ${metrics.belowPct}% of covered time — spread across the day rather than one slot.`;
  } else if (metrics.abovePct >= 25) {
    patternLine = `Above-range time was ${metrics.abovePct}% of covered time — spread across the day rather than one slot.`;
  } else if (metrics.tirPct >= 70) {
    patternLine = `Time in range was ${metrics.tirPct}% (mean ${metrics.meanLabel} mmol/L) with no strong recurring high/low windows.`;
  } else {
    patternLine = `Mean ${metrics.meanLabel} mmol/L with ${metrics.tirPct}% time in range.`;
  }

  const tight =
    metrics.tightTirPct > 0
      ? `Tight range (3.9–7.8) was ${metrics.tightTirPct}% of covered time.`
      : '';

  const overnight =
    metrics.overnightTirPct != null
      ? `Overnight TIR (22:00–07:00) was ${metrics.overnightTirPct}%.`
      : 'Overnight window had limited data.';

  const cvNote =
    metrics.cv >= 36
      ? `Variability (CV ${metrics.cvLabel}%) was above the usual 36% target.`
      : `Variability (CV ${metrics.cvLabel}%) stayed under 36%.`;

  const q =
    patterns.some((p) => p.kind === 'low')
      ? 'Worth asking the clinic: do the recurring low windows match meals, activity, or overnight basal patterns on your reports?'
      : patterns.some((p) => p.kind === 'high')
        ? 'Worth asking the clinic: do the recurring high windows match meals or post-meal timing on your reports?'
        : 'Worth asking the clinic: does this pattern match what you see on pump/CGM reports for the same period?';

  return {
    p1: `${patternLine} ${overnight}${tight ? ' ' + tight : ''}`,
    p2: `${cvNote} ${covNote}`,
    q,
    patterns,
  };
}
