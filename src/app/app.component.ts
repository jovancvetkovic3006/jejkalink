import { Component, NgZone, OnInit } from '@angular/core';
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
import { take } from 'rxjs';

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
export class AppComponent implements OnInit {
  userName: any;

  constructor(public authService: AuthService, public notifyService: NotificationsService, private readonly ngZone: NgZone) {
    if (this.authService.isTokenExpired()) {
      this.authService.login();
    }

    this.ngZone.run(() => {
      this.notifyService.checkPermissions();
      this.notifyService.requestManageOverlayPermission();
    });
  }

  ngOnInit(): void {
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

    this.authService.getData().subscribe({
      next: (data: any) => {
        Log().info('Patient data: ', data.data);
        const patientData = this.authService.processPatientData(data.data)
        this.authService.data$.next(patientData);

        this.ngZone.run(() => {

          this.notifyService.createNotificationChannel().then(() => {
            Log().info('Notification channel created successfully');
            this.notifyService.startForegroundService().then(() => {
              Log().info('Foreground service started successfully');
            }).catch((error) => {
              Log().error('Error starting foreground service: ', error);
            });
          });

        });
      },
      error: (err: any) => {
        Log().error('Data request failed: ', err);
      },
    });
  }

  logout() {
    this.authService.logout();
  }
}
