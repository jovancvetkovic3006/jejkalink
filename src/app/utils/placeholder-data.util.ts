import { SgReading } from '../services/sgs-history.service';
import { AgpBucket } from '../analytics/agp';

/** Deterministic wobble for placeholder charts. */
function wobble(i: number, seed = 1): number {
  return (
    Math.sin(i * 0.7 + seed) * 0.5 +
    Math.sin(i * 0.23 + seed * 2) * 0.35 +
    Math.sin(i * 1.9 + seed * 3) * 0.18
  );
}

export function placeholderSparklineReadings(
  startMs: number,
  endMs: number,
  stepMin = 5
): SgReading[] {
  const out: SgReading[] = [];
  const step = stepMin * 60 * 1000;
  let i = 0;
  for (let t = startMs; t <= endMs; t += step) {
    const mmol = 6.1 + wobble(i, 1.2) * 1.8 + Math.sin(i / 8) * 0.4;
    out.push({
      mmol: Math.round(mmol * 10) / 10,
      timestamp: new Date(t).toISOString(),
    });
    i++;
  }
  return out;
}

export function placeholderDayReadings(startMs: number, endMs: number): SgReading[] {
  const out: SgReading[] = [];
  const step = 5 * 60 * 1000;
  let i = 0;
  for (let t = startMs; t <= endMs; t += step) {
    const hour = new Date(t).getHours();
    let mmol =
      6.1 +
      1.5 * Math.exp(-((hour - 8.6) ** 2) / 1.1) * 3.2 +
      1.2 * Math.exp(-((hour - 13.2) ** 2) / 1.3) * 2.4 +
      wobble(i, 0.8) * 0.6;
    if (hour >= 22 || hour < 6) mmol -= 0.4;
    out.push({
      mmol: Math.max(3.5, Math.round(mmol * 10) / 10),
      timestamp: new Date(t).toISOString(),
    });
    i++;
  }
  return out;
}

export function placeholderAgpBuckets(): AgpBucket[] {
  const buckets: AgpBucket[] = [];
  for (let slot = 0; slot < 1440; slot += 30) {
    const hour = slot / 60;
    let median =
      6.2 +
      1.4 * Math.exp(-((hour - 8.5) ** 2) / 2) +
      1.0 * Math.exp(-((hour - 13) ** 2) / 2.5) +
      wobble(slot / 30, 2) * 0.3;
    if (hour >= 22 || hour < 6) median -= 0.5;
    median = Math.max(3.8, Math.min(12, median));
    const spread = 0.8 + Math.abs(wobble(slot / 30, 3)) * 0.5;
    buckets.push({
      slotMin: slot,
      median,
      p10: median - spread * 1.2,
      p25: median - spread * 0.6,
      p75: median + spread * 0.7,
      p90: median + spread * 1.1,
      count: 12,
    });
  }
  return buckets;
}
