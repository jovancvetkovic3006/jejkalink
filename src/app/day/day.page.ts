import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonButtons,
  IonIcon,
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { SgsHistoryService, SgReading } from '../services/sgs-history.service';
import { EventsStore, AppEvent } from '../services/events-store.service';
import { CoverageStripComponent } from '../components/coverage-strip/coverage-strip.component';
import { MetricGridComponent, MetricCell } from '../components/metric-grid/metric-grid.component';
import { GlucoseChartComponent } from '../components/glucose-chart/glucose-chart.component';
import { periodMetrics } from '../analytics';

@Component({
  selector: 'app-day-page',
  templateUrl: 'day.page.html',
  styleUrls: ['day.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonButtons,
    IonIcon,
    CoverageStripComponent,
    MetricGridComponent,
    GlucoseChartComponent,
  ],
})
export class DayPage implements OnInit, OnDestroy {
  private sub?: Subscription;
  readings: SgReading[] = [];
  dayEvents: AppEvent[] = [];
  dayOffset = 0;
  title = '';
  startMs = 0;
  endMs = 0;
  cells: MetricCell[] = [];
  coverage = null as ReturnType<typeof periodMetrics>['coverage'] | null;

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

  private refresh() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + this.dayOffset);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    this.startMs = start.getTime();
    this.endMs = end.getTime();
    this.title = start.toLocaleDateString('sr-Latn-RS', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });

    const m = periodMetrics(this.readings, start, end);
    this.coverage = m.coverage;
    this.cells = [
      { key: 'U opsegu', value: `${m.tirPct}%` },
      { key: 'Prosek', value: m.meanLabel },
      {
        key: 'Ispod 3.9',
        value: `${m.belowPct}%`,
        delta: m.veryLowPct ? `ispod 3.0: ${m.veryLowPct}%` : undefined,
        deltaTone: 'down',
      },
      {
        key: 'Iznad 10.0',
        value: `${m.abovePct}%`,
        delta: m.veryHighPct ? `preko 13.9: ${m.veryHighPct}%` : undefined,
        deltaTone: 'down',
      },
    ];

    this.dayEvents = this.eventsStore.events$.value.filter((e) => {
      const t = new Date(e.timestamp).getTime();
      return t >= this.startMs && t <= this.endMs;
    });
  }
}
