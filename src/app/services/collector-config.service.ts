import { Injectable } from '@angular/core';
import { BackgroundWeb } from './background-web.service';
import { AppSettingsService } from './app-settings.service';

/** Push collector settings from Ionic into the Android background plugin. */
@Injectable({ providedIn: 'root' })
export class CollectorConfigService {
  constructor(
    private readonly bckg: BackgroundWeb,
    private readonly appSettings: AppSettingsService
  ) {}

  async syncToNative() {
    const s = this.appSettings.get();
    const patientUsername =
      localStorage.getItem('patientUsername')?.trim() || 'jejka3006';
    try {
      await this.bckg.setCollectorConfig({
        pollIntervalMin: s.pollIntervalMin,
        failureAlertAt: s.failureAlertAt,
        patientUsername,
      });
    } catch (e) {
      console.log('[collector] setCollectorConfig failed', e);
    }
  }
}
