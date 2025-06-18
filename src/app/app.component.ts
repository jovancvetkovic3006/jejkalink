import { Component, OnInit } from '@angular/core';
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
import { BehaviorSubject, take } from 'rxjs';
import { BackgroundService } from './services/background.service';
import { CommonModule } from '@angular/common';
import { App } from '@capacitor/app';

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
    CommonModule,
  ],
})
export class AppComponent implements OnInit {
  timeoutId: ReturnType<typeof setTimeout> | undefined;
  username$ = new BehaviorSubject<string>('Jefimija Cvetkovic');

  constructor(
    private readonly authService: AuthService,
    private readonly bckgService: BackgroundService
  ) {
    if (this.authService.isTokenExpired()) {
      this.authService.login();
    }
  }

  ngOnInit(): void {
    this.bckgService.isTaskTriggered$.subscribe(() => {
      this.refreshPatientData();
    });

    this.bckgService.startBackgroundTask();

    this.refreshPatientData();

    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        this.refreshPatientData(); // Refresh data when app comes to foreground
      }
    });

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
  }

  refreshPatientData = () => {
    this.authService.getData().subscribe({
      next: (data) => {
        const patientData = this.authService.processPatientData(data.data);
        this.authService.patientData$.next(patientData);
      },
      error: (err: any) => {
        Log().error('Data request failed: ', err);
      },
    });
  }

  keepRefreshInLoop() {
    this.timeoutId && clearTimeout(this.timeoutId);

    this.refreshPatientData();
    this.timeoutId = setTimeout(() => {
      Log().info('Foreground service timeout reached, starting service');
      this.keepRefreshInLoop(); // Restart the loop
    }, 5000);
  }

  logout() {
    this.authService.logout();
  }
}
