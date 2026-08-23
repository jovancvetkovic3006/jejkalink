import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { toMmol } from '../domain/glucose';
import { AppSettingsService } from './app-settings.service';

export interface SgReading {
  /** Original CareLink mg/dL (if known). */
  sg?: number;
  /** mmol/L — converted once at the boundary. */
  mmol: number;
  timestamp: string;
  /** Local UTC offset minutes at capture time, if known. */
  utcOffsetMin?: number;
}

@Injectable({ providedIn: 'root' })
export class SgsHistoryService {
  private static readonly STORAGE_KEY = 'sgs_history_v2';
  private static readonly LEGACY_KEY = 'sgs_history';
  private static readonly RAW_KEY = 'carelink_raw_last';
  private static readonly MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
  private static readonly RAW_MAX_CHARS = 400_000;

  public allSgs$ = new BehaviorSubject<SgReading[]>(this.load());

  constructor(private readonly appSettings: AppSettingsService) {}

  private load(): SgReading[] {
    try {
      const raw = localStorage.getItem(SgsHistoryService.STORAGE_KEY);
      if (raw) {
        return this.prune(JSON.parse(raw) as SgReading[]);
      }
      return this.migrateLegacy();
    } catch {
      return [];
    }
  }

  private migrateLegacy(): SgReading[] {
    try {
      const legacy = localStorage.getItem(SgsHistoryService.LEGACY_KEY);
      if (!legacy) return [];
      const entries: { sg: number; timestamp: string }[] = JSON.parse(legacy);
      const migrated: SgReading[] = entries
        .filter((e) => e.sg > 0 && e.timestamp)
        .map((e) => ({
          sg: e.sg,
          mmol: toMmol(e.sg),
          timestamp: e.timestamp,
          utcOffsetMin: -new Date(e.timestamp).getTimezoneOffset(),
        }));
      const pruned = this.prune(migrated);
      this.persist(pruned);
      return pruned;
    } catch {
      return [];
    }
  }

  private prune(entries: SgReading[]): SgReading[] {
    const cutoff = Date.now() - SgsHistoryService.MAX_AGE_MS;
    return entries
      .filter((e) => e.mmol > 0 && e.timestamp && new Date(e.timestamp).getTime() >= cutoff)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  private persist(entries: SgReading[]) {
    try {
      localStorage.setItem(SgsHistoryService.STORAGE_KEY, JSON.stringify(entries));
    } catch {
      /* storage full */
    }
  }

  /** Upsert by timestamp; CareLink may send overlapping windows. */
  merge(newSgs: { sg: number; timestamp: string }[]) {
    if (!newSgs?.length) return;

    const byTs = new Map<string, SgReading>();
    for (const e of this.load()) {
      byTs.set(e.timestamp, e);
    }

    for (const e of newSgs) {
      if (!e?.sg || e.sg <= 0 || !e.timestamp) continue;
      byTs.set(e.timestamp, {
        sg: e.sg,
        mmol: toMmol(e.sg),
        timestamp: e.timestamp,
        utcOffsetMin: -new Date(e.timestamp).getTimezoneOffset(),
      });
    }

    const pruned = this.prune([...byTs.values()]);
    this.persist(pruned);
    this.allSgs$.next(pruned);
  }

  saveRawResponse(body: unknown) {
    if (!this.appSettings.get().keepRaw) return;
    try {
      const str = typeof body === 'string' ? body : JSON.stringify(body);
      if (str.length > SgsHistoryService.RAW_MAX_CHARS) {
        localStorage.setItem(
          SgsHistoryService.RAW_KEY,
          str.slice(0, SgsHistoryService.RAW_MAX_CHARS)
        );
      } else {
        localStorage.setItem(SgsHistoryService.RAW_KEY, str);
      }
    } catch {
      /* ignore */
    }
  }

  getRawResponse(): string | null {
    return localStorage.getItem(SgsHistoryService.RAW_KEY);
  }

  readings(): SgReading[] {
    return this.allSgs$.value;
  }
}
