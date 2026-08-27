import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SgReading } from './sgs-history.service';
import { formatMinutesLong } from '../utils/duration-format.util';
import { eventsFromCareLinkMarkers } from '../utils/carelink-markers.util';
import { eventsFromCareLinkAlerts } from '../utils/carelink-alerts.util';
import {
  carelinkWallClock,
  formatCarelinkClock,
  offsetMinFromIso,
  restampCarelinkStoredIso,
  shiftCarelinkWallHours,
} from '../utils/carelink-time.util';

export type EventKind =
  | 'bolus'
  | 'basal'
  | 'sensor'
  | 'sync'
  | 'alarm'
  | 'gap'
  | 'meal'
  | 'note'
  | 'other';

export interface AppEvent {
  id: string;
  kind: EventKind;
  timestamp: string;
  label: string;
  detail?: string;
  units?: number;
}

@Injectable({ providedIn: 'root' })
export class EventsStore {
  private static readonly STORAGE_KEY = 'app_events_v1';
  private static readonly MAX = 500;

  public events$ = new BehaviorSubject<AppEvent[]>(this.load());

  private load(): AppEvent[] {
    try {
      const raw = localStorage.getItem(EventsStore.STORAGE_KEY);
      if (!raw) return [];
      const list = JSON.parse(raw) as AppEvent[];
      let changed = false;
      const next = list.map((e) => {
        const ts = restampCarelinkStoredIso(e.timestamp);
        if (ts === e.timestamp) return e;
        changed = true;
        return { ...e, timestamp: ts };
      });
      const sorted = next.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      if (changed) this.persist(sorted);
      return sorted;
    } catch {
      return [];
    }
  }

  private persist(events: AppEvent[]) {
    try {
      localStorage.setItem(EventsStore.STORAGE_KEY, JSON.stringify(events.slice(0, EventsStore.MAX)));
    } catch {
      /* ignore */
    }
  }

  add(event: Omit<AppEvent, 'id'> & { id?: string }) {
    const list = this.load();
    const timestamp = restampCarelinkStoredIso(event.timestamp);
    const id = event.id || `${event.kind}-${timestamp}-${Math.random().toString(36).slice(2, 7)}`;
    const idx = list.findIndex((e) => e.id === id);
    if (idx >= 0) {
      const prev = list[idx];
      if (timestamp && timestamp !== prev.timestamp) {
        list[idx] = { ...prev, ...event, id, timestamp };
        this.persist(list);
        this.events$.next(list);
      }
      return;
    }
    const next = [{ ...event, id, timestamp }, ...list].slice(0, EventsStore.MAX);
    this.persist(next);
    this.events$.next(next);
  }

  /** Rewrite stored CareLink event walls by whole hours (skips real UTC sync/notes). */
  shiftAllWallHours(hours: number) {
    if (!hours) return;
    let changed = false;
    const byId = new Map<string, AppEvent>();
    for (const e of this.events$.value) {
      if (offsetMinFromIso(e.timestamp) === 0) {
        byId.set(e.id, e);
        continue;
      }
      const oldWall = carelinkWallClock(e.timestamp);
      const timestamp = shiftCarelinkWallHours(e.timestamp, hours);
      if (timestamp === e.timestamp) {
        byId.set(e.id, e);
        continue;
      }
      changed = true;
      const newWall = carelinkWallClock(timestamp);
      const id = e.id.includes(oldWall) ? e.id.replace(oldWall, newWall) : e.id;
      byId.set(id, { ...e, id, timestamp });
    }
    if (!changed) return;
    const next = [...byId.values()].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    this.persist(next);
    this.events$.next(next);
  }

