import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Annotation {
  id: string;
  timestamp: string;
  text: string;
}

/** Carepartner notes for weekly read / clinic context (descriptive only). */
@Injectable({ providedIn: 'root' })
export class AnnotationsStore {
  private static readonly KEY = 'annotations_v1';
  private static readonly MAX = 200;

  public annotations$ = new BehaviorSubject<Annotation[]>(this.load());

  private load(): Annotation[] {
    try {
      const raw = localStorage.getItem(AnnotationsStore.KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private persist(list: Annotation[]) {
    localStorage.setItem(AnnotationsStore.KEY, JSON.stringify(list.slice(0, AnnotationsStore.MAX)));
    this.annotations$.next(list.slice(0, AnnotationsStore.MAX));
  }

  add(text: string, timestamp = new Date().toISOString()) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const entry: Annotation = {
      id: `ann-${Date.now()}`,
      timestamp,
      text: trimmed.slice(0, 500),
    };
    this.persist([entry, ...this.load()]);
  }

  remove(id: string) {
    this.persist(this.load().filter((a) => a.id !== id));
  }

  inRange(startMs: number, endMs: number): Annotation[] {
    return this.load().filter((a) => {
      const t = new Date(a.timestamp).getTime();
      return t >= startMs && t <= endMs;
    });
  }
}
