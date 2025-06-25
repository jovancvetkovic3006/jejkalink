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

import { AuthenticationService } from './services/authentication.service';
import { Log } from './utils/log';
import { BehaviorSubject, take } from 'rxjs';
import { CommonModule } from '@angular/common';
import { App } from '@capacitor/app';
import { BackgroundWeb } from './services/background-web.service';
// Import BackgroundWeb if it exists in your project

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
    private readonly authService: AuthenticationService,
    private readonly bckg: BackgroundWeb
  ) {
    if (this.authService.isTokenExpired()) {
      this.authService.login();
    }
  }

  async init() {
    const hasPermission = await this.bckg.ensureNotificationPermission();
    if (!hasPermission) {
      await this.bckg.requestPermissions();
    }

    (window as any).Capacitor.Plugins.Background.addListener('onDataFetched', async (info: any) => {
      console.log('[LOGG] Data fetched:', info);
    });

    (window as any).Capacitor.Plugins.Background.addListener('onTokenRefreshed', async (info: any) => {
      console.log('[LOGG] Got token refresh:', info);
      this.authService.setTokens(info);
      this.authService.doRefresh();
    });

    (window as any).Capacitor.Plugins.Background.addListener('onLogged', async (info: any) => {
      console.log('[LOGG DEBUG]', info);
    });

    await this.bckg.setTokens(this.authService.getTokens());
    await this.bckg.startPolling();
  }

  ngOnInit(): void {
    this.authService.doRefresh();

    this.init();

    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        this.authService.doRefresh();
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

  logout() {
    this.authService.logout();
  }
}
