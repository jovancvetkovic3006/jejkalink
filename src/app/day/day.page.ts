import { Component, OnDestroy, OnInit } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { SgsHistoryService, SgReading } from '../services/sgs-history.service';
import { EventsStore, AppEvent } from '../services/events-store.service';
import { CoverageStripComponent } from '../components/coverage-strip/coverage-strip.component';
import { MetricGridComponent, MetricCell } from '../components/metric-grid/metric-grid.component';
import { GlucoseChartComponent, BolusMark } from '../components/glucose-chart/glucose-chart.component';
import { PageTbarComponent } from '../components/page-tbar/page-tbar.component';
import { EventRowComponent } from '../components/event-row/event-row.component';
import { GlassPanelComponent } from '../components/glass-panel/glass-panel.component';
import { periodMetrics } from '../analytics';
import { placeholderDayReadings } from '../utils/placeholder-data.util';

const PLACEHOLDER_DAY_EVENTS: AppEvent[] = [
  {
    id: 'ph-d1',
    kind: 'bolus',
    timestamp: new Date().toISOString(),
    label: 'Bolus 3.8 j',
    detail: 'doručak',
  },
  {
    id: 'ph-d2',
    kind: 'sensor',
    timestamp: new Date().toISOString(),
    label: 'Obrok 45 g',
    detail: '08:12',
  },
  {
    id: 'ph-d3',
    kind: 'gap',
    timestamp: new Date().toISOString(),
    label: 'Gubitak veze',
    detail: '14 min',
  },
];

const PLACEHOLDER_DAY_CELLS: MetricCell[] = [
  { key: 'U opsegu', value: '72', valueSuffix: '%', delta: '3.9–10.0' },
  { key: 'Prosek', value: '6.4', delta: 'mmol/L' },
  {
    key: 'Ispod 3.9',
    value: '4',
    valueSuffix: '%',
    valueColor: 'var(--low)',
    delta: '1% ispod 3.0',
    deltaTone: 'down',
  },
  {
    key: 'Iznad 10.0',
    value: '18',
    valueSuffix: '%',
    valueColor: 'var(--amber)',
    delta: '3% preko 13.9',
    deltaTone: 'down',
  },
];

@Component({
  selector: 'app-day-page',
  templateUrl: 'day.page.html',
  styleUrls: ['day.page.scss'],
  imports: [
    CommonModule,
    IonContent,
    CoverageStripComponent,
    MetricGridComponent,
    GlucoseChartComponent,
    PageTbarComponent,
    EventRowComponent,
    GlassPanelComponent,
  ],
})
export class DayPage implements OnInit, OnDestroy {
  private sub?: Subscription;
  readings: SgReading[] = [];
  dayEvents: AppEvent[] = [];
  dayOffset = 0;
  datePill = '';
  startMs = 0;
  endMs = 0;
  periodStart = new Date();
  periodEnd = new Date();
  cells: MetricCell[] = [];
  coverage = null as ReturnType<typeof periodMetrics>['coverage'] | null;
  boluses: BolusMark[] = [];
  metricsEmpty = true;
  chartReadings: SgReading[] = [];
  chartPlaceholder = false;
  displayEvents: AppEvent[] = [];
  eventsPlaceholder = false;
  displayCells: MetricCell[] = [];
  metricsPlaceholder = false;

  constructor(
    private readonly history: SgsHistoryService,
    private readonly eventsStore: EventsStore
  ) {}

  ngOnInit() {
    this.sub = this.history.allSgs$.subscribe((sgs: SgReading[]) => {
      this.readings = sgs;
      this.refresh();
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  prevDay() {
    this.dayOffset--;
    this.refresh();
  }

  nextDay() {
    if (this.dayOffset < 0) {
      this.dayOffset++;
      this.refresh();
    }
  }

  onPrev = () => this.prevDay();
  onNext = () => this.nextDay();

  eventTime(e: AppEvent): string {
    return new Date(e.timestamp).toLocaleTimeString('sr-Latn-RS', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  eventDot(e: AppEvent): string {
    return EventsStore.dotColor(e.kind);
  }

  eventRight(e: AppEvent): string {
    if (e.kind === 'gap') return '—';
    const r = this.chartReadings.find(
      (x) =>
        Math.abs(new Date(x.timestamp).getTime() - new Date(e.timestamp).getTime()) <
        5 * 60 * 1000
    );
    return r ? r.mmol.toFixed(1) : '';
  }

  private refresh() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + this.dayOffset);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    this.startMs = start.getTime();
    this.endMs = end.getTime();
    this.periodStart = start;
    this.periodEnd = end;
    this.datePill = start.toLocaleDateString('sr-Latn-RS', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });

    const inDay = this.readings.filter((r) => {
      const t = new Date(r.timestamp).getTime();
      return t >= this.startMs && t <= this.endMs;
    });

    this.chartPlaceholder = inDay.length === 0;
    this.chartReadings = this.chartPlaceholder
      ? placeholderDayReadings(this.startMs, this.endMs)
      : inDay;

    const m = periodMetrics(this.readings, start, end);
    this.coverage = m.coverage;
    this.metricsEmpty = m.count === 0;
    this.cells = [
      {
        key: 'U opsegu',
        value: String(m.tirPct),
        valueSuffix: '%',
        delta: '3.9–10.0',
      },
      {
        key: 'Prosek',
        value: m.meanLabel,
        delta: 'mmol/L',
      },
      {
        key: 'Ispod 3.9',
        value: String(m.belowPct),
        valueSuffix: '%',
        valueColor: 'var(--low)',
        delta: m.veryLowPct ? `${m.veryLowPct}% ispod 3.0` : undefined,
        deltaTone: 'down',
      },
      {
        key: 'Iznad 10.0',
        value: String(m.abovePct),
        valueSuffix: '%',
        valueColor: 'var(--amber)',
        delta: m.veryHighPct ? `${m.veryHighPct}% preko 13.9` : undefined,
        deltaTone: 'down',
      },
    ];

    this.metricsPlaceholder = this.metricsEmpty;
    this.displayCells = this.metricsPlaceholder ? PLACEHOLDER_DAY_CELLS : this.cells;

    this.boluses = this.eventsStore
      .bolusesInRange(this.startMs, this.endMs)
      .map((b) => ({ timestamp: b.timestamp, units: b.units || 0 }));

    this.dayEvents = this.eventsStore.events$.value.filter((e) => {
      const t = new Date(e.timestamp).getTime();
      return t >= this.startMs && t <= this.endMs;
    });
    this.eventsPlaceholder = this.dayEvents.length === 0;
    this.displayEvents = this.eventsPlaceholder ? PLACEHOLDER_DAY_EVENTS : this.dayEvents;
  }
}
