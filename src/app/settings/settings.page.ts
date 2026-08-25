import { Component, OnInit } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthenticationService } from '../services/authentication.service';
import { SgsHistoryService } from '../services/sgs-history.service';
import { AppSettingsService } from '../services/app-settings.service';
import { CollectorHealthService } from '../services/collector-health.service';
import { CollectorConfigService } from '../services/collector-config.service';
import { PageTbarComponent } from '../components/page-tbar/page-tbar.component';
import { CoverageStripComponent } from '../components/coverage-strip/coverage-strip.component';
import { detectGaps, periodMetrics, detectTrendPatterns, splitByDayType, detectHypoEpisodes, postMealRises, summarizePostMealRises } from '../analytics';
import { EventsStore } from '../services/events-store.service';
import { AnnotationsStore } from '../services/annotations-store.service';
import { TabSwipeDirective } from '../directives/tab-swipe.directive';
import { parseCareLinkCsv, csvImportSummary } from '../utils/carelink-csv.util';
import {
  buildClinicReportHtml,
  downloadHtmlReport,
} from '../utils/clinic-report.util';
import {
  DataRetentionService,
  HOT_RETENTION_DAYS,
} from '../services/data-retention.service';
import { ApiCaptureService } from '../services/api-capture.service';
import {
  buildArchiveHtml,
  buildArchiveJson,
  downloadTextFile,
} from '../utils/archive-export.util';