  /** Pull useful events from a CareLink patientData payload. */
  ingestCareLink(patientData: any) {
    if (!patientData) return;
    const nowIso = new Date().toISOString();
    const dayBucket = Math.floor(Date.now() / (24 * 60 * 60 * 1000));

    if (patientData.conduitSensorInRange === false) {
      this.add({
        kind: 'sensor',
        timestamp: patientData.lastSG?.timestamp || nowIso,
        id: `disconnect-${dayBucket}`,
        label: 'Sensor disconnected',
        detail: 'Conduit out of range',
      });
    }

    const markers =
      patientData.markers ||
      patientData.mealMarkers ||
      patientData.bolusMarkers ||
      [];
    const hasLgsMarker = markers.some(
      (m: any) => m?.type === 'LOW_GLUCOSE_SUSPENDED'
    );

    const banner = patientData.pumpBannerState || [];
    for (const b of banner) {
      if (b?.type === 'TEMP_BASAL') {
        this.add({
          kind: 'basal',
          timestamp: nowIso,
          id: `temp-basal-${Math.floor(Date.now() / (15 * 60 * 1000))}`,
          label: `Temp basal ${formatMinutesLong(Number(b.timeRemaining) || 0)} left`,
          detail: b.tempRate != null ? `${b.tempRate} u/h` : undefined,
          units: b.tempRate,
        });
      }
      // Prefer timed LGS markers over banner rows with poll-time stamps.
      if (
        !hasLgsMarker &&
        (b?.type === 'SUSPENDED_ON_LOW' || b?.type === 'SUSPENDED_BEFORE_LOW')
      ) {
        this.add({
          kind: 'alarm',
          timestamp: nowIso,
          id: `banner-lgs-${dayBucket}-${b.type}`,
          label:
            b.type === 'SUSPENDED_ON_LOW'
              ? 'Suspended on low'
              : 'Suspended before low',
          detail: 'Pump auto-suspend',
        });
      }
      if (
        b?.type === 'AUTO_MODE' ||
        b?.type === 'SMARTGUARD' ||
        b?.type === 'AUTO_MODE_ACTIVE'
      ) {
        this.add({
          kind: 'basal',
          timestamp: nowIso,
          id: `mode-${Math.floor(Date.now() / (15 * 60 * 1000))}`,
          label: 'Auto mode active',
          detail: b.type === 'SMARTGUARD' ? 'SmartGuard' : 'Automated insulin delivery',
        });
      }
    }

    // Deduped status when suspended but no LGS marker this payload.
    if (patientData.pumpSuspended && !hasLgsMarker) {
      this.add({
        kind: 'alarm',
        timestamp: nowIso,
        id: `suspend-${dayBucket}`,
        label: 'Pump suspended',
        detail: 'Delivery paused',
      });
    }

    const sensorState = patientData.lastSG?.sensorState || patientData.sensorState;
    if (sensorState === 'WARMUP' || sensorState === 'WARM_UP') {
      this.add({
        kind: 'sensor',
        timestamp: patientData.lastSG?.timestamp || nowIso,
        id: `warmup-${Math.floor(Date.now() / (30 * 60 * 1000))}`,
        label: 'Sensor warmup',
        detail: 'Readings may be unavailable',
      });
    }
    if (sensorState === 'CHANGE_SENSOR') {
      this.add({
        kind: 'sensor',
        timestamp: patientData.lastSG?.timestamp || nowIso,
        id: `change-sensor-${dayBucket}`,
        label: 'Replace sensor',
        detail: 'Sensor end of life',
      });
    }

    const calMin = patientData.timeToNextCalibrationMinutes;
    if (calMin != null && calMin > 0 && calMin <= 120) {
      this.add({
        kind: 'sensor',
        timestamp: nowIso,
        id: `cal-due-${Math.floor(Date.now() / (60 * 60 * 1000))}`,
        label: 'Calibration due soon',
        detail: `In ${formatMinutesLong(Math.floor(calMin))}`,
      });
    }

    for (const ev of eventsFromCareLinkMarkers(markers)) {
      this.add(ev);
    }
    for (const ev of eventsFromCareLinkAlerts(patientData)) {
      this.add(ev);
    }

    const reservoir = patientData.reservoirRemainingUnits;
    this.add({
      kind: 'sync',
      timestamp: nowIso,
      id: `sync-${Math.floor(Date.now() / (5 * 60 * 1000))}`,
      label: 'Sensor synced',
      detail:
        reservoir != null && reservoir >= 0
          ? `Pump reservoir ${reservoir} u`
          : 'CareLink refresh',
    });
  }

  /** Status-only event when an NGP snapshot is dropped for a bad pump clock. */
  ingestPumpDisconnected(patientData: any) {
    const nowIso = new Date().toISOString();
    const dayBucket = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
    this.add({
      kind: 'alarm',
      timestamp: nowIso,
      id: `pump-disconnect-${dayBucket}`,
      label: 'Pump disconnected',
      detail: 'Snapshot ignored — clock unreliable',
    });
  }

  recent(limit = 20): AppEvent[] {
    return this.events$.value.slice(0, limit);
  }

