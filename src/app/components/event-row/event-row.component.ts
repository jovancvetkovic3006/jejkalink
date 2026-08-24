import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-event-row',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="row">
      <span class="t">{{ time }}</span>
      <span class="dot" [style.background]="dotColor"></span>
      <div class="body">
        <div class="h">{{ title }}</div>
        <div class="s" *ngIf="subtitle">{{ subtitle }}</div>
      </div>
      <span class="rt numeral" *ngIf="rightValue">{{ rightValue }}</span>
    </div>
  `,
  styles: [
    `
      .row {
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 14px 0;
        border-bottom: 1px solid var(--line);
      }
      .row:last-child {
        border-bottom: 0;
        padding-bottom: 4px;
      }
      .row:first-child {
        padding-top: 4px;
      }
      .t {
        font-family: var(--font-data);
        font-size: 11px;
        color: var(--muted);
        width: 46px;
        flex: 0 0 46px;
      }
      .dot {
        width: 7px;
        height: 7px;
        border-radius: 99px;
        flex: 0 0 7px;
      }
      .body {
        flex: 1;
        min-width: 0;
      }
      .h {
        font-size: var(--t-row);
        font-weight: 500;
      }
      .s {
        font-size: var(--t-sub);
        color: var(--muted);
      }
      .rt {
        font-size: 12px;
        color: var(--ink);
      }
    `,
  ],
})
export class EventRowComponent {
  @Input() time = '';
  @Input() title = '';
  @Input() subtitle = '';
  @Input() rightValue = '';
  @Input() dotColor = 'var(--indigo)';
}
