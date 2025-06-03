import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  clientId = '4fb211b8-f130-4398-b51e-28900bf68527';
  redirectUri = 'com.medtronic.carepartner:/sso';
  scope = 'openid profile roles country';

  constructor(public authService: AuthService) {
    this.authService.authCode$.subscribe((code) => {
      if (code) {
        // Here you can call your backend with the code
        console.log('Received auth code in component:', code);
      }
    });
  }
}
