import { SgReading } from '../services/sgs-history.service';

/** mmol/L per minute from last two readings. */
export function slopePerMin(readings: SgReading[]): number | null {
  if (readings.length < 2) return null;
  const last = readings[readings.length - 1];
  const prev = readings[readings.length - 2];
  const dtMin =
    (new Date(last.timestamp).getTime() - new Date(prev.timestamp).getTime()) /
    60000;
  if (dtMin <= 0) return null;
  return (last.mmol - prev.mmol) / dtMin;
}

/** mmol/L per minute over the last lookbackMin minutes ending at the newest reading. */
export function slopePerMinWindow(
  readings: SgReading[],
  lookbackMin = 15
): number | null {
  if (readings.length < 2) return null;
  const last = readings[readings.length - 1];
  const lastMs = new Date(last.timestamp).getTime();
  if (!Number.isFinite(lastMs)) return null;
  const windowStart = lastMs - lookbackMin * 60000;
  const inWindow = readings.filter((r) => {
    const t = new Date(r.timestamp).getTime();
    return Number.isFinite(t) && t >= windowStart;
  });
  if (inWindow.length < 2) return slopePerMin(readings);
  const first = inWindow[0];
  const end = inWindow[inWindow.length - 1];
  const dtMin =
    (new Date(end.timestamp).getTime() - new Date(first.timestamp).getTime()) /
    60000;
  if (dtMin <= 0) return null;
  return (end.mmol - first.mmol) / dtMin;
}

/** Map slope to UI trend: -1 down, 0 flat, 1 up. |slope| < 0.05 → flat. */
export function trendFromSlope(slope: number | null): number {
  if (slope == null || !Number.isFinite(slope)) return 0;
  if (Math.abs(slope) < 0.05) return 0;
  return slope > 0 ? 1 : -1;
}

/**
 * CareLink lastSGTrend → UI trend, or null when NONE/empty so caller can
 * fall back to slope.
 */
export function mapCareLinkTrend(raw: string | null | undefined): number | null {
  if (!raw || raw === 'NONE') return null;
  if (
    raw === 'DOWN' ||
    raw === 'DOWN_DOUBLE' ||
    raw === 'DOWN_TRIPLE'
  ) {
    return -1;
  }
  if (raw === 'UP' || raw === 'UP_DOUBLE' || raw === 'UP_TRIPLE') {
    return 1;
  }
  return 0;
}

/** Project value forward by lag minutes using slope. */
export function projectMmol(
  mmol: number,
  slopePerMinute: number | null,
  lagMin = 15
): number | null {
  if (slopePerMinute == null || !Number.isFinite(mmol)) return null;
  return mmol + slopePerMinute * lagMin;
}
