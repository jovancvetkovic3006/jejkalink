import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-glass-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="glass-wrap"
      [class.glass-placeholder]="placeholder"
      [class.glass-loading]="loading"
    >
      <div class="glass-content" [class.dimmed]="placeholder || loading">
        <ng-content></ng-content>
      </div>
      <div class="glass-overlay" *ngIf="placeholder">
        <span class="glass-msg">{{ message || 'No data yet' }}</span>
      </div>
      <div class="glass-shimmer-layer" *ngIf="loading">
        <div class="glass-shimmer"></div>
      </div>
    </div>
  `,
  styles: [
    `
      .glass-wrap {
        position: relative;
        border-radius: inherit;
        min-height: inherit;
      }
      .glass-content.dimmed {
        filter: blur(2.5px);
        opacity: 0.72;
        pointer-events: none;
        user-select: none;
      }
      .glass-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: inherit;
        background: rgba(246, 247, 249, 0.18);
        pointer-events: none;
        z-index: 2;
      }
      .glass-msg {
        font-family: var(--font-data);
        font-size: 11px;
        color: var(--ink);
        padding: 6px 12px;
        background: rgba(255, 255, 255, 0.92);
        border-radius: var(--r-pill);
        border: 1px solid var(--line);
        box-shadow: 0 1px 2px rgba(21, 33, 59, 0.06);
      }
      .glass-shimmer-layer {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        overflow: hidden;
        pointer-events: none;
      }
      .glass-shimmer {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          105deg,
          transparent 40%,
          rgba(255, 255, 255, 0.35) 50%,
          transparent 60%
        );
        animation: shimmer 1.6s ease-in-out infinite;
      }
      @keyframes shimmer {
        from {
          transform: translateX(-100%);
        }
        to {
          transform: translateX(100%);
        }
      }
    `,
  ],
})
export class GlassPanelComponent {
  /** Show blurred placeholder content underneath (content should be mock data). */
  @Input() placeholder = false;
  @Input() loading = false;
  @Input() message = 'No data yet';
  /** Kept for callers; message always shows when placeholder is true. */
  @Input() showMessage = true;
}
