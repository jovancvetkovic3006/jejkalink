import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoverageResult } from '../../analytics';

@Component({
  selector: 'app-coverage-strip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="cov">
      <div class="track">
        <i
          *ngFor="let s of display.segments"
          [class.on]="s.covered"
          [style.flex]="segmentFlex(s)"
        ></i>
      </div>
      <div class="meta">
        <span>{{ periodLabel }}</span>
        <span>
          <em *ngIf="display.gapCount > 0" class="warn">{{ gapPart }}</em>
          <ng-container *ngIf="display.gapCount > 0"> · </ng-container>
          {{ display.coveragePct }}%
        </span>
      </div>
    </div>
  `,
  styles: [
    `
      .cov {
        margin-top: 12px;
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
        height: 100%;
        min-width: 0;
      }
      .track i.on {
        background: var(--teal);
      }
      .meta {
        display: flex;
        justify-content: space-between;
        margin-top: 6px;
        font-family: var(--font-data);
        font-size: 10px;
        color: var(--muted);
      }
      .meta em {
        font-style: normal;
      }
      .meta em.warn {
        color: var(--low);
      }
    `,
  ],
})
export class CoverageStripComponent {
  @Input() coverage: CoverageResult | null = null;
  @Input() periodLabel = '';
  @Input() periodStart?: Date;
  @Input() periodEnd?: Date;

  get display(): CoverageResult {
    if (this.coverage) return this.coverage;
    const start = this.periodStart || new Date();
    const end = this.periodEnd || start;
    const ms = Math.max(1, end.getTime() - start.getTime());
    return {
      segments: [{ from: start, to: end, covered: false }],
      coveredMs: 0,
      gapMs: ms,
      gapCount: 1,
      coveragePct: 0,
      period: [start, end],
    };
  }

  get gapPart(): string {
    const gapMin = Math.round(this.display.gapMs / 60000);
    return `${this.display.gapCount} praznina · ${gapMin} min`;
  }

  segmentFlex(s: { from: Date; to: Date }): number {
    const total =
      this.display.period[1].getTime() - this.display.period[0].getTime() || 1;
    return Math.max(0.5, s.to.getTime() - s.from.getTime()) / total;
  }
}
