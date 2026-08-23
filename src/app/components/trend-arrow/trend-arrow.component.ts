import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-trend-arrow',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="arrow">
      <svg
        width="26"
        height="26"
        viewBox="0 0 26 26"
        fill="none"
        [attr.stroke]="color"
        stroke-width="2.1"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path *ngIf="trend === 1" d="M4 16 L22 10" />
        <path *ngIf="trend === 1" d="M16 8.2 L22 10 L20.2 16" />
        <path *ngIf="trend === -1" d="M4 10 L22 16" />
        <path *ngIf="trend === -1" d="M16 18 L22 16 L20.2 10" />
        <path *ngIf="trend === 0" d="M4 13 L22 13" />
        <path *ngIf="trend === 0" d="M18 9 L22 13 L18 17" />
      </svg>
      <span *ngIf="slopeLabel">{{ slopeLabel }}</span>
    </div>
  `,
  styles: [
    `
      .arrow {
        text-align: right;
        padding-bottom: 3px;
      }
      svg {
        display: block;
        margin-left: auto;
      }
      span {
        font-family: var(--font-data);
        font-size: 11px;
        color: var(--muted);
        display: block;
        margin-top: 5px;
      }
    `,
  ],
})
export class TrendArrowComponent {
  @Input() trend = 0;
  @Input() slopePerMin: number | null = null;
  @Input() color = 'var(--teal)';

  get slopeLabel(): string {
    if (this.slopePerMin == null || !Number.isFinite(this.slopePerMin)) return '';
    const sign = this.slopePerMin > 0 ? '+' : '';
    return `${sign}${this.slopePerMin.toFixed(2)} /min`;
  }
}
