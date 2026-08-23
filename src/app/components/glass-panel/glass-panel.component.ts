import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-glass-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="glass-wrap"
      [class.glass-empty]="empty"
      [class.glass-loading]="loading"
    >
      <div class="glass-content" [class.dimmed]="empty || loading">
        <ng-content></ng-content>
      </div>
      <div class="glass-overlay" *ngIf="empty || loading">
        <div class="glass-shimmer" *ngIf="loading"></div>
        <span class="glass-msg">{{ message }}</span>
      </div>
    </div>
  `,
  styles: [
    `
      .glass-wrap {
        position: relative;
        border-radius: inherit;
      }
      .glass-content.dimmed {
        filter: blur(5px);
        opacity: 0.45;
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
        background: rgba(246, 247, 249, 0.55);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(227, 231, 237, 0.8);
        z-index: 2;
      }
      .glass-msg {
        font-family: var(--font-data);
        font-size: 11px;
        color: var(--muted);
        padding: 8px 12px;
        text-align: center;
        max-width: 90%;
        line-height: 1.4;
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
  @Input() empty = false;
  @Input() loading = false;
  @Input() message = 'Još nema podataka';
}
