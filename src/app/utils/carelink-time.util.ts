/** CareLink display/message timestamps are naive local wall-clock ISO strings. */

/** Allow small pump/server skew when rejecting post-server SG points. */
export const CARELINK_SERVER_SKEW_MS = 2 * 60 * 1000;

export function carelinkTsMs(iso: string | number | null | undefined): number {
  if (iso == null || iso === '') return NaN;
  if (typeof iso === 'number') return Number.isFinite(iso) ? iso : NaN;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/**
 * Cutoff for accepting SG points: CareLink currentServerTime (ms) + skew,
 * or wall clock if server time is missing.
 */
export function serverCutoffMs(patientData: {
  currentServerTime?: number | null;
} | null | undefined): number {
  const server = patientData?.currentServerTime;
  const base =
    typeof server === 'number' && Number.isFinite(server) && server > 0
      ? server
      : Date.now();
  return base + CARELINK_SERVER_SKEW_MS;
}

export function isAcceptableReadingTs(
  ts: string | number | null | undefined,
  cutoffMs: number
): boolean {
  const t = carelinkTsMs(ts);
  return Number.isFinite(t) && t <= cutoffMs;
}

export function filterAcceptedSgs<T extends { sg?: number; timestamp?: string }>(
  sgs: T[] | null | undefined,
  cutoffMs: number
): T[] {
  if (!sgs?.length) return [];
  return sgs.filter(
    (sg) =>
      !!sg &&
      Number(sg.sg) > 0 &&
      !!sg.timestamp &&
      isAcceptableReadingTs(sg.timestamp, cutoffMs)
  );
}

/** Newest accepted reading (sg > 0, t ≤ cutoff), or undefined. */
export function latestAcceptedSg<T extends { sg?: number; timestamp?: string }>(
  sgs: T[] | null | undefined,
  cutoffMs: number,
  lastSg?: T | null
): T | undefined {
  const accepted = filterAcceptedSgs(sgs, cutoffMs);
  if (
    lastSg &&
    Number(lastSg.sg) > 0 &&
    lastSg.timestamp &&
    isAcceptableReadingTs(lastSg.timestamp, cutoffMs)
  ) {
    const lastT = carelinkTsMs(lastSg.timestamp);
    const bestFromArray = accepted
      .slice()
      .sort((a, b) => carelinkTsMs(b.timestamp) - carelinkTsMs(a.timestamp))[0];
    if (!bestFromArray || lastT >= carelinkTsMs(bestFromArray.timestamp)) {
      return lastSg;
    }
  }
  return accepted
    .slice()
    .sort((a, b) => carelinkTsMs(b.timestamp) - carelinkTsMs(a.timestamp))[0];
}
