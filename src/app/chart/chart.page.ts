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
  isLoading = false;
  chartWidth = 0;

  private static readonly DAY_WIDTH_PX = 800;

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
        pointHoverRadius: 0,
        borderWidth: 2,
      },
    ],
  };

  lineChartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    events: ['click'],
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
          maxRotation: 45,
          autoSkip: true,
          maxTicksLimit: 12,
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

    this.loadChartData(sorted);
  }

  private loadChartData(sgs: any[]) {
    this.lineChartData.labels = sgs.map((d: any) =>
      new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );

    const values = sgs.map((d: any) => parseFloat((d.sg / 18).toFixed(1)));
    this.lineChartData.datasets[0].data = values;
    this.lineChartData.datasets[0].pointRadius = 0;
    this.lineChartData.datasets[0].pointHoverRadius = 0;
    this.lineChartData.datasets[0].borderWidth = 2;

    // Annotations: threshold zones + vertical lines every 12 hours
    const annotations: any = {
      lowZone: {
        type: 'box', yMin: 0, yMax: LOW_THRESHOLD,
        backgroundColor: 'rgba(211, 47, 47, 0.10)', borderWidth: 0,
      },
      normalZone: {
        type: 'box', yMin: LOW_THRESHOLD, yMax: HIGH_THRESHOLD,
        backgroundColor: 'rgba(124, 179, 66, 0.08)', borderWidth: 0,
      },
      highZone: {
        type: 'box', yMin: HIGH_THRESHOLD, yMax: 20,
        backgroundColor: 'rgba(245, 124, 0, 0.10)', borderWidth: 0,
      },
      lowLine: {
        type: 'line', yMin: LOW_THRESHOLD, yMax: LOW_THRESHOLD,
        borderColor: 'rgba(211, 47, 47, 0.5)', borderWidth: 1, borderDash: [6, 4],
      },
      highLine: {
        type: 'line', yMin: HIGH_THRESHOLD, yMax: HIGH_THRESHOLD,
        borderColor: 'rgba(245, 124, 0, 0.5)', borderWidth: 1, borderDash: [6, 4],
      },
    };

    // Add vertical lines every 12 hours (00:00 and 12:00)
    // AM (midnight) = blue, PM (noon) = orange
    let lastMarkerDate = '';
    for (let i = 0; i < sgs.length; i++) {
      const dt = new Date(sgs[i].timestamp);
      const h = dt.getHours();
      if (h === 0 || h === 12) {
        const key = dt.toISOString().substring(0, 13);
        if (key !== lastMarkerDate) {
          lastMarkerDate = key;
          const isAM = h === 0;
          const lineColor = isAM ? 'rgba(33, 120, 210, 0.45)' : 'rgba(230, 140, 30, 0.35)';
          const badgeColor = isAM ? 'rgba(33, 120, 210, 0.9)' : 'rgba(230, 140, 30, 0.75)';
          if (isAM) {
            const dayNum = dt.getDate();
            const monthName = dt.toLocaleDateString('en-US', { month: 'short' });
            annotations[`t12_${i}`] = {
              type: 'line',
              xMin: i,
              xMax: i,
              borderColor: lineColor,
              borderWidth: 1.5,
              label: {
                display: true,
                content: `${dayNum} ${monthName}.`,
                position: 'start',
                backgroundColor: badgeColor,
                color: '#fff',
                font: { size: 11, weight: 'bold' },
                padding: { top: 3, bottom: 3, left: 6, right: 6 },
                borderRadius: 4,
              },
            };
          } else {
            annotations[`t12_${i}`] = {
              type: 'line',
              xMin: i,
              xMax: i,
              borderColor: lineColor,
              borderWidth: 1,
              label: {
                display: true,
                content: '12:00',
                position: 'start',
                backgroundColor: badgeColor,
                color: '#fff',
                font: { size: 9 },
                padding: 2,
              },
            };
          }
        }
      }
    }

    (this.lineChartOptions as any).plugins.annotation.annotations = annotations;

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
