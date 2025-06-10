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
        backgroundColor: 'rgb(49, 53, 127)',
        tension: 0.5,
      },
    ],
  };

  lineChartOptions: ChartOptions = {
    responsive: true,
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

  // Example raw data - replace with your actual data input
  rawData = [
    {
      kind: 'SG',
      version: 1,
      sg: 7,
      sensorState: 'OK',
      timestamp: '2025-05-21T16:40:31',
    },
    {
      kind: 'SG',
      version: 1,
      sg: 12,
      sensorState: 'OK',
      timestamp: '2025-05-21T17:00:31',
    },
    {
      kind: 'SG',
      version: 1,
      sg: 5,
      sensorState: 'OK',
      timestamp: '2025-05-21T17:20:31',
    },
    // Add more valid data points here...
  ];

  ngOnInit() {
    this.data$.subscribe((data) => {
      this.loadChartData(data.sgs || []);
    });
  }

  loadChartData(sgs: any[]) {
    // Filter out invalid data points (sg=0 or no data)
    const filtered = sgs.filter(
      (d) => d.sg > 0 && d.sensorState === 'OK'
    );

    // Map timestamps for labels
    this.lineChartData.labels = filtered.map((d) =>
      new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );

    // Map glucose values
    this.lineChartData.datasets[0].data = filtered.map((d) => d.sg);
  }
}
