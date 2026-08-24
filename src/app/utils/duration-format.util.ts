/** English relative duration for UI chips and labels. */

export function formatDurationEn(minutes: number, prefix = 'ago'): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m === 0) return 'just now';
  if (m < 60) return `${m} min ${prefix}`;

  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (rem === 0) return `${h}h ${prefix}`;
  return `${h}h ${rem}m ${prefix}`;
}

/** e.g. "No data for 2h 15m" */
export function formatStaleLabelEn(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m === 0) return 'No data';
  if (m < 60) return `No data for ${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (rem === 0) return `No data for ${h}h`;
  return `No data for ${h}h ${rem}m`;
}

/** e.g. "polled 4 min ago" */
export function formatPolledAgoEn(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m === 0) return 'polled just now';
  if (m < 60) return `polled ${m} min ago`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (rem === 0) return `polled ${h}h ago`;
  return `polled ${h}h ${rem}m ago`;
}
