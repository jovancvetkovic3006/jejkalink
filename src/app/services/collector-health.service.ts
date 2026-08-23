import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CollectorHealthService {
  private static readonly FAIL_KEY = 'collector_failures';
  public failures$ = new BehaviorSubject<number>(this.loadFailures());

  private loadFailures(): number {
    return Number(localStorage.getItem(CollectorHealthService.FAIL_KEY) || 0);
  }

  recordFailure() {
    const n = this.loadFailures() + 1;
    localStorage.setItem(CollectorHealthService.FAIL_KEY, String(n));
    this.failures$.next(n);
  }

  recordSuccess() {
    if (this.loadFailures() > 0) {
      localStorage.setItem(CollectorHealthService.FAIL_KEY, '0');
      this.failures$.next(0);
    }
  }
}
