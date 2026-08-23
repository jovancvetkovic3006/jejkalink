/** Serbian (Latin) relative duration for UI chips and labels. */

export function formatDurationSr(minutes: number, prefix = 'pre'): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m === 0) return 'upravo sada';
  if (m < 60) return `${prefix} ${m} min`;

  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (rem === 0) return `${prefix} ${h}h`;
  return `${prefix} ${h}h ${rem}m`;
}

/** e.g. "Nema podataka 2h 15m" */
export function formatStaleLabelSr(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m === 0) return 'Nema podataka';
  if (m < 60) return `Nema podataka ${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (rem === 0) return `Nema podataka ${h}h`;
  return `Nema podataka ${h}h ${rem}m`;
}
