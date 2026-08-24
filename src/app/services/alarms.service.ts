import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  HIGH,
  LOW,
  LOW_CLEAR,
  STALE_URGENT_MIN,
  VERY_LOW,
} from '../domain/glucose';
import { SgReading } from './sgs-history.service';
import { formatStaleLabelEn } from '../utils/duration-format.util';

export interface AlarmSettings {
  low: number;
  urgentLow: number;
  high: number;
  fallingFast: number;
  staleEnabled: boolean;
  projectionEnabled: boolean;
  overnightProfile: boolean;
  repeatUntilCleared: boolean;
}

export interface FiredAlarm {
  id: string;
  timestamp: string;
  rule: string;
  label: string;
  readingTs?: string;
  mmol?: number;
  tag: 'real' | 'false' | null;
}

const DEFAULTS: AlarmSettings = {
  low: LOW,
  urgentLow: VERY_LOW,
  high: HIGH,
  fallingFast: 0.15,
  staleEnabled: true,
  projectionEnabled: false,
  overnightProfile: true,
  repeatUntilCleared: true,
};

@Injectable({ providedIn: 'root' })
export class AlarmsService {
  private static readonly SETTINGS_KEY = 'alarm_settings_v1';
  private static readonly FIRED_KEY = 'alarms_fired_v1';

  public settings$ = new BehaviorSubject<AlarmSettings>(this.loadSettings());
  public fired$ = new BehaviorSubject<FiredAlarm[]>(this.loadFired());

  private lowActive = false;
  private lastFireKey = '';

  private loadSettings(): AlarmSettings {
    try {
      const raw = localStorage.getItem(AlarmsService.SETTINGS_KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  }

  private loadFired(): FiredAlarm[] {
    try {
      const raw = localStorage.getItem(AlarmsService.FIRED_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveSettings(patch: Partial<AlarmSettings>) {
    const next = { ...this.settings$.value, ...patch };
    localStorage.setItem(AlarmsService.SETTINGS_KEY, JSON.stringify(next));
    this.settings$.next(next);
  }

  private persistFired(list: FiredAlarm[]) {
    localStorage.setItem(AlarmsService.FIRED_KEY, JSON.stringify(list.slice(0, 200)));
    this.fired$.next(list.slice(0, 200));
  }

  private fire(rule: string, label: string, reading?: SgReading) {
    const key = `${rule}-${reading?.timestamp || ''}-${label}`;
    if (key === this.lastFireKey) return;
    // Deduplicate same rule within 15 minutes
    const recent = this.loadFired().find(
      (f) =>
        f.rule === rule &&
        Date.now() - new Date(f.timestamp).getTime() < 15 * 60 * 1000
    );
    if (recent) return;
    this.lastFireKey = key;
    const entry: FiredAlarm = {
      id: `${rule}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      rule,
      label,
      readingTs: reading?.timestamp,
      mmol: reading?.mmol,
      tag: null,
    };
    this.persistFired([entry, ...this.loadFired()]);
  }

  tag(id: string, tag: 'real' | 'false') {
    const list = this.loadFired().map((f) => (f.id === id ? { ...f, tag } : f));
    this.persistFired(list);
  }

  /**
   * Evaluate against reading timestamps (not fetch time).
   * Call after history updates.
   */
  evaluate(readings: SgReading[]) {
    const s = this.settings$.value;
    if (!readings.length) return;

    const last = readings[readings.length - 1];
    const ageMin = (Date.now() - new Date(last.timestamp).getTime()) / 60000;

    if (s.staleEnabled && ageMin >= STALE_URGENT_MIN) {
      this.fire('stale', formatStaleLabelEn(ageMin), last);
    }

    const mmol = last.mmol;
    if (mmol < s.urgentLow) {
      this.fire('urgent_low', `Urgent low ${mmol.toFixed(1)}`, last);
      this.lowActive = true;
    } else if (mmol < s.low) {
      if (!this.lowActive) {
        this.fire('low', `Low ${mmol.toFixed(1)}`, last);
        this.lowActive = true;
      }
    } else if (mmol >= LOW_CLEAR) {
      this.lowActive = false;
    }

    if (mmol > s.high) {
      this.fire('high', `High ${mmol.toFixed(1)}`, last);
    }

    if (readings.length >= 2 && s.fallingFast) {
      const prev = readings[readings.length - 2];
      const dtMin =
        (new Date(last.timestamp).getTime() - new Date(prev.timestamp).getTime()) /
        60000;
      if (dtMin > 0) {
        const slope = (last.mmol - prev.mmol) / dtMin;
        if (slope <= -s.fallingFast) {
          this.fire('falling_fast', `Falling fast ${slope.toFixed(2)}/min`, last);
        }
      }
    }
  }

  firedThisWeek(): FiredAlarm[] {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return this.fired$.value.filter((f) => new Date(f.timestamp).getTime() >= weekAgo);
  }
}
