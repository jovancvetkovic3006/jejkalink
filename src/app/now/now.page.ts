import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AuthenticationService } from '../services/authentication.service';
import { SgsHistoryService, SgReading } from '../services/sgs-history.service';
import { EventsStore, AppEvent } from '../services/events-store.service';
import { CoverageStripComponent } from '../components/coverage-strip/coverage-strip.component';
import { StaleChipComponent } from '../components/stale-chip/stale-chip.component';
import { GlucoseChartComponent } from '../components/glucose-chart/glucose-chart.component';
import { detectGaps, CoverageResult } from '../analytics';
import {
  formatMmol,
  rangeBucket,
  rangeColorVar,
  rangeLabelSr,
} from '../domain/glucose';

@Component({
  selector: 'app-now-page',
  templateUrl: 'now.page.html',
  styleUrls: ['now.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    CoverageStripComponent,
    StaleChipComponent,
    GlucoseChartComponent,
  ],
})
export class NowPage implements OnInit, OnDestroy {
  private sub?: Subscription;
  private patientSub?: Subscription;
  readings: SgReading[] = [];
  events: AppEvent[] = [];
  value = '--';
  unit = 'mmol/L';
  trendLabel = 'Miran';
  trend = 0;
  rangeText = '';
  rangeColor = 'var(--teal)';
  minutesAgo: number | null = null;
  coverage: CoverageResult | null = null;
  sparkStart = 0;
  sparkEnd = 0;
  periodLabel = 'danas';

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

  private refresh() {
    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    this.coverage = detectGaps(this.readings, startOfDay, new Date(now));
    this.sparkEnd = now;
    this.sparkStart = now - 3 * 60 * 60 * 1000;

    const last = this.readings[this.readings.length - 1];
    if (!last) {
      this.value = '--';
      this.minutesAgo = null;
      return;
    }
    this.value = formatMmol(last.mmol);
    const bucket = rangeBucket(last.mmol);
    this.rangeText = rangeLabelSr(bucket);
    this.rangeColor = rangeColorVar(bucket);
    this.minutesAgo = (now - new Date(last.timestamp).getTime()) / 60000;

    const data = this.auth.patientData$.value;
    this.trend = data?.trend ?? 0;
    this.trendLabel =
      this.trend === -1 ? 'Pada' : this.trend === 1 ? 'Raste' : 'Miran';
  }
}