  /** Newest-first feed for Now — hides routine sync unless little else to show. */
  recentForDisplay(limit = 8): AppEvent[] {
    const all = [...this.events$.value].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const notable = all.filter((e) => e.kind !== 'sync');
    const pool = notable.length >= 3 ? notable : all;
    return pool.slice(0, limit);
  }

  eventsInRange(startMs: number, endMs: number): AppEvent[] {
    return this.events$.value
      .filter((e) => {
        const t = new Date(e.timestamp).getTime();
        return t >= startMs && t <= endMs;
      })
      .sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
  }

  clearAll() {
    localStorage.removeItem(EventsStore.STORAGE_KEY);
    this.events$.next([]);
  }

  bolusesInRange(startMs: number, endMs: number): AppEvent[] {
    return this.events$.value.filter(
      (e) =>
        e.kind === 'bolus' &&
        e.units &&
        new Date(e.timestamp).getTime() >= startMs &&
        new Date(e.timestamp).getTime() <= endMs
    );
  }

  /** Upsert closed signal-loss gaps between readings (not open trailing to EOD/now). */
  syncGapsForRange(readings: SgReading[], startMs: number, endMs: number) {
    const cappedEnd = Math.min(endMs, Date.now());
    const withoutDayGaps = this.load().filter((e) => {
      if (e.kind !== 'gap') return true;
      const t = new Date(e.timestamp).getTime();
      return t < startMs || t > cappedEnd;
    });

    const inRange = readings
      .filter((r) => {
        const t = new Date(r.timestamp).getTime();
        return t >= startMs && t <= cappedEnd && r.mmol > 0;
      })
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

    const gaps: AppEvent[] = [];
    for (let i = 0; i < inRange.length - 1; i++) {
      const fromMs = new Date(inRange[i].timestamp).getTime();
      const toMs = new Date(inRange[i + 1].timestamp).getTime();
      const durMin = Math.round((toMs - fromMs) / 60_000);
      if (durMin < 10) continue;

      const from = new Date(fromMs);
      const to = new Date(toMs);
      const fromLabel = formatCarelinkClock(inRange[i].timestamp);
      const toLabel = formatCarelinkClock(inRange[i + 1].timestamp);
      gaps.push({
        id: `gap-${from.toISOString()}-${to.toISOString()}`,
        kind: 'gap',
        timestamp: from.toISOString(),
        label: 'Signal lost',
        detail: `${fromLabel}–${toLabel} · ${formatMinutesLong(durMin)}`,
      });
    }

    const byId = new Map<string, AppEvent>();
    for (const e of [...gaps, ...withoutDayGaps]) {
      if (!byId.has(e.id)) byId.set(e.id, e);
    }
    const next = [...byId.values()]
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      .slice(0, EventsStore.MAX);

    // Avoid re-emitting identical lists — Day page combines events$ into refresh().
    if (sameEventSnapshot(this.events$.value, next)) return;

    this.persist(next);
    this.events$.next(next);
  }

  /** Drop legacy open-ended “until 23:59” gap rows from older builds. */
  pruneBogusGapEvents() {
    const cleaned = this.load().filter((e) => {
      if (e.kind !== 'gap') return true;
      const d = e.detail || '';
      if (/until\s*23:59/i.test(d)) return false;
      if (/\d+\s*min\b/i.test(d) && /until/i.test(d)) return false;
      return true;
    });
    if (sameEventSnapshot(this.events$.value, cleaned)) return;
    this.persist(cleaned);
    this.events$.next(cleaned);
  }

  static dotColor(kind: EventKind): string {
    switch (kind) {
      case 'bolus':
        return 'var(--indigo)';
      case 'alarm':
        return 'var(--low)';
      case 'sensor':
        return 'var(--teal)';
      case 'gap':
        return 'var(--gap)';
      case 'sync':
        return 'var(--teal)';
      case 'basal':
        return 'var(--indigo)';
      case 'meal':
        return 'var(--amber)';
      case 'note':
        return 'var(--indigo)';
      default:
        return 'var(--muted)';
    }
  }
}

function sameEventSnapshot(a: AppEvent[], b: AppEvent[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].detail !== b[i].detail ||
      a[i].label !== b[i].label ||
      a[i].timestamp !== b[i].timestamp
    ) {
      return false;
    }
  }
  return true;
}
