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
  runInForeground = true; // Set to false if you want to disable background tasks
  private appStateChangeListener: Promise<PluginListenerHandle> | undefined;

  constructor(public authService: AuthService, public notifyService: NotificationsService, private readonly ngZone: NgZone) {
    if (this.authService.isTokenExpired()) {
      this.authService.login();
    }

    this.ngZone.run(async () => {
      await this.notifyService.checkPermissions();
      await this.notifyService.requestManageOverlayPermission();
    });
  }

  ngOnInit(): void {
    this.addListeners();

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
        Log().info('Foreground service started successfully');
      },
      error: (err: any) => {
        Log().error('Data request failed: ', err);
      },
    });

    setInterval(() => {
      if (this.runInForeground) {
        this.refreshPatientData()
      }
    }, 30000); // 60,000 ms = 1 minute
  }

  refreshPatientData() {
    return this.authService.getData().pipe(take(1), tap((data) => {
      const patientData = this.authService.processPatientData(data.data)
      this.authService.data$.next(patientData);
    }));
  }

  ngOnDestroy() {
    this.appStateChangeListener?.then(listener => listener.remove());
  }

  logout() {
    this.authService.logout();
  }

  private addListeners(): void {
    Log().info('Ready background task listener');
    this.appStateChangeListener = App.addListener(
      'appStateChange',
      ({ isActive }) => {
        Log().info('App state changed: ', isActive);
        this.ngZone.run(async () => {
          if (isActive) {
            this.runInForeground = true;
            return;
          }

          const taskId = await BackgroundTask.beforeExit(async () => {
            this.runInForeground = false;
            await this.runTask();
            BackgroundTask.finish({ taskId });
          });
        });
      },
    );
  }

  private async runTask(): Promise<void> {
    const taskDurationMs = 120000;
    const end = new Date().getTime() + taskDurationMs;
    while (new Date().getTime() < end) {
      const isAppActive = await this.isAppActive();
      if (isAppActive) {
        this.runInForeground = true;
        break;
      }
      Log().info('Background task still active.');
      await this.refreshPatientData();
    }
  }

  private async isAppActive(): Promise<boolean> {
    const currentState = await App.getState();
    return currentState.isActive;
  }
}
