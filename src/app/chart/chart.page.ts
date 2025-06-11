import { Component } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/angular/standalone';
import { AuthService } from '../services/auth.service';
import { NgChartsModule } from 'ng2-charts';
import { Chart, ChartConfiguration, ChartData, ChartOptions, ChartType } from "chart.js";
import annotationPlugin from 'chartjs-plugin-annotation';
Chart.register(annotationPlugin);

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
    NgChartsModule
  ],
})
export class ChartPage {
  data$ = this.authService.data$;
  public lineChartLegend = true;
  constructor(public authService: AuthService) { }

  doRefresh(event: CustomEvent) {
    this.authService.doRefresh(event);
  }

  customTooltipHandler(context: any) {
    const { chart, tooltip } = context;

    // Create custom tooltip element if not exists
    let tooltipEl = document.getElementById('custom-tooltip');
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'custom-tooltip';
      tooltipEl.style.position = 'absolute';
      tooltipEl.style.background = '#333';
      tooltipEl.style.color = '#fff';
      tooltipEl.style.padding = '6px 10px';
      tooltipEl.style.borderRadius = '4px';
      tooltipEl.style.pointerEvents = 'none';
      tooltipEl.style.transition = '0.2s ease';
      document.body.appendChild(tooltipEl);
    }

    // Hide if no tooltip
    if (tooltip.opacity === 0) {
      tooltipEl.style.opacity = '0';
      return;
    }

    // Set text content
    if (tooltip.body) {
      const bodyLines = tooltip.body.map((b: any) => b.lines).flat();
      tooltipEl.innerHTML = bodyLines.join('<br>');
    }

    // Position horizontally only
    const canvasRect = chart.canvas.getBoundingClientRect();
    tooltipEl.style.left = canvasRect.left + window.pageXOffset + tooltip.caretX + 'px';
    tooltipEl.style.top = canvasRect.top + window.pageYOffset + 'px'; // fixed to top
    tooltipEl.style.opacity = '1';
  }

  options = {
    plugins: {
      annotation: {
        annotations: {
          line1: {
            type: 'line',
            yMin: 60,
            yMax: 60,
            borderColor: 'rgb(255, 99, 132)',
            borderWidth: 2,
          }
        }
      }
    }
  };

  lineChartData: ChartData<'line'> = {
    labels: [],
    datasets: [
      {
        label: 'Glucose (mg/dL)',
        data: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
        fill: false, borderColor: 'black',
        backgroundColor: 'black',
        tension: 0.3,
      },
    ],
  };

  lineChartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    interaction: {
      mode: 'index', // or 'nearest'
      intersect: false, // important: allow trigger when not directly on a point
    },
    plugins: {
      annotation: {
        annotations: {
          line1: {
            type: 'line',
            yMin: 4.5,
            yMax: 4.5,
            borderColor: 'rgb(255, 99, 132)',
            borderWidth: 2,
          }
          , line2: {
            type: 'line',
            yMin: 7.5,
            yMax: 7.5,
            borderColor: 'rgb(255, 99, 132)',
            borderWidth: 2,
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Time',
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'Glucose (mg/dL)',
        },
        suggestedMin: 0,
        suggestedMax: 30,
      },
    },
  };

  ngOnInit() {
    this.data$.subscribe((data) => {
      this.loadChartData(data.sgs || []);
    });
  }

  loadChartData(sgs: any[]) {
    const now = new Date();
    sgs.reverse()
    // Map timestamps for labels
    this.lineChartData.labels = sgs.map((d) =>
      new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );

    debugger;
    // Map glucose values
    this.lineChartData.datasets[0].data = sgs.map((d) => {
      return parseFloat(((d.sg) / 18).toFixed(1));
    });
  }
}
