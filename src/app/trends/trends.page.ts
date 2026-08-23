import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonSegment,
  IonSegmentButton,
  IonLabel,
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SgsHistoryService, SgReading } from '../services/sgs-history.service';
import { CoverageStripComponent } from '../components/coverage-strip/coverage-strip.component';
import { MetricGridComponent, MetricCell } from '../components/metric-grid/metric-grid.component';
import { GlucoseChartComponent } from '../components/glucose-chart/glucose-chart.component';
import { periodMetrics } from '../analytics';
import { HIGH, LOW, VERY_HIGH, VERY_LOW } from '../domain/glucose';

@Component({
  selector: 'app-trends-page',
  templateUrl: 'trends.page.html',
  styleUrls: ['trends.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    CoverageStripComponent,
    MetricGridComponent,
    GlucoseChartComponent,
  ],
})
export class TrendsPage implements OnInit, OnDestroy {
  private sub?: Subscription;
  readings: SgReading[] = [];
  days = 7;
  cells: MetricCell[] = [];
  coverage = null as ReturnType<typeof periodMetrics>['coverage'] | null;
  startMs = 0;
  endMs = 0;
  rangeBars: { label: string; pct: number; color: string }[] = [];
  weeklyRead =
    'Nedeljni pregled nije konfigurisan. Kada bude uključen, ovde će stajati opisni sažetak obrazaca — nikad predlog doze.';

  constructor(private readonly history: SgsHistoryService) {}

  ngOnInit() {
    this.sub = this.history.allSgs$.subscribe((sgs: SgReading[]) => {
      this.readings = sgs;
      this.refresh();
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  onPeriodChange(ev: CustomEvent) {
    this.days = Number(ev.detail.value) || 7;
    this.refresh();
  }

  private refresh() {
    const end = new Date();
    const start = new Date(end.getTime() - this.days * 24 * 60 * 60 * 1000);
    this.startMs = start.getTime();
    this.endMs = end.getTime();

    const m = periodMetrics(this.readings, start, end);
    const prevStart = new Date(start.getTime() - this.days * 24 * 60 * 60 * 1000);
    const prev = periodMetrics(this.readings, prevStart, start);
    this.coverage = m.coverage;

    const delta = (cur: number, old: number, higherIsBetter: boolean) => {
      const d = Math.round((cur - old) * 10) / 10;
      if (!old && !cur) return { delta: undefined as string | undefined, tone: 'muted' as const };
      const sign = d > 0 ? '+' : '';
      const better = higherIsBetter ? d >= 0 : d <= 0;
      return {
        delta: `${sign}${d}`,
        tone: (d === 0 ? 'muted' : better ? 'up' : 'down') as 'up' | 'down' | 'muted',
      };
    };

    const tirD = delta(m.tirPct, prev.tirPct, true);
    const gmiD = delta(m.gmi, prev.gmi, false);
    const meanD = delta(m.mean, prev.mean, false);
    const night =
      m.overnightTirPct != null
        ? delta(m.overnightTirPct, prev.overnightTirPct ?? 0, true)
        : { delta: undefined, tone: 'muted' as const };

    this.cells = [
      { key: 'GMI', value: `${m.gmiLabel}%`, delta: gmiD.delta, deltaTone: gmiD.tone },
      { key: 'CV', value: `${m.cvLabel}%` },
      { key: 'Prosek', value: m.meanLabel, delta: meanD.delta, deltaTone: meanD.tone },
      {
        key: 'Noćni TIR',
        value: m.overnightTirPct != null ? `${m.overnightTirPct}%` : '--',
        delta: night.delta,
        deltaTone: night.tone,
      },
      { key: 'U opsegu', value: `${m.tirPct}%`, delta: tirD.delta, deltaTone: tirD.tone },
      { key: 'Očitavanja', value: String(m.count) },
    ];

    const inPeriod = this.readings.filter((r) => {
      const t = new Date(r.timestamp).getTime();
      return t >= this.startMs && t <= this.endMs && r.mmol > 0;
    });
    const n = inPeriod.length || 1;
    const pct = (fn: (v: number) => boolean) =>
      Math.round((inPeriod.filter((r) => fn(r.mmol)).length / n) * 1000) / 10;

    this.rangeBars = [
      { label: 'Veoma niska', pct: pct((v) => v < VERY_LOW), color: 'var(--very-low)' },
      { label: 'Niska', pct: pct((v) => v >= VERY_LOW && v < LOW), color: 'var(--low)' },
      { label: 'U opsegu', pct: pct((v) => v >= LOW && v <= HIGH), color: 'var(--teal)' },
      { label: 'Visoka', pct: pct((v) => v > HIGH && v <= VERY_HIGH), color: 'var(--amber)' },
      { label: 'Veoma visoka', pct: pct((v) => v > VERY_HIGH), color: 'var(--very-high)' },
    ];
  }
}
