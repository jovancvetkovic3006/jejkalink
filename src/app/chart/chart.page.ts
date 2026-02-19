import { Component, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonLabel,
  IonSegment,
  IonSegmentButton,
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
    IonLabel,
    IonSegment,
    IonSegmentButton,
    NgChartsModule,
    CommonModule,
  ],
})
export class ChartPage implements OnInit, OnDestroy {
  @ViewChild(BaseChartDirective) chartDirective?: BaseChartDirective;
  private subscription?: Subscription;
  patientData$ = this.authService.patientData$;
  hoursFilter = 6;
  allSgs: any[] = [];
  isLandscape = false;

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
      legend: {
        display: true,
        labels: {
          font: { size: 13 },
          color: '#555',
        },
      },
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

  @HostListener('window:resize')
  onResize() {
    this.checkOrientation();
  }

  private checkOrientation() {
    this.isLandscape = window.innerWidth > window.innerHeight;
  }

  ngOnInit() {
    this.subscription = this.sgsHistory.allSgs$.subscribe((sgs) => {
      this.allSgs = sgs || [];
      this.applyFilter();
    });
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  onFilterChange(event: any) {
    this.hoursFilter = Number(event.detail.value);
    this.applyFilter();
  }

  applyFilter() {
    const cutoff = Date.now() - this.hoursFilter * 60 * 60 * 1000;
    const filtered = this.allSgs
      .filter((sg) => new Date(sg.timestamp).getTime() >= cutoff)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    this.loadChartData(filtered);
  }

  loadChartData(sgs: any[]) {
    const showDate = this.hoursFilter > 24;
    this.lineChartData.labels = sgs.map((d) => {
      const dt = new Date(d.timestamp);
      if (showDate) {
        return dt.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
          + ' ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

    const values = sgs.map((d) => parseFloat((d.sg / 18).toFixed(1)));
    this.lineChartData.datasets[0].data = values;

    const pointColors = values.map((v) => {
      if (v < LOW_THRESHOLD) return '#c62828';
      if (v > HIGH_THRESHOLD) return '#e65100';
      return '#2e7d32';
    });
    this.lineChartData.datasets[0].pointBackgroundColor = pointColors;
    this.lineChartData.datasets[0].pointBorderColor = pointColors;

    this.lineChartData.datasets[0].pointRadius = sgs.length > 500 ? 0 : sgs.length > 100 ? 1 : 0;
    this.lineChartData.datasets[0].pointHoverRadius = sgs.length > 500 ? 2 : 6;
    this.lineChartData.datasets[0].borderWidth = sgs.length > 500 ? 1 : 2;

    // Show tooltip on last data point by default
    setTimeout(() => this.showLastTooltip(), 300);
  }

  private showLastTooltip() {
    const chart = this.chartDirective?.chart;
    if (!chart || !chart.data.datasets[0]?.data?.length) return;
    const lastIndex = chart.data.datasets[0].data.length - 1;
    chart.setActiveElements([{ datasetIndex: 0, index: lastIndex }]);
    chart.tooltip?.setActiveElements([{ datasetIndex: 0, index: lastIndex }], { x: 0, y: 0 });
    chart.update();
  }

  doRefresh(event: CustomEvent) {
    this.authService.doRefresh(event);
  }
}
