import { Component, OnInit } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonButton,
  IonIcon,
  IonNote,
} from '@ionic/angular/standalone';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthenticationService } from '../services/authentication.service';

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonInput,
    IonButton,
    IonIcon,
    IonNote,
    FormsModule,
    CommonModule,
  ],
})
export class SettingsPage implements OnInit {
  patientUsername = '';
  appVersion = '0.1.0';
  saved = false;
  debugLog$ = this.authService.debugLog$;
  logsExpanded = false;
  userName = '';
  userEmail = '';
  tokenStatus = '';

  constructor(private readonly authService: AuthenticationService) {}

  ngOnInit() {
    this.patientUsername =
      localStorage.getItem('patientUsername') || 'jejka3006';
    this.loadUserInfo();
    this.updateTokenStatus();
  }

  private loadUserInfo() {
    try {
      const raw = localStorage.getItem('userInfo');
      if (raw) {
        const user = JSON.parse(raw);
        this.userName = user.name || '';
        this.userEmail = user.email || user.nickname || '';
      }
    } catch { /* ignore */ }
  }

  private updateTokenStatus() {
    if (this.authService.isTokenExpired()) {
      this.tokenStatus = 'Istekao';
    } else {
      try {
        const token = this.authService.getToken();
        const parts = token.split('.');
        const padded = parts[1] + '='.repeat((4 - parts[1].length % 4) % 4);
        const payload = JSON.parse(atob(padded));
        const exp = new Date(payload.exp * 1000);
        this.tokenStatus = 'Aktivan do ' + exp.toLocaleString();
      } catch {
        this.tokenStatus = 'Aktivan';
      }
    }
  }

  saveUsername() {
    localStorage.setItem('patientUsername', this.patientUsername);
    this.saved = true;
    setTimeout(() => (this.saved = false), 2000);
  }

  logout() {
    this.authService.logout();
  }

  clearLogs() {
    localStorage.removeItem('debug_logs');
    this.authService.debugLog$.next([]);
  }
}
