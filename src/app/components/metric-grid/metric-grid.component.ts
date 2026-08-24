import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GlassPanelComponent } from '../glass-panel/glass-panel.component';

export interface MetricCell {
  key: string;
  value: string;
  valueSuffix?: string;
  valueColor?: string;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'muted';
}

@Component({
  selector: 'app-metric-grid',
  standalone: true,
  imports: [CommonModule, GlassPanelComponent],
  template: `
    <app-glass-panel [placeholder]="placeholder || empty" [message]="emptyMessage">
      <div class="mgrid">
        <div class="m" *ngFor="let cell of cells">
          <div class="k">{{ cell.key }}</div>
          <div class="v numeral" [style.color]="cell.valueColor">
            {{ cell.value
            }}<span class="suf" *ngIf="cell.valueSuffix">{{ cell.valueSuffix }}</span>
          </div>
          <div
            class="d"
            *ngIf="cell.delta"
            [class.up]="cell.deltaTone === 'up'"
            [class.down]="cell.deltaTone === 'down'"
          >
            {{ cell.delta }}
          </div>
        </div>
      </div>
    </app-glass-panel>
  `,
  styles: [
    `
      .mgrid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1px;
        background: var(--line);
        border: 1px solid var(--line);
        border-radius: var(--r-card);
        overflow: hidden;
        margin-bottom: 12px;
      }
      .m {
        background: var(--surface);
        padding: 11px 12px;
      }
      .k {
        font-family: var(--font-data);
        font-size: 9.5px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .v {
        font-family: var(--font-data);
        font-weight: 600;
        font-size: var(--t-metric);
        margin-top: 3px;
        color: var(--ink);
      }
      .suf {
        font-size: 13px;
      }
      .d {
        font-family: var(--font-data);
        font-size: 10px;
        margin-top: 2px;
        color: var(--muted);
      }
      .up {
        color: var(--teal);
      }
      .down {
        color: var(--low);
      }
    `,
  ],
})
export class MetricGridComponent {
  @Input() cells: MetricCell[] = [];
  @Input() empty = false;
  @Input() placeholder = false;
  @Input() emptyMessage = 'No data yet';
}
