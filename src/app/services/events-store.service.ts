import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SgReading } from './sgs-history.service';
import { formatMinutesLong } from '../utils/duration-format.util';

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
      return (JSON.parse(raw) as AppEvent[]).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
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
    const id = event.id || `${event.kind}-${event.timestamp}-${Math.random().toString(36).slice(2, 7)}`;
    if (list.some((e) => e.id === id)) return;
    const next = [{ ...event, id }, ...list].slice(0, EventsStore.MAX);
    this.persist(next);
    this.events$.next(next);
  }

  /** Pull useful events from a CareLink patientData payload. */
  ingestCareLink(patientData: any) {
    if (!patientData) return;
    const nowIso = new Date().toISOString();

    if (patientData.conduitSensorInRange === false) {
      this.add({
        kind: 'sensor',
        timestamp: patientData.lastSG?.timestamp || nowIso,
        label: 'Sensor disconnected',
        detail: 'Conduit out of range',
      });
    }

    const banner = patientData.pumpBannerState || [];
    for (const b of banner) {
      if (b?.type === 'TEMP_BASAL') {
        this.add({
          kind: 'basal',
          timestamp: nowIso,
          label: `Temp basal ${formatMinutesLong(Number(b.timeRemaining) || 0)} left`,
          detail: b.tempRate != null ? `${b.tempRate} u/h` : undefined,
          units: b.tempRate,
        });
      }
      if (b?.type === 'SUSPENDED_ON_LOW' || b?.type === 'SUSPENDED_BEFORE_LOW') {
        this.add({
          kind: 'alarm',
          timestamp: nowIso,
          label: b.type === 'SUSPENDED_ON_LOW' ? 'Suspended on low' : 'Suspended before low',
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

    if (patientData.pumpSuspended) {
      this.add({
        kind: 'alarm',
        timestamp: nowIso,
        id: `suspend-${Math.floor(Date.now() / (15 * 60 * 1000))}`,
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
        label: 'Replace sensor',
        detail: 'Sensor end of life',
      });
    }

    const calMin = patientData.timeToNextCalibrationMinutes;
    if (calMin != null && calMin > 0 && calMin <= 120) {
      this.add({
        kind: 'sensor',
        timestamp: nowIso,
        id: `cal-${Math.floor(Date.now() / (60 * 60 * 1000))}`,
        label: 'Calibration due soon',
        detail: `In ${formatMinutesLong(Math.floor(calMin))}`,
      });
    }

    const markers =
      patientData.markers ||
      patientData.mealMarkers ||
      patientData.bolusMarkers ||
      [];
    for (const m of markers) {
      const amount = m.amount ?? m.bolusAmount ?? m.value;
      const carbs = m.carbs ?? m.carbohydrates;
      const ts = m.timestamp || m.time || nowIso;
      const meal = m.meal ?? m.mealType ?? m.foodType;

      if (amount && Number(amount) > 0) {
        const detailParts: string[] = [];
        if (carbs) detailParts.push(`${carbs} g carbs`);
        if (meal) detailParts.push(String(meal).toLowerCase());
        this.add({
          kind: 'bolus',
          timestamp: ts,
          label: `Bolus ${Number(amount).toFixed(1)} u`,
          detail: detailParts.length ? detailParts.join(' · ') : undefined,
          units: Number(amount),
        });
      } else if (carbs && Number(carbs) > 0) {
        const detailParts: string[] = [`${carbs} g carbs`];
        if (meal) detailParts.push(String(meal).toLowerCase());
        this.add({
          kind: 'meal',
          timestamp: ts,
          label: 'Carbs logged',
          detail: detailParts.join(' · '),
        });
      }
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
      const fromLabel = from.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const toLabel = to.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      });
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
    if (cleaned.length === this.events$.value.length) return;
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
