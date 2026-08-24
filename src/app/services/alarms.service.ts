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
import { projectMmol, slopePerMin } from '../utils/glucose-slope.util';
import { BackgroundWeb } from './background-web.service';

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

const OVERNIGHT_LOW = 4.2;
const HIGH_HOLD_MIN = 30;
const DEDUPE_MS = 15 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class AlarmsService {
  private static readonly SETTINGS_KEY = 'alarm_settings_v1';
  private static readonly FIRED_KEY = 'alarms_fired_v1';

  public settings$ = new BehaviorSubject<AlarmSettings>(this.loadSettings());
  public fired$ = new BehaviorSubject<FiredAlarm[]>(this.loadFired());

  private lowActive = false;
  private lastFireKey = '';
  private highSinceMs: number | null = null;

  constructor(private readonly bckg: BackgroundWeb) {
    void this.syncThresholdsToNative(this.settings$.value);
  }

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
    void this.syncThresholdsToNative(next);
  }

  /** Push thresholds to Android so ongoing notification / critical channel match UI. */
  async syncThresholdsToNative(s: AlarmSettings = this.settings$.value) {
    try {
      await this.bckg.setAlarmThresholds({
        low: s.low,
        high: s.high,
        urgentLow: s.urgentLow,
      });
    } catch (e) {
      console.log('[alarms] setAlarmThresholds failed', e);
    }
  }

  private persistFired(list: FiredAlarm[]) {
    localStorage.setItem(AlarmsService.FIRED_KEY, JSON.stringify(list.slice(0, 200)));
    this.fired$.next(list.slice(0, 200));
  }

  private isOvernight(d: Date): boolean {
    const h = d.getHours();
    return h >= 22 || h < 7;
  }

  private effectiveLow(s: AlarmSettings, readingTs: Date): number {
    if (s.overnightProfile && this.isOvernight(readingTs)) return OVERNIGHT_LOW;
    return s.low;
  }

  private shouldNotify(rule: string): boolean {
    const recent = this.fired$.value.find(
      (f) =>
        f.rule === rule &&
        Date.now() - new Date(f.timestamp).getTime() < DEDUPE_MS
    );
    return !recent;
  }

  private fire(
    rule: string,
    label: string,
    reading?: SgReading,
    opts?: { critical?: boolean; body?: string }
  ) {
    const key = `${rule}-${reading?.timestamp || ''}-${label}`;
    if (key === this.lastFireKey) return;
    if (!this.shouldNotify(rule)) return;

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
    this.persistFired([entry, ...this.fired$.value]);

    const critical =
      opts?.critical ??
      (rule === 'urgent_low' || rule === 'stale' || rule === 'projection');
    void this.deliver(rule, label, opts?.body || label, critical);
  }

  private async deliver(
    rule: string,
    title: string,
    body: string,
    critical: boolean
  ) {
    try {
      await this.bckg.fireAlarmAlert({ title, body, critical, rule });
    } catch (e) {
      console.log('[alarms] fireAlarmAlert failed', e);
    }
  }

  tag(id: string, tag: 'real' | 'false') {
    const list = this.fired$.value.map((f) => (f.id === id ? { ...f, tag } : f));
    this.persistFired(list);
  }

  /**
   * Evaluate against reading timestamps (not fetch time).
   * Call after history updates. Delivers native notifications for new fires.
   */
  evaluate(readings: SgReading[]) {
    const s = this.settings$.value;
    if (!readings.length) return;

    const last = readings[readings.length - 1];
    const readingAt = new Date(last.timestamp);
    const ageMin = (Date.now() - readingAt.getTime()) / 60000;
    const low = this.effectiveLow(s, readingAt);

    if (s.staleEnabled && ageMin >= STALE_URGENT_MIN) {
      this.fire('stale', formatStaleLabelEn(ageMin), last, {
        critical: true,
        body: 'No fresh CGM reading for 20+ minutes. Check sensor and phone connection.',
      });
    }

    const mmol = last.mmol;
    if (mmol < s.urgentLow) {
      this.fire('urgent_low', `Urgent low ${mmol.toFixed(1)}`, last, {
        critical: true,
        body: `Reading ${mmol.toFixed(1)} mmol/L at ${readingAt.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
        })}. Backup alarm — keep pump alerts on.`,
      });
      this.lowActive = true;
    } else if (mmol < low) {
      if (!this.lowActive || s.repeatUntilCleared) {
        this.fire('low', `Low ${mmol.toFixed(1)}`, last, {
          critical: true,
          body: `Below ${low.toFixed(1)} mmol/L${
            s.overnightProfile && this.isOvernight(readingAt) ? ' (overnight profile)' : ''
          }.`,
        });
      }
      this.lowActive = true;
    } else if (mmol >= LOW_CLEAR) {
      this.lowActive = false;
    }

    if (mmol > s.high) {
      if (this.highSinceMs == null) {
        this.highSinceMs = readingAt.getTime();
      }
      const heldMin = (readingAt.getTime() - this.highSinceMs) / 60000;
      if (heldMin >= HIGH_HOLD_MIN) {
        this.fire('high', `High ${mmol.toFixed(1)}`, last, {
          critical: false,
          body: `Above ${s.high.toFixed(1)} mmol/L for ${Math.round(heldMin)} min.`,
        });
      }
    } else {
      this.highSinceMs = null;
    }

    if (readings.length >= 2 && s.fallingFast > 0) {
      const slope = slopePerMin(readings);
      if (slope != null && slope <= -s.fallingFast) {
        this.fire(
          'falling_fast',
          `Falling fast ${slope.toFixed(2)}/min`,
          last,
          {
            critical: false,
            body: `Drop rate ${slope.toFixed(2)} mmol/L per minute crossed ${s.fallingFast.toFixed(2)}.`,
          }
        );
      }
    }

    if (s.projectionEnabled) {
      const slope = slopePerMin(readings);
      const projected = projectMmol(mmol, slope, 15);
      if (projected != null && projected < low) {
        this.fire(
          'projection',
          `Projected low ${projected.toFixed(1)}`,
          last,
          {
            critical: true,
            body: `15-min forecast ${projected.toFixed(1)} mmol/L (now ${mmol.toFixed(1)}).`,
          }
        );
      }
    }
  }

  firedThisWeek(): FiredAlarm[] {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return this.fired$.value.filter((f) => new Date(f.timestamp).getTime() >= weekAgo);
  }
}
