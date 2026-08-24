import { SgReading } from '../services/sgs-history.service';
import { slotMinForReading } from './agp';
import { MetricTargets, PeriodMetrics, periodMetrics } from './metrics';

export interface DaySplitMetrics {
  weekday: PeriodMetrics;
  weekend: PeriodMetrics;
  weekdayLabel: string;
  weekendLabel: string;
}

function localWeekday(r: SgReading): number {
  const ts = new Date(r.timestamp).getTime();
  const offsetMin =
    r.utcOffsetMin ?? -new Date(r.timestamp).getTimezoneOffset();
  const d = new Date(ts + offsetMin * 60 * 1000);
  return d.getUTCDay();
}

function isWeekend(r: SgReading): boolean {
  const d = localWeekday(r);
  return d === 0 || d === 6;
}

/** Split period readings into weekday (Mon–Fri) vs weekend (Sat–Sun) metrics. */
export function splitByDayType(
  readings: SgReading[],
  periodStart: Date,
  periodEnd: Date,
  targets?: MetricTargets
): DaySplitMetrics {
  const startMs = periodStart.getTime();
  const endMs = periodEnd.getTime();
  const weekday: SgReading[] = [];
  const weekend: SgReading[] = [];

  for (const r of readings) {
    const t = new Date(r.timestamp).getTime();
    if (t < startMs || t > endMs || r.mmol <= 0) continue;
    (isWeekend(r) ? weekend : weekday).push(r);
  }

  return {
    weekday: periodMetrics(weekday, periodStart, periodEnd, targets),
    weekend: periodMetrics(weekend, periodStart, periodEnd, targets),
    weekdayLabel: 'Mon–Fri',
    weekendLabel: 'Sat–Sun',
  };
}

export interface HourlyTir {
  slotMin: number;
  tirPct: number;
  count: number;
}

/** Per 30-min slot TIR for heatmap-style use (optional). */
export function hourlyTirBySlot(
  readings: SgReading[],
  periodStart: Date,
  periodEnd: Date,
  bandLow: number,
  bandHigh: number
): HourlyTir[] {
  const startMs = periodStart.getTime();
  const endMs = periodEnd.getTime();
  const bySlot = new Map<number, { inRange: number; total: number }>();

  for (const r of readings) {
    const t = new Date(r.timestamp).getTime();
    if (t < startMs || t > endMs || r.mmol <= 0) continue;
    const slot = slotMinForReading(r);
    const stat = bySlot.get(slot) || { inRange: 0, total: 0 };
    stat.total++;
    if (r.mmol >= bandLow && r.mmol <= bandHigh) stat.inRange++;
    bySlot.set(slot, stat);
  }

  const out: HourlyTir[] = [];
  for (const [slotMin, stat] of bySlot) {
    if (stat.total < 2) continue;
    out.push({
      slotMin,
      tirPct: Math.round((stat.inRange / stat.total) * 1000) / 10,
      count: stat.total,
    });
  }
  return out.sort((a, b) => a.slotMin - b.slotMin);
}
