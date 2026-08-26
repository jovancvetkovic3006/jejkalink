/** CareLink display/message timestamps are wall-clock ISO strings in the conduit TZ. */

/** Allow small pump/server skew when rejecting post-server SG points. */
export const CARELINK_SERVER_SKEW_MS = 2 * 60 * 1000;

const TZ_SUFFIX = /(?:[Zz]|[+-]\d{2}:\d{2})$/;

export function carelinkWallClock(iso: string): string {
  return iso.replace(TZ_SUFFIX, '');
}

/** HH:mm from CareLink wall-clock digits — not timezone-converted. */
export function formatCarelinkClock(
  iso: string | number | null | undefined
): string {
  if (iso == null || iso === '') return '--';
  if (typeof iso === 'number') {
    if (!Number.isFinite(iso)) return '--';
    return new Date(iso).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  const s = String(iso);
  const existing = offsetMinFromIso(s);
  if (existing === 0) {
    const t = new Date(s).getTime();
    if (!Number.isFinite(t)) return '--';
    return new Date(t).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  const wall = carelinkWallClock(s);
  const m = wall.match(/T(\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '--';
  return new Date(t).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** Calendar day from CareLink wall-clock digits. */
export function formatCarelinkDate(iso: string): string {
  const wall = carelinkWallClock(iso);
  const m = wall.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m
    ? new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`)
    : new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
  });
}

/**
 * Restamp a stored CareLink ISO whose offset is a 60-min DST miss (CET vs CEST).
 * Leaves real UTC (`Z`) alone — notes/sync use that.
 */
export function restampCarelinkStoredIso(
  iso: string,
  deviceOffsetMin = deviceUtcOffsetMin()
): string {
  if (!iso || typeof iso !== 'string' || !iso.includes('T')) return iso;
  const existing = offsetMinFromIso(iso);
  if (existing == null) {
    return applyCarelinkOffset(iso, deviceOffsetMin);
  }
  if (existing === 0) return iso;
  if (Math.abs(existing - deviceOffsetMin) === 60) {
    return applyCarelinkOffset(iso, deviceOffsetMin);
  }
  return iso;
}

export function offsetMinFromIso(iso: string): number | null {
  const m = iso.match(/([Zz]|([+-])(\d{2}):(\d{2}))$/);
  if (!m) return null;
  if (m[1] === 'Z' || m[1] === 'z') return 0;
  const sign = m[2] === '-' ? -1 : 1;
  return sign * (Number(m[3]) * 60 + Number(m[4]));
}

export function formatUtcOffset(offsetMin: number): string {
  const sign = offsetMin < 0 ? '-' : '+';
  const abs = Math.abs(Math.round(offsetMin));
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

/** Stamp CareLink wall-clock digits with the conduit offset (replaces Z / any suffix). */
export function applyCarelinkOffset(iso: string, offsetMin: number): string {
  if (!iso) return iso;
  return carelinkWallClock(iso) + formatUtcOffset(offsetMin);
}

/**
 * Conduit offset from a clock string vs a UTC epoch. Wall digits are local;
 * the epoch is the same instant. Rounds to 15 min (DST / TZ steps).
 */
export function offsetMinFromClockAndServer(
  clockIso: string,
  serverMs: number
): number | null {
  if (!clockIso || !Number.isFinite(serverMs) || serverMs <= 0) return null;
  const asUtc = Date.parse(carelinkWallClock(clockIso) + 'Z');
  if (!Number.isFinite(asUtc)) return null;
  const rounded = Math.round((asUtc - serverMs) / 60000 / 15) * 15;
  if (!Number.isFinite(rounded) || Math.abs(rounded) > 14 * 60) return null;
  return rounded;
}

function firstPositiveMs(...values: unknown[]): number {
  for (const v of values) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n) && n > 1e11) return n;
  }
  return 0;
}

function firstClockString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.includes('T')) return v;
  }
  return null;
}

function offsetMinForTimeZone(name: string, atMs: number): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: name,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date(atMs));
    const raw = parts.find((p) => p.type === 'timeZoneName')?.value || '';
    const m = raw.match(/([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (!m) return null;
    const sign = m[1] === '-' ? -1 : 1;
    return sign * (Number(m[2]) * 60 + Number(m[3] || 0));
  } catch {
    return null;
  }
}

export function deviceUtcOffsetMin(atMs = Date.now()): number {
  return -new Date(atMs).getTimezoneOffset();
}

function inferredCarelinkOffsetMin(patientData: {
  lastConduitDateTime?: string | number | null;
  sMedicalDeviceTime?: string | null;
  medicalDeviceTimeAsString?: string | null;
  lastConduitUpdateServerDateTime?: number | null;
  lastConduitUpdateServerTime?: number | null;
  lastMedicalDeviceDataUpdateServerTime?: number | null;
} | null | undefined): number | null {
  // xDrip correctTimeInRecentData: device clock vs device-update server time.
  const devicePair = offsetMinFromClockAndServer(
    firstClockString(
      patientData?.sMedicalDeviceTime,
      patientData?.medicalDeviceTimeAsString
    ) || '',
    firstPositiveMs(patientData?.lastMedicalDeviceDataUpdateServerTime)
  );
  if (devicePair != null) return devicePair;
  // xDrip correctTimeInDisplayMessage (v11): conduit clock vs conduit-update server.
  // Do not pair a stale conduit clock with currentServerTime — that infers CET in CEST.
  return offsetMinFromClockAndServer(
    firstClockString(patientData?.lastConduitDateTime) || '',
    firstPositiveMs(
      patientData?.lastConduitUpdateServerDateTime,
      patientData?.lastConduitUpdateServerTime
    )
  );
}

/**
 * CareLink/conduit UTC offset in minutes.
 * v11 EU dates have no timezone. Infer from the matching clock/server pair,
 * then reject a 60-minute DST miss against the named CareLink TZ or the phone.
 */
export function carelinkOffsetMin(
  patientData: {
    lastConduitDateTime?: string | number | null;
    sMedicalDeviceTime?: string | null;
    medicalDeviceTimeAsString?: string | null;
    lastConduitUpdateServerDateTime?: number | null;
    lastConduitUpdateServerTime?: number | null;
    lastMedicalDeviceDataUpdateServerTime?: number | null;
    currentServerTime?: number | null;
    clientTimeZoneName?: string | null;
  } | null | undefined,
  nowMs = Date.now(),
  deviceOffsetMin = deviceUtcOffsetMin(nowMs)
): number {
  const named = patientData?.clientTimeZoneName
    ? offsetMinForTimeZone(patientData.clientTimeZoneName, nowMs)
    : null;
  const inferred = inferredCarelinkOffsetMin(patientData);
  const dstAnchor = named ?? deviceOffsetMin;
  if (inferred != null && Math.abs(inferred - dstAnchor) === 60) {
    return dstAnchor;
  }
  if (inferred != null) return inferred;
  if (named != null) return named;
  return deviceOffsetMin;
}

export function normalizePatientTimestamps(
  patientData: any,
  offsetMin: number
): void {
  if (!patientData || !Number.isFinite(offsetMin)) return;
  if (Array.isArray(patientData.sgs)) {
    for (const sg of patientData.sgs) {
      if (sg && typeof sg.timestamp === 'string') {
        sg.timestamp = applyCarelinkOffset(sg.timestamp, offsetMin);
      }
    }
  }
  if (patientData.lastSG && typeof patientData.lastSG.timestamp === 'string') {
    patientData.lastSG.timestamp = applyCarelinkOffset(
      patientData.lastSG.timestamp,
      offsetMin
    );
  }
  if (Array.isArray(patientData.markers)) {
    for (const m of patientData.markers) {
      if (!m) continue;
      for (const key of [
        'timestamp',
        'time',
        'displayTime',
        'dateTime',
        'datetime',
      ] as const) {
        if (typeof m[key] === 'string') {
          m[key] = applyCarelinkOffset(m[key], offsetMin);
        }
      }
    }
  }
  const lastAlarm = patientData.lastAlarm;
  if (lastAlarm) {
    for (const key of ['datetime', 'dateTime', 'timestamp'] as const) {
      if (typeof lastAlarm[key] === 'string') {
        lastAlarm[key] = applyCarelinkOffset(lastAlarm[key], offsetMin);
      }
    }
  }
  const hist = patientData.notificationHistory;
  if (hist) {
    for (const row of [
      ...(hist.activeNotifications || []),
      ...(hist.clearedNotifications || []),
    ]) {
      if (!row) continue;
      for (const key of [
        'dateTime',
        'datetime',
        'timestamp',
        'triggeredDateTime',
      ] as const) {
        if (typeof row[key] === 'string') {
          row[key] = applyCarelinkOffset(row[key], offsetMin);
        }
      }
    }
  }
}

/** MiniMed 7xxG clock is wrong while the pump is unreachable — skip the snapshot. */
export function isUnreliablePumpClock(patientData: any): boolean {
  if (!patientData) return false;
  const fam = String(patientData.medicalDeviceFamily || '').toUpperCase();
  if (fam !== 'NGP' && fam !== 'CC') return false;
  return patientData.pumpCommunicationState === false;
}

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
