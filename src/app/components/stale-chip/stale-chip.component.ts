import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { STALE_URGENT_MIN, STALE_WARN_MIN } from '../../domain/glucose';
import { formatDurationSr } from '../../utils/duration-format.util';

@Component({
  selector: 'app-stale-chip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="chip" [ngClass]="tone">{{ label }}</span>
  `,
  styles: [
    `
      .chip {
        font-family: var(--font-data);
        font-size: 10.5px;
        padding: 4px 9px;
        border-radius: var(--r-pill);
        border: 1px solid var(--line);
        color: var(--muted);
        white-space: nowrap;
      }
      .chip.warn {
        border-color: #f0d9b4;
        background: #fdf7ee;
        color: var(--amber);
      }
      .chip.urgent {
        border-color: #f5c2d1;
        background: #fff5f8;
        color: var(--low);
      }
    `,
  ],
})
export class StaleChipComponent implements OnChanges {
  /** Minutes since last reading. */
  @Input() minutesAgo: number | null = null;

  label = '—';
  tone: 'ok' | 'warn' | 'urgent' = 'ok';

  ngOnChanges() {
    const m = this.minutesAgo;
    if (m == null || !Number.isFinite(m)) {
      this.label = 'nema podataka';
      this.tone = 'urgent';
      return;
    }
    const mins = Math.max(0, Math.floor(m));
    this.label = formatDurationSr(mins);
    if (mins >= STALE_URGENT_MIN) this.tone = 'urgent';
    else if (mins >= STALE_WARN_MIN) this.tone = 'warn';
    else this.tone = 'ok';
  }
}
