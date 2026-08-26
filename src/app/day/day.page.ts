import { Component, OnDestroy, OnInit } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { combineLatest, Subscription } from 'rxjs';
import { SgsHistoryService, SgReading } from '../services/sgs-history.service';
import { EventsStore, AppEvent } from '../services/events-store.service';
import {
  AnnotationsStore,
  AnnotationTag,
  ANNOTATION_TAGS,
} from '../services/annotations-store.service';
import { AppSettingsService } from '../services/app-settings.service';
import { CoverageStripComponent } from '../components/coverage-strip/coverage-strip.component';
import { MetricGridComponent, MetricCell } from '../components/metric-grid/metric-grid.component';
import { GlucoseChartComponent, BolusMark } from '../components/glucose-chart/glucose-chart.component';
import { PageTbarComponent } from '../components/page-tbar/page-tbar.component';
import { EventRowComponent } from '../components/event-row/event-row.component';
import { GlassPanelComponent } from '../components/glass-panel/glass-panel.component';
import { periodMetrics, isUnusualDay } from '../analytics';
import { placeholderDayReadings } from '../utils/placeholder-data.util';
import {
  effectiveChartWindow,
  formatReadingScrubLabel,
} from '../utils/chart-window.util';
import { TabSwipeDirective } from '../directives/tab-swipe.directive';
import { formatCarelinkClock } from '../utils/carelink-time.util';

const PLACEHOLDER_DAY_EVENTS: AppEvent[] = [
  {
    id: 'ph-d1',
    kind: 'bolus',
    timestamp: new Date().toISOString(),
    label: 'Bolus 6.1 u · 62 g',
    detail: 'Dinner',
  },
  {
    id: 'ph-d2',
    kind: 'alarm',
    timestamp: new Date().toISOString(),
    label: 'Low 3.6 · treated',
    detail: 'Recovered',
  },
  {
    id: 'ph-d3',
    kind: 'gap',
    timestamp: new Date().toISOString(),
    label: 'Signal lost',
    detail: '14:02–14:40 · 00:38',
  },
];

@Component({
  selector: 'app-day-page',
  templateUrl: 'day.page.html',
  styleUrls: ['day.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    CoverageStripComponent,
    MetricGridComponent,
    GlucoseChartComponent,
    PageTbarComponent,
    EventRowComponent,
    GlassPanelComponent,
    TabSwipeDirective,
  ],
})
export class DayPage implements OnInit, OnDestroy {
  private sub?: Subscription;
  private syncingGaps = false;
  readings: SgReading[] = [];
  dayEvents: AppEvent[] = [];
  dayOffset = 0;
  datePill = '';
  dateStatus = '';
  chartTitle = 'Glucose';
  chartLabel = '';
  chartStartMs = 0;
  chartEndMs = 0;
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
  targetLow = 3.9;
  targetHigh = 10.0;
  noteText = '';
  noteTag: AnnotationTag = 'other';
  tagOptions = ANNOTATION_TAGS;

  constructor(
    private readonly history: SgsHistoryService,
    private readonly eventsStore: EventsStore,
    private readonly annotations: AnnotationsStore,
    private readonly appSettings: AppSettingsService
  ) {}

