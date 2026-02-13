import { Component, OnInit } from '@angular/core';
import {
  IonApp,
  IonRouterOutlet,
  IonToolbar,
  IonHeader,
  IonTitle,
} from '@ionic/angular/standalone';

import { AuthenticationService } from './services/authentication.service';
import { App } from '@capacitor/app';
import { take } from 'rxjs';
import { BackgroundWeb } from './services/background-web.service';
// Import BackgroundWeb if it exists in your project

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [
    IonTitle,
    IonHeader,
    IonToolbar,
    IonApp,
    IonRouterOutlet,
  ],
})
export class AppComponent implements OnInit {
  timeoutId: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly authService: AuthenticationService,
    private readonly bckg: BackgroundWeb
  ) {
    if (this.authService.isTokenExpired()) {
      // Try refreshing token first before forcing full re-login
      this.authService.doRefresh();
    }
  }

  async init() {
    await this.bckg.ensureNotificationPermission();

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

    (window as any).Capacitor.Plugins.Background.addListener('onTokenRefreshFailed', async (info: any) => {
      console.log('[LOGG] Token refresh failed in background:', info);
      // Background refresh failed — try Ionic-side refresh and update background plugin tokens
      this.authService.refreshToken().pipe(take(1)).subscribe({
        next: (tokenData: any) => {
          if (tokenData?.access_token) {
            this.authService.setTokens(tokenData);
            this.bckg.setTokens(this.authService.getTokens());
            console.log('[LOGG] Ionic-side token refresh OK, updated background plugin');
          } else {
            console.log('[LOGG] Ionic-side refresh returned no token, re-login needed');
            this.authService.login();
          }
        },
        error: () => {
          console.log('[LOGG] Ionic-side refresh also failed, re-login needed');
          this.authService.login();
        }
      });
    });

    await this.bckg.setTokens(this.authService.getTokens());
    await this.bckg.startPolling();
  }

  ngOnInit(): void {
    if (!this.authService.isTokenExpired()) {
      this.authService.doRefresh();
    }

    this.init();

    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        // Always try to refresh when app comes to foreground
        this.authService.doRefresh();
      }
    });
  }

}
