import {
  Component,
  EventEmitter,
  HostBinding,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-event-row',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="wrap">
      <div class="row">
        <span class="t">{{ time }}</span>
        <span class="dot" [style.background]="dotColor"></span>
        <div class="body">
          <div class="h">{{ title }}</div>
          <div class="s" [class.empty]="!subtitle">{{ subtitle || '\u00a0' }}</div>
        </div>
        <span class="rt numeral" *ngIf="rightValue && !removable">{{ rightValue }}</span>
        <button
          *ngIf="removable"
          type="button"
          class="remove"
          (click)="removed.emit()"
          aria-label="Remove note"
        >
          ×
        </button>
      </div>
      <div class="tag-row" *ngIf="showAlarmTags">
        <button
          type="button"
          class="tag-btn"
          [class.on]="alarmTag === 'real'"
          (click)="alarmTagClick.emit('real')"
        >
          Real
        </button>
        <button
          type="button"
          class="tag-btn"
          [class.on]="alarmTag === 'false'"
          (click)="alarmTagClick.emit('false')"
        >
          False
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 56px;
        box-sizing: border-box;
        border-bottom: 1px solid var(--line);
      }
      :host(.tall) {
        min-height: 80px;
      }
      :host(:last-child) {
        border-bottom: 0;
      }
      .wrap {
        display: flex;
        flex-direction: column;
        justify-content: center;
        box-sizing: border-box;
        padding: 8px 0;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 11px;
        min-height: 0;
        flex: 0 0 auto;
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
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .s {
        font-size: var(--t-sub);
        color: var(--muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-height: 1.25em;
        line-height: 1.25;
      }
      .s.empty {
        visibility: hidden;
      }
      .rt {
        font-size: 12px;
        color: var(--ink);
        flex: 0 0 auto;
      }
      .remove {
        border: 0;
        background: transparent;
        color: var(--muted);
        font-size: 18px;
        line-height: 1;
        padding: 4px 2px;
        cursor: pointer;
        flex: 0 0 auto;
      }
      .tag-row {
        display: flex;
        gap: 6px;
        padding: 4px 0 0 64px;
        flex: 0 0 auto;
      }
      .tag-btn {
        font-family: var(--font-data);
        font-size: 10px;
        padding: 3px 8px;
        border-radius: 99px;
        border: 1px solid var(--line);
        background: var(--paper);
        color: var(--muted);
        cursor: pointer;
      }
      .tag-btn.on {
        border-color: var(--indigo-br);
        background: var(--indigo-bg);
        color: var(--indigo);
      }
    `,
  ],
})
export class EventRowComponent {
  @HostBinding('class.tall') get tall() {
    return this.showAlarmTags;
  }

  @Input() time = '';
  @Input() title = '';
  @Input() subtitle = '';
  @Input() rightValue = '';
  @Input() dotColor = 'var(--indigo)';
  @Input() removable = false;
  @Input() showAlarmTags = false;
  @Input() alarmTag: 'real' | 'false' | null = null;

  @Output() removed = new EventEmitter<void>();
  @Output() alarmTagClick = new EventEmitter<'real' | 'false'>();
}
