import { Component, OnDestroy, OnInit } from '@angular/core';
import { IonContent, IonRefresher, IonRefresherContent } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AuthenticationService } from '../services/authentication.service';
import { SgsHistoryService, SgReading } from '../services/sgs-history.service';
import { EventsStore, AppEvent } from '../services/events-store.service';
import { CoverageStripComponent } from '../components/coverage-strip/coverage-strip.component';
import { StaleChipComponent } from '../components/stale-chip/stale-chip.component';
import { GlucoseChartComponent } from '../components/glucose-chart/glucose-chart.component';
import { PageTbarComponent } from '../components/page-tbar/page-tbar.component';
import { TrendArrowComponent } from '../components/trend-arrow/trend-arrow.component';
import { EventRowComponent } from '../components/event-row/event-row.component';
import { GlassPanelComponent } from '../components/glass-panel/glass-panel.component';
import { detectGaps, CoverageResult } from '../analytics';
import {
  formatMmol,
  rangeBucket,
  rangeColorVar,
  rangeLabelSr,
} from '../domain/glucose';
import { slopePerMin, projectMmol } from '../utils/glucose-slope.util';
import { placeholderSparklineReadings } from '../utils/placeholder-data.util';
import { TabSwipeDirective } from '../directives/tab-swipe.directive';

const PLACEHOLDER_EVENTS: AppEvent[] = [
  {
    id: 'ph-1',
    kind: 'bolus',
    timestamp: new Date().toISOString(),
    label: 'Bolus 4.2 j',
    detail: '45 g · doručak',
  },
  {
    id: 'ph-2',
    kind: 'sync',
    timestamp: new Date().toISOString(),
    label: 'Senzor sinhronizovan',
    detail: 'Rezervoar 118 j',
  },
  {
    id: 'ph-3',
    kind: 'alarm',
    timestamp: new Date().toISOString(),
    label: 'Niska 3.7',
    detail: 'Oporavak za 22 min',
  },
];

@Component({
  selector: 'app-now-page',
  templateUrl: 'now.page.html',
  styleUrls: ['now.page.scss'],
  imports: [
    CommonModule,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    CoverageStripComponent,
    StaleChipComponent,
    GlucoseChartComponent,
    PageTbarComponent,
    TrendArrowComponent,
    EventRowComponent,
    GlassPanelComponent,
    TabSwipeDirective,
  ],
})
export class NowPage implements OnInit, OnDestroy {
  private sub?: Subscription;
  private patientSub?: Subscription;
  readings: SgReading[] = [];
  events: AppEvent[] = [];
  value = '--';
  hasReading = false;
  unit = 'mmol/L';
  trend = 0;
  rangeText = '';
  rangeColor = 'var(--teal)';
  trendColor = 'var(--teal)';
  minutesAgo: number | null = null;
  coverage: CoverageResult | null = null;
  sparkStart = 0;
  sparkEnd = 0;
  periodLabel = 'Pokriće danas';
  whoPill = '';
  pollStatus = '';
  projectionChip = '';
  slopePerMin: number | null = null;
  dayStart = new Date();
  dayEnd = new Date();
  sparkReadings: SgReading[] = [];
  sparkPlaceholder = false;
  displayEvents: AppEvent[] = [];
  eventsPlaceholder = false;
  heroPlaceholder = false;

  constructor(
    public auth: AuthenticationService,
    private readonly history: SgsHistoryService,
    private readonly eventsStore: EventsStore
  ) {}

  ngOnInit() {
    this.sub = this.history.allSgs$.subscribe((sgs: SgReading[]) => {
      this.readings = sgs;
      this.refresh();
    });
    this.patientSub = this.auth.patientData$.subscribe(() => this.refresh());
    this.eventsStore.events$.subscribe((e) => {
      this.events = e.slice(0, 8);
      this.syncEventsDisplay();
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.patientSub?.unsubscribe();
  }

  doRefresh(ev: CustomEvent) {
    this.auth.doRefresh(ev);
  }

  eventTime(e: AppEvent): string {
    return new Date(e.timestamp).toLocaleTimeString('sr-Latn-RS', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  eventDot(e: AppEvent): string {
    return EventsStore.dotColor(e.kind);
  }

  private syncEventsDisplay() {
    this.eventsPlaceholder = this.events.length === 0;
    this.displayEvents = this.eventsPlaceholder ? PLACEHOLDER_EVENTS : this.events;
  }

  private refresh() {
    const nowMs = Date.now();
    const now = new Date(nowMs);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    this.dayStart = startOfDay;
    this.dayEnd = now;
    this.coverage = detectGaps(this.readings, startOfDay, now);
    this.sparkEnd = nowMs;
    this.sparkStart = nowMs - 3 * 60 * 60 * 1000;
    this.pollStatus = `provereno ${formatDurationPoll(now)}`;

    this.sparkPlaceholder = this.readings.length === 0;
    this.sparkReadings = this.sparkPlaceholder
      ? placeholderSparklineReadings(this.sparkStart, this.sparkEnd)
      : this.readings;

    const data = this.auth.patientData$.value;
    this.trend = data?.trend ?? 0;
    this.whoPill = this.buildWhoPill(data);

    const last = this.readings[this.readings.length - 1];
    if (!last) {
      this.hasReading = false;
      this.heroPlaceholder = true;
      this.value = '6.4';
      this.rangeText = rangeLabelSr('in-range');
      this.rangeColor = rangeColorVar('in-range');
      this.trendColor = 'var(--teal)';
      this.minutesAgo = 4;
      this.projectionChip = 'Projekcija 6.0 za 15 min';
      this.slopePerMin = -0.04;
      return;
    }

    this.hasReading = true;
    this.heroPlaceholder = false;
    this.value = formatMmol(last.mmol);
    const bucket = rangeBucket(last.mmol);
    this.rangeText = rangeLabelSr(bucket);
    this.rangeColor = rangeColorVar(bucket);
    this.trendColor = rangeColorVar(bucket);
    this.minutesAgo = (nowMs - new Date(last.timestamp).getTime()) / 60000;

    this.slopePerMin = slopePerMin(this.readings);
    const projected = projectMmol(last.mmol, this.slopePerMin, 15);
    this.projectionChip =
      projected != null ? `Projekcija ${formatMmol(projected)} za 15 min` : '';
  }

  private buildWhoPill(data: any): string {
    try {
      const raw = localStorage.getItem('userInfo');
      const user = raw ? JSON.parse(raw) : null;
      const name =
        user?.name?.split(' ')[0] ||
        localStorage.getItem('patientUsername') ||
        '';
      const pump = data?.pumpModel || '780G';
      return name ? `${name} · ${pump}` : pump;
    } catch {
      return '';
    }
  }
}

function formatDurationPoll(now: Date): string {
  return now.toLocaleTimeString('sr-Latn-RS', { hour: '2-digit', minute: '2-digit' });
}
