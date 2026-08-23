import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonButton,
  IonIcon,
  IonTitle,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-screen-header',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
  ],
  template: `
    <ion-header class="screen-ion-header">
      <ion-toolbar class="screen-toolbar">
        <ion-buttons slot="start" *ngIf="showBack">
          <ion-button (click)="onBack?.()">
            <ion-icon name="chevron-back-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>
          <div class="tbar-inner">
            <span class="title">{{ title }}</span>
            <span class="who" *ngIf="pill">{{ pill }}</span>
          </div>
        </ion-title>
        <ion-buttons slot="end" *ngIf="showForward">
          <ion-button (click)="onForward?.()" [disabled]="forwardDisabled">
            <ion-icon name="chevron-forward-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <div class="status-strip" *ngIf="statusLeft || statusRight">
        <span>{{ statusLeft }}</span>
        <span>{{ statusRight }}</span>
      </div>
    </ion-header>
  `,
  styles: [
    `
      .screen-ion-header ion-toolbar {
        --background: var(--paper);
        --border-color: transparent;
      }
      .tbar-inner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        width: 100%;
      }
      .title {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: var(--t-title);
        letter-spacing: -0.02em;
        color: var(--ink);
      }
      .who {
        font-family: var(--font-data);
        font-size: 10.5px;
        color: var(--muted);
        border: 1px solid var(--line);
        border-radius: var(--r-pill);
        padding: 3px 9px;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .status-strip {
        display: flex;
        justify-content: space-between;
        padding: 0 18px 8px;
        font-family: var(--font-data);
        font-size: 10.5px;
        color: var(--muted);
        background: var(--paper);
      }
    `,
  ],
})
export class ScreenHeaderComponent {
  @Input() title = '';
  @Input() pill = '';
  @Input() statusLeft = '';
  @Input() statusRight = '';
  @Input() showBack = false;
  @Input() showForward = false;
  @Input() forwardDisabled = false;
  @Input() onBack?: () => void;
  @Input() onForward?: () => void;
}
