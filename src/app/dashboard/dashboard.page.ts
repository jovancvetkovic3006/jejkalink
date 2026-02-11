import { Component } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonList,
  IonLabel,
  IonItem,
  IonIcon,
  IonSpinner
} from '@ionic/angular/standalone';
import { AuthenticationService } from '../services/authentication.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard-tab',
  templateUrl: 'dashboard.page.html',
  styleUrls: ['dashboard.page.scss'],
  imports: [
    IonItem,
    IonLabel,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    CommonModule,
    IonRefresher,
    IonRefresherContent,
    IonList,
    IonIcon,
    IonSpinner
  ],
})
export class DashboardPage {
  patientData$ = this.authService.patientData$;
  debugLog$ = this.authService.debugLog$;

  constructor(public authService: AuthenticationService) { }

  doRefresh(event: CustomEvent) {
    this.authService.doRefresh(event);
  }

  getTrendIcon(trend: number): string {
    switch (trend) {
      case -1: return 'arrow-down-circle';
      case 1: return 'arrow-up-circle';
      default: return 'arrow-back-circle'; // horizontal line
    }
  }

  trendText(trend: number): string {
    switch (trend) {
      case -1: return 'Pada';
      case 1: return 'Raste';
      default: return 'Miran';
    }
  }

  getTrendClass(trend: number): string {
    switch (trend) {
      case -1: return 'trend-down';
      case 1: return 'trend-up';
      default: return 'trend-stable';
    }
  }

  getCurrentClass(current: number): string {
    console.log('[LOG CURRENT]', current);
    if (current < 4.5) return 'trend-down';
    if (current <= 7.5) return 'trend-stable';
    return 'trend-up';
  }
}
