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
  ],
})
export class DashboardPage {
  user$ = this.authService.user$;
  data$ = this.authService.data$;

  constructor(public authService: AuthService) {}

  doRefresh(event: CustomEvent) {
    this.authService.doRefresh(event);
  }

  refreshData() {
    this.authService
      .getData()
      .pipe(take(1))
      .subscribe({
        next: (data: any) => {
          Log().info('Data data: ', data.data);
          this.authService.data$.next(
            this.authService.processPatientData(data.data)
          );
        },
        error: (err: any) => {
          Log().error('Data request failed: ', err);
        },
      });
  }
}
