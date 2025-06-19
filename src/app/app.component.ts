import { Component, OnInit } from '@angular/core';
import {
  IonApp,
  IonRouterOutlet,
  IonToolbar,
  IonButton,
  IonHeader,
  IonTitle,
  IonButtons,
  IonIcon,
} from '@ionic/angular/standalone';

import { AuthenticationService } from './services/authentication.service';
import { Log } from './utils/log';
import { BehaviorSubject, take } from 'rxjs';
import { CommonModule } from '@angular/common';
import { App } from '@capacitor/app';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [
    IonButtons,
    IonTitle,
    IonHeader,
    IonButton,
    IonToolbar,
    IonApp,
    IonRouterOutlet,
    IonIcon,
    CommonModule,
  ],
})
export class AppComponent implements OnInit {
  timeoutId: ReturnType<typeof setTimeout> | undefined;
  username$ = new BehaviorSubject<string>('Jefimija Cvetkovic');

  constructor(
    private readonly authService: AuthenticationService,
  ) {
    if (this.authService.isTokenExpired()) {
      this.authService.login();
    }
  }

  ngOnInit(): void {
    this.authService.doRefresh();

    // App.addListener('appStateChange', ({ isActive }) => {
    //   if (isActive) {
    //     this.authService.doRefresh();
    //   }
    // });

    // Optionally, load the username from a user service
    const storedUser = localStorage.getItem('userInfo');
    if (storedUser) {
      this.username$.next(JSON.parse(storedUser).name);
    } else {
      this.authService.user$.pipe(take(1)).subscribe({
        next: (user) => {
          this.username$.next(user.name);
        },
      });
    }
  }

  logout() {
    this.authService.logout();
  }
}
