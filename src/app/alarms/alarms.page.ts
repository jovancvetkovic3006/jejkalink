import { Component, OnInit } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonToggle,
  IonItem,
  IonLabel,
  IonList,
  IonButton,
  IonNote,
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlarmsService, AlarmSettings, FiredAlarm } from '../services/alarms.service';
import { SgsHistoryService } from '../services/sgs-history.service';

@Component({
  selector: 'app-alarms-page',
  templateUrl: 'alarms.page.html',
  styleUrls: ['alarms.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonToggle,
    IonItem,
    IonLabel,
    IonList,
    IonButton,
    IonNote,
  ],
})
export class AlarmsPage implements OnInit {
  settings!: AlarmSettings;
  fired: FiredAlarm[] = [];
  thresholdRows: { key: 'urgentLow' | 'low' | 'high' | 'fallingFast'; label: string }[] = [
    { key: 'urgentLow', label: 'Hitna niska' },
    { key: 'low', label: 'Niska' },
    { key: 'high', label: 'Visoka' },
    { key: 'fallingFast', label: 'Brzo padanje /min' },
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
    const cur = this.settings[field];
    this.settings[field] = Math.round((cur + delta) * 10) / 10;
    this.save();
  }

  tag(id: string, tag: 'real' | 'false') {
    this.alarms.tag(id, tag);
  }
}
