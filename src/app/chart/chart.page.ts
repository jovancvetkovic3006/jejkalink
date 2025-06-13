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
import { Chart, ChartData, ChartOptions } from "chart.js";
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
  patientData$ = this.authService.patientData$;

  lineChartData: ChartData<'line'> = {
    labels: [],
    datasets: [
      {
        label: 'Glikemija (mmol/l)',
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
            borderColor: 'rgb(149, 0, 32)',
            borderWidth: 2,
          }
          , line2: {
            type: 'line',
            yMin: 7.5,
            yMax: 7.5,
            borderColor: 'rgb(22, 0, 163)',
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
          text: 'Glikemija (mmol/l)',
        },
        suggestedMin: 0,
        suggestedMax: 30,
      },
    },
  };
  constructor(public authService: AuthService) { }

  ngOnInit() {
    this.patientData$.subscribe((data) => {
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

    // Map glucose values
    this.lineChartData.datasets[0].data = sgs.map((d) => {
      return parseFloat(((d.sg) / 18).toFixed(1));
    });
  }

  doRefresh(event: CustomEvent) {
    this.authService.doRefresh(event);
  }
}
