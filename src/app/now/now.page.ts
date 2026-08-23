import { Component, OnDestroy, OnInit } from '@angular/core';
import { IonContent, IonRefresher, IonRefresherContent } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AuthenticationService } from '../services/authentication.service';
import { SgsHistoryService, SgReading } from '../services/sgs-history.service';
import { EventsStore, AppEvent } from '../services/events-store.service';
import { CoverageStripComponent } from '../components/coverage-strip/coverage-strip.component';
import { StaleChipComponent } from '../components/stale-chip/stale-chip.component';
import { GlucoseChartComponent, BolusMark } from '../components/glucose-chart/glucose-chart.component';
import { ScreenHeaderComponent } from '../components/screen-header/screen-header.component';
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
    ScreenHeaderComponent,
    TrendArrowComponent,
    EventRowComponent,
    GlassPanelComponent,
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
    this.eventsStore.events$.subscribe((e) => (this.events = e.slice(0, 8)));
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

  private refresh() {
    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    this.dayStart = startOfDay;
    this.dayEnd = new Date(now);
    this.coverage = detectGaps(this.readings, startOfDay, new Date(now));
    this.sparkEnd = now;
    this.sparkStart = now - 3 * 60 * 60 * 1000;
    this.pollStatus = `provereno ${new Date().toLocaleTimeString('sr-Latn-RS', { hour: '2-digit', minute: '2-digit' })}`;

    const data = this.auth.patientData$.value;
    this.trend = data?.trend ?? 0;
    this.whoPill = this.buildWhoPill(data);

    const last = this.readings[this.readings.length - 1];
    if (!last) {
      this.value = '--';
      this.hasReading = false;
      this.minutesAgo = null;
      this.projectionChip = '';
      this.slopePerMin = null;
      return;
    }

    this.hasReading = true;
    this.value = formatMmol(last.mmol);
    const bucket = rangeBucket(last.mmol);
    this.rangeText = rangeLabelSr(bucket);
    this.rangeColor = rangeColorVar(bucket);
    this.trendColor = rangeColorVar(bucket);
    this.minutesAgo = (now - new Date(last.timestamp).getTime()) / 60000;

    this.slopePerMin = slopePerMin(this.readings);
    const projected = projectMmol(last.mmol, this.slopePerMin, 15);
    this.projectionChip =
      projected != null
        ? `Projekcija ${formatMmol(projected)} za 15 min`
        : '';
  }

  private buildWhoPill(data: any): string {
    try {
      const raw = localStorage.getItem('userInfo');
      const user = raw ? JSON.parse(raw) : null;
      const name =
        user?.name?.split(' ')[0] ||
        data?.senzor?.[0]?.text ||
        localStorage.getItem('patientUsername') ||
        '';
      const pump =
        data?.pump?.[0]?.text?.includes('Pumpica')
          ? 'pumpica'
          : 'CareLink';
      return name ? `${name} · ${pump}` : pump;
    } catch {
      return '';
    }
  }
}
