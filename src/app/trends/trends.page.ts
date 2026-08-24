import { Component, OnDestroy, OnInit } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { SgsHistoryService, SgReading } from '../services/sgs-history.service';
import { AppSettingsService } from '../services/app-settings.service';
import { CoverageStripComponent } from '../components/coverage-strip/coverage-strip.component';
import { MetricGridComponent, MetricCell } from '../components/metric-grid/metric-grid.component';
import { AgpChartComponent } from '../components/agp-chart/agp-chart.component';
import { PageTbarComponent } from '../components/page-tbar/page-tbar.component';
import { GlassPanelComponent } from '../components/glass-panel/glass-panel.component';
import { agpBuckets, periodMetrics } from '../analytics';
import { VERY_HIGH, VERY_LOW } from '../domain/glucose';
import { TabSwipeDirective } from '../directives/tab-swipe.directive';

const PERIODS = [7, 14, 30, 90] as const;

@Component({
  selector: 'app-trends-page',
  templateUrl: 'trends.page.html',
  styleUrls: ['trends.page.scss'],
  imports: [
    CommonModule,
    IonContent,
    CoverageStripComponent,
    MetricGridComponent,
    AgpChartComponent,
    PageTbarComponent,
    GlassPanelComponent,
    TabSwipeDirective,
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
  periodPill = '14 days';
  coveragePeriodLabel = '';
  agpPlaceholder = false;
  displayCells: MetricCell[] = [];
  metricsPlaceholder = false;
  targetLow = 3.9;
  targetHigh = 10.0;
  weeklyReadP1 =
    'Weekly read is not configured. When enabled, a descriptive pattern summary will appear here.';
  weeklyReadP2 =
    'Never a dose suggestion — description and one clinic question only.';
  weeklyReadQ =
    'A clinic question will appear here when the weekly read is active.';

  constructor(
    private readonly history: SgsHistoryService,
    private readonly appSettings: AppSettingsService
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

  cyclePeriod = () => {
    const i = PERIODS.indexOf(this.days as (typeof PERIODS)[number]);
    this.days = PERIODS[(i + 1) % PERIODS.length];
    this.refresh();
  };

  private refresh() {
    const s = this.appSettings.get();
    this.targetLow = s.targetLow;
    this.targetHigh = s.targetHigh;

    const end = new Date();
    const start = new Date(end.getTime() - this.days * 24 * 60 * 60 * 1000);
    this.periodStart = start;
    this.periodEnd = end;
    this.periodPill = `${this.days} days`;
    this.coveragePeriodLabel = `${fmtShort(start)} — ${fmtShort(end)}`;

    const m = periodMetrics(this.readings, start, end);
    const prevStart = new Date(start.getTime() - this.days * 24 * 60 * 60 * 1000);
    const prev = periodMetrics(this.readings, prevStart, start);
    this.coverage = m.coverage;
    this.metricsEmpty = m.count === 0;
    this.agpBuckets = agpBuckets(this.readings, start, end);
    this.agpPlaceholder = this.agpBuckets.length === 0;

    const delta = (cur: number, old: number, higherIsBetter: boolean) => {
      const d = Math.round((cur - old) * 10) / 10;
      if (!old && !cur)
        return { delta: undefined as string | undefined, tone: 'muted' as const };
      const sign = d > 0 ? '+' : '';
      const better = higherIsBetter ? d >= 0 : d <= 0;
      return {
        delta: `${sign}${d} vs prev`,
        tone: (d === 0 ? 'muted' : better ? 'up' : 'down') as 'up' | 'down' | 'muted',
      };
    };

    const gmiD = delta(m.gmi, prev.gmi, false);
    const meanD = delta(m.mean, prev.mean, false);

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
        delta: m.cv < 36 ? 'stable · under 36' : 'above 36%',
        deltaTone: m.cv < 36 ? 'up' : 'down',
      },
      {
        key: 'Mean',
        value: m.meanLabel,
        delta: meanD.delta,
        deltaTone: meanD.tone,
      },
      {
        key: 'Overnight TIR',
        value: m.overnightTirPct != null ? String(m.overnightTirPct) : '--',
        valueSuffix: m.overnightTirPct != null ? '%' : undefined,
        delta: '00:00–06:00',
        deltaTone: 'muted',
      },
    ];

    const placeholderCells: MetricCell[] = [
      {
        key: 'GMI',
        value: '7.2',
        valueSuffix: '%',
        delta: '−0.2 vs prev',
        deltaTone: 'up',
      },
      {
        key: 'CV',
        value: '34',
        valueSuffix: '%',
        delta: 'stable · under 36',
        deltaTone: 'up',
      },
      {
        key: 'Mean',
        value: '8.1',
        delta: '+0.4 vs prev',
        deltaTone: 'down',
      },
      {
        key: 'Overnight TIR',
        value: '79',
        valueSuffix: '%',
        delta: '00:00–06:00',
        deltaTone: 'muted',
      },
    ];

    this.metricsPlaceholder = this.metricsEmpty;
    this.displayCells = this.metricsPlaceholder ? placeholderCells : this.cells;

    const low = this.targetLow;
    const high = this.targetHigh;
    const inPeriod = this.readings.filter((r) => {
      const t = new Date(r.timestamp).getTime();
      return t >= start.getTime() && t <= end.getTime() && r.mmol > 0;
    });
    const n = inPeriod.length || 1;
    const pct = (fn: (v: number) => boolean) =>
      Math.round((inPeriod.filter((r) => fn(r.mmol)).length / n) * 1000) / 10;

    this.rangeBars = [
      {
        label: 'Very low · under 3.0',
        pct: pct((v) => v < VERY_LOW),
        color: 'var(--very-low)',
      },
      {
        label: `Low · 3.0–${low.toFixed(1)}`,
        pct: pct((v) => v >= VERY_LOW && v < low),
        color: 'var(--low)',
      },
      {
        label: `In range · ${low.toFixed(1)}–${high.toFixed(1)}`,
        pct: pct((v) => v >= low && v <= high),
        color: 'var(--teal)',
      },
      {
        label: `High · ${high.toFixed(1)}–13.9`,
        pct: pct((v) => v > high && v <= VERY_HIGH),
        color: 'var(--amber)',
      },
      {
        label: 'Very high · over 13.9',
        pct: pct((v) => v > VERY_HIGH),
        color: 'var(--very-high)',
      },
    ];
  }
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
