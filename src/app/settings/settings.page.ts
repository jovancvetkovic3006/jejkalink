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

  constructor(private readonly authService: AuthenticationService) {}

  ngOnInit() {
    this.patientUsername =
      localStorage.getItem('patientUsername') || 'jejka3006';
  }

  saveUsername() {
    localStorage.setItem('patientUsername', this.patientUsername);
    this.saved = true;
    setTimeout(() => (this.saved = false), 2000);
  }

  logout() {
    this.authService.logout();
  }
}
