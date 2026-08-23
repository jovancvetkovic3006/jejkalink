import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  AfterViewInit,
} from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
} from '@ionic/angular/standalone';
import { AuthenticationService } from '../services/authentication.service';
import { SgsHistoryService } from '../services/sgs-history.service';
import { NgChartsModule } from 'ng2-charts';
import { Chart, ChartData, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { downsampleSgPoints, readingMmol } from '../utils/chart-data.util';
import { HIGH, LOW } from '../domain/glucose';

Chart.register(annotationPlugin);

/** Serbian (Latin) — app UI language */
const SR_LOCALE = 'sr-Latn-RS';

const dayLabelPlugin = {
  id: 'dayLabels',
  afterDraw(chart: any) {
    const timestamps: Date[] = chart.config.options?._timestamps;
    if (!timestamps || timestamps.length === 0) return;
    const xScale = chart.scales['x'];
    const ctx = chart.ctx;
    if (!xScale || !ctx) return;

    const bottom = chart.chartArea.bottom;
    const left = chart.chartArea.left;
    const right = chart.chartArea.right;
    let lastDay = -1;

    for (const dt of timestamps) {
      const h = dt.getHours();
      const m = dt.getMinutes();
      if (h !== 0 || m >= 5) continue;
      if (dt.getDate() === lastDay) continue;
      lastDay = dt.getDate();

      const x = xScale.getPixelForValue(dt.getTime());
      if (x < left || x > right) continue;

      const label = `${dt.getDate()} ${dt.toLocaleDateString(SR_LOCALE, { month: 'short' })}.`;

      ctx.save();
      ctx.font = 'bold 11px sans-serif';
      const textW = ctx.measureText(label).width;
      const pad = 4;
      const boxW = textW + pad * 2;
      const boxH = 16;
      const bx = x + 4;
      const by = bottom + 4;

      ctx.fillStyle = 'rgba(33, 120, 210, 0.9)';
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 3);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'top';
      ctx.fillText(label, bx + pad, by + 2);
      ctx.restore();
    }
  },
};
Chart.register(dayLabelPlugin);

const LOW_THRESHOLD = LOW;
const HIGH_THRESHOLD = HIGH;