  ngOnInit() {
    this.sub = combineLatest([
      this.history.allSgs$,
      this.eventsStore.events$,
      this.annotations.annotations$,
    ]).subscribe(() => {
      // syncGapsForRange emits events$ — skip re-entry while that write is in flight.
      if (this.syncingGaps) return;
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

  selectTag(tag: AnnotationTag) {
    this.noteTag = tag;
  }

  addNote() {
    if (!this.noteText.trim()) return;
    const ts = new Date(this.endMs);
    ts.setHours(12, 0, 0, 0);
    if (this.dayOffset === 0) {
      ts.setTime(Math.min(Date.now(), this.endMs));
    }
    this.annotations.add(this.noteText, this.noteTag, ts.toISOString());
    this.noteText = '';
    this.refresh();
  }

  removeNote(id: string) {
    this.annotations.remove(id);
    this.refresh();
  }

  eventTime(e: AppEvent): string {
    return formatCarelinkClock(e.timestamp);
  }

  eventDot(e: AppEvent): string {
    return EventsStore.dotColor(e.kind);
  }

  eventRight(e: AppEvent): string {
    if (e.kind === 'gap' || e.kind === 'note') return '—';
    const r = this.chartReadings.find(
      (x) =>
        Math.abs(new Date(x.timestamp).getTime() - new Date(e.timestamp).getTime()) <
        5 * 60 * 1000
    );
    return r ? r.mmol.toFixed(1) : '';
  }

  isNote(e: AppEvent): boolean {
    return e.kind === 'note';
  }

  noteId(e: AppEvent): string {
    return e.id.replace(/^note-/, '');
  }

  trackEvent = (_: number, e: AppEvent) => e.id;

  private refresh() {
    const s = this.appSettings.get();
    this.targetLow = s.targetLow;
    this.targetHigh = s.targetHigh;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + this.dayOffset);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    this.startMs = start.getTime();
    this.endMs = end.getTime();
    this.periodStart = start;
    this.periodEnd = end;
    /** Charts must not paint gaps into the future for “today”. */
    const chartWindowEnd =
      this.dayOffset === 0 ? Math.min(this.endMs, Date.now()) : this.endMs;
    const daySpanMs = chartWindowEnd - this.startMs;
    const window = effectiveChartWindow(
      this.history.readings(),
      this.startMs,
      chartWindowEnd,
      Math.max(daySpanMs, 60 * 60 * 1000)
    );
    this.chartStartMs = window.startMs;
    this.chartEndMs = window.endMs;
    this.datePill = start.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });
    this.chartTitle =
      this.dayOffset === 0 ? 'Today · glucose' : `${this.datePill} · glucose`;

    const inDay = this.history.readingsInRange(this.startMs, this.endMs);

    this.chartPlaceholder = inDay.length === 0;
    this.chartReadings = this.chartPlaceholder
      ? placeholderDayReadings(this.chartStartMs, this.chartEndMs)
      : inDay;

    const lastInDay = inDay[inDay.length - 1];
    this.chartLabel = lastInDay ? formatReadingScrubLabel(lastInDay) : this.chartTitle;

    const m = periodMetrics(inDay, start, end, {
      low: this.targetLow,
      high: this.targetHigh,
    });
    this.coverage = m.coverage;
    this.metricsEmpty = m.count === 0;

    let status = this.datePill;
    if (s.flagUnusualDays && !this.metricsEmpty) {
      const lookback = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
      const periodReadings = this.history.readingsInRange(
        lookback.getTime(),
        end.getTime()
      );
      const periodM = periodMetrics(periodReadings, lookback, end, {
        low: this.targetLow,
        high: this.targetHigh,
      });
      if (isUnusualDay(m, periodM)) {
        status = `${this.datePill} · unusual`;
      }
    }
    this.dateStatus = status;

    const rangeLabel = `${this.targetLow.toFixed(1)}–${this.targetHigh.toFixed(1)}`;
    const placeholderCells: MetricCell[] = [
      { key: 'In range', value: '72', valueSuffix: '%', delta: rangeLabel },
      { key: 'Mean', value: '6.4', delta: 'mmol/L' },
      {
        key: `Below ${this.targetLow.toFixed(1)}`,
        value: '4',
        valueSuffix: '%',
        valueColor: 'var(--low)',
        delta: '0.6% under 3.0',
        deltaTone: 'down',
      },
      {
        key: `Above ${this.targetHigh.toFixed(1)}`,
        value: '25',
        valueSuffix: '%',
        valueColor: 'var(--amber)',
        delta: '3% over 13.9',
        deltaTone: 'down',
      },
    ];

    this.cells = [
      {
        key: 'In range',
        value: String(m.tirPct),
        valueSuffix: '%',
        delta: rangeLabel,
      },
      { key: 'Mean', value: m.meanLabel, delta: 'mmol/L' },
      {
        key: `Below ${this.targetLow.toFixed(1)}`,
        value: String(m.belowPct),
        valueSuffix: '%',
        valueColor: 'var(--low)',
        delta: `${m.veryLowPct}% under 3.0`,
        deltaTone: 'down',
      },
      {
        key: `Above ${this.targetHigh.toFixed(1)}`,
        value: String(m.abovePct),
        valueSuffix: '%',
        valueColor: 'var(--amber)',
        delta: `${m.veryHighPct}% over 13.9`,
        deltaTone: 'down',
      },
    ];

    this.metricsPlaceholder = this.metricsEmpty;
    this.displayCells = this.metricsPlaceholder ? placeholderCells : this.cells;

    this.boluses = this.eventsStore
      .bolusesInRange(this.startMs, this.endMs)
      .map((b) => ({ timestamp: b.timestamp, units: b.units || 0 }));

    if (!this.chartPlaceholder) {
      this.syncingGaps = true;
      try {
        this.eventsStore.syncGapsForRange(inDay, this.startMs, this.endMs);
      } finally {
        this.syncingGaps = false;
      }
    }

    const notes: AppEvent[] = this.annotations.inRange(this.startMs, this.endMs).map(
      (a) => ({
        id: `note-${a.id}`,
        kind: 'note' as const,
        timestamp: a.timestamp,
        label: AnnotationsStore.tagLabel(a.tag),
        detail: a.text,
      })
    );

    this.dayEvents = [
      ...this.eventsStore.eventsInRange(this.startMs, this.endMs),
      ...notes,
    ].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    this.eventsPlaceholder = this.dayEvents.length === 0;
    this.displayEvents = this.eventsPlaceholder ? PLACEHOLDER_DAY_EVENTS : this.dayEvents;
  }
}
