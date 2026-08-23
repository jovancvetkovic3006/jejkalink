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
  appVersion = '1.6.0';
  saved = false;
  debugLog$ = this.authService.debugLog$;
  logsExpanded = false;
  userName = '';
  tokenStatus = 'Nepoznato';
  sessionDetail = '';
  readingsCount = 0;
  failures = 0;
  pollInterval = 5;
  keepRaw = true;
  weekStart: 'monday' | 'sunday' = 'monday';
  weeklyReadEnabled = false;
  flagUnusualDays = false;
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
    } catch { /* ignore */ }
  }

  private updateTokenStatus() {
    if (this.authService.isTokenExpired()) {
      this.tokenStatus = 'Istekao';
      this.sessionDetail = 'Potrebna ponovna prijava';
    } else {
      try {
        const token = this.authService.getToken();
        const parts = token.split('.');
        const padded = parts[1] + '='.repeat((4 - parts[1].length % 4) % 4);
        const payload = JSON.parse(atob(padded));
        const exp = new Date(payload.exp * 1000);
        this.tokenStatus = 'Aktivan';
        this.sessionDetail =
          'Važi do ' + exp.toLocaleString('sr-Latn-RS');
      } catch {
        this.tokenStatus = 'Aktivan';
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
    return this.weekStart === 'monday' ? 'Ponedeljak' : 'Nedelja';
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
