import { Injectable } from '@angular/core';

import { Capacitor } from '@capacitor/core';
import { ForegroundService, Importance, ServiceType } from '@capawesome-team/capacitor-android-foreground-service';
import { Log } from './utils/log';

@Injectable({
  providedIn: 'root'
})
export class NotificationsService {

  constructor() { }


  startForegroundService = async () => {
    Log().info('Starting foreground service');
    return ForegroundService.startForegroundService({
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

  requestPermissions(): Promise<any> {
    return ForegroundService.requestPermissions();
  }

  requestManageOverlayPermission(): Promise<any> {
    return ForegroundService.requestManageOverlayPermission();
  }

  checkPermissions(): Promise<any> {
    return ForegroundService.checkPermissions();
  }
}
