import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CollectorHealthService {
  private static readonly FAIL_KEY = 'collector_failures';
  private static readonly LAST_OK_KEY = 'collector_last_ok_ms';

  public failures$ = new BehaviorSubject<number>(this.loadFailures());
  public lastOkAt$ = new BehaviorSubject<number | null>(this.loadLastOk());

  private loadFailures(): number {
    return Number(localStorage.getItem(CollectorHealthService.FAIL_KEY) || 0);
  }

  private loadLastOk(): number | null {
    const raw = localStorage.getItem(CollectorHealthService.LAST_OK_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  recordFailure() {
    const n = this.loadFailures() + 1;
    localStorage.setItem(CollectorHealthService.FAIL_KEY, String(n));
    this.failures$.next(n);
  }

  recordSuccess() {
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
}
