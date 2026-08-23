import { Component, OnDestroy, OnInit } from '@angular/core';
import { IonContent, IonSegment, IonSegmentButton, IonLabel } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SgsHistoryService, SgReading } from '../services/sgs-history.service';
import { CoverageStripComponent } from '../components/coverage-strip/coverage-strip.component';
import { MetricGridComponent, MetricCell } from '../components/metric-grid/metric-grid.component';
import { AgpChartComponent } from '../components/agp-chart/agp-chart.component';
import { ScreenHeaderComponent } from '../components/screen-header/screen-header.component';
import { agpBuckets, periodMetrics } from '../analytics';
import { HIGH, LOW, VERY_HIGH, VERY_LOW } from '../domain/glucose';

@Component({
  selector: 'app-trends-page',
  templateUrl: 'trends.page.html',
  styleUrls: ['trends.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    CoverageStripComponent,
    MetricGridComponent,
    AgpChartComponent,
    ScreenHeaderComponent,
  ],
})
export class TrendsPage implements OnInit, OnDestroy {
  private sub?: Subscription;
  readings: SgReading[] = [];
  days = 14;
  cells: MetricCell[] = [];
  coverage = null as ReturnType<typeof periodMetrics>['coverage'] | null;
  periodStart = new Date();
  periodEnd = new Date();
  agpBuckets: ReturnType<typeof agpBuckets> = [];
  rangeBars: { label: string; pct: number; color: string }[] = [];
  metricsEmpty = true;
  periodPill = '14 dana';
  weeklyReadP1 =
    'Nedeljni pregled nije konfigurisan. Kada bude uključen, ovde će stajati opisni sažetak obrazaca.';
  weeklyReadP2 = 'Nikad predlog doze — samo opis i jedno pitanje za kliniku.';
  weeklyReadQ =
    'Pitanje za kliniku će se pojaviti ovde kada pregled bude aktivan.';

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
    this.periodStart = start;
    this.periodEnd = end;
    this.periodPill = `${this.days} dana`;

    const m = periodMetrics(this.readings, start, end);
    const prevStart = new Date(start.getTime() - this.days * 24 * 60 * 60 * 1000);
    const prev = periodMetrics(this.readings, prevStart, start);
    this.coverage = m.coverage;
    this.metricsEmpty = m.count === 0;
    this.agpBuckets = agpBuckets(this.readings, start, end);

    const delta = (cur: number, old: number, higherIsBetter: boolean) => {
      const d = Math.round((cur - old) * 10) / 10;
      if (!old && !cur) return { delta: undefined as string | undefined, tone: 'muted' as const };
      const sign = d > 0 ? '+' : '';
      const better = higherIsBetter ? d >= 0 : d <= 0;
      return {
        delta: `${sign}${d} u odnosu na prethodni`,
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
      {
        key: 'GMI',
        value: m.gmiLabel,
        valueSuffix: '%',
        delta: gmiD.delta,
        deltaTone: gmiD.tone,
      },
      {
        key: 'CV',
        value: m.cvLabel,
        valueSuffix: '%',
        delta: m.cv < 36 ? 'ispod 36%' : 'iznad 36%',
        deltaTone: m.cv < 36 ? 'up' : 'down',
      },
      {
        key: 'Prosek',
        value: m.meanLabel,
        delta: meanD.delta,
        deltaTone: meanD.tone,
      },
      {
        key: 'Noćni TIR',
        value: m.overnightTirPct != null ? String(m.overnightTirPct) : '--',
        valueSuffix: m.overnightTirPct != null ? '%' : undefined,
        delta: night.delta || '00:00–06:00',
        deltaTone: night.tone,
      },
      {
        key: 'U opsegu',
        value: String(m.tirPct),
        valueSuffix: '%',
        delta: tirD.delta,
        deltaTone: tirD.tone,
      },
      {
        key: 'Očitavanja',
        value: String(m.count),
      },
    ];

    const inPeriod = this.readings.filter((r) => {
      const t = new Date(r.timestamp).getTime();
      return t >= start.getTime() && t <= end.getTime() && r.mmol > 0;
    });
    const n = inPeriod.length || 1;
    const pct = (fn: (v: number) => boolean) =>
      Math.round((inPeriod.filter((r) => fn(r.mmol)).length / n) * 1000) / 10;

    this.rangeBars = [
      { label: 'Veoma niska · ispod 3.0', pct: pct((v) => v < VERY_LOW), color: 'var(--very-low)' },
      { label: 'Niska · 3.0–3.9', pct: pct((v) => v >= VERY_LOW && v < LOW), color: 'var(--low)' },
      { label: 'U opsegu · 3.9–10.0', pct: pct((v) => v >= LOW && v <= HIGH), color: 'var(--teal)' },
      { label: 'Visoka · 10.0–13.9', pct: pct((v) => v > HIGH && v <= VERY_HIGH), color: 'var(--amber)' },
      { label: 'Veoma visoka · preko 13.9', pct: pct((v) => v > VERY_HIGH), color: 'var(--very-high)' },
    ];
  }
}
