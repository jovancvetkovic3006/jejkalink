import { Component } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/angular/standalone';
import { take } from 'rxjs';
import { AuthService } from '../services/auth.service';

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
  ],
})
export class ChartPage {
  constructor(public authService: AuthService) {}

  doRefresh(event: CustomEvent) {
    this.authService.doRefresh(event);
  }
}
