import { PeriodMetrics } from './metrics';

export interface WeeklyReadCopy {
  p1: string;
  p2: string;
  q: string;
}

/**
 * Descriptive weekly read from period metrics only — no dosing advice.
 * Returns null when disabled or there is no covered data.
 */
export function buildWeeklyRead(
  metrics: PeriodMetrics,
  days: number,
  enabled: boolean
): WeeklyReadCopy | null {
  if (!enabled || metrics.count === 0) return null;

  const cov = metrics.coverage.coveragePct;
  const covNote =
    cov < 70
      ? `Coverage was ${cov}% — percentages may not represent a full ${days}-day picture.`
      : `Coverage ${cov}% over the period.`;

  let pattern = '';
  if (metrics.veryLowPct >= 5) {
    pattern = `Very low time (< 3.0) was ${metrics.veryLowPct}% of covered time.`;
  } else if (metrics.belowPct >= 15) {
    pattern = `Below-range time was ${metrics.belowPct}% of covered time.`;
  } else if (metrics.abovePct >= 25) {
    pattern = `Above-range time was ${metrics.abovePct}% of covered time.`;
  } else if (metrics.tirPct >= 70) {
    pattern = `Time in range was ${metrics.tirPct}% (mean ${metrics.meanLabel} mmol/L).`;
  } else {
    pattern = `Mean ${metrics.meanLabel} mmol/L with ${metrics.tirPct}% time in range.`;
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

  return {
    p1: `${pattern} ${overnight}${tight ? ' ' + tight : ''}`,
    p2: `${cvNote} ${covNote}`,
    q: 'Worth asking the clinic: does this pattern match what you see on pump/CGM reports for the same period?',
  };
}
