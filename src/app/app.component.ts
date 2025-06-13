import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import {
  IonApp,
  IonRouterOutlet,
  IonToolbar,
  IonButton,
  IonHeader,
  IonTitle,
  IonButtons,
  IonIcon,
} from '@ionic/angular/standalone';

import { AuthService } from './services/auth.service';
import { Log } from './utils/log';
import { NotificationsService } from './notifications.service';
import { BehaviorSubject, take, tap } from 'rxjs';
import { BackgroundService } from './background.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [
    IonButtons,
    IonTitle,
    IonHeader,
    IonButton,
    IonToolbar,
    IonApp,
    IonRouterOutlet,
    IonIcon,
  ],
})
export class AppComponent implements OnInit, OnDestroy {
  username$ = new BehaviorSubject<string>('Jefimija Cvetkovic');

  constructor(
    private readonly authService: AuthService,
    private readonly notifyService: NotificationsService,
    private readonly bckgService: BackgroundService
  ) {
    if (this.authService.isTokenExpired()) {
      this.authService.login();
    }
  }

  ngOnInit(): void {
    this.bckgService.startBackgroundTask(this.refreshPatientData);
    this.notifyService.startForegroundService();
    this.notifyService.startForegroundListener();

    // Optionally, load the username from a user service
    const storedUser = localStorage.getItem('userInfo');
    if (storedUser) {
      this.username$.next(JSON.parse(storedUser).name);
    } else {
      this.authService.user$.pipe(take(1)).subscribe({
        next: (user) => {
          this.username$.next(user.name);
        },
      });
    }

    this.refreshPatientData().subscribe({
      error: (err: any) => {
        Log().error('Data request failed: ', err);
      },
    });
  }

  refreshPatientData = () => {
    return this.authService.getData().pipe(tap((data) => {
      const patientData = this.authService.processPatientData(data.data);
      this.notifyService.updateForegroundService('Glikemija', `${patientData?.current}` || 'Nema podataka');
      this.authService.patientData$.next(patientData);
    }));
  }

  ngOnDestroy() {
    this.bckgService.onDestroy();
  }

  logout() {
    this.authService.logout();
  }
}
