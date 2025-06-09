import { Component } from '@angular/core';
import {
  IonApp,
  IonRouterOutlet,
  IonToolbar,
  IonButton,
  IonHeader,
  IonTitle,
  IonButtons,
} from '@ionic/angular/standalone';

import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { AuthService } from './services/auth.service';
import { Log } from './utils/log';

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
  ],
})
export class AppComponent {
  userName: any;

  constructor(public authService: AuthService) {
    // Optionally, load the username from a user service
    const storedUser = localStorage.getItem('userInfo');
    if (storedUser) {
      this.userName = JSON.parse(storedUser).name;
    } else {
      this.authService.user$.subscribe({
        next: (user) => {
          this.userName = user.name;
        },
      });
    }

    this.authService.getData().subscribe({
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

  logout() {
    this.authService.logout();
  }
}
