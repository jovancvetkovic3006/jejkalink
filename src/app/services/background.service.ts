import { Injectable, NgZone } from '@angular/core';
import { Log } from '../utils/log';
import { App } from '@capacitor/app';
import { PluginListenerHandle } from '@capacitor/core';
import { BackgroundTask } from '@capawesome/capacitor-background-task';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class BackgroundService {
  taskId = '' as string; // Use string | undefined to match the type of taskId in BackgroundTask
  timeoutId: ReturnType<typeof setTimeout> | undefined; // Use correct type for timeoutId
  appStateChangeListener: Promise<PluginListenerHandle> | undefined;
  isActive$ = new BehaviorSubject<boolean>(true); // Track app state
  isTaskTriggered$ = new BehaviorSubject<void>(undefined); // Track task state

  constructor(private readonly ngZone: NgZone) { }

  startBackgroundTask(): void {
    Log().info('Ready background task listener');
    this.appStateChangeListener = App.addListener(
      'appStateChange',
      ({ isActive }) => {
        this.ngZone.run(async () => {
          if (isActive) {
            return;
          }

          const taskId = await BackgroundTask.beforeExit(async () => {
            await this.keepRefreshInLoop();
            BackgroundTask.finish({ taskId });
          });
        });
      },
    );
  }

  keepRefreshInLoop = async () => {
    this.timeoutId && clearTimeout(this.timeoutId);
    this.isTaskTriggered$.next();
    this.timeoutId = setTimeout(async () => {
      Log().info('Foreground service timeout reached, starting service');
      await this.keepRefreshInLoop();
    }, 120000);
  }

  onDestroy() {
    this.appStateChangeListener?.then(listener => listener.remove());
  }
}
