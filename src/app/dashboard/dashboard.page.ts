import { Component } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonList,
  IonItemGroup,
  IonItemDivider,
  IonLabel,
  IonItem,
  IonIcon
} from '@ionic/angular/standalone';
import { AuthService } from '../services/auth.service';
import { take } from 'rxjs';
import { Log } from '../utils/log';
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
    IonItemGroup,
    IonItemDivider,
    IonIcon
  ],
})
export class DashboardPage {
  patientData$ = this.authService.patientData$;

  constructor(public authService: AuthService) { }

  doRefresh(event: CustomEvent) {
    this.authService.doRefresh(event);
  }


  getTrendIcon(trend: number): string {
    switch (trend) {
      case -1: return 'arrow-down';
      case 1: return 'arrow-up';
      default: return 'remove'; // horizontal line
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

  refreshData() {
    this.authService
      .getData()
      .pipe(take(1))
      .subscribe({
        next: (data: any) => {
          Log().info('Data data: ', data.data);
          this.authService.patientData$.next(
            this.authService.processPatientData(data.data)
          );
        },
        error: (err: any) => {
          Log().error('Data request failed: ', err);
        },
      });
  }
}
