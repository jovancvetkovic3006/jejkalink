import { Component, OnInit } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { AlarmsService, AlarmSettings, FiredAlarm } from '../services/alarms.service';
import { SgsHistoryService } from '../services/sgs-history.service';
import { PageTbarComponent } from '../components/page-tbar/page-tbar.component';
import { EventRowComponent } from '../components/event-row/event-row.component';
import { GlassPanelComponent } from '../components/glass-panel/glass-panel.component';
import { LOW_CLEAR } from '../domain/glucose';
import { TabSwipeDirective } from '../directives/tab-swipe.directive';

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
export class AlarmsPage implements OnInit {
  settings!: AlarmSettings;
  fired: FiredAlarm[] = [];

  thresholdRows: {
    key: 'urgentLow' | 'low' | 'high' | 'fallingFast';
    label: string;
    hint: string;
  }[] = [
    { key: 'low', label: 'Niska', hint: `Razrešava se na ${LOW_CLEAR}` },
    { key: 'urgentLow', label: 'Hitna niska', hint: 'Ne poštuje odloženo' },
    { key: 'high', label: 'Visoka', hint: 'Posle 30 min iznad' },
    { key: 'fallingFast', label: 'Brzo padanje', hint: 'mmol/L po minutu' },
  ];

  ruleRows: {
    key: keyof AlarmSettings;
    label: string;
    hint: string;
  }[] = [
    { key: 'staleEnabled', label: 'Nema podataka 20 min', hint: 'Tretira se kao hitno' },
    { key: 'projectionEnabled', label: 'Alarm na projekciju', hint: 'Koristi prognozu 15 min' },
    { key: 'overnightProfile', label: 'Noćni profil', hint: '22:00–07:00 · niska na 4.2' },
    { key: 'repeatUntilCleared', label: 'Ponavljaj dok se ne razreši', hint: 'Svakih 15 min' },
  ];

  constructor(
    private readonly alarms: AlarmsService,
    private readonly history: SgsHistoryService
  ) {}

  ngOnInit() {
    this.settings = { ...this.alarms.settings$.value };
    this.alarms.fired$.subscribe(() => (this.fired = this.alarms.firedThisWeek()));
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

  tag(id: string, tag: 'real' | 'false') {
    this.alarms.tag(id, tag);
  }

  firedDay(f: FiredAlarm): string {
    return new Date(f.timestamp).toLocaleDateString('sr-Latn-RS', {
      weekday: 'short',
    });
  }

  firedTime(f: FiredAlarm): string {
    return new Date(f.timestamp).toLocaleTimeString('sr-Latn-RS', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  firedSubtitle(f: FiredAlarm): string {
    if (f.tag === 'real') return 'Označeno · stvarno';
    if (f.tag === 'false') return 'Označeno · lažno';
    return 'Označite ispod';
  }

  firedDot(f: FiredAlarm): string {
    if (f.rule === 'stale') return 'var(--muted)';
    if (f.rule.includes('low')) return 'var(--low)';
    if (f.rule === 'projection') return 'var(--gap)';
    return 'var(--amber)';
  }
}