const GLOSSARY: { term: string; meaning: string }[] = [
  {
    term: 'TIR',
    meaning: 'Time in range — % of readings between your target low and high.',
  },
  {
    term: 'Tight TIR',
    meaning: 'Time in the tighter 3.9–7.8 mmol/L band.',
  },
  {
    term: 'GMI',
    meaning: 'Glucose Management Indicator — estimated average glucose as a % (like HbA1c).',
  },
  {
    term: 'CV',
    meaning: 'Coefficient of variation — how much glucose swings; aim under 36%.',
  },
  {
    term: 'Mean',
    meaning: 'Average glucose for the period, in mmol/L.',
  },
  {
    term: 'AGP',
    meaning: 'Ambulatory Glucose Profile — typical day pattern by time of day.',
  },
  {
    term: 'Coverage',
    meaning: '% of the period with sensor data (gaps excluded from percentages).',
  },
];

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
  appVersion = '1.30.0';
  saved = false;
  debugLog$ = this.authService.debugLog$;
  apiCaptures$ = this.apiCapture.captures$;
  logsExpanded = false;
  apiExpanded = false;
  glossaryExpanded = false;
  glossary = GLOSSARY;
  clearStatus = '';
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
  csvStatus = '';
  exportStatus = '';
  archiveStatus = '';
  storageLabel = '';
  storageWarning: string | null = null;
  archiveMonths = 0;
  lastArchiveLabel = 'None yet';
  lastExportLabel = 'Never';
  hotRetentionDays = HOT_RETENTION_DAYS;

  constructor(
    private readonly authService: AuthenticationService,
    private readonly history: SgsHistoryService,
    private readonly appSettings: AppSettingsService,
    private readonly collectorHealth: CollectorHealthService,
    private readonly collectorConfig: CollectorConfigService,
    private readonly eventsStore: EventsStore,
    private readonly annotations: AnnotationsStore,
    private readonly retention: DataRetentionService,
    private readonly apiCapture: ApiCaptureService
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
    this.collectorHealth.pollEvents$.subscribe(() => this.refreshUptime());
    this.refreshUptime();
    this.history.allSgs$.subscribe(() => {
      this.readingsCount = this.history.readings().length;
      this.refreshUptime();
      this.refreshRetention();
    });
    this.retention.storageWarning$.subscribe((w) => (this.storageWarning = w));
    this.refreshRetention();
  }

  private refreshRetention() {
    this.storageLabel = this.retention.formatStorageMb();
    this.archiveMonths = this.retention.archiveCount();
    this.lastArchiveLabel = this.retention.lastArchiveLabel();
    this.lastExportLabel = this.retention.lastExportLabel();
  }

  private refreshUptime() {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    this.uptimeStart = start;
    this.uptimeEnd = end;
    this.uptimeCoverage = this.collectorHealth.uptimeCoverage(
      start,
      end,
      this.pollInterval
    );
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
    void this.collectorConfig.syncToNative();
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
    void this.collectorConfig.syncToNative();
  }

  stepFailureAlert(delta: number) {
    const next = Math.min(20, Math.max(1, this.failureAlertAt + delta));
    if (next === this.failureAlertAt) return;
    this.failureAlertAt = next;
    this.appSettings.patch({ failureAlertAt: next });
    void this.collectorConfig.syncToNative();
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
    const input = document.getElementById('csv-import-input') as HTMLInputElement | null;
    input?.click();
  }

  onCsvSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const rows = parseCareLinkCsv(text);
      if (!rows.length) {
        this.csvStatus = 'No glucose rows found in CSV';
        return;
      }
      this.history.merge(rows);
      this.readingsCount = this.history.readings().length;
      this.csvStatus = `Imported · ${csvImportSummary(rows)}`;
    };
    reader.readAsText(file);
  }

  exportPdfHint() {
    const end = new Date();
    const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
    const ranged = this.history.readingsInRange(start.getTime(), end.getTime());
    const m = periodMetrics(ranged, start, end, {
      low: this.targetLow,
      high: this.targetHigh,
    });
    if (m.count === 0) {
      this.exportStatus = 'No readings in the last 14 days';
      return;
    }
    const patient =
      this.patientUsername.trim() || localStorage.getItem('patientUsername') || 'Patient';

    const patterns = detectTrendPatterns(
      ranged,
      start,
      end,
      this.targetLow,
      this.targetHigh
    );
    const hypos = detectHypoEpisodes(ranged, start, end, this.targetLow);
    const daySplit = splitByDayType(ranged, start, end, {
      low: this.targetLow,
      high: this.targetHigh,
    });
    const bolusAnchors = this.eventsStore
      .bolusesInRange(start.getTime(), end.getTime())
      .map((b) => ({ timestamp: b.timestamp, units: b.units }));
    const pm = summarizePostMealRises(
      postMealRises(ranged, bolusAnchors, this.targetHigh)
    );
    const postMealSummary =
      pm.count > 0
        ? `${pm.count} bolus windows · median peak +${pm.medianRiseMmol} mmol at ${pm.medianPeakMin} min`
        : undefined;

    const html = buildClinicReportHtml({
      patientLabel: patient,
      periodLabel: `${start.toLocaleDateString('en-GB')} — ${end.toLocaleDateString('en-GB')}`,
      metrics: m,
      targetLow: this.targetLow,
      targetHigh: this.targetHigh,
      extras: {
        patterns,
        hypos,
        daySplit,
        postMealSummary,
        annotations: this.annotations.inRange(start.getTime(), end.getTime()),
      },
    });
    const stamp = end.toISOString().slice(0, 10);
    downloadHtmlReport(`jejkalink-clinic-${stamp}.html`, html);
    this.exportStatus = 'Report saved (open in browser · Print to PDF)';
  }

  exportArchive() {
    const months = this.retention.loadArchives();
    if (!months.length) {
      this.archiveStatus = 'No monthly archives yet — summaries appear when data rolls past 90 days';
      return;
    }
    const patient =
      this.patientUsername.trim() || localStorage.getItem('patientUsername') || 'Patient';
    const bundle = {
      exportedAt: new Date().toISOString(),
      patientLabel: patient,
      hotRetentionDays: HOT_RETENTION_DAYS,
      months,
    };
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(
      `jejkalink-archive-${stamp}.json`,
      buildArchiveJson(bundle),
      'application/json'
    );
    downloadHtmlReport(`jejkalink-archive-${stamp}.html`, buildArchiveHtml(bundle));
    this.retention.markExported();
    this.refreshRetention();
    this.archiveStatus = `Saved ${months.length} monthly summaries (JSON + HTML)`;
  }

  logout() {
    this.authService.logout();
  }

  clearLogs() {
    this.authService.clearDebugLogs();
  }

  sendLogs() {
    this.authService.sendLogsViaEmail();
  }

  clearApiCaptures() {
    this.apiCapture.clear();
  }

  sendApiCaptures() {
    this.authService.sendApiCapturesViaEmail(this.apiCapture);
  }

  clearLocalData() {
    if (
      !confirm(
        'Clear all local readings, events, notes, archives, and API captures? Sign-in and settings are kept.'
      )
    ) {
      return;
    }
    this.retention.clearLocalData({
      history: this.history,
      events: this.eventsStore,
      annotations: this.annotations,
      apiCapture: this.apiCapture,
      auth: this.authService,
    });
    this.readingsCount = 0;
    this.refreshRetention();
    this.clearStatus = 'Local data cleared';
  }

  trackLog = (index: number, log: string) => `${index}:${log.slice(0, 24)}`;

  trackCapture = (index: number, c: { ts: number }) => `${index}:${c.ts}`;
}
