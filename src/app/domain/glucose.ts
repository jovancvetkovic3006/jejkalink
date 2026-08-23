/** Central mmol/L glucose domain — convert mg/dL only at the collector boundary. */

export const MGDL_TO_MMOL = 18.0182;

export const VERY_LOW = 3.0;
export const LOW = 3.9;
export const HIGH = 10.0;
export const VERY_HIGH = 13.9;
export const TIGHT_HIGH = 7.8;

/** Low alarm hysteresis clear threshold */
export const LOW_CLEAR = 4.4;

export const STALE_WARN_MIN = 10;
export const STALE_URGENT_MIN = 20;

export type RangeBucket =
  | 'very-low'
  | 'low'
  | 'in-range'
  | 'high'
  | 'very-high';

/** CareLink SG is mg/dL; convert once at the boundary. */
export function toMmol(sgMgdl: number): number {
  if (!Number.isFinite(sgMgdl) || sgMgdl <= 0) return 0;
  return sgMgdl / MGDL_TO_MMOL;
}

/** Always one decimal place: 6 → "6.0". */
export function formatMmol(mmol: number): string {
  if (!Number.isFinite(mmol)) return '--';
  return mmol.toFixed(1);
}

export function rangeBucket(mmol: number): RangeBucket {
  if (mmol < VERY_LOW) return 'very-low';
  if (mmol < LOW) return 'low';
  if (mmol <= HIGH) return 'in-range';
  if (mmol <= VERY_HIGH) return 'high';
  return 'very-high';
}

export function rangeLabelSr(bucket: RangeBucket): string {
  switch (bucket) {
    case 'very-low':
      return 'Veoma niska';
    case 'low':
      return 'Niska';
    case 'in-range':
      return 'U opsegu';
    case 'high':
      return 'Visoka';
    case 'very-high':
      return 'Veoma visoka';
  }
}

/** CSS token name for bucket colour. */
export function rangeColorVar(bucket: RangeBucket): string {
  switch (bucket) {
    case 'very-low':
      return 'var(--very-low)';
    case 'low':
      return 'var(--low)';
    case 'in-range':
      return 'var(--teal)';
    case 'high':
      return 'var(--amber)';
    case 'very-high':
      return 'var(--very-high)';
  }
}

export function gmiFromMean(meanMmol: number): number {
  return 12.71 + 4.70587 * meanMmol;
}

export function cvPercent(stdev: number, mean: number): number {
  if (!mean || !Number.isFinite(mean) || !Number.isFinite(stdev)) return 0;
  return (stdev / mean) * 100;
}

export function isPlaySoundAlert(mmol: number): boolean {
  return mmol > 0 && (mmol < LOW || mmol > HIGH);
}

export function isUrgentLow(mmol: number): boolean {
  return mmol > 0 && mmol < VERY_LOW;
}
