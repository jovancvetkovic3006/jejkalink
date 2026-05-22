import { Component, OnInit } from '@angular/core';
import {
  IonApp,
  IonRouterOutlet,
  IonToolbar,
  IonHeader,
  IonTitle,
  Platform,
} from '@ionic/angular/standalone';

import { AuthenticationService } from './services/authentication.service';
import { App } from '@capacitor/app';
import { take } from 'rxjs';
import { BackgroundWeb } from './services/background-web.service';

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
    private readonly bckg: BackgroundWeb,
    private readonly platform: Platform
  ) {}

  async init() {
    await this.bckg.ensureNotificationPermission();
    // Request full-screen intent permission (needed for lock screen notifications on Android 14+)
    try {
      await (window as any).Capacitor.Plugins.Background.requestFullScreenPermission();
    } catch (e) {
      console.log('[LOGG] requestFullScreenPermission error:', e);
    }

    (window as any).Capacitor.Plugins.Background.addListener('onDataFetched', async (info: any) => {
      console.log('[LOGG] Data fetched:', info);
    });

    (window as any).Capacitor.Plugins.Background.addListener('onTokenRefreshed', async (info: any) => {
      console.log('[LOGG] Got token refresh from background:', info);
      this.authService.setTokens({
        access_token: info?.access_token ?? info?.accessToken,
        refresh_token: info?.refresh_token ?? info?.refreshToken,
        id_token: info?.id_token ?? info?.idToken,
      });
    });

    (window as any).Capacitor.Plugins.Background.addListener('onLogged', async (info: any) => {
      console.log('[LOGG DEBUG]', info);
    });

    (window as any).Capacitor.Plugins.Background.addListener('onTokenRefreshFailed', async (info: any) => {
      console.log('[LOGG] Token refresh failed in background:', info);
      // Don't try Ionic-side refresh here — it would race with background plugin
      // and potentially invalidate rotating refresh tokens.
      // doRefresh will handle re-login if needed when user opens the app.
    });

    await this.bckg.setTokens(this.authService.getTokens());
    await this.bckg.startPolling();
  }

  ngOnInit(): void {
    void this.bootstrap();

    App.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
        await this.syncTokensFromPlugin();
        this.authService.doRefresh();
      }
    });

    this.platform.backButton.subscribeWithPriority(10, () => {
      App.exitApp();
    });
  }

  private async syncTokensFromPlugin() {
    try {
      const pluginTokens = await (window as any).Capacitor.Plugins.Background.getTokens();
      if (pluginTokens?.accessToken) {
        this.authService.setTokens({
          access_token: pluginTokens.accessToken,
          refresh_token: pluginTokens.refreshToken,
        });
        console.log('[LOGG] Synced tokens from background plugin');
      }
    } catch (e) {
      console.log('[LOGG] Failed to sync tokens from background plugin:', e);
    }
  }

  private async bootstrap() {
    await this.init();
    await this.syncTokensFromPlugin();
    this.authService.doRefresh();
  }

}
