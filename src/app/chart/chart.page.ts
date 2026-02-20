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
    animation: false,
    events: [],
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
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

    this.loadChartData(sorted);
  }

  private loadChartData(sgs: any[]) {
    this.lineChartData.labels = sgs.map((d: any) => {
      const dt = new Date(d.timestamp);
      return dt.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
        + ' ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

    const values = sgs.map((d: any) => parseFloat((d.sg / 18).toFixed(1)));
    this.lineChartData.datasets[0].data = values;
    this.lineChartData.datasets[0].pointRadius = 0;
    this.lineChartData.datasets[0].pointHoverRadius = 0;
    this.lineChartData.datasets[0].borderWidth = 2;

    // Annotations: threshold zones + vertical lines every 12 hours
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

    // Add vertical lines every 12 hours (00:00 and 12:00)
    let lastMarkerDate = '';
    for (let i = 0; i < sgs.length; i++) {
      const dt = new Date(sgs[i].timestamp);
      const h = dt.getHours();
      if (h === 0 || h === 12) {
        const key = dt.toISOString().substring(0, 13);
        if (key !== lastMarkerDate) {
          lastMarkerDate = key;
          const label = h === 0
            ? dt.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
            : '12:00';
          annotations[`t12_${i}`] = {
            type: 'line',
            xMin: i,
            xMax: i,
            borderColor: 'rgba(0, 0, 0, 0.15)',
            borderWidth: 1,
            label: {
              display: true,
              content: label,
              position: 'start',
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              color: '#fff',
              font: { size: 9 },
              padding: 2,
            },
          };
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
