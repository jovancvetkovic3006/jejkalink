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
export class Tab2Page {
  constructor(public authService: AuthService) {}

  doRefresh(event: CustomEvent) {
    this.authService
      .getData()
      .pipe(take(1))
      .subscribe({
        next: (data: any) => {
          this.authService.data$.next(
            this.authService.processPatientData(data.data)
          );
          (event.target as HTMLIonRefresherElement).complete();
        },
        error: (err: any) => {
          console.error('Refresh failed', err);
          (event.target as HTMLIonRefresherElement).complete();
        },
      });
  }
}
