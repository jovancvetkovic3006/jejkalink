import { Injectable } from '@angular/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { BehaviorSubject, from, Observable, of, take } from 'rxjs';
import { isTokenExpired } from '../utils/token.util';
import { Log } from '../utils/log.js';
import { CapacitorHttp, HttpResponse } from '@capacitor/core';
import { BackgroundWeb } from './background-web.service';
import { MedtronicDiscoveryService } from './medtronic-discovery.service';

export interface IUserInfo {
  name: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthenticationService {
  private clientId = 'PeAhkbhQWlQRxJiQxWfcFBiGus1lxfe9';
  private redirectUri = 'com.medtronic.carepartner:/sso';
  private scope = 'profile openid offline_access';
  private audience = 'carepartner.patient.ous';

  public debugLog$ = new BehaviorSubject<string[]>([]);
  private addDebug(msg: string) {
    const logs = this.debugLog$.value;
    logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (logs.length > 50) logs.shift();
    this.debugLog$.next([...logs]);
    Log().info(msg);
  }

  // Observable for auth code (or tokens if you want)
  public authCode$ = new BehaviorSubject<string | null>(null);

  private tokenEndpoint =
    'https://carelink-login.minimed.eu/oauth/token';

  private userEndpoint =
    'https://carelink-login.minimed.eu/userinfo';

  private loginEndpoint =
    'https://carelink-login.minimed.eu/authorize';

  private logoutEndpoint =
    'https://carelink-login.minimed.eu/oidc/logout';

  private dataEndpoint =
    'https://clcloud.minimed.eu/connect/carepartner/v13/display/message';

  // Observable for tokens after exchange
  public accessToken$ = new BehaviorSubject<any | null>(null);
  public refreshToken$ = new BehaviorSubject<any | null>(null);
  public idToken$ = new BehaviorSubject<any | null>(null);
  public user$ = new BehaviorSubject<any | null>(null);
  patientData$: BehaviorSubject<any> = new BehaviorSubject({
    current: 0,
    trend: '',
    glicemia: [] as string[],
    insulin: [] as string[],
    pump: [] as string[],
    senzor: [] as string[],
  });

  constructor(
    private readonly bckg: BackgroundWeb,
    private readonly discovery: MedtronicDiscoveryService
  ) {
    this.setupDeepLinkListener();
    this.initDiscovery();
  }

  private async initDiscovery() {
    try {
      this.addDebug('Discovery: starting...');
      const endpoints = await this.discovery.discover();
      this.clientId = endpoints.clientId;
      this.redirectUri = endpoints.redirectUri;
      this.scope = endpoints.scope;
      this.audience = endpoints.audience;
      this.tokenEndpoint = endpoints.tokenEndpoint;
      this.userEndpoint = endpoints.userEndpoint;
      this.loginEndpoint = endpoints.loginEndpoint;
      this.logoutEndpoint = endpoints.logoutEndpoint;
      this.dataEndpoint = endpoints.dataEndpoint;
      this.addDebug('Discovery: OK, login=' + this.loginEndpoint);
    } catch (err) {
      this.addDebug('Discovery: FAILED, using defaults');
    }
  }

  getToken(): string {
    return this.accessToken$.value || localStorage.getItem('access_token') || '';
  }

  setTokens(token: any) {
    token?.access_token && this.accessToken$.next(token.access_token);
    token?.refresh_token && this.refreshToken$.next(token.refresh_token);
    const idToken = token?.id_token || token?.id_token_hint;
    idToken && this.idToken$.next(idToken);

    token?.access_token && localStorage.setItem('access_token', token.access_token);
    token?.refresh_token && localStorage.setItem('refresh_token', token.refresh_token);
    idToken && localStorage.setItem('id_token', idToken);

    this.addDebug('setTokens: access=' + (!!token?.access_token) + ' refresh=' + (!!token?.refresh_token) + ' id=' + (!!idToken));
  }

  getTokens(): { accessToken: string; refreshToken: string; idToken: string } {
    return {
      accessToken: this.getToken(),
      refreshToken: this.refreshToken$.value || localStorage.getItem('refresh_token') || '',
      idToken: this.idToken$.value || localStorage.getItem('id_token') || '',
    };
  }

  isTokenExpired() {
    return isTokenExpired(this.getToken());
  }

  getUserInfo(): Observable<IUserInfo> {
    this.addDebug('getUserInfo: ' + this.userEndpoint);
    return from(
      CapacitorHttp.get({
        url: this.userEndpoint,
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
        },
      }).then((response) => {
        this.addDebug('getUserInfo: status=' + response.status);
        return response.data as IUserInfo;
      })
    );
  }

  

