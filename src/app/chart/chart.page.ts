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
import { downsampleSgPoints } from '../utils/chart-data.util';

Chart.register(annotationPlugin);

const dayLabelPlugin = {
  id: 'dayLabels',
  afterDraw(chart: any) {
    const timestamps: Date[] = chart.config.options?._timestamps;
    if (!timestamps || timestamps.length === 0) return;
    const xScale = chart.scales['x'];
    const ctx = chart.ctx;
    if (!xScale || !ctx) return;

    const bottom = chart.chartArea.bottom;
    let lastDay = -1;
    const min = Math.max(0, Math.floor(xScale.min ?? 0));
    const max = Math.min(timestamps.length - 1, Math.ceil(xScale.max ?? timestamps.length - 1));

    for (let i = min; i <= max; i++) {
      const dt = timestamps[i];
      const h = dt.getHours();
      const m = dt.getMinutes();
      if (h === 0 && m < 5 && dt.getDate() !== lastDay) {
        lastDay = dt.getDate();
        const x = xScale.getPixelForValue(i);
        const label = `${dt.getDate()} ${dt.toLocaleDateString('en-US', { month: 'short' })}.`;

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
    }
  },
};
Chart.register(dayLabelPlugin);

const LOW_THRESHOLD = 4.5;
const HIGH_THRESHOLD = 7.5;

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
  private sortedSgs: { sg: number; timestamp: string }[] = [];

  patientData$ = this.authService.patientData$;
  allSgs: any[] = [];
  isLandscape = false;
  isLoading = false;

  /** Wide scroll track (full history span). */
  totalScrollWidth = 0;
  /** Fixed viewport where Chart.js renders (screen width). */
  viewportWidth = 0;

  private static readonly PIXELS_PER_DAY = 360;
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
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0,0,0,0.8)',
        titleFont: { size: 13 },
        bodyFont: { size: 12 },
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (ctx: any) => ` ${ctx.parsed.y} mmol/L`,
        },
      },
      annotation: {
        annotations: {},
      },
    },
    scales: {
      x: {
        display: true,
        ticks: {
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 18,
          color: '#888',
          font: { size: 10 },
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
    this.viewportWidth = window.innerWidth;
    if (this.sortedSgs.length > 0) {
      this.updateViewportFromScroll();
    }
  }

  private checkOrientation() {
    this.isLandscape = window.innerWidth > window.innerHeight;
  }

  ngOnInit() {
    this.unlockOrientation();
    this.viewportWidth = window.innerWidth;
    this.isLoading = true;
    this.subscription = this.sgsHistory.allSgs$.subscribe((sgs) => {
      this.allSgs = sgs || [];
      this.prepareTimeline();
    });
  }

  ngAfterViewInit() {
    const el = this.chartScrollRef?.nativeElement;
    if (!el) return;
    el.addEventListener('scroll', () => this.onChartScroll(), { passive: true });
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
    cancelAnimationFrame(this.scrollRaf);
    this.lockPortrait();
  }

  private onChartScroll() {
    cancelAnimationFrame(this.scrollRaf);
    this.scrollRaf = requestAnimationFrame(() => this.updateViewportFromScroll());
  }

  private prepareTimeline() {
    this.sortedSgs = [...this.allSgs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    if (this.sortedSgs.length === 0) {
      this.isLoading = false;
      this.totalScrollWidth = 0;
      return;
    }

    const firstTs = new Date(this.sortedSgs[0].timestamp).getTime();
    const lastTs = new Date(this.sortedSgs[this.sortedSgs.length - 1].timestamp).getTime();
    const totalDays = Math.max(1, (lastTs - firstTs) / (24 * 60 * 60 * 1000));
    this.totalScrollWidth = Math.max(
      this.viewportWidth,
      totalDays * ChartPage.PIXELS_PER_DAY
    );

    setTimeout(() => {
      this.scrollToEnd();
      this.updateViewportFromScroll();
    }, 50);
  }

  /** Map horizontal scroll position → time window → chart dataset. */
  private updateViewportFromScroll() {
    const el = this.chartScrollRef?.nativeElement;
    if (!el || this.sortedSgs.length === 0) return;

    const scrollLeft = el.scrollLeft;
    const viewportPx = el.clientWidth || this.viewportWidth;
    const trackWidth = Math.max(this.totalScrollWidth, viewportPx);
    const scrollable = Math.max(1, trackWidth - viewportPx);

    const firstTs = new Date(this.sortedSgs[0].timestamp).getTime();
    const lastTs = new Date(this.sortedSgs[this.sortedSgs.length - 1].timestamp).getTime();
    const totalMs = Math.max(1, lastTs - firstTs);
    const viewportMs = totalMs * (viewportPx / trackWidth);

    const startMs = firstTs + (scrollLeft / scrollable) * (totalMs - viewportMs);
    const endMs = startMs + viewportMs;

    const padMs = 30 * 60 * 1000;
    const slice = this.sortedSgs.filter((d) => {
      const t = new Date(d.timestamp).getTime();
      return t >= startMs - padMs && t <= endMs + padMs;
    });

    const display = downsampleSgPoints(slice, ChartPage.MAX_CHART_POINTS);
    this.renderSlice(display);
  }

  private renderSlice(sgs: { sg: number; timestamp: string }[]) {
    if (sgs.length === 0) {
      this.isLoading = false;
      return;
    }

    this.rawTimestamps = sgs.map((d) => new Date(d.timestamp));
    (this.lineChartOptions as any)._timestamps = this.rawTimestamps;
    this.lineChartData.labels = this.rawTimestamps.map((dt) => {
      const h = dt.getHours();
      const m = dt.getMinutes();
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    });

    const values = sgs.map((d) => parseFloat((d.sg / 18).toFixed(1)));
    this.lineChartData.datasets[0].data = values;

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

    let lastMarkerKey = '';
    for (let i = 0; i < sgs.length; i++) {
      const dt = new Date(sgs[i].timestamp);
      const h = dt.getHours();
      if (h === 0 || h === 12) {
        const key = dt.toISOString().substring(0, 13);
        if (key !== lastMarkerKey) {
          lastMarkerKey = key;
          const isAM = h === 0;
          annotations[`t12_${i}`] = {
            type: 'line',
            xMin: i,
            xMax: i,
            borderColor: isAM ? 'rgba(33, 120, 210, 0.45)' : 'rgba(230, 140, 30, 0.35)',
            borderWidth: isAM ? 1.5 : 1,
          };
        }
      }
    }

    (this.lineChartOptions as any).plugins.annotation.annotations = annotations;
    this.chartDirective?.update();
    this.isLoading = false;
  }

  private rawTimestamps: Date[] = [];

  private scrollToEnd() {
    const el = this.chartScrollRef?.nativeElement;
    if (el) {
      el.scrollLeft = el.scrollWidth;
    }
  }

  doRefresh(event: CustomEvent) {
    this.authService.doRefresh(event);
  }
}
