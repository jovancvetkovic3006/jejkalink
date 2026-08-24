import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { collectorPollCoverage, PollEvent } from '../analytics/collector-coverage';

@Injectable({ providedIn: 'root' })
export class CollectorHealthService {
  private static readonly FAIL_KEY = 'collector_failures';
  private static readonly LAST_OK_KEY = 'collector_last_ok_ms';
  private static readonly POLL_LOG_KEY = 'collector_poll_log_v1';
  private static readonly MAX_POLL_EVENTS = 4000;

  public failures$ = new BehaviorSubject<number>(this.loadFailures());
  public lastOkAt$ = new BehaviorSubject<number | null>(this.loadLastOk());
  public pollEvents$ = new BehaviorSubject<PollEvent[]>(this.loadPollLog());

  private loadFailures(): number {
    return Number(localStorage.getItem(CollectorHealthService.FAIL_KEY) || 0);
  }

  private loadLastOk(): number | null {
    const raw = localStorage.getItem(CollectorHealthService.LAST_OK_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  private loadPollLog(): PollEvent[] {
    try {
      const raw = localStorage.getItem(CollectorHealthService.POLL_LOG_KEY);
      if (!raw) return [];
      const list = JSON.parse(raw) as PollEvent[];
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      return list.filter((e) => e.ts >= cutoff);
    } catch {
      return [];
    }
  }

  private appendPollEvent(ok: boolean) {
    const list = [...this.loadPollLog(), { ts: Date.now(), ok }];
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const pruned = list.filter((e) => e.ts >= cutoff).slice(-CollectorHealthService.MAX_POLL_EVENTS);
    localStorage.setItem(CollectorHealthService.POLL_LOG_KEY, JSON.stringify(pruned));
    this.pollEvents$.next(pruned);
  }

  recordFailure() {
    this.appendPollEvent(false);
    const n = this.loadFailures() + 1;
    localStorage.setItem(CollectorHealthService.FAIL_KEY, String(n));
    this.failures$.next(n);
    return n;
  }

  recordSuccess() {
    this.appendPollEvent(true);
    const now = Date.now();
    localStorage.setItem(CollectorHealthService.LAST_OK_KEY, String(now));
    this.lastOkAt$.next(now);
    if (this.loadFailures() > 0) {
      localStorage.setItem(CollectorHealthService.FAIL_KEY, '0');
      this.failures$.next(0);
    }
  }

  setFailures(n: number) {
    const v = Math.max(0, Math.floor(n));
    localStorage.setItem(CollectorHealthService.FAIL_KEY, String(v));
    this.failures$.next(v);
  }

  minutesSinceLastOk(): number | null {
    const t = this.lastOkAt$.value;
    if (t == null) return null;
    return (Date.now() - t) / 60000;
  }

  uptimeCoverage(start: Date, end: Date, intervalMin = 5) {
    return collectorPollCoverage(this.pollEvents$.value, start, end, intervalMin);
  }
}
