import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Mock-aligned page header: status row + tbar (title + who pill).
 * Matches design/cgm-companion-mockups.html `.status` + `.tbar`.
 */
@Component({
  selector: 'app-page-tbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="status">
      <span>{{ statusLeft || clock }}</span>
      <span>{{ statusRight }}</span>
    </div>
    <div class="tbar">
      <h2>{{ title }}</h2>
      <div
        class="who"
        *ngIf="pill"
        [class.interactive]="showBack || showForward"
        (click)="onPillClick($event)"
      >
        <button
          type="button"
          class="chev"
          *ngIf="showBack"
          (click)="back($event)"
          aria-label="Previous"
        >
          ‹
        </button>
        <span class="who-text">{{ pill }}</span>
        <button
          type="button"
          class="chev"
          *ngIf="showForward"
          (click)="forward($event)"
          [disabled]="forwardDisabled"
          aria-label="Next"
        >
          ›
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .status {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0 0;
        font-family: var(--font-data);
        font-size: 10.5px;
        color: var(--muted);
      }
      .tbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 10px 0 16px;
      }
      .tbar h2 {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: var(--t-title);
        letter-spacing: -0.02em;
        margin: 0;
        color: var(--ink);
      }
      .who {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-family: var(--font-data);
        font-size: 10.5px;
        color: var(--muted);
        border: 1px solid var(--line);
        border-radius: var(--r-pill);
        padding: 3px 9px;
        white-space: nowrap;
        max-width: 62%;
      }
      .who.interactive {
        padding: 2px 6px;
      }
      .who-text {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .chev {
        border: 0;
        background: transparent;
        color: var(--ink);
        font-size: 14px;
        line-height: 1;
        padding: 0 2px;
        cursor: pointer;
      }
      .chev:disabled {
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
  /** Optional: tap on who pill (e.g. cycle period). */
  @Input() onPill?: () => void;

  get clock(): string {
    return new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  back(ev: Event) {
    ev.stopPropagation();
    this.onBack?.();
  }

  forward(ev: Event) {
    ev.stopPropagation();
    this.onForward?.();
  }

  onPillClick(ev: Event) {
    if (!this.onPill) return;
    if ((ev.target as HTMLElement).closest('.chev')) return;
    this.onPill();
  }
}
