/** English duration helpers — always non-negative, HH:MM clock style. */

function floorAbsMinutes(minutes: number): number {
  return Math.max(0, Math.floor(Math.abs(minutes)));
}

/** e.g. "00:40", "01:15", "16:15" */
export function formatMinutesLong(minutes: number): string {
  const m = floorAbsMinutes(minutes);
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${String(h).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

/** e.g. "00:40 ago", or "just now" */
export function formatDurationEn(minutes: number, prefix = 'ago'): string {
  const m = floorAbsMinutes(minutes);
  if (m === 0) return 'just now';
  return `${formatMinutesLong(m)} ${prefix}`;
}

/** e.g. "No data for 02:15" */
export function formatStaleLabelEn(minutes: number): string {
  const m = floorAbsMinutes(minutes);
  if (m === 0) return 'No data';
  return `No data for ${formatMinutesLong(m)}`;
}

/** e.g. "polled 00:04 ago" */
export function formatPolledAgoEn(minutes: number): string {
  const m = floorAbsMinutes(minutes);
  if (m === 0) return 'polled just now';
  return `polled ${formatMinutesLong(m)} ago`;
}
