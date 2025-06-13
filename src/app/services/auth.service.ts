import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { BehaviorSubject, from, Observable, of, take, tap } from 'rxjs';
import { getTokenMag, isTokenExpired } from '../utils/token.util';
import { Log } from '../utils/log.js';
import { CapacitorHttp, HttpResponse } from '@capacitor/core';

export interface IUserInfo {
  name: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private clientId = '4fb211b8-f130-4398-b51e-28900bf68527';
  private redirectUri = 'com.medtronic.carepartner:/sso';
  private scope = 'openid profile roles country';

  // Observable for auth code (or tokens if you want)
  public authCode$ = new BehaviorSubject<string | null>(null);

  private tokenEndpoint =
    'https://mdtlogin-ocl.medtronic.com/mmcl/auth/oauth/v2/token';

  private userEndpoint =
    'https://mdtlogin-ocl.medtronic.com/mmcl/openid/connect/v1/userinfo';

  private loginEndpoint =
    'https://mdtlogin-ocl.medtronic.com/mmcl/auth/oauth/v2/authorize';

  private logoutEndpoint =
    'https://mdtlogin-ocl.medtronic.com/mmcl/connect/session/logout';

  private dataEndpoint =
    'https://clcloud.minimed.eu/connect/carepartner/v11/display/message';

  private patientEndpoint =
    'https://mdtlogin-ocl.medtronic.com/mmcl/auth/oauth/v2/links/patients';

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

  constructor(private readonly http: HttpClient) {
    this.setupDeepLinkListener();
  }

  getToken(): string | null {
    return this.accessToken$.value || localStorage.getItem('access_token');
  }

  setTokens(token: any) {
    this.accessToken$.next(token.access_token);
    this.refreshToken$.next(token.refresh_token);
    this.idToken$.next(token.id_token_hint);

    localStorage.setItem('access_token', token.access_token);
    localStorage.setItem('refresh_token', token.refresh_token);
    localStorage.setItem('id_token', token.id_token_hint);
  }

  isTokenExpired() {
    return isTokenExpired(this.getToken());
  }

  getUserInfo(): Observable<IUserInfo> {
    Log().info('Get user info', this.getToken());
    const headers = new HttpHeaders({
      Authorization: `Bearer ${this.getToken()}`,
    });
    return this.http.get<any>(this.userEndpoint, {
      headers,
    });
  }

  refreshToken(): Observable<any> {
    const refresh_token =
      this.refreshToken$.value || localStorage.getItem('refresh_token');
    if (!refresh_token) return of();

    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', refresh_token);
    body.set('client_id', '4fb211b8-f130-4398-b51e-28900bf68527');

    Log().info('Auth refresh token: ', refresh_token);
    return this.http.post<any>(this.tokenEndpoint, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  }

  doRefresh(event: CustomEvent) {
    this.getData()
      .pipe(take(1))
      .subscribe({
        next: (data: any) => {
          this.patientData$.next(this.processPatientData(data.data));
          (event.target as HTMLIonRefresherElement).complete();
        },
        error: (err: any) => {
          Log().error('Refresh failed', err);
          (event.target as HTMLIonRefresherElement).complete();
        },
      });
  }

  getData(): Observable<HttpResponse> {
    const userName = 'jejka3006';

    Log().info('Request pump data');
    return from(
      CapacitorHttp.post({
        url: this.dataEndpoint,
        data: {
          username: userName,
          role: 'patient',
        },
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent':
            'Dalvik/2.1.0 (Linux; U; Android 10; Nexus 5X Build/QQ3A.200805.001)',
          'mag-identifier': getTokenMag(this.getToken()),
        },
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
    };

    const patientData = recentData.patientData || {};

    data.sgs = (patientData.sgs?.reverse() as any[] || []).filter(sg => sg.sg > 0 && sg.timestamp).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );;

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

    const isSensorConnected = patientData.conduitSensorInRange || false;
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
    data.senzor.push(`Serzor traje jos ${days}d ${hours}h ${minutes}m`);

    const calibrationMinutes = patientData.timeToNextCalibrationMinutes || 0;
    data.senzor.push(
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

    if (!isSensorConnected) {
      data.senzor.push('Senzor nije povezan');
      for (const sg of data.sgs || []) {
        if (sg) {
          const lastGlicemia = this.getLastGlicemia(data)?.sg;
          data.glicemia.push(`Poslednja glikemija ${lastGlicemia}`);
          data.senzor.push(`Poslednja sinhronizacija ${lastTime}`);
          break;
        }
      }
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

    if (sensorBattery < 10) {
      data.senzor.push(`Baterija senzora ${sensorBattery}%`);
    } else {
      data.senzor.push(`Baterija senzora ${sensorBattery}%`);
    }

    if (pumpBattery < 10) {
      data.pump.push(`Baterija pumpice ${pumpBattery}%`);
    } else {
      data.pump.push(`Baterija pumpice ${pumpBattery}%`);
    }

    Log().info('MESAGES: ', data);
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

  private exchangeCodeForToken(code: string) {
    const body = new HttpParams()
      .set('grant_type', 'authorization_code')
      .set('code', code)
      .set('redirect_uri', this.redirectUri)
      .set('client_id', this.clientId);
    // .set('client_secret', 'YOUR_CLIENT_SECRET_IF_REQUIRED'); // add if needed
    const headers = new HttpHeaders({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    Log().info('Request access token');
    this.http
      .post<any>(this.tokenEndpoint, body.toString(), { headers })
      .subscribe({
        next: (tokens) => {
          Log().info('Token received', tokens);
          this.setTokens(tokens);
          this.getUserInfo()
            .pipe(take(1))
            .subscribe({
              next: (userInfo) => {
                Log().info('New user info: ', userInfo);
                this.user$.next(userInfo);
                localStorage.setItem('userInfo', JSON.stringify(userInfo));

                this.getData().subscribe({
                  next: (data: any) => {
                    Log().info('Data data: ', data.data);
                    this.patientData$.next(this.processPatientData(data.data));
                  },
                  error: (err: any) => {
                    Log().error('Data request failed: ', err);
                  },
                });
              },
              error: (err) => {
                Log().info('Error getting user info: ', err);
                this.logout();
              },
            });
          // TODO: store tokens securely (e.g., Secure Storage)
        },
        error: (err: any) => {
          Log().error('Token exchange failed:', err);
          this.setTokens({});
          this.logout();
        },
      });
  }

  async login() {
    const authUrl = `${this.loginEndpoint}?response_type=code&client_id=${this.clientId
      }&redirect_uri=${encodeURIComponent(
        this.redirectUri
      )}&scope=${encodeURIComponent(this.scope)}`;

    await Browser.open({ url: authUrl });
  }
}
