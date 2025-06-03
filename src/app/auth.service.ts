import { Injectable } from '@angular/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private clientId = '4fb211b8-f130-4398-b51e-28900bf68527';
  private redirectUri = 'com.medtronic.carepartner:/sso';
  private scope = 'openid profile roles country';

  // Observable for auth code (or tokens if you want)
  public authCode$ = new BehaviorSubject<string | null>(null);

  constructor() {
    this.setupDeepLinkListener();
  }

  private setupDeepLinkListener() {
    App.addListener('appUrlOpen', async (data) => {
      console.log('App URL Open:', data.url);

      if (data.url && data.url.startsWith(this.redirectUri)) {
        try {
          await Browser.close();

          const url = new URL(data.url);
          const code = url.searchParams.get('code');
          console.log('All query params:', url.searchParams);

          if (code) {
            console.log('Authorization code received:', code);
            this.authCode$.next(code);
          } else {
            console.warn('No authorization code found in redirect URL');
            this.authCode$.next(null);
          }
        } catch (e) {
          console.error('Error parsing URL:', e);
          this.authCode$.next(null);
        }
      } else {
        console.log('URL does not match redirectUri');
      }
    });
  }

  async login() {
    const authUrl = `https://mdtlogin-ocl.medtronic.com/mmcl/auth/oauth/v2/authorize?response_type=code&client_id=${
      this.clientId
    }&redirect_uri=${encodeURIComponent(
      this.redirectUri
    )}&scope=${encodeURIComponent(this.scope)}`;

    await Browser.open({ url: authUrl });
  }
}
