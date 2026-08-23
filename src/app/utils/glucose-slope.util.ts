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

/** Project value forward by lag minutes using slope. */
export function projectMmol(
  mmol: number,
  slopePerMinute: number | null,
  lagMin = 15
): number | null {
  if (slopePerMinute == null || !Number.isFinite(mmol)) return null;
  return mmol + slopePerMinute * lagMin;
}
