import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-page-tbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-top" *ngIf="statusLeft || statusRight">
      <span>{{ statusLeft }}</span>
      <span>{{ statusRight }}</span>
    </div>
    <div class="tbar">
      <h2>{{ title }}</h2>
      <div class="tbar-end">
        <button
          type="button"
          class="nav-btn"
          *ngIf="showBack"
          (click)="onBack?.()"
          aria-label="Prethodni"
        >
          ‹
        </button>
        <div class="who" *ngIf="pill">{{ pill }}</div>
        <button
          type="button"
          class="nav-btn"
          *ngIf="showForward"
          (click)="onForward?.()"
          [disabled]="forwardDisabled"
          aria-label="Sledeći"
        >
          ›
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .page-top {
        display: flex;
        justify-content: space-between;
        padding: 12px 0 0;
        font-family: var(--font-data);
        font-size: 10.5px;
        color: var(--muted);
      }
      .tbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }
      .tbar h2 {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: var(--t-title);
        letter-spacing: -0.02em;
        margin: 0;
        color: var(--ink);
      }
      .tbar-end {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .who {
        font-family: var(--font-data);
        font-size: 10.5px;
        color: var(--muted);
        border: 1px solid var(--line);
        border-radius: var(--r-pill);
        padding: 3px 9px;
        white-space: nowrap;
      }
      .nav-btn {
        width: 28px;
        height: 28px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--surface);
        color: var(--ink);
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
      }
      .nav-btn:disabled {
        opacity: 0.35;
      }
    `,
  ],
})
export class PageTbarComponent {
  @Input() title = '';
  @Input() pill = '';
  @Input() statusLeft = '';
  @Input() statusRight = '';
  @Input() showBack = false;
  @Input() showForward = false;
  @Input() forwardDisabled = false;
  @Input() onBack?: () => void;
  @Input() onForward?: () => void;
}
