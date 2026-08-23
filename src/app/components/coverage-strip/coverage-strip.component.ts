import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoverageResult, formatCoverageCaptionSr } from '../../analytics';

@Component({
  selector: 'app-coverage-strip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="cov" *ngIf="coverage">
      <div class="track">
        <i
          *ngFor="let s of coverage.segments"
          [class.on]="s.covered"
          [style.flex]="segmentFlex(s)"
        ></i>
      </div>
      <div class="meta">
        <span>{{ periodLabel }}</span>
        <em [class.warn]="coverage.gapCount > 0">{{ caption }}</em>
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

  get caption(): string {
    return this.coverage ? formatCoverageCaptionSr(this.coverage) : '';
  }

  segmentFlex(s: { from: Date; to: Date }): number {
    if (!this.coverage) return 1;
    const total =
      this.coverage.period[1].getTime() - this.coverage.period[0].getTime() || 1;
    return Math.max(0.5, s.to.getTime() - s.from.getTime()) / total;
  }
}
