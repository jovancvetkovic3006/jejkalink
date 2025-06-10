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
import { ChartData, ChartOptions } from 'chart.js';

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
  constructor(public authService: AuthService) { }

  doRefresh(event: CustomEvent) {
    this.authService.doRefresh(event);
  }

  lineChartData: ChartData<'line'> = {
    labels: [],
    datasets: [
      {
        label: 'Glucose (mg/dL)',
        data: [],
        fill: false,
        borderColor: 'blue',
        tension: 0.3,
      },
    ],
  };

  lineChartOptions: ChartOptions = {
    responsive: true,
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
        suggestedMin: 50,
        suggestedMax: 200,
      },
    },
  };

  // Example raw data - replace with your actual data input
  rawData = [
    {
      kind: 'SG',
      version: 1,
      sg: 120,
      sensorState: 'OK',
      timestamp: '2025-05-21T16:40:31',
    },
    {
      kind: 'SG',
      version: 1,
      sg: 125,
      sensorState: 'OK',
      timestamp: '2025-05-21T17:00:31',
    },
    {
      kind: 'SG',
      version: 1,
      sg: 115,
      sensorState: 'OK',
      timestamp: '2025-05-21T17:20:31',
    },
    // Add more valid data points here...
  ];

  ngOnInit() {
    this.loadChartData();
  }

  loadChartData() {
    // Filter out invalid data points (sg=0 or no data)
    const filtered = this.rawData.filter(
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
