import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type AnnotationTag =
  | 'meal'
  | 'exercise'
  | 'illness'
  | 'stress'
  | 'site'
  | 'other';

export interface Annotation {
  id: string;
  timestamp: string;
  text: string;
  tag: AnnotationTag;
}

export const ANNOTATION_TAGS: { id: AnnotationTag; label: string }[] = [
  { id: 'meal', label: 'Meal' },
  { id: 'exercise', label: 'Exercise' },
  { id: 'illness', label: 'Illness' },
  { id: 'stress', label: 'Stress' },
  { id: 'site', label: 'Site change' },
  { id: 'other', label: 'Other' },
];

/** Carepartner notes for day log / clinic context (descriptive only). */
@Injectable({ providedIn: 'root' })
export class AnnotationsStore {
  private static readonly KEY = 'annotations_v1';
  private static readonly MAX = 200;

  public annotations$ = new BehaviorSubject<Annotation[]>(this.load());

  private load(): Annotation[] {
    try {
      const raw = localStorage.getItem(AnnotationsStore.KEY);
      const list: Annotation[] = raw ? JSON.parse(raw) : [];
      return list.map((a) => ({
        ...a,
        tag: a.tag || 'other',
      }));
    } catch {
      return [];
    }
  }

  private persist(list: Annotation[]) {
    localStorage.setItem(AnnotationsStore.KEY, JSON.stringify(list.slice(0, AnnotationsStore.MAX)));
    this.annotations$.next(list.slice(0, AnnotationsStore.MAX));
  }

  add(text: string, tag: AnnotationTag = 'other', timestamp = new Date().toISOString()) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const entry: Annotation = {
      id: `ann-${Date.now()}`,
      timestamp,
      text: trimmed.slice(0, 500),
      tag,
    };
    this.persist([entry, ...this.load()]);
  }

  remove(id: string) {
    this.persist(this.load().filter((a) => a.id !== id));
  }

  inRange(startMs: number, endMs: number): Annotation[] {
    return this.load()
      .filter((a) => {
        const t = new Date(a.timestamp).getTime();
        return t >= startMs && t <= endMs;
      })
      .sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
  }

  static tagLabel(tag: AnnotationTag): string {
    return ANNOTATION_TAGS.find((t) => t.id === tag)?.label || 'Note';
  }
}