  refreshToken(): Observable<any> {
    const refresh_token =
      this.refreshToken$.value || localStorage.getItem('refresh_token');
    if (!refresh_token) return of();

    this.addDebug('refreshToken: starting...');
    return from(
      CapacitorHttp.post({
        url: this.tokenEndpoint,
        data: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refresh_token)}&client_id=${encodeURIComponent(this.clientId)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }).then((response) => {
        this.addDebug('refreshToken: status=' + response.status);
        return response.data;
      })
    );
  }

  doRefresh(event?: CustomEvent) {
    this.getData()
      .pipe(
        take(1)
      )
      .subscribe({
        next: (data: any) => {
          this.patientData$.next(this.processPatientData(data.data));
          Log().info('Re-fresh data sg: ', data.data?.patientData?.lastSG || {});
          Log().info('Re-fresh data sgs: ', data.data?.patientData?.sgs || []);
          this.bckg.showNotificationFromIonic({
            lastSG: data.data?.patientData?.lastSG || {},
            sgs: data.data?.patientData?.sgs || [],
            conduitSensorInRange: data.data?.patientData?.conduitSensorInRange
          });
          (event?.target as HTMLIonRefresherElement)?.complete();
        },
        error: (err: any) => {
          Log().error('Refresh failed', err);
          (event?.target as HTMLIonRefresherElement)?.complete();
        },
      });
  }

  getData(): Observable<HttpResponse> {
    const patientUsername = localStorage.getItem('patientUsername') || 'jejka3006';

    // Extract username from JWT token payload (matching Python client)
    let tokenUsername = patientUsername;
    try {
      const tokenParts = this.getToken().split('.');
      const padded = tokenParts[1] + '='.repeat((4 - tokenParts[1].length % 4) % 4);
      const payload = JSON.parse(atob(padded));
      tokenUsername = payload?.token_details?.preferred_username || payload?.preferred_username || payload?.sub || patientUsername;
      this.addDebug('token: aud=' + payload.aud + ' user=' + tokenUsername);
    } catch (e) {
      this.addDebug('token decode failed');
    }

    // Match Python client exactly: application/x-www-form-urlencoded + JSON string body
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.getToken()}`,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 10; Nexus 5X Build/QQ3A.200805.001)',
    };

    const requestBody = JSON.stringify({
      username: tokenUsername,
      role: 'carepartner',
      patientId: patientUsername,
    });

    this.addDebug('getData: endpoint=' + this.dataEndpoint);
    this.addDebug('getData: body=' + requestBody);
    return from(
      CapacitorHttp.post({
        url: this.dataEndpoint,
        data: requestBody,
        headers,
      }).then(async (response) => {
        this.addDebug('getData: status=' + response.status);
        this.addDebug('getData: resp=' + JSON.stringify(response.data)?.substring(0, 300));
        return response;
      }).catch((err) => {
        this.addDebug('getData: ERROR ' + JSON.stringify(err)?.substring(0, 300));
        throw err;
      })
    );
  }

  getLastGlicemia(data: any): any {
    return data.lastSG?.sg ? data.lastSG?.sg : data.sgs[0] ? data.sgs[0] : { sg: 0, timestamp: Date.now() } as any;
  }

  getTimeSinceLastGS(data: any): string {
    const last = this.getLastGlicemia(data);
    if (!last) return 'No valid SG data';

    const now = new Date().getTime();
    const lastTime = new Date(last.timestamp).getTime();
    const diffMs = now - lastTime;

    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return hours > 0
      ? ` pre ${hours}h ${remainingMinutes}m`
      : ` pre ${minutes}m`;
  }

  processPatientData(recentData: any) {
    const data = {
      current: 0 as string | number,
      since: '' as string,
      trend: 0,
      glicemia: [] as string[],
      insulin: [] as string[],
      pump: [] as string[],
      senzor: [] as string[],
      sgs: [] as any[],
      isSensorConnected: false
    };

    const patientData = recentData.patientData || {};

    data.sgs = (patientData.sgs?.reverse() as any[] || []).filter(sg => sg.sg > 0 && sg.timestamp).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    data.since = this.getTimeSinceLastGS(data);
    const unitsLeft = patientData.reservoirRemainingUnits || 0;
    const glicemia: string | number = (this.getLastGlicemia(data).sg / 18).toFixed(1);

    const sensorState = patientData.lastSG?.sensorState || 'UNKNOWN';

    const timestamp = patientData.lastSG?.timestamp || this.getLastGlicemia(data)?.timestamp || Date.now();

    const dt = new Date(timestamp);

    const datePart = dt.toLocaleDateString('en-US', {
      month: 'long',
      day: '2-digit',
      year: 'numeric',
    });
    const timePart = dt.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });


    const lastTime = `${datePart} u ${timePart}`;

    const isSensorConnected = data.isSensorConnected = patientData.conduitSensorInRange || false;

    if (!isSensorConnected) {
      data.senzor.push('Senzor nije povezan');
      for (const sg of data.sgs || []) {
        if (sg) {
          const lastGlicemia = (this.getLastGlicemia(data)?.sg / 18).toFixed(1);
          data.glicemia.push(`Poslednja glikemija ${lastGlicemia}`);
          data.senzor.push(`Poslednja sinhronizacija ${lastTime}`);
          break;
        }
      }
    }


    const activeInsulin = patientData.activeInsulin.amount.toFixed(1);

    const sensorBattery = patientData.gstBatteryLevel || 0;
    const pumpBattery = patientData.conduitBatteryLevel || 0;

    const trend_raw = patientData.lastSGTrend || '';
    const trend =
      trend_raw === 'DOWN' ? -1 : trend_raw === 'UP' ? 1 : 0;
    const averageSG = ((patientData?.averageSG || 0) / 18).toFixed(1);

    let timeInRange = '-';
    if ('timeInRange' in patientData) {
      timeInRange = `${patientData.timeInRange}%`;
    }

    const belowHypoLimit = `${patientData.belowHypoLimit || 0}%`;
    const aboveHyperLimit = `${patientData.aboveHyperLimit || 0}%`;

    data.current = glicemia;
    data.trend = trend;

    const durationMinutes = patientData.sensorDurationMinutes || 0;
    const days = Math.floor(durationMinutes / 1440);
    const hours = Math.floor((durationMinutes % 1440) / 60);
    const minutes = durationMinutes % 60;
    isSensorConnected && data.senzor.push(`Serzor traje jos ${days}d ${hours}h ${minutes}m`);

    const calibrationMinutes = patientData.timeToNextCalibrationMinutes || 0;
    isSensorConnected && data.senzor.push(
      `Sledeca kalibracija za ${Math.floor(calibrationMinutes / 60)}h ${calibrationMinutes % 60
      }m`
    );

    if (sensorState === 'CHANGE_SENSOR') {
      data.senzor.push('Zamenite senzor');
    }

    const banner = patientData.pumpBannerState || [];
    if (banner.length > 0 && banner?.[0]?.type === 'TEMP_BASAL') {
      const temporalni = banner[0].timeRemaining || 0;
      data.insulin.push(`Temporalni tece jos ${temporalni} min`);
    }

    if (activeInsulin !== -1.0) {
      data.insulin.push(`Aktivni insulin ${activeInsulin}`);
    }

    if (patientData.pumpSuspended) {
      data.pump.push('Pumpica je suspendovana');
    }

    data.glicemia.push(`HbA1c ${averageSG}`);

    if ('timeInRange' in patientData) {
      timeInRange && data.glicemia.push(`U normali je ${timeInRange}`);
      data.glicemia.push(`Niska ${belowHypoLimit}`);
      data.glicemia.push(`Visoka ${aboveHyperLimit}`);
    }

    data.insulin.push(`Preostalo jedinica ${unitsLeft}`);

    isSensorConnected && data.senzor.push(`Baterija senzora ${sensorBattery}%`);
    data.pump.push(`Baterija pumpice ${pumpBattery}%`);

    return data;
  }

  logout() {
    this.cleanUp();
    this.login();
  }

  cleanUp() {
    this.setTokens({});
  }

  private setupDeepLinkListener() {
    App.addListener('appUrlOpen', async (data) => {
      Log().info('App URL Open:', data.url);

      if (data.url && data.url.startsWith(this.redirectUri)) {
        try {
          await Browser.close();

          const url = new URL(data.url);
          const code = url.searchParams.get('code');
          Log().info('All query params:', url.searchParams);

          if (code) {
            Log().info('Authorization code received:', code);
            this.authCode$.next(code);

            // Exchange code for tokens here
            this.exchangeCodeForToken(code);
          } else {
            Log().warn('No authorization code found in redirect URL');
            this.authCode$.next(null);
          }
        } catch (e) {
          Log().error('Error parsing URL:', e);
          this.authCode$.next(null);
        }
      } else {
        Log().info('URL does not match redirectUri');
      }
    });
  }

  private async exchangeCodeForToken(code: string) {
    this.addDebug('Token exchange: starting...');
    this.addDebug('Token endpoint: ' + this.tokenEndpoint);
    try {
      const bodyStr = `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(this.redirectUri)}&client_id=${encodeURIComponent(this.clientId)}&audience=${encodeURIComponent(this.audience)}`;
      const response = await CapacitorHttp.post({
        url: this.tokenEndpoint,
        data: bodyStr,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      const tokens = response.data;
      this.addDebug('Token exchange: OK status=' + response.status + ' keys=' + Object.keys(tokens).join(','));

      if (!tokens.access_token) {
        this.addDebug('Token exchange: no access_token in response');
        this.logout();
        return;
      }

      this.setTokens(tokens);

      this.getUserInfo()
        .pipe(take(1))
        .subscribe({
          next: (userInfo) => {
            this.addDebug('UserInfo: OK, name=' + userInfo?.name);
            this.user$.next(userInfo);
            localStorage.setItem('userInfo', JSON.stringify(userInfo));

            this.getData().subscribe({
              next: (data: any) => {
                this.addDebug('Data: status=' + data?.status + ' hasPatientData=' + (!!data?.data?.patientData));
                this.addDebug('Data: conduitSensorInRange=' + data?.data?.patientData?.conduitSensorInRange);
                this.patientData$.next(this.processPatientData(data.data));
              },
              error: (err: any) => {
                this.addDebug('Data: FAILED ' + (err?.status || '') + ' ' + (err?.message || JSON.stringify(err)?.substring(0, 200)));
              },
            });
          },
          error: (err) => {
            this.addDebug('UserInfo: FAILED ' + JSON.stringify(err)?.substring(0, 200));
            this.logout();
          },
        });
    } catch (err: any) {
      this.addDebug('Token exchange: FAILED ' + JSON.stringify(err)?.substring(0, 300));
      this.setTokens({});
      this.logout();
    }
  }

  async login() {
    const authUrl = `${this.loginEndpoint}?response_type=code&client_id=${this.clientId
      }&redirect_uri=${encodeURIComponent(
        this.redirectUri
      )}&scope=${encodeURIComponent(this.scope
      )}&audience=${encodeURIComponent(this.audience)}`;

    await Browser.open({ url: authUrl });
  }
}
