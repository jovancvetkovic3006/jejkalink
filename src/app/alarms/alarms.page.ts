import { Component, OnInit } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
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
    ScrollingModule,
    IonContent,
    PageTbarComponent,
    EventRowComponent,
    GlassPanelComponent,
    TabSwipeDirective,
  ],
})
export class AlarmsPage implements OnInit {
  settings!: AlarmSettings;
  fired: FiredAlarm[] = [];
  displayFired: FiredAlarm[] = [];
  firedPlaceholder = false;

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
    this.alarms.fired$.subscribe(() => {
      this.fired = this.alarms.firedThisWeek();
      this.firedPlaceholder = this.fired.length === 0;
      this.displayFired = this.firedPlaceholder ? PLACEHOLDER_FIRED : this.fired;
    });
    this.alarms.evaluate(this.history.readings());
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
    if (f.rule === 'stale') return 'No fresh reading for 20 min';
    if (f.rule === 'projection') return '15-min forecast crossed threshold';
    if (f.rule === 'falling_fast') return 'Drop rate crossed the fast-fall threshold';
    if (f.rule === 'urgent_low') return 'Urgent threshold crossed';
    if (f.rule === 'low') return 'Low threshold crossed';
    if (f.rule === 'high') return 'High threshold crossed';
    return '';
  }

  firedDot(f: FiredAlarm): string {
    if (f.rule === 'stale') return 'var(--muted)';
    if (f.rule.includes('low')) return 'var(--low)';
    if (f.rule === 'projection') return 'var(--gap)';
    return 'var(--amber)';
  }

  trackFired = (_: number, f: FiredAlarm) => f.id;
}
