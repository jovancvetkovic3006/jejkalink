import { SgReading } from '../services/sgs-history.service';

export interface AgpBucket {
  /** Minutes from local midnight (0–1439). */
  slotMin: number;
  median: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  count: number;
}

const SLOT_MIN = 30;

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Local wall-clock hour at capture using stored utcOffsetMin (DST-safe). */
export function captureLocalHour(r: SgReading): number {
  const ts = new Date(r.timestamp).getTime();
  const offsetMin =
    r.utcOffsetMin ?? -new Date(r.timestamp).getTimezoneOffset();
  return new Date(ts + offsetMin * 60 * 1000).getUTCHours();
}

/** Local wall-clock minutes at capture using stored utcOffsetMin (DST-safe). */
export function slotMinForReading(r: SgReading): number {
  const ts = new Date(r.timestamp).getTime();
  const offsetMin =
    r.utcOffsetMin ?? -new Date(r.timestamp).getTimezoneOffset();
  const localMs = ts + offsetMin * 60 * 1000;
  const d = new Date(localMs);
  const totalMin = d.getUTCHours() * 60 + d.getUTCMinutes();
  return Math.floor(totalMin / SLOT_MIN) * SLOT_MIN;
}

function captureLocalSlotMin(r: SgReading): number {
  return slotMinForReading(r);
}

/** AGP buckets by capture-time local clock for readings in period. */
export function agpBuckets(
  readings: SgReading[],
  periodStart: Date,
  periodEnd: Date
): AgpBucket[] {
  const startMs = periodStart.getTime();
  const endMs = periodEnd.getTime();
  const bySlot = new Map<number, number[]>();

  for (const r of readings) {
    const t = new Date(r.timestamp).getTime();
    if (t < startMs || t > endMs || r.mmol <= 0) continue;
    const slotMin = captureLocalSlotMin(r);
    const list = bySlot.get(slotMin) || [];
    list.push(r.mmol);
    bySlot.set(slotMin, list);
  }

  const buckets: AgpBucket[] = [];
  for (let slot = 0; slot < 1440; slot += SLOT_MIN) {
    const vals = bySlot.get(slot);
    if (!vals || vals.length < 2) continue;
    const sorted = [...vals].sort((a, b) => a - b);
    buckets.push({
      slotMin: slot,
      median: percentile(sorted, 0.5),
      p10: percentile(sorted, 0.1),
      p25: percentile(sorted, 0.25),
      p75: percentile(sorted, 0.75),
      p90: percentile(sorted, 0.9),
      count: sorted.length,
    });
  }
  return buckets.sort((a, b) => a.slotMin - b.slotMin);
}
