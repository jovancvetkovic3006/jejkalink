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
  private static readonly RAW_KEY = 'carelink_raw_archive_v1';
  private static readonly RAW_LEGACY_KEY = 'carelink_raw_last';
  private static readonly MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
  private static readonly RAW_MAX_BLOBS = 48;
  private static readonly RAW_MAX_CHARS = 120_000;

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

  /** Upsert by patient + timestamp; CareLink may send overlapping windows. */
  merge(newSgs: { sg: number; timestamp: string }[]) {
    if (!newSgs?.length) return;

    const patientId =
      localStorage.getItem('patientUsername')?.trim() || 'default';
    const byKey = new Map<string, SgReading>();
    for (const e of this.allSgs$.value) {
      byKey.set(this.upsertKey(patientId, e.timestamp), e);
    }

    for (const e of newSgs) {
      if (!e?.sg || e.sg <= 0 || !e.timestamp) continue;
      byKey.set(this.upsertKey(patientId, e.timestamp), {
        sg: e.sg,
        mmol: toMmol(e.sg),
        timestamp: e.timestamp,
        utcOffsetMin: -new Date(e.timestamp).getTimezoneOffset(),
      });
    }

    const pruned = this.prune([...byKey.values()]);
    this.persist(pruned);
    this.allSgs$.next(pruned);
  }

  private upsertKey(patientId: string, timestamp: string): string {
    return `${patientId}|${timestamp}`;
  }

  saveRawResponse(body: unknown) {
    if (!this.appSettings.get().keepRaw) return;
    try {
      const str = typeof body === 'string' ? body : JSON.stringify(body);
      const blob = {
        fetchedAt: new Date().toISOString(),
        body: str.length > SgsHistoryService.RAW_MAX_CHARS
          ? str.slice(0, SgsHistoryService.RAW_MAX_CHARS)
          : str,
      };
      const archive = this.loadRawArchive();
      archive.unshift(blob);
      localStorage.setItem(
        SgsHistoryService.RAW_KEY,
        JSON.stringify(archive.slice(0, SgsHistoryService.RAW_MAX_BLOBS))
      );
    } catch {
      /* ignore */
    }
  }

  private loadRawArchive(): { fetchedAt: string; body: string }[] {
    try {
      const raw = localStorage.getItem(SgsHistoryService.RAW_KEY);
      if (raw) return JSON.parse(raw);
      const legacy = localStorage.getItem(SgsHistoryService.RAW_LEGACY_KEY);
      if (legacy) {
        return [{ fetchedAt: new Date().toISOString(), body: legacy }];
      }
      return [];
    } catch {
      return [];
    }
  }

  getRawArchive(): { fetchedAt: string; body: string }[] {
    return this.loadRawArchive();
  }

  /** Latest raw blob, if any. */
  getRawResponse(): string | null {
    const archive = this.loadRawArchive();
    return archive[0]?.body ?? null;
  }

  readings(): SgReading[] {
    return this.allSgs$.value;
  }

  /** Binary-search slice of sorted history for [start, end] inclusive. */
  readingsInRange(startMs: number, endMs: number): SgReading[] {
    const all = this.allSgs$.value;
    if (!all.length || endMs < startMs) return [];
    const lo = lowerBound(all, startMs);
    const hi = upperBound(all, endMs);
    if (lo >= hi) return [];
    return all.slice(lo, hi);
  }
}

function readingMs(r: SgReading): number {
  return new Date(r.timestamp).getTime();
}

function lowerBound(arr: SgReading[], t: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (readingMs(arr[mid]) < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBound(arr: SgReading[], t: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (readingMs(arr[mid]) <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
