import { Component, OnDestroy, OnInit } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AlarmsService, AlarmSettings, FiredAlarm } from '../services/alarms.service';
import { SgsHistoryService } from '../services/sgs-history.service';
import { PageTbarComponent } from '../components/page-tbar/page-tbar.component';
import { EventRowComponent } from '../components/event-row/event-row.component';
import { GlassPanelComponent } from '../components/glass-panel/glass-panel.component';
import { LOW_CLEAR } from '../domain/glucose';
import { TabSwipeDirective } from '../directives/tab-swipe.directive';

const PLACEHOLDER_FIRED: FiredAlarm[] = [
  {
    id: 'ph-f1',
    timestamp: new Date().toISOString(),
    rule: 'low',
    label: 'Low 3.7',
    tag: null,
  },
  {
    id: 'ph-f2',
    timestamp: new Date().toISOString(),
    rule: 'stale',
    label: 'No data 24 min',
    tag: null,
  },
  {
    id: 'ph-f3',
    timestamp: new Date().toISOString(),
    rule: 'projection',
    label: 'Projected low 3.8',
    tag: null,
  },
];

@Component({
  selector: 'app-alarms-page',
  templateUrl: 'alarms.page.html',
  styleUrls: ['alarms.page.scss'],
  imports: [
    CommonModule,
    IonContent,
    PageTbarComponent,
    EventRowComponent,
    GlassPanelComponent,
    TabSwipeDirective,
  ],
})
export class AlarmsPage implements OnInit, OnDestroy {
  settings!: AlarmSettings;
  fired: FiredAlarm[] = [];
  displayFired: FiredAlarm[] = [];
  firedPlaceholder = false;
  snoozeMin = 0;
  private snoozeSub?: Subscription;

  thresholdRows: {
    key: 'urgentLow' | 'low' | 'high' | 'fallingFast';
    label: string;
    hint: string;
  }[] = [
    { key: 'low', label: 'Low', hint: `Clears at ${LOW_CLEAR}` },
    { key: 'urgentLow', label: 'Urgent low', hint: 'Ignores snooze' },
    { key: 'high', label: 'High', hint: 'After 30 min above' },
    { key: 'fallingFast', label: 'Falling fast', hint: 'mmol/L per minute' },
  ];

  ruleRows: {
    key: keyof AlarmSettings;
    label: string;
    hint: string;
  }[] = [
    { key: 'staleEnabled', label: 'No data for 20 min', hint: 'Treated as urgent' },
    { key: 'projectionEnabled', label: 'Alert on projection', hint: 'Uses 15-min forecast' },
    { key: 'overnightProfile', label: 'Overnight profile', hint: '22:00–07:00 · low at 4.2' },
    { key: 'repeatUntilCleared', label: 'Repeat until cleared', hint: 'Every 15 min' },
  ];

  constructor(
    private readonly alarms: AlarmsService,
    private readonly history: SgsHistoryService
  ) {}

  ngOnInit() {
    this.settings = { ...this.alarms.settings$.value };
    this.refreshSnooze();
    this.snoozeSub = this.alarms.snoozeUntilMs$.subscribe(() => this.refreshSnooze());
    this.alarms.fired$.subscribe(() => {
      this.fired = this.alarms.firedThisWeek();
      this.firedPlaceholder = this.fired.length === 0;
      this.displayFired = this.firedPlaceholder ? PLACEHOLDER_FIRED : this.fired;
    });
    this.alarms.evaluate(this.history.readings());
  }

  ngOnDestroy() {
    this.snoozeSub?.unsubscribe();
  }

  save() {
    this.alarms.saveSettings(this.settings);
  }

  step(field: 'urgentLow' | 'low' | 'high' | 'fallingFast', delta: number) {
    this.settings[field] = Math.round((this.settings[field] + delta) * 10) / 10;
    this.save();
  }

  toggleRule(key: keyof AlarmSettings) {
    const cur = this.settings[key];
    if (typeof cur === 'boolean') {
      (this.settings as any)[key] = !cur;
      this.save();
    }
  }

  isRuleOn(key: keyof AlarmSettings): boolean {
    return Boolean(this.settings[key]);
  }

  snooze(minutes: number) {
    this.alarms.snooze(minutes);
    this.refreshSnooze();
  }

  clearSnooze() {
    this.alarms.clearSnooze();
    this.refreshSnooze();
  }

  tagAlarm(id: string, tag: 'real' | 'false') {
    if (this.firedPlaceholder) return;
    this.alarms.tag(id, tag);
  }

  private refreshSnooze() {
    this.snoozeMin = this.alarms.snoozeRemainingMin();
  }

  firedDay(f: FiredAlarm): string {
    return new Date(f.timestamp).toLocaleDateString('en-GB', {
      weekday: 'short',
    });
  }

  firedTime(f: FiredAlarm): string {
    return new Date(f.timestamp).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  firedSubtitle(f: FiredAlarm): string {
    const tag =
      f.tag === 'real' ? ' · real' : f.tag === 'false' ? ' · false alarm' : '';
    if (f.rule === 'stale') return `No fresh reading for 20 min${tag}`;
    if (f.rule === 'projection') return `15-min forecast crossed threshold${tag}`;
    if (f.rule === 'falling_fast') return `Drop rate crossed the fast-fall threshold${tag}`;
    if (f.rule === 'urgent_low') return `Urgent threshold crossed${tag}`;
    if (f.rule === 'low') return `Low threshold crossed${tag}`;
    if (f.rule === 'high') return `High threshold crossed${tag}`;
    return tag.slice(3) || '';
  }

  firedDot(f: FiredAlarm): string {
    if (f.rule === 'stale') return 'var(--muted)';
    if (f.rule.includes('low')) return 'var(--low)';
    if (f.rule === 'projection') return 'var(--gap)';
    return 'var(--amber)';
  }

  trackFired = (_: number, f: FiredAlarm) => f.id;
}
