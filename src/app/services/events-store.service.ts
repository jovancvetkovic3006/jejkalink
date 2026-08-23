import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type EventKind =
  | 'bolus'
  | 'basal'
  | 'sensor'
  | 'sync'
  | 'alarm'
  | 'gap'
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
        label: 'Senzor nije povezan',
      });
    }

    const banner = patientData.pumpBannerState || [];
    for (const b of banner) {
      if (b?.type === 'TEMP_BASAL') {
        this.add({
          kind: 'basal',
          timestamp: nowIso,
          label: `Temporalni bazal još ${b.timeRemaining || '?'} min`,
          units: b.tempRate,
        });
      }
      if (b?.type === 'SUSPENDED_ON_LOW' || b?.type === 'SUSPENDED_BEFORE_LOW') {
        this.add({
          kind: 'alarm',
          timestamp: nowIso,
          label: b.type === 'SUSPENDED_ON_LOW' ? 'Suspendovano na niskoj' : 'Suspendovano pre niske',
        });
      }
    }

    const markers =
      patientData.markers ||
      patientData.mealMarkers ||
      patientData.bolusMarkers ||
      [];
    for (const m of markers) {
      const amount = m.amount ?? m.bolusAmount ?? m.value;
      const ts = m.timestamp || m.time || nowIso;
      if (amount && Number(amount) > 0) {
        const carbs = m.carbs ?? m.carbohydrates;
        this.add({
          kind: 'bolus',
          timestamp: ts,
          label: `Bolus ${Number(amount).toFixed(1)} j`,
          detail: carbs ? `${carbs} g` : undefined,
          units: Number(amount),
        });
      }
    }

    this.add({
      kind: 'sync',
      timestamp: nowIso,
      label: 'Sinhronizacija CareLink',
    });
  }

  recent(limit = 20): AppEvent[] {
    return this.events$.value.slice(0, limit);
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
      default:
        return 'var(--muted)';
    }
  }
}
