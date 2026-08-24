import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { detectGaps } from '../analytics/coverage';
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
          label: `Temp basal ${b.timeRemaining || '?'} min left`,
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
        detail: `In ${Math.floor(calMin / 60)}h ${calMin % 60}m`,
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

  /** Upsert gap rows from detectGaps for a day window (day log). */
  syncGapsForRange(readings: SgReading[], startMs: number, endMs: number) {
    const start = new Date(startMs);
    const end = new Date(endMs);
    const cov = detectGaps(readings, start, end);
    for (const seg of cov.segments) {
      if (seg.covered) continue;
      const durMin = Math.round((seg.to.getTime() - seg.from.getTime()) / 60000);
      if (durMin < 10) continue;
      const id = `gap-${seg.from.toISOString()}-${seg.to.toISOString()}`;
      this.add({
        id,
        kind: 'gap',
        timestamp: seg.from.toISOString(),
        label: 'Signal lost',
        detail: `${formatMinutesLong(durMin)} · until ${seg.to.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
        })}`,
      });
    }
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
