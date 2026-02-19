import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

interface SgEntry {
  sg: number;
  timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class SgsHistoryService {
  private static readonly STORAGE_KEY = 'sgs_history';
  private static readonly MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

  public allSgs$ = new BehaviorSubject<SgEntry[]>(this.load());

  private load(): SgEntry[] {
    try {
      const raw = localStorage.getItem(SgsHistoryService.STORAGE_KEY);
      if (!raw) return [];
      const entries: SgEntry[] = JSON.parse(raw);
      return this.prune(entries);
    } catch {
      return [];
    }
  }

  private prune(entries: SgEntry[]): SgEntry[] {
    const cutoff = Date.now() - SgsHistoryService.MAX_AGE_MS;
    return entries.filter(e => new Date(e.timestamp).getTime() >= cutoff);
  }

  private persist(entries: SgEntry[]) {
    try {
      localStorage.setItem(SgsHistoryService.STORAGE_KEY, JSON.stringify(entries));
    } catch { /* storage full — silently fail */ }
  }

  /** Merge new SGS readings into the persisted history, dedup by timestamp */
  merge(newSgs: SgEntry[]) {
    if (!newSgs || newSgs.length === 0) return;

    const existing = this.load();
    const existingSet = new Set(existing.map(e => e.timestamp));

    const toAdd = newSgs.filter(
      e => e.sg > 0 && e.timestamp && !existingSet.has(e.timestamp)
    );

    const merged = [...existing, ...toAdd].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const pruned = this.prune(merged);
    this.persist(pruned);
    this.allSgs$.next(pruned);
  }
}
