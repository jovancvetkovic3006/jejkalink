import { Injectable, NgZone } from '@angular/core';

import { ForegroundService, Importance } from '@capawesome-team/capacitor-android-foreground-service';
import { Log } from '../utils/log';

@Injectable({
  providedIn: 'root'
})
export class NotificationsService {
  constructor(private readonly ngZone: NgZone) { }

  startForegroundService = async () => {
    const permissions = await ForegroundService.checkPermissions();
    Log().info('Foreground service permissions:', permissions);
    if (permissions.display !== 'granted') {
      this.ngZone.run(async () => {
        await this.requestPermissions();
        await this.requestManageOverlayPermission();
      });
    }

    Log().info('Starting foreground service');
    await ForegroundService.startForegroundService({
      id: 1,
      title: 'Glikemija',
      body: 'Nema podataka',
      smallIcon: 'splash',
      silent: false,
      notificationChannelId: 'Default',
    });
  };

  async startForegroundListener(): Promise<void> {
    await ForegroundService.removeAllListeners();
    await ForegroundService.addListener('buttonClicked', event => {
      this.ngZone.run(async () => {
        await ForegroundService.stopForegroundService();
        await ForegroundService.moveToForeground();
      });
    });
  }

  updateForegroundService = async (title = 'Glikemija', body = 'Nema podataka') => {
    Log().info('Updating foreground service');
    await ForegroundService.updateForegroundService({
      id: 1,
      title: title,
      body: body,
      smallIcon: 'splash',
    });
  };

  stopForegroundService = async () => {
    await ForegroundService.stopForegroundService();
  };

  createNotificationChannel = async () => {
    await ForegroundService.createNotificationChannel({
      id: 'Default',
      name: 'Default',
      description: 'Default channel',
      importance: Importance.Max,
    });
  };

  deleteNotificationChannel = async () => {
    await ForegroundService.deleteNotificationChannel({
      id: 'Default',
    });
  };

  async requestPermissions(): Promise<any> {
    await ForegroundService.requestPermissions();
  }

  async requestManageOverlayPermission(): Promise<any> {
    await ForegroundService.requestManageOverlayPermission();
  }

  async checkPermissions(): Promise<any> {
    await ForegroundService.checkPermissions();
  }
}
