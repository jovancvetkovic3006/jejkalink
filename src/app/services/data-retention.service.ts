import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  buildMonthlySummary,
  monthKeyForReading,
  MonthlyArchive,
} from '../analytics/archive';
import { SgReading } from './sgs-history.service';
import { AppSettingsService } from './app-settings.service';

export const HOT_RETENTION_DAYS = 90;
const ARCHIVES_KEY = 'monthly_archives_v1';
const ARCHIVE_META_KEY = 'archive_meta_v1';
const MAX_ARCHIVE_MONTHS = 36;

interface ArchiveMeta {
  lastArchiveAt: string | null;
  lastExportAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class DataRetentionService {
  /** Set when localStorage write fails (storage full). */
  public storageWarning$ = new BehaviorSubject<string | null>(null);

  constructor(private readonly appSettings: AppSettingsService) {}

  /** Call before dropping readings older than the hot window. */
  archiveRemovedReadings(removed: SgReading[], kept: SgReading[]) {
    if (!removed.length) return;

    const keptMonths = new Set(kept.map(monthKeyForReading));
    const byMonth = new Map<string, SgReading[]>();
    for (const r of removed) {
      const key = monthKeyForReading(r);
      const list = byMonth.get(key) || [];
      list.push(r);
      byMonth.set(key, list);
    }

    const existing = this.loadArchives();
    const byKey = new Map(existing.map((a) => [a.month, a]));
    let changed = false;
    const targets = {
      low: this.appSettings.get().targetLow,
      high: this.appSettings.get().targetHigh,
    };

    for (const [month, readings] of byMonth) {
      if (keptMonths.has(month)) continue;
      if (byKey.has(month)) continue;
      const summary = buildMonthlySummary(readings, month, targets);
      if (!summary) continue;
      byKey.set(month, summary);
      changed = true;
    }

    if (!changed) return;

    const merged = [...byKey.values()].sort((a, b) =>
      a.month.localeCompare(b.month)
    );
    this.persistArchives(merged.slice(-MAX_ARCHIVE_MONTHS));
    this.patchMeta({ lastArchiveAt: new Date().toISOString() });
  }

  loadArchives(): MonthlyArchive[] {
    try {
      const raw = localStorage.getItem(ARCHIVES_KEY);
      return raw ? (JSON.parse(raw) as MonthlyArchive[]) : [];
    } catch {
      return [];
    }
  }

  archiveCount(): number {
    return this.loadArchives().length;
  }

  lastArchiveLabel(): string {
    const meta = this.loadMeta();
    if (!meta.lastArchiveAt) return 'None yet';
    return new Date(meta.lastArchiveAt).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  lastExportLabel(): string {
    const meta = this.loadMeta();
    if (!meta.lastExportAt) return 'Never';
    return new Date(meta.lastExportAt).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  markExported() {
    this.patchMeta({ lastExportAt: new Date().toISOString() });
  }

  notifyStorageFull(context: string) {
    this.storageWarning$.next(
      `Storage full while saving ${context}. Export archive and consider turning off raw responses.`
    );
  }

  clearStorageWarning() {
    this.storageWarning$.next(null);
  }

  /** Approximate localStorage footprint (UTF-16 bytes). */
  estimateStorageBytes(): number {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const val = localStorage.getItem(key) ?? '';
        total += (key.length + val.length) * 2;
      }
    } catch {
      /* ignore */
    }
    return total;
  }

  formatStorageMb(): string {
    const mb = this.estimateStorageBytes() / (1024 * 1024);
    return mb < 0.1 ? '< 0.1 MB' : `${mb.toFixed(1)} MB`;
  }

  private loadMeta(): ArchiveMeta {
    try {
      const raw = localStorage.getItem(ARCHIVE_META_KEY);
      return raw
        ? JSON.parse(raw)
        : { lastArchiveAt: null, lastExportAt: null };
    } catch {
      return { lastArchiveAt: null, lastExportAt: null };
    }
  }

  private patchMeta(patch: Partial<ArchiveMeta>) {
    const next = { ...this.loadMeta(), ...patch };
    try {
      localStorage.setItem(ARCHIVE_META_KEY, JSON.stringify(next));
    } catch {
      this.notifyStorageFull('archive metadata');
    }
  }

  private persistArchives(list: MonthlyArchive[]) {
    try {
      localStorage.setItem(ARCHIVES_KEY, JSON.stringify(list));
    } catch {
      this.notifyStorageFull('monthly archive');
    }
  }
}
