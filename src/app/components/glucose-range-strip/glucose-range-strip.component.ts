import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SgReading } from '../../services/sgs-history.service';
import { readingMmol } from '../../utils/chart-data.util';

interface RangeSeg {
  color: string;
  flex: number;
}

@Component({
  selector: 'app-glucose-range-strip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="wrap" *ngIf="segments.length">
      <div class="track">
        <i
          *ngFor="let s of segments"
          [style.flex]="s.flex"
          [style.background]="s.color"
        ></i>
      </div>
      <div class="meta">
        <span>{{ periodLabel }}</span>
        <span class="legend">
          <em class="ok">in range</em> · <em class="hi">high</em> · <em class="lo">low</em>
        </span>
      </div>
    </div>
  `,
  styles: [
    `
      .wrap {
        margin-top: 10px;
      }
      .track {
        display: flex;
        height: 5px;
        border-radius: 3px;
        overflow: hidden;
        background: var(--gap);
      }
      .track i {
        display: block;
        min-width: 2px;
        height: 100%;
      }
      .meta {
        display: flex;
        justify-content: space-between;
        margin-top: 6px;
        font-family: var(--font-data);
        font-size: 10px;
        color: var(--muted);
        gap: 8px;
      }
      .legend em {
        font-style: normal;
      }
      .legend .ok {
        color: var(--teal);
      }
      .legend .hi {
        color: var(--amber);
      }
      .legend .lo {
        color: var(--low);
      }
    `,
  ],
})
export class GlucoseRangeStripComponent implements OnChanges {
  @Input() readings: SgReading[] = [];
  @Input() periodStart = new Date();
  @Input() periodEnd = new Date();
  @Input() periodLabel = '';
  @Input() targetLow = 3.9;
  @Input() targetHigh = 10.0;

  segments: RangeSeg[] = [];

  ngOnChanges() {
    this.build();
  }

  private build() {
    const startMs = this.periodStart.getTime();
    const endMs = this.periodEnd.getTime();
    const span = Math.max(1, endMs - startMs);
    const bucketMs = Math.max(15 * 60 * 1000, Math.floor(span / 48));
    const buckets = new Map<number, number[]>();

    for (const r of this.readings) {
      const t = new Date(r.timestamp).getTime();
      if (t < startMs || t > endMs) continue;
      const mmol = readingMmol(r);
      if (mmol <= 0) continue;
      const slot = Math.floor((t - startMs) / bucketMs);
      const list = buckets.get(slot) || [];
      list.push(mmol);
      buckets.set(slot, list);
    }

    const slots = [...buckets.keys()].sort((a, b) => a - b);
    if (!slots.length) {
      this.segments = [];
      return;
    }

    const segs: RangeSeg[] = [];
    for (const slot of slots) {
      const vals = buckets.get(slot)!;
      const med = vals.sort((a, b) => a - b)[Math.floor(vals.length / 2)];
      let color = 'var(--teal)';
      if (med < this.targetLow) color = 'var(--low)';
      else if (med > this.targetHigh) color = 'var(--amber)';
      segs.push({ color, flex: 1 });
    }
    this.segments = segs;
  }
}
