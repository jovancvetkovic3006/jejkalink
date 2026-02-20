import { Component, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
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
const MIN_DAYS_FOR_PATTERN = 2;

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
  private subscription?: Subscription;
  patientData$ = this.authService.patientData$;
  allSgs: any[] = [];
  isLandscape = false;
  isLoading = false;
  patternSummary: string[] = [];

  // Pagination: each page = 1 day
  dayPages: { date: string; sgs: any[] }[] = [];
  currentPage = 0;

  // Touch tracking for swipe
  private touchStartX = 0;
  private touchStartY = 0;

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
        pointHoverRadius: 0,
        borderWidth: 2,
      },
    ],
  };

  lineChartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
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
        annotations: {},
      },
    },
    scales: {
      x: {
        display: true,
        ticks: {
          maxRotation: 45,
          autoSkip: true,
          maxTicksLimit: 8,
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
      this.buildPages();
    });
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
    this.lockPortrait();
  }

  /** Group all data into day pages and detect patterns */
  private buildPages() {
    const sorted = [...this.allSgs]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Group by date
    const dayMap = new Map<string, any[]>();
    for (const entry of sorted) {
      const dateKey = new Date(entry.timestamp).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
      if (!dayMap.has(dateKey)) dayMap.set(dateKey, []);
      dayMap.get(dateKey)!.push(entry);
    }

    this.dayPages = Array.from(dayMap.entries()).map(([date, sgs]) => ({ date, sgs }));

    // Detect patterns across all data
    this.detectPatterns(sorted);

    // Go to last page (most recent day)
    this.currentPage = Math.max(0, this.dayPages.length - 1);
    this.renderCurrentPage();
  }

  /** Detect recurring highs/lows at similar times across days */
  private detectPatterns(sgs: any[]) {
    const highBuckets = new Map<number, Set<string>>();
    const lowBuckets = new Map<number, Set<string>>();

    for (const entry of sgs) {
      const dt = new Date(entry.timestamp);
      const hour = dt.getHours();
      const dateKey = dt.toISOString().substring(0, 10);
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

    this.patternSummary = [];
    for (const [hour, dates] of highBuckets) {
      if (dates.size >= MIN_DAYS_FOR_PATTERN) {
        const hStr = `${hour.toString().padStart(2, '0')}:00`;
        this.patternSummary.push(`\u26a0 Visok \u0161e\u0107er oko ${hStr} (${dates.size} dana)`);
      }
    }
    for (const [hour, dates] of lowBuckets) {
      if (dates.size >= MIN_DAYS_FOR_PATTERN) {
        const hStr = `${hour.toString().padStart(2, '0')}:00`;
        this.patternSummary.push(`\u26a0 Nizak \u0161e\u0107er oko ${hStr} (${dates.size} dana)`);
      }
    }
  }

  /** Render the chart for the current page (day) */
  private renderCurrentPage() {
    if (this.dayPages.length === 0) {
      this.isLoading = false;
      return;
    }

    const page = this.dayPages[this.currentPage];
    const sgs = page.sgs;

    // Labels = time only
    this.lineChartData.labels = sgs.map((d: any) =>
      new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );

    const values = sgs.map((d: any) => parseFloat((d.sg / 18).toFixed(1)));
    this.lineChartData.datasets[0].data = values;

    // No points at all
    this.lineChartData.datasets[0].pointRadius = 0;
    this.lineChartData.datasets[0].pointHoverRadius = 0;
    this.lineChartData.datasets[0].borderWidth = 2;

    // Build annotations: vertical lines at the highest peaks
    const annotations: any = {
      lowZone: {
        type: 'box', yMin: 0, yMax: LOW_THRESHOLD,
        backgroundColor: 'rgba(198, 40, 40, 0.06)', borderWidth: 0,
      },
      highZone: {
        type: 'box', yMin: HIGH_THRESHOLD, yMax: 20,
        backgroundColor: 'rgba(230, 81, 0, 0.06)', borderWidth: 0,
      },
      lowLine: {
        type: 'line', yMin: LOW_THRESHOLD, yMax: LOW_THRESHOLD,
        borderColor: 'rgba(198, 40, 40, 0.5)', borderWidth: 1, borderDash: [6, 4],
      },
      highLine: {
        type: 'line', yMin: HIGH_THRESHOLD, yMax: HIGH_THRESHOLD,
        borderColor: 'rgba(22, 0, 163, 0.5)', borderWidth: 1, borderDash: [6, 4],
      },
    };

    // Find peaks: local maxima that are above HIGH_THRESHOLD
    const peakIndices = this.findPeaks(values);
    for (const idx of peakIndices) {
      const label = this.lineChartData.labels![idx] as string;
      annotations[`peak_${idx}`] = {
        type: 'line',
        xMin: idx,
        xMax: idx,
        borderColor: 'rgba(230, 81, 0, 0.6)',
        borderWidth: 2,
        borderDash: [4, 3],
        label: {
          display: true,
          content: `${values[idx]}`,
          position: 'start',
          backgroundColor: 'rgba(230, 81, 0, 0.8)',
          color: '#fff',
          font: { size: 10, weight: 'bold' as const },
          padding: 3,
        },
      };
    }

    (this.lineChartOptions as any).plugins.annotation.annotations = annotations;

    // Force chart update
    this.chartDirective?.update();

    setTimeout(() => { this.isLoading = false; }, 100);
  }

  /** Find indices of local maxima above HIGH_THRESHOLD */
  private findPeaks(values: number[]): number[] {
    if (values.length < 3) return [];

    const peaks: number[] = [];
    // Find all local maxima above threshold
    for (let i = 1; i < values.length - 1; i++) {
      if (values[i] > HIGH_THRESHOLD &&
          values[i] >= values[i - 1] &&
          values[i] >= values[i + 1]) {
        peaks.push(i);
      }
    }

    // Deduplicate: if peaks are within 6 readings of each other, keep the highest
    const filtered: number[] = [];
    let lastPeak = -10;
    for (const p of peaks) {
      if (p - lastPeak < 6) {
        // Replace last if this one is higher
        if (values[p] > values[filtered[filtered.length - 1]]) {
          filtered[filtered.length - 1] = p;
        }
      } else {
        filtered.push(p);
      }
      lastPeak = p;
    }

    return filtered;
  }

  // --- Swipe navigation ---
  onTouchStart(event: TouchEvent) {
    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
  }

  onTouchEnd(event: TouchEvent) {
    const dx = event.changedTouches[0].clientX - this.touchStartX;
    const dy = event.changedTouches[0].clientY - this.touchStartY;

    // Only trigger if horizontal swipe is dominant and > 50px
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && this.currentPage < this.dayPages.length - 1) {
        this.currentPage++;
        this.renderCurrentPage();
      } else if (dx > 0 && this.currentPage > 0) {
        this.currentPage--;
        this.renderCurrentPage();
      }
    }
  }

  get currentDateLabel(): string {
    if (this.dayPages.length === 0) return '';
    return this.dayPages[this.currentPage]?.date || '';
  }

  get pageIndicator(): string {
    if (this.dayPages.length === 0) return '';
    return `${this.currentPage + 1} / ${this.dayPages.length}`;
  }

  doRefresh(event: CustomEvent) {
    this.authService.doRefresh(event);
  }
}
