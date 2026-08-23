import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface AppSettings {
  keepRaw: boolean;
  weekStart: 'monday' | 'sunday';
  weeklyReadEnabled: boolean;
  flagUnusualDays: boolean;
  pollIntervalMin: number;
}

const KEY = 'app_settings_v1';

const DEFAULTS: AppSettings = {
  keepRaw: true,
  weekStart: 'monday',
  weeklyReadEnabled: false,
  flagUnusualDays: false,
  pollIntervalMin: 5,
};

@Injectable({ providedIn: 'root' })
export class AppSettingsService {
  public settings$ = new BehaviorSubject<AppSettings>(this.load());

  private load(): AppSettings {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  }

  get(): AppSettings {
    return this.settings$.value;
  }

  patch(partial: Partial<AppSettings>) {
    const next = { ...this.get(), ...partial };
    localStorage.setItem(KEY, JSON.stringify(next));
    this.settings$.next(next);
  }
}
