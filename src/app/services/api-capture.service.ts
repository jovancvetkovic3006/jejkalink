import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ApiCaptureEntry {
  ts: number;
  label: string;
  body: string;
}

@Injectable({ providedIn: 'root' })
export class ApiCaptureService {
  private static readonly KEY = 'api_capture_v1';
  private static readonly MAX = 24;
  private static readonly MAX_CHARS = 80_000;

  public captures$ = new BehaviorSubject<ApiCaptureEntry[]>(this.load());

  record(label: string, payload: unknown) {
    try {
      const body =
        typeof payload === 'string'
          ? payload
          : JSON.stringify(payload, null, 0);
      const trimmed =
        body.length > ApiCaptureService.MAX_CHARS
          ? body.slice(0, ApiCaptureService.MAX_CHARS) + '…'
          : body;
      const entry: ApiCaptureEntry = {
        ts: Date.now(),
        label,
        body: trimmed,
      };
      const next = [entry, ...this.load()].slice(0, ApiCaptureService.MAX);
      localStorage.setItem(ApiCaptureService.KEY, JSON.stringify(next));
      this.captures$.next(next);
    } catch {
      /* ignore */
    }
  }

  load(): ApiCaptureEntry[] {
    try {
      const raw = localStorage.getItem(ApiCaptureService.KEY);
      return raw ? (JSON.parse(raw) as ApiCaptureEntry[]) : [];
    } catch {
      return [];
    }
  }

  clear() {
    localStorage.removeItem(ApiCaptureService.KEY);
    this.captures$.next([]);
  }

  formatForEmail(): string {
    return this.load()
      .map((e) => {
        const when = new Date(e.ts).toLocaleString('en-GB');
        return `--- ${when} · ${e.label} ---\n${e.body}`;
      })
      .join('\n\n');
  }
}
