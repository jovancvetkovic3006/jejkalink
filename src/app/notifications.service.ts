import { Injectable } from '@angular/core';

import { ForegroundService, Importance } from '@capawesome-team/capacitor-android-foreground-service';
import { Log } from './utils/log';

@Injectable({
  providedIn: 'root'
})
export class NotificationsService {
  startForegroundService = async () => {
    Log().info('Starting foreground service');
    await ForegroundService.startForegroundService({
      id: 1,
      title: 'Title',
      body: 'Body',
      smallIcon: 'splash',
      silent: false,
      notificationChannelId: 'default',
    });
  };

  updateForegroundService = async () => {
    Log().info('Updating foreground service');
    await ForegroundService.updateForegroundService({
      id: 1,
      title: 'Title',
      body: 'Body',
      smallIcon: 'splash',
    });
  };

  stopForegroundService = async () => {
    await ForegroundService.stopForegroundService();
  };

  createNotificationChannel = async () => {
    await ForegroundService.createNotificationChannel({
      id: 'default',
      name: 'Default',
      description: 'Default channel',
      importance: Importance.Max,
    });
  };

  deleteNotificationChannel = async () => {
    await ForegroundService.deleteNotificationChannel({
      id: 'default',
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
