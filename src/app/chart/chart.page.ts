import { Component } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-chart-tab',
  templateUrl: 'chart.page.html',
  styleUrls: ['chart.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
})
export class Tab2Page {
  constructor() {}
}
