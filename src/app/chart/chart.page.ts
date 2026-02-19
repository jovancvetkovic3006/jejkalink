import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
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
import { Chart, ChartData, ChartOptions } from "chart.js";
import { BaseChartDirective } from 'ng2-charts';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
Chart.register(annotationPlugin);

const LOW_THRESHOLD = 4.5;
const HIGH_THRESHOLD = 7.5;
const HOUR_BUCKET_TOLERANCE = 1; // ±1 hour for pattern matching
const MIN_DAYS_FOR_PATTERN = 2; // need 2+ days to call it a pattern

interface PatternInfo {
  type: 'high' | 'low';
  hourBucket: number;
  dayCount: number;
}

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
export class ChartPage implements OnInit, OnDestroy {
  @ViewChild(BaseChartDirective) chartDirective?: BaseChartDirective;
  @ViewChild('chartScroll') chartScrollRef?: ElementRef<HTMLDivElement>;
  private subscription?: Subscription;
  patientData$ = this.authService.patientData$;
  allSgs: any[] = [];
  isLandscape = false;
  chartWidth = 0;
  isLoading = false;
  patternSummary: string[] = [];

  private static readonly DAY_WIDTH_PX = 1200;

  lineChartData: ChartData<'line'> = {
    labels: [],
    datasets: [
      {
        label: 'Glikemija (mmol/l)',
        data: [],
        fill: false,
        borderColor: '#333',
        backgroundColor: '#333',
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointBackgroundColor: [],
        pointBorderColor: [],
        borderWidth: 2,
      },
    ],
  };

  lineChartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0,0,0,0.8)',
        titleFont: { size: 13 },
        bodyFont: { size: 12 },
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (ctx) => ` ${ctx.parsed.y} mmol/L`,
        },
      },
      annotation: {
        annotations: {
          lowZone: {
            type: 'box',
            yMin: 0,
            yMax: LOW_THRESHOLD,
            backgroundColor: 'rgba(198, 40, 40, 0.06)',
            borderWidth: 0,
          },
          highZone: {
            type: 'box',
            yMin: HIGH_THRESHOLD,
            yMax: 20,
            backgroundColor: 'rgba(230, 81, 0, 0.06)',
            borderWidth: 0,
          },
          lowLine: {
            type: 'line',
            yMin: LOW_THRESHOLD,
            yMax: LOW_THRESHOLD,
            borderColor: 'rgba(198, 40, 40, 0.5)',
            borderWidth: 2,
            borderDash: [6, 4],
          },
          highLine: {
            type: 'line',
            yMin: HIGH_THRESHOLD,
            yMax: HIGH_THRESHOLD,
            borderColor: 'rgba(22, 0, 163, 0.5)',
            borderWidth: 2,
            borderDash: [6, 4],
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Vreme',
          color: '#888',
        },
        ticks: {
          maxRotation: 45,
          autoSkip: true,
          maxTicksLimit: 12,
          color: '#888',
          font: { size: 11 },
        },
        grid: {
          color: 'rgba(0,0,0,0.04)',
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'mmol/L',
          color: '#888',
        },
        suggestedMin: 2,
        suggestedMax: 16,
        ticks: {
          color: '#888',
          font: { size: 11 },
        },
        grid: {
          color: 'rgba(0,0,0,0.06)',
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
    } catch (_) { /* not supported */ }
  }

  private lockPortrait() {
    try {
      (window as any).Capacitor.Plugins.Background.lockPortrait();
    } catch (_) { /* not supported */ }
  }

  @HostListener('window:resize')
  onResize() {
    this.checkOrientation();
  }

  private checkOrientation() {
    this.isLandscape = window.innerWidth > window.innerHeight;
  }

  ngOnInit() {
    this.unlockOrientation();
    this.isLoading = true;
    this.subscription = this.sgsHistory.allSgs$.subscribe((sgs) => {
      this.allSgs = sgs || [];
      this.buildChart();
    });
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
    this.lockPortrait();
  }

  private buildChart() {
    const sorted = [...this.allSgs]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (sorted.length === 0) {
      this.isLoading = false;
      return;
    }

    const firstTs = new Date(sorted[0].timestamp).getTime();
    const lastTs = new Date(sorted[sorted.length - 1].timestamp).getTime();
    const totalDays = Math.max(1, (lastTs - firstTs) / (24 * 60 * 60 * 1000));
    const screenW = window.innerWidth;
    this.chartWidth = Math.max(screenW, totalDays * ChartPage.DAY_WIDTH_PX);

    const ticksPerScreen = 6;
    const totalScreens = Math.max(1, this.chartWidth / screenW);
    (this.lineChartOptions as any).scales.x.ticks.maxTicksLimit =
      Math.round(ticksPerScreen * totalScreens);

    // Detect recurring patterns
    const patterns = this.detectPatterns(sorted);

    this.loadChartData(sorted, patterns);
  }

  /**
   * Detect recurring highs/lows at similar times of day across multiple days.
   * Groups readings into 1-hour buckets by time-of-day.
   * If a bucket has highs (or lows) on 2+ distinct days, it's a pattern.
   * Returns a Set of indices into the sorted sgs array that are pattern points.
   */
  private detectPatterns(sgs: any[]): Map<number, PatternInfo> {
    // bucket key = hour of day (0-23)
    // For each bucket, track which dates had a high and which had a low
    const highBuckets = new Map<number, Set<string>>(); // hour -> set of date strings
    const lowBuckets = new Map<number, Set<string>>();

    for (const entry of sgs) {
      const dt = new Date(entry.timestamp);
      const hour = dt.getHours();
      const dateKey = dt.toISOString().substring(0, 10); // YYYY-MM-DD
      const val = entry.sg / 18;

      if (val > HIGH_THRESHOLD) {
        if (!highBuckets.has(hour)) highBuckets.set(hour, new Set());
        highBuckets.get(hour)!.add(dateKey);
      }
      if (val < LOW_THRESHOLD) {
        if (!lowBuckets.has(hour)) lowBuckets.set(hour, new Set());
        lowBuckets.get(hour)!.add(dateKey);
      }
    }

    // Find buckets with patterns (2+ days)
    const patternHighHours = new Map<number, number>(); // hour -> dayCount
    const patternLowHours = new Map<number, number>();

    for (const [hour, dates] of highBuckets) {
      if (dates.size >= MIN_DAYS_FOR_PATTERN) {
        patternHighHours.set(hour, dates.size);
      }
    }
    for (const [hour, dates] of lowBuckets) {
      if (dates.size >= MIN_DAYS_FOR_PATTERN) {
        patternLowHours.set(hour, dates.size);
      }
    }

    // Build summary text
    this.patternSummary = [];
    for (const [hour, count] of patternHighHours) {
      const hStr = `${hour.toString().padStart(2, '0')}:00`;
      this.patternSummary.push(`\u26a0 Visok \u0161e\u0107er oko ${hStr} (${count} dana)`);
    }
    for (const [hour, count] of patternLowHours) {
      const hStr = `${hour.toString().padStart(2, '0')}:00`;
      this.patternSummary.push(`\u26a0 Nizak \u0161e\u0107er oko ${hStr} (${count} dana)`);
    }

    // Map each data point index to its pattern info (if any)
    const result = new Map<number, PatternInfo>();
    for (let i = 0; i < sgs.length; i++) {
      const dt = new Date(sgs[i].timestamp);
      const hour = dt.getHours();
      const val = sgs[i].sg / 18;

      if (val > HIGH_THRESHOLD && this.isInPatternBucket(hour, patternHighHours)) {
        const bucketHour = this.getMatchingBucket(hour, patternHighHours);
        result.set(i, { type: 'high', hourBucket: bucketHour, dayCount: patternHighHours.get(bucketHour)! });
      } else if (val < LOW_THRESHOLD && this.isInPatternBucket(hour, patternLowHours)) {
        const bucketHour = this.getMatchingBucket(hour, patternLowHours);
        result.set(i, { type: 'low', hourBucket: bucketHour, dayCount: patternLowHours.get(bucketHour)! });
      }
    }

    return result;
  }

  private isInPatternBucket(hour: number, buckets: Map<number, number>): boolean {
    for (const bHour of buckets.keys()) {
      if (Math.abs(hour - bHour) <= HOUR_BUCKET_TOLERANCE) return true;
    }
    return false;
  }

  private getMatchingBucket(hour: number, buckets: Map<number, number>): number {
    for (const bHour of buckets.keys()) {
      if (Math.abs(hour - bHour) <= HOUR_BUCKET_TOLERANCE) return bHour;
    }
    return hour;
  }

  private loadChartData(sgs: any[], patterns: Map<number, PatternInfo>) {
    this.lineChartData.labels = sgs.map((d) => {
      const dt = new Date(d.timestamp);
      return dt.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
        + ' ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

    const values = sgs.map((d) => parseFloat((d.sg / 18).toFixed(1)));
    this.lineChartData.datasets[0].data = values;

    // Color points: pattern points get special colors + larger radius
    const PATTERN_HIGH_COLOR = '#d500f9'; // purple for recurring highs
    const PATTERN_LOW_COLOR = '#2979ff';  // blue for recurring lows

    const pointColors = values.map((v, i) => {
      if (patterns.has(i)) {
        return patterns.get(i)!.type === 'high' ? PATTERN_HIGH_COLOR : PATTERN_LOW_COLOR;
      }
      if (v < LOW_THRESHOLD) return '#c62828';
      if (v > HIGH_THRESHOLD) return '#e65100';
      return '#2e7d32';
    });

    const pointRadii = values.map((_, i) => patterns.has(i) ? 4 : 0);
    const pointBorderWidths = values.map((_, i) => patterns.has(i) ? 2 : 0);

    this.lineChartData.datasets[0].pointBackgroundColor = pointColors;
    this.lineChartData.datasets[0].pointBorderColor = pointColors;
    this.lineChartData.datasets[0].pointRadius = pointRadii;
    this.lineChartData.datasets[0].pointHoverRadius = 6;
    this.lineChartData.datasets[0].borderWidth = 2;

    // Scroll to the right (most recent data) after render
    setTimeout(() => {
      this.scrollToEnd();
      this.isLoading = false;
    }, 150);
  }

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
