import { Component, OnInit } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthenticationService } from '../services/authentication.service';
import { SgsHistoryService } from '../services/sgs-history.service';
import { AppSettingsService } from '../services/app-settings.service';
import { CollectorHealthService } from '../services/collector-health.service';
import { PageTbarComponent } from '../components/page-tbar/page-tbar.component';
import { CoverageStripComponent } from '../components/coverage-strip/coverage-strip.component';
import { detectGaps } from '../analytics';
import { TabSwipeDirective } from '../directives/tab-swipe.directive';

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  imports: [
    IonContent,
    FormsModule,
    CommonModule,
    PageTbarComponent,
    CoverageStripComponent,
    TabSwipeDirective,
  ],
})
export class SettingsPage implements OnInit {
  patientUsername = '';
  appVersion = '1.13.0';
  saved = false;
  debugLog$ = this.authService.debugLog$;
  logsExpanded = false;
  userName = '';
  tokenStatus = 'Unknown';
  sessionDetail = '';
  readingsCount = 0;
  failures = 0;
  failureAlertAt = 3;
  pollInterval = 5;
  keepRaw = true;
  weekStart: 'monday' | 'sunday' = 'monday';
  weeklyReadEnabled = false;
  flagUnusualDays = false;
  targetLow = 3.9;
  targetHigh = 10.0;
  uptimeCoverage: ReturnType<typeof detectGaps> | null = null;
  uptimeStart = new Date();
  uptimeEnd = new Date();

  constructor(
    private readonly authService: AuthenticationService,
    private readonly history: SgsHistoryService,
    private readonly appSettings: AppSettingsService,
    private readonly collectorHealth: CollectorHealthService
  ) {}

  ngOnInit() {
    this.patientUsername =
      localStorage.getItem('patientUsername') || 'jejka3006';
    this.loadUserInfo();
    this.updateTokenStatus();
    this.readingsCount = this.history.readings().length;
    const s = this.appSettings.get();
    this.keepRaw = s.keepRaw;
    this.weekStart = s.weekStart;
    this.weeklyReadEnabled = s.weeklyReadEnabled;
    this.flagUnusualDays = s.flagUnusualDays;
    this.pollInterval = s.pollIntervalMin;
    this.failureAlertAt = s.failureAlertAt;
    this.targetLow = s.targetLow;
    this.targetHigh = s.targetHigh;
    this.collectorHealth.failures$.subscribe((n) => (this.failures = n));
    this.refreshUptime();
    this.history.allSgs$.subscribe(() => {
      this.readingsCount = this.history.readings().length;
      this.refreshUptime();
    });
  }

  private refreshUptime() {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    this.uptimeStart = start;
    this.uptimeEnd = end;
    this.uptimeCoverage = detectGaps(this.history.readings(), start, end);
  }

  private loadUserInfo() {
    try {
      const raw = localStorage.getItem('userInfo');
      if (raw) {
        const user = JSON.parse(raw);
        this.userName = user.name || '';
      }
    } catch {
      /* ignore */
    }
  }

  private updateTokenStatus() {
    if (this.authService.isTokenExpired()) {
      this.tokenStatus = 'Expired';
      this.sessionDetail = 'Sign in again';
    } else {
      try {
        const token = this.authService.getToken();
        const parts = token.split('.');
        const padded = parts[1] + '='.repeat((4 - (parts[1].length % 4)) % 4);
        const payload = JSON.parse(atob(padded));
        const exp = new Date(payload.exp * 1000);
        this.tokenStatus = 'Live';
        this.sessionDetail = 'Valid until ' + exp.toLocaleString('en-GB');
      } catch {
        this.tokenStatus = 'Live';
        this.sessionDetail = '';
      }
    }
  }

  saveUsername() {
    localStorage.setItem('patientUsername', this.patientUsername);
    this.saved = true;
    setTimeout(() => (this.saved = false), 2000);
  }

  toggleKeepRaw() {
    this.keepRaw = !this.keepRaw;
    this.appSettings.patch({ keepRaw: this.keepRaw });
  }

  toggleWeeklyRead() {
    this.weeklyReadEnabled = !this.weeklyReadEnabled;
    this.appSettings.patch({ weeklyReadEnabled: this.weeklyReadEnabled });
  }

  toggleUnusualDays() {
    this.flagUnusualDays = !this.flagUnusualDays;
    this.appSettings.patch({ flagUnusualDays: this.flagUnusualDays });
  }

  weekStartLabel(): string {
    return this.weekStart === 'monday' ? 'Monday' : 'Sunday';
  }

  toggleWeekStart() {
    this.weekStart = this.weekStart === 'monday' ? 'sunday' : 'monday';
    this.appSettings.patch({ weekStart: this.weekStart });
  }

  stepPoll(delta: number) {
    const next = Math.min(15, Math.max(5, this.pollInterval + delta));
    if (next === this.pollInterval) return;
    this.pollInterval = next;
    this.appSettings.patch({ pollIntervalMin: next });
  }

  stepFailureAlert(delta: number) {
    const next = Math.min(20, Math.max(1, this.failureAlertAt + delta));
    if (next === this.failureAlertAt) return;
    this.failureAlertAt = next;
    this.appSettings.patch({ failureAlertAt: next });
  }

  stepTargetLow(delta: number) {
    const next = Math.round((this.targetLow + delta) * 10) / 10;
    if (next < 3.0 || next >= this.targetHigh - 0.5) return;
    this.targetLow = next;
    this.appSettings.patch({ targetLow: next });
  }

  stepTargetHigh(delta: number) {
    const next = Math.round((this.targetHigh + delta) * 10) / 10;
    if (next > 15.0 || next <= this.targetLow + 0.5) return;
    this.targetHigh = next;
    this.appSettings.patch({ targetHigh: next });
  }

  importCsvHint() {
    /* v1 shell — file picker later */
  }

  exportPdfHint() {
    /* v1 shell */
  }

  logout() {
    this.authService.logout();
  }

  clearLogs() {
    localStorage.removeItem('debug_logs');
    this.authService.debugLog$.next([]);
  }

  sendLogs() {
    this.authService.sendLogsViaEmail();
  }
}
