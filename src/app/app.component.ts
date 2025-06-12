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
import { take, tap } from 'rxjs';
import { App } from '@capacitor/app';
import { BackgroundTask } from '@capawesome/capacitor-background-task';
import { PluginListenerHandle } from '@capacitor/core';
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
  userName: any;

  constructor(private readonly authService: AuthService,
    private readonly notifyService: NotificationsService,
    private readonly ngZone: NgZone,
    private readonly bckgService: BackgroundService) {
    if (this.authService.isTokenExpired()) {
      this.authService.login();
    }

    this.ngZone.run(async () => {
      await this.notifyService.checkPermissions();
      await this.notifyService.requestManageOverlayPermission();
    });
  }

  ngOnInit(): void {
    this.bckgService.startBackgroundTask(this.refreshPatientData);

    // Optionally, load the username from a user service
    const storedUser = localStorage.getItem('userInfo');
    if (storedUser) {
      this.userName = JSON.parse(storedUser).name;
    } else {
      this.authService.user$.pipe(take(1)).subscribe({
        next: (user) => {
          this.userName = user.name;
        },
      });
    }

    this.refreshPatientData().subscribe({
      next: async () => {
        await this.notifyService.startForegroundService();
        await this.notifyService.startForegroundListener();
        Log().info('Foreground service started successfully');
      },
      error: (err: any) => {
        Log().error('Data request failed: ', err);
      },
    });
  }

  refreshPatientData = () => {
    return this.authService.getData().pipe(take(1), tap((data) => {
      const patientData = this.authService.processPatientData(data.data)
      this.authService.data$.next(patientData);
    }));
  }

  ngOnDestroy() {
    this.bckgService.onDestroy();
  }

  logout() {
    this.authService.logout();
  }
}