@Component({
  selector: 'app-chart-tab',
  templateUrl: 'chart.page.html',
  styleUrls: ['chart.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonSpinner,
    NgChartsModule,
    CommonModule,
  ],
})
export class ChartPage implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild(BaseChartDirective) chartDirective?: BaseChartDirective;
  @ViewChild('chartScroll') chartScrollRef?: ElementRef<HTMLDivElement>;

  private subscription?: Subscription;
  private scrollRaf = 0;
  private periodScrollLock = 0;
  private sortedSgs: { sg?: number; mmol?: number; timestamp: string }[] = [];
  private historyStartMs = 0;
  private historyEndMs = 0;
  private viewStartMs = 0;
  private viewEndMs = 0;

  patientData$ = this.authService.patientData$;
  allSgs: any[] = [];
  isLandscape = false;
  isLoading = false;

  /** Horizontal scroll track width (px). */
  totalScrollWidth = 0;
  viewportWidth = 0;
  periodSummary = '';
  /** Fixed window length in hours (12h default). */
  activeWindowHours: number | null = 12;
  sortedSgsCount = 0;

  readonly windowPresets = [
    { label: '12h', hours: 12 },
    { label: '24h', hours: 24 },
    { label: '6h', hours: 6 },
  ];

  private windowMs = 12 * 60 * 60 * 1000;

  private static readonly MS_PER_HOUR = 60 * 60 * 1000;
  private static readonly MS_PER_DAY = 24 * ChartPage.MS_PER_HOUR;
  /** Scroll track: px per hour of pannable timeline. */
  private static readonly PIXELS_PER_HOUR = 56;
  private static readonly MAX_CHART_POINTS = 1200;

  lineChartData: ChartData<'line'> = {
    labels: [],
    datasets: [
      {
        label: 'Glikemija (mmol/l)',
        data: [],
        fill: false,
        borderColor: '#1B5E20',
        backgroundColor: '#1B5E20',
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
        parsing: false,
      },
    ],
  };

  lineChartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    events: ['click'],
    layout: {
      padding: { bottom: 24 },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        mode: 'nearest',
        intersect: false,
        backgroundColor: 'rgba(0,0,0,0.8)',
        titleFont: { size: 13 },
        bodyFont: { size: 12 },
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          title: (items: any[]) => {
            const x = items[0]?.parsed?.x;
            if (x == null) return '';
            return new Date(x).toLocaleString(SR_LOCALE, {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            });
          },
          label: (ctx: any) => ` ${ctx.parsed.y} mmol/L`,
        },
      },
      annotation: {
        annotations: {},
      },
    },
    scales: {
      x: {
        type: 'linear',
        display: true,
        ticks: {
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8,
          color: '#888',
          font: { size: 10 },
          callback: (value) => ChartPage.formatAxisTime(Number(value)),
        },
        grid: {
          color: 'rgba(0,0,0,0.06)',
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'mmol/L',
          color: '#666',
        },
        suggestedMin: 2,
        suggestedMax: 16,
        ticks: {
          color: '#666',
          font: { size: 11 },
        },
        grid: {
          color: 'rgba(0,0,0,0.08)',
        },
      },
    },
  };

  private static formatAxisTime(ms: number): string {
    if (!ms || !Number.isFinite(ms)) return '';
    return new Date(ms).toLocaleTimeString(SR_LOCALE, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  constructor(
    public authService: AuthenticationService,
    private readonly sgsHistory: SgsHistoryService
  ) {
    this.checkOrientation();
  }

  private unlockOrientation() {
    try {
      (window as any).Capacitor.Plugins.Background.unlockOrientation();
    } catch (_) {
      /* not supported */
    }
  }

  private lockPortrait() {
    try {
      (window as any).Capacitor.Plugins.Background.lockPortrait();
    } catch (_) {
      /* not supported */
    }
  }

  @HostListener('window:resize')
  onResize() {
    this.checkOrientation();
    this.measureViewport();
    if (this.sortedSgs.length > 0) {
      this.recalculateScrollWidth();
      this.updateViewportFromScroll();
    }
  }

  private measureViewport() {
    const el = this.chartScrollRef?.nativeElement;
    this.viewportWidth = el?.clientWidth || window.innerWidth;
  }

  private checkOrientation() {
    this.isLandscape = window.innerWidth > window.innerHeight;
  }

  ngOnInit() {
    this.unlockOrientation();
    this.isLoading = true;
    this.subscription = this.sgsHistory.allSgs$.subscribe((sgs) => {
      this.allSgs = sgs || [];
      this.prepareTimeline();
    });
  }

  ngAfterViewInit() {
    this.measureViewport();
    const el = this.chartScrollRef?.nativeElement;
    if (!el) return;
    el.addEventListener('scroll', () => this.onChartScroll(), { passive: true });
    if (this.sortedSgs.length > 0) {
      this.prepareTimeline();
    }
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
    cancelAnimationFrame(this.scrollRaf);
    this.lockPortrait();
  }

  private onChartScroll() {
    if (Date.now() - this.periodScrollLock > 150) {
      this.activeWindowHours = null;
    }
    cancelAnimationFrame(this.scrollRaf);
    this.scrollRaf = requestAnimationFrame(() => this.updateViewportFromScroll());
  }

  private prepareTimeline() {
    this.sortedSgs = [...this.allSgs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    this.sortedSgsCount = this.sortedSgs.length;

    if (this.sortedSgs.length === 0) {
      this.isLoading = false;
      this.totalScrollWidth = 0;
      this.periodSummary = 'Nema podataka za prikaz.';
      return;
    }

    this.historyStartMs = new Date(this.sortedSgs[0].timestamp).getTime();
    this.historyEndMs = new Date(this.sortedSgs[this.sortedSgs.length - 1].timestamp).getTime();

    this.recalculateScrollWidth();

    setTimeout(() => {
      this.measureViewport();
      this.recalculateScrollWidth();
      const hours = this.activeWindowHours ?? 12;
      this.setWindowHours(hours, true);
    }, 80);
  }

  private getScrollRangeMs(): number {
    return Math.max(0, this.historyEndMs - this.historyStartMs - this.windowMs);
  }

  private recalculateScrollWidth() {
    if (this.sortedSgs.length === 0) return;
    this.measureViewport();
    const scrollRangeMs = this.getScrollRangeMs();
    const scrollablePx =
      (scrollRangeMs / ChartPage.MS_PER_HOUR) * ChartPage.PIXELS_PER_HOUR;
    this.totalScrollWidth = Math.max(this.viewportWidth + 1, this.viewportWidth + scrollablePx);
  }

  /** Set fixed window size and jump to the latest readings. */
  setWindowHours(hours: number, scrollToLatest = true) {
    this.windowMs = hours * ChartPage.MS_PER_HOUR;
    this.activeWindowHours = hours;
    this.periodScrollLock = Date.now();
    this.recalculateScrollWidth();
    if (scrollToLatest) {
      this.scrollToLatest();
    } else {
      this.updateViewportFromScroll();
    }
  }

  scrollToLatest() {
    const el = this.chartScrollRef?.nativeElement;
    if (!el) return;
    const viewportPx = el.clientWidth || this.viewportWidth;
    const scrollable = Math.max(0, this.totalScrollWidth - viewportPx);
    el.scrollLeft = scrollable;
    this.periodScrollLock = Date.now();
    this.updateViewportFromScroll();
  }

  scrollToOldest() {
    const el = this.chartScrollRef?.nativeElement;
    if (!el) return;
    el.scrollLeft = 0;
    this.periodScrollLock = Date.now();
    this.activeWindowHours = null;
    this.updateViewportFromScroll();
  }

  /** Scroll maps to a sliding window of fixed duration (always shows N hours). */
  private updateViewportFromScroll() {
    const el = this.chartScrollRef?.nativeElement;
    if (!el || this.sortedSgs.length === 0) return;

    const scrollLeft = el.scrollLeft;
    const viewportPx = el.clientWidth || this.viewportWidth;
    const scrollable = Math.max(0, this.totalScrollWidth - viewportPx);
    const scrollRangeMs = this.getScrollRangeMs();

    if (scrollRangeMs <= 0) {
      this.viewStartMs = this.historyStartMs;
      this.viewEndMs = Math.min(this.historyEndMs, this.historyStartMs + this.windowMs);
    } else {
      const ratio = scrollable > 0 ? scrollLeft / scrollable : 1;
      this.viewStartMs = this.historyStartMs + ratio * scrollRangeMs;
      this.viewEndMs = this.viewStartMs + this.windowMs;
    }

    this.updatePeriodSummary();

    const padMs = 5 * 60 * 1000;
    const slice = this.sortedSgs.filter((d) => {
      const t = new Date(d.timestamp).getTime();
      return t >= this.viewStartMs - padMs && t <= this.viewEndMs + padMs;
    });

    const display = downsampleSgPoints(slice, ChartPage.MAX_CHART_POINTS);
    this.renderSlice(display);
  }

  private updatePeriodSummary() {
    const historyDays = Math.max(
      1,
      Math.round((this.historyEndMs - this.historyStartMs) / ChartPage.MS_PER_DAY)
    );
    const windowHours = Math.round(this.windowMs / ChartPage.MS_PER_HOUR);
    const fmt = (ms: number) =>
      new Date(ms).toLocaleString(SR_LOCALE, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });

    this.periodSummary =
      `Prozor ${windowHours}h: ${fmt(this.viewStartMs)} – ${fmt(this.viewEndMs)} · ` +
      `Istorija: ${historyDays} d`;
  }

  private renderSlice(sgs: { sg: number; timestamp: string }[]) {
    const xScale = this.lineChartOptions.scales?.['x'] as any;
    if (xScale) {
      xScale.min = this.viewStartMs;
      xScale.max = this.viewEndMs;
    }

    if (sgs.length === 0) {
      this.lineChartData.labels = [];
      this.lineChartData.datasets[0].data = [];
      (this.lineChartOptions as any)._timestamps = [];
      (this.lineChartOptions as any).plugins.annotation.annotations = {};
      this.chartDirective?.update();
      this.isLoading = false;
      return;
    }

    this.rawTimestamps = sgs.map((d) => new Date(d.timestamp));
    (this.lineChartOptions as any)._timestamps = this.rawTimestamps;

    this.lineChartData.labels = [];
    this.lineChartData.datasets[0].data = sgs.map((d) => ({
      x: new Date(d.timestamp).getTime(),
      y: readingMmol(d),
    }));

    const annotations: any = {
      lowZone: {
        type: 'box',
        yMin: 0,
        yMax: LOW_THRESHOLD,
        backgroundColor: 'rgba(211, 47, 47, 0.10)',
        borderWidth: 0,
      },
      normalZone: {
        type: 'box',
        yMin: LOW_THRESHOLD,
        yMax: HIGH_THRESHOLD,
        backgroundColor: 'rgba(124, 179, 66, 0.20)',
        borderWidth: 0,
      },
      highZone: {
        type: 'box',
        yMin: HIGH_THRESHOLD,
        yMax: 20,
        backgroundColor: 'rgba(245, 124, 0, 0.10)',
        borderWidth: 0,
      },
      lowLine: {
        type: 'line',
        yMin: LOW_THRESHOLD,
        yMax: LOW_THRESHOLD,
        borderColor: 'rgba(211, 47, 47, 0.5)',
        borderWidth: 1,
        borderDash: [6, 4],
      },
      highLine: {
        type: 'line',
        yMin: HIGH_THRESHOLD,
        yMax: HIGH_THRESHOLD,
        borderColor: 'rgba(245, 124, 0, 0.5)',
        borderWidth: 1,
        borderDash: [6, 4],
      },
    };

    const seenMidnight = new Set<string>();
    for (const d of sgs) {
      const dt = new Date(d.timestamp);
      const h = dt.getHours();
      if (h !== 0 && h !== 12) continue;
      const key = dt.toISOString().substring(0, 13);
      if (seenMidnight.has(key)) continue;
      seenMidnight.add(key);
      const t = dt.getTime();
      const isAM = h === 0;
      annotations[`t12_${key}`] = {
        type: 'line',
        xMin: t,
        xMax: t,
        borderColor: isAM ? 'rgba(33, 120, 210, 0.45)' : 'rgba(230, 140, 30, 0.35)',
        borderWidth: isAM ? 1.5 : 1,
      };
    }

    (this.lineChartOptions as any).plugins.annotation.annotations = annotations;
    this.chartDirective?.update();
    this.isLoading = false;
  }

  private rawTimestamps: Date[] = [];

  doRefresh(event: CustomEvent) {
    this.authService.doRefresh(event);
  }
}

