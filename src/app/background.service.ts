import { Injectable } from '@angular/core';

import { ForegroundService, Importance } from '@capawesome-team/capacitor-android-foreground-service';
import { Log } from './utils/log';
import { App } from '@capacitor/app';
import { BackgroundTask } from '@capawesome/capacitor-background-task';
import { PluginListenerHandle } from '@capacitor/core';

@Injectable({
  providedIn: 'root'
})
export class BackgroundService {
  runInForeground = true; // Set to false if you want to disable background tasks
  appStateChangeListener: Promise<PluginListenerHandle> | undefined;

  startBackgroundTask(callback: any): void {
    Log().info('Ready background task listener');
    setInterval(() => {
      if (this.runInForeground) {
        callback();
      }
    }, 30000); // 60,000 ms = 1 minute

    this.appStateChangeListener = App.addListener(
      'appStateChange',
      async ({ isActive }) => {
        Log().info('App state changed: ', isActive);
        if (isActive) {
          this.runInForeground = true;
          return;
        }

        const taskId = await BackgroundTask.beforeExit(async () => {
          this.runInForeground = false;
          await this.runTask(callback);
          BackgroundTask.finish({ taskId });
        });
      },
    );
  }

  onDestroy() {
    this.appStateChangeListener?.then(listener => listener.remove());
  }

  private async runTask(callback: any): Promise<void> {
    const taskDurationMs = 120000;
    const end = new Date().getTime() + taskDurationMs;
    while (new Date().getTime() < end) {
      const isAppActive = await this.isAppActive();
      if (isAppActive) {
        this.runInForeground = true;
        break;
      }
      Log().info('Background task still active.');
      await callback();
    }
  }

  private async isAppActive(): Promise<boolean> {
    const currentState = await App.getState();
    return currentState.isActive;
  }
}
