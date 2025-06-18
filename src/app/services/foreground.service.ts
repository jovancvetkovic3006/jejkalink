import { Injectable, NgZone } from '@angular/core';
import { ForegroundService as CapacitorForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { Log } from '../utils/log';
import { BehaviorSubject } from 'rxjs';
import { App } from '@capacitor/app';
import { PluginListenerHandle } from '@capacitor/core';

@Injectable({
  providedIn: 'root'
})
export class ForegroundService {
  timeoutId: ReturnType<typeof setTimeout> | undefined; // Use correct type for timeoutId
  appStateChangeListener: Promise<PluginListenerHandle> | undefined;

  constructor(private readonly ngZone: NgZone) {
    CapacitorForegroundService.checkPermissions().then(permissions => {
      Log().info('Notification service permissions:', permissions);
      if (permissions.display !== 'granted') {
        this.ngZone.run(async () => {
          await this.requestPermissions();
        });
      }
    });

    CapacitorForegroundService.checkManageOverlayPermission().then(permissions => {
      Log().info('Overlay service permissions:', permissions);
      if (permissions.granted !== true) {
        this.ngZone.run(async () => {
          await this.requestManageOverlayPermission();
        });
      }
    });

    this.appStateChangeListener = App.addListener(
      'appStateChange',
      ({ isActive }) => {
        this.ngZone.run(async () => {
          if (!isActive) {
            this.startForegroundService();
          }
          else {
            Log().info('App is active, stopping foreground service');
            await this.stopForegroundService();
          }
        });
      },
    );
  }

  startForegroundService = async () => {
    Log().info('Starting foreground service');
    await CapacitorForegroundService.startForegroundService({
      id: 1,
      title: 'Glikemija',
      body: 'Nema podataka',
      smallIcon: 'splash',
      silent: false,
      notificationChannelId: 'default',
    });
  };

  updateForegroundService = async (body = 'Nema podataka') => {
    Log().info(`Updating foreground service with: ${body}`);
    await CapacitorForegroundService.updateForegroundService({
      id: 1,
      title: 'Glikemija',
      body: body,
      smallIcon: 'splash',
    });
  };

  stopForegroundService = async () => {
    await CapacitorForegroundService.stopForegroundService();
  };

  requestPermissions = async (): Promise<any> => {
    await CapacitorForegroundService.requestPermissions();
  }

  requestManageOverlayPermission = async (): Promise<any> => {
    await CapacitorForegroundService.requestManageOverlayPermission();
  }

  checkPermissions = async (): Promise<any> => {
    await CapacitorForegroundService.checkPermissions();
  }

  checkManageOverlayPermission = async (): Promise<any> => {
    await CapacitorForegroundService.checkManageOverlayPermission();
  }

  keepRefreshInLoop(callback: any) {
    this.timeoutId && clearTimeout(this.timeoutId);

    callback();
    this.timeoutId = setTimeout(() => {
      Log().info('Foreground service timeout reached, starting service');
      this.keepRefreshInLoop(callback); // Restart the loop
    }, 5000);
  }
}
