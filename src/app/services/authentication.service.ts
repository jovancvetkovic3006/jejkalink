import { Injectable } from '@angular/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { BehaviorSubject, from, Observable, of, switchMap, take } from 'rxjs';
import { isTokenExpired, isTokenExpiringSoon } from '../utils/token.util';
import { Log } from '../utils/log.js';
import { CapacitorHttp, HttpResponse } from '@capacitor/core';
import { BackgroundWeb } from './background-web.service';
import { MedtronicDiscoveryService } from './medtronic-discovery.service';
import { SgsHistoryService } from './sgs-history.service';
import { EventsStore } from './events-store.service';
import { CollectorHealthService } from './collector-health.service';
import { ApiCaptureService } from './api-capture.service';
import { formatMmol, gmiFromMean, toMmol } from '../domain/glucose';
import { formatDurationEn, formatMinutesLong } from '../utils/duration-format.util';
import {
  filterAcceptedSgs,
  latestAcceptedSg,
  serverCutoffMs,
} from '../utils/carelink-time.util';
import {
  mapCareLinkTrend,
  slopePerMinWindow,
  trendFromSlope,
} from '../utils/glucose-slope.util';

export interface IUserInfo {
  name: string;
  email?: string;
  nickname?: string;
  picture?: string;
  sub?: string;
  [key: string]: any;
}

@Injectable({
  providedIn: 'root',
})
export class AuthenticationService {
  private clientId = 'PeAhkbhQWlQRxJiQxWfcFBiGus1lxfe9';
  private redirectUri = 'com.medtronic.carepartner:/sso';
  private scope = 'profile openid offline_access';
  private audience = 'carepartner.patient.ous';

  private static readonly LOG_STORAGE_KEY = 'debug_logs';
  private static readonly LOG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
  private static readonly LOG_MAX_ENTRIES = 500;

  private loginInProgress = false;
  private loginCooldownUntil = 0;
  private backgroundRefreshInFlight: Promise<boolean> | null = null;
  private refreshCycleInProgress = false;
  private refreshCycleTimeout: ReturnType<typeof setTimeout> | undefined;
  private tokenSyncInterval: ReturnType<typeof setInterval> | undefined;
  private static readonly TOKEN_REFRESH_BUFFER_SEC = 300; // refresh 5 min before expiry

  public debugLog$ = new BehaviorSubject<string[]>(this.loadPersistedLogs());

  private loadPersistedLogs(): string[] {
    try {
      const raw = localStorage.getItem(AuthenticationService.LOG_STORAGE_KEY);
      if (!raw) return [];
      const entries: { ts: number; msg: string }[] = JSON.parse(raw);
      const cutoff = Date.now() - AuthenticationService.LOG_MAX_AGE_MS;
      const valid = entries.filter((e) => e.ts >= cutoff);
      if (valid.length !== entries.length) {
        localStorage.setItem(AuthenticationService.LOG_STORAGE_KEY, JSON.stringify(valid));
      }
      return valid.map((e) => e.msg);
    } catch {
      return [];
    }
  }

  private persistLog(formattedMsg: string) {
    try {
      const raw = localStorage.getItem(AuthenticationService.LOG_STORAGE_KEY);
      const entries: { ts: number; msg: string }[] = raw ? JSON.parse(raw) : [];
      entries.push({ ts: Date.now(), msg: formattedMsg });
      const cutoff = Date.now() - AuthenticationService.LOG_MAX_AGE_MS;
      const pruned = entries.filter((e) => e.ts >= cutoff).slice(-AuthenticationService.LOG_MAX_ENTRIES);
      localStorage.setItem(AuthenticationService.LOG_STORAGE_KEY, JSON.stringify(pruned));
    } catch { /* ignore storage errors */ }
  }

  private addDebug(msg: string) {
    const formatted = `[${new Date().toLocaleString()}] ${msg}`;
    const logs = [...this.debugLog$.value, formatted];
    if (logs.length > AuthenticationService.LOG_MAX_ENTRIES) logs.splice(0, logs.length - AuthenticationService.LOG_MAX_ENTRIES);
    this.debugLog$.next(logs);
    this.persistLog(formatted);
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
    loading: true,
    current: 0,
    trend: '',
    glicemia: [] as string[],
    insulin: [] as string[],
    pump: [] as string[],
    senzor: [] as string[],
  });

  constructor(
    private readonly bckg: BackgroundWeb,
    private readonly discovery: MedtronicDiscoveryService,
    private readonly sgsHistory: SgsHistoryService,
    private readonly eventsStore: EventsStore,
    private readonly collectorHealth: CollectorHealthService,
    private readonly apiCapture: ApiCaptureService
  ) {
    this.restorePersistedTokens();
    this.setupDeepLinkListener();
    this.initDiscovery();
    this.startBackgroundTokenSync();
  }

  /** Load tokens from storage into memory on cold start. */
  private restorePersistedTokens() {
    const access = localStorage.getItem('access_token');
    const refresh = localStorage.getItem('refresh_token');
    const id = localStorage.getItem('id_token');
    if (access) this.accessToken$.next(access);
    if (refresh) this.refreshToken$.next(refresh);
    if (id) this.idToken$.next(id);
  }

  /** Sync from background plugin only — never call OAuth refresh from Ionic. */
  private startBackgroundTokenSync() {
    clearInterval(this.tokenSyncInterval);
    this.tokenSyncInterval = setInterval(() => {
      if (this.loginInProgress) return;
      if (!localStorage.getItem('refresh_token')) return;
      void this.syncTokensFromBackgroundPlugin().then((valid) => {
        if (valid) return;
        const token = this.getToken();
        if (!token || !isTokenExpiringSoon(token, AuthenticationService.TOKEN_REFRESH_BUFFER_SEC)) return;
        this.addDebug('background sync: access expiring, requesting plugin refresh');
        void this.requestBackgroundTokenRefresh();
      });
    }, 60_000);
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

  /** Accept OAuth snake_case or background-plugin camelCase payloads. */
  setTokens(token: any, options?: { silent?: boolean; source?: string }) {
    const changed = this.writeTokens(token);
    if (changed && !options?.silent) {
      const access = token?.access_token ?? token?.accessToken;
      const refresh = token?.refresh_token ?? token?.refreshToken;
      const idToken = token?.id_token ?? token?.idToken ?? token?.id_token_hint;
      const src = options?.source ? ` (${options.source})` : '';
      this.addDebug(
        'setTokens' + src + ': access=' + (!!access) + ' refresh=' + (!!refresh) + ' id=' + (!!idToken)
      );
    }
  }

  /** Apply tokens from background plugin; skip if unchanged to avoid refresh-token churn. */
  applyTokensFromBackground(token: any) {
    this.writeTokens(token);
  }

  private writeTokens(token: any): boolean {
    if (!token) return false;

    const access = token.access_token ?? token.accessToken;
    const refresh = token.refresh_token ?? token.refreshToken;
    const idToken = token.id_token ?? token.idToken ?? token.id_token_hint;
    let changed = false;

    if (access && access !== this.getToken()) {
      this.accessToken$.next(access);
      localStorage.setItem('access_token', access);
      changed = true;
    }
    const storedRefresh = this.refreshToken$.value || localStorage.getItem('refresh_token') || '';
    if (refresh && refresh !== storedRefresh) {
      this.refreshToken$.next(refresh);
      localStorage.setItem('refresh_token', refresh);
      changed = true;
    }
    const storedId = this.idToken$.value || localStorage.getItem('id_token') || '';
    if (idToken && idToken !== storedId) {
      this.idToken$.next(idToken);
      localStorage.setItem('id_token', idToken);
      changed = true;
    }
    return changed;
  }

  clearTokens() {
    this.accessToken$.next(null);
    this.refreshToken$.next(null);
    this.idToken$.next(null);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('id_token');
    this.addDebug('clearTokens: removed stored tokens');
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

  

  /**
   * @deprecated Ionic must not call OAuth refresh — delegates to the Android background plugin.
   */
  refreshToken(): Observable<{ access_token: string; refresh_token: string } | null> {
    return from(this.requestBackgroundTokenRefresh()).pipe(
      take(1),
      switchMap((ok) => {
        if (!ok) return of(null);
        return of({
          access_token: this.getToken(),
          refresh_token: this.refreshToken$.value || localStorage.getItem('refresh_token') || '',
        });
      })
    );
  }

  /** Ask the background plugin to refresh; only it may call /oauth/token with refresh_token. */
  async requestBackgroundTokenRefresh(): Promise<boolean> {
    if (this.backgroundRefreshInFlight) {
      return this.backgroundRefreshInFlight;
    }

    this.backgroundRefreshInFlight = (async () => {
      try {
        const result = await this.bckg.requestTokenRefresh();
        if (result?.accessToken) {
          this.applyTokensFromBackground({
            access_token: result.accessToken,
            refresh_token: result.refreshToken,
          });
        }
        const token = this.getToken();
        const valid =
          !!token &&
          !isTokenExpired(token) &&
          !isTokenExpiringSoon(token, AuthenticationService.TOKEN_REFRESH_BUFFER_SEC);
        if (valid) {
          this.addDebug('requestBackgroundTokenRefresh: OK');
        } else {
          this.addDebug('requestBackgroundTokenRefresh: still invalid after plugin refresh');
        }
        return valid;
      } catch (err: any) {
        this.addDebug(
          'requestBackgroundTokenRefresh: FAILED ' + (err?.message || String(err))?.substring(0, 200)
        );
        return false;
      } finally {
        this.backgroundRefreshInFlight = null;
      }
    })();

    return this.backgroundRefreshInFlight;
  }

  /** Read tokens from the background plugin (source of truth for refresh rotation). */
  async syncTokensFromBackgroundPlugin(): Promise<boolean> {
    try {
      const pluginTokens = await this.bckg.getTokens();
      if (!pluginTokens?.accessToken && !pluginTokens?.refreshToken) return false;

      const changed = this.writeTokens({
        access_token: pluginTokens.accessToken,
        refresh_token: pluginTokens.refreshToken,
      });
      const token = this.getToken();
      const valid =
        !!token &&
        !isTokenExpired(token) &&
        !isTokenExpiringSoon(token, AuthenticationService.TOKEN_REFRESH_BUFFER_SEC);
      if (changed && valid) {
        this.addDebug('syncTokensFromBackgroundPlugin: applied fresher tokens');
      }
      return valid;
    } catch {
      return false;
    }
  }

  private async resolveValidTokenFromBackground(forcePluginRefresh = false): Promise<boolean> {
    if (await this.syncTokensFromBackgroundPlugin()) {
      return true;
    }

    if (forcePluginRefresh || isTokenExpired(this.getToken()) ||
      isTokenExpiringSoon(this.getToken(), AuthenticationService.TOKEN_REFRESH_BUFFER_SEC)) {
      this.addDebug('ensureValidToken: requesting background plugin refresh (no Ionic OAuth)');
      if (await this.requestBackgroundTokenRefresh()) {
        return true;
      }
      return this.syncTokensFromBackgroundPlugin();
    }

    return false;
  }

  private ensureValidToken(forcePluginRefresh = false): Observable<boolean> {
    const refreshStored = !!(this.refreshToken$.value || localStorage.getItem('refresh_token'));

    if (!refreshStored) {
      this.addDebug('ensureValidToken: no refresh token');
      return of(false);
    }

    const token = this.getToken();
    if (
      !forcePluginRefresh &&
      token &&
      !isTokenExpired(token) &&
      !isTokenExpiringSoon(token, AuthenticationService.TOKEN_REFRESH_BUFFER_SEC)
    ) {
      return of(true);
    }

    this.addDebug(
      'ensureValidToken: need valid access (expired=' + isTokenExpired(token) + ', force=' + forcePluginRefresh + ')'
    );

    return from(this.resolveValidTokenFromBackground(forcePluginRefresh));
  }

  doRefresh(event?: CustomEvent) {
    if (this.loginInProgress) {
      this.addDebug('doRefresh: login in progress, skipping');
      (event?.target as HTMLIonRefresherElement)?.complete();
      return;
    }
    if (this.loginCooldownUntil && Date.now() < this.loginCooldownUntil) {
      this.addDebug('doRefresh: login cooldown active, skipping');
      (event?.target as HTMLIonRefresherElement)?.complete();
      return;
    }
    if (this.refreshCycleInProgress && !event) {
      this.addDebug('doRefresh: already in progress, skipping');
      return;
    }
    this.refreshCycleInProgress = true;

    // Safety: auto-reset flag after 30s to prevent permanent lockout
    clearTimeout(this.refreshCycleTimeout);
    this.refreshCycleTimeout = setTimeout(() => {
      if (this.refreshCycleInProgress) {
        this.addDebug('doRefresh: safety timeout, resetting refreshCycleInProgress');
        this.refreshCycleInProgress = false;
      }
    }, 30_000);

    this.addDebug('doRefresh: starting...');
    this.ensureValidToken()
      .pipe(take(1))
      .subscribe((valid: boolean) => {
        if (valid) {
          this.fetchAndProcessData(event);
        } else {
          this.refreshCycleInProgress = false;
          this.addDebug('doRefresh: token invalid, triggering re-login...');
          (event?.target as HTMLIonRefresherElement)?.complete();
          this.login();
        }
      });
  }

  private fetchAndProcessData(event?: CustomEvent, isRetry = false) {
    this.getData()
      .pipe(take(1))
      .subscribe({
        next: (response: any) => {
          if (response.status === 401 && !isRetry) {
            this.addDebug('fetchData: got 401, refreshing token and retrying...');
            this.ensureValidToken(true)
              .pipe(take(1))
              .subscribe((valid: boolean) => {
                if (valid) {
                  this.fetchAndProcessData(event, true);
                } else {
                  this.refreshCycleInProgress = false;
                  this.addDebug('fetchData: retry refresh failed, re-login...');
                  (event?.target as HTMLIonRefresherElement)?.complete();
                  this.login();
                }
              });
            return;
          }
          if (!this.ingestCareLinkPayload(response.data)) {
            this.collectorHealth.recordFailure();
            this.refreshCycleInProgress = false;
            (event?.target as HTMLIonRefresherElement)?.complete();
            return;
          }
          Log().info('Re-fresh data sg: ', response.data?.patientData?.lastSG || {});
          Log().info('Re-fresh data sgs: ', response.data?.patientData?.sgs || []);
          this.bckg.showNotificationFromIonic({
            lastSG: response.data?.patientData?.lastSG || {},
            sgs: response.data?.patientData?.sgs || [],
            conduitSensorInRange: response.data?.patientData?.conduitSensorInRange,
            lastSGTrend: response.data?.patientData?.lastSGTrend || '',
            currentServerTime: response.data?.patientData?.currentServerTime ?? 0,
            activeInsulin: response.data?.patientData?.activeInsulin || {},
            reservoirRemainingUnits: response.data?.patientData?.reservoirRemainingUnits ?? -1,
            isTempBasal: response.data?.patientData?.isTempBasal ?? false,
            sensorDurationMinutes: response.data?.patientData?.sensorDurationMinutes ?? -1,
            gstBatteryLevel: response.data?.patientData?.gstBatteryLevel ?? -1,
            conduitBatteryLevel: response.data?.patientData?.conduitBatteryLevel ?? -1,
            pumpBatteryLevelPercent:
              response.data?.patientData?.pumpBatteryLevelPercent ?? -1,
          });
          this.refreshCycleInProgress = false;
          (event?.target as HTMLIonRefresherElement)?.complete();
        },
        error: (err: any) => {
          this.collectorHealth.recordFailure();
          this.addDebug('fetchData: ERROR ' + JSON.stringify(err)?.substring(0, 200));
          if (!isRetry) {
            this.addDebug('fetchData: error on first try, refreshing token and retrying...');
            this.ensureValidToken(true)
              .pipe(take(1))
              .subscribe((valid: boolean) => {
                if (valid) {
                  this.fetchAndProcessData(event, true);
                } else {
                  this.refreshCycleInProgress = false;
                  this.addDebug('fetchData: retry refresh failed, re-login...');
                  (event?.target as HTMLIonRefresherElement)?.complete();
                  this.login();
                }
              });
          } else {
            this.refreshCycleInProgress = false;
            Log().error('Refresh failed after retry', err);
            (event?.target as HTMLIonRefresherElement)?.complete();
          }
        },
      });
  }

  /**
   * Ingest a CareLink display/message body from Ionic HTTP or background plugin.
   * Merges readings, events, raw blob, and updates patientData$.
   * Background plugin sends `{ data: "<json string>" }`; CapacitorHttp already parses.
   */
  ingestCareLinkPayload(raw: unknown): boolean {
    const body = this.normalizeCareLinkBody(raw);
    if (!body?.patientData) {
      this.addDebug('ingestCareLinkPayload: missing patientData');
      return false;
    }
    this.apiCapture.record(
      'CareLink display/message',
      typeof raw === 'string' ? raw : body
    );
    this.collectorHealth.recordSuccess();
    this.patientData$.next(this.processPatientData(body));
    this.addDebug(
      'ingestCareLinkPayload: ok sgs=' +
        (body.patientData?.sgs?.length ?? 0)
    );
    return true;
  }

  /** Background poll failed (401 / network). */
  recordBackgroundFetchError(info?: { error?: string; status?: number }) {
    this.collectorHealth.recordFailure();
    this.addDebug(
      'background fetch error: ' +
        (info?.error || 'unknown') +
        (info?.status != null ? ' status=' + info.status : '')
    );
  }

  private normalizeCareLinkBody(raw: unknown): any | null {
    try {
      let body: any = raw;
      // Plugin wraps as { data: string | object }
      if (body && typeof body === 'object' && 'data' in body && !('patientData' in body)) {
        body = (body as { data: unknown }).data;
      }
      if (typeof body === 'string') {
        body = JSON.parse(body);
      }
      if (!body || typeof body !== 'object') return null;
      return body;
    } catch (e) {
      this.addDebug('normalizeCareLinkBody failed: ' + String(e));
      return null;
    }
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

  getLastGlicemia(patientData: any): { sg: number; timestamp: string } {
    const cutoff = serverCutoffMs(patientData);
    const accepted = latestAcceptedSg(
      patientData?.sgs,
      cutoff,
      patientData?.lastSG
    );
    if (accepted) {
      return { sg: Number(accepted.sg), timestamp: accepted.timestamp };
    }
    return { sg: 0, timestamp: '' };
  }

  getTimeSinceLastGS(data: any): string {
    const last = this.getLastGlicemia(data);
    if (!last?.timestamp) return 'No valid SG data';

    const now = Date.now();
    const lastTime = new Date(last.timestamp).getTime();
    if (!Number.isFinite(lastTime)) return 'No valid SG data';
    const minutes = Math.max(0, Math.floor((now - lastTime) / 60000));
    if (minutes === 0) return 'just now';
    return `${formatMinutesLong(minutes)} ago`;
  }

  processPatientData(recentData: any) {
    const prev = this.patientData$.value;
    const data = {
      loading: false,
      current: 0 as string | number,
      since: '' as string,
      trend: 0,
      glicemia: [] as { text: string; warn: boolean }[],
      insulin: [] as { text: string; warn: boolean }[],
      pump: [] as { text: string; warn: boolean }[],
      senzor: [] as { text: string; warn: boolean }[],
      sgs: [] as any[],
      isSensorConnected: false
    };

    const patientData = recentData.patientData || {};
    const cutoff = serverCutoffMs(patientData);

    const acceptedSgs = filterAcceptedSgs(patientData.sgs, cutoff)
      .filter(
        (sg): sg is { sg: number; timestamp: string } & Record<string, unknown> =>
          Number(sg.sg) > 0 && typeof sg.timestamp === 'string'
      )
      .map((sg) => ({ ...sg, sg: Number(sg.sg), timestamp: sg.timestamp }))
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    data.sgs = acceptedSgs;

    this.sgsHistory.merge(acceptedSgs, { cutoffMs: cutoff });
    this.sgsHistory.saveRawResponse(recentData);
    this.eventsStore.ingestCareLink(patientData);

    const isSensorConnected = data.isSensorConnected =
      !!patientData.conduitSensorInRange;
    const currentSg = latestAcceptedSg(
      patientData.sgs,
      cutoff,
      patientData.lastSG
    );
    const hasAccepted = !!currentSg && Number(currentSg.sg) > 0;

    const historyReadings = this.sgsHistory.readings();
    const historyLast =
      historyReadings.length > 0
        ? historyReadings[historyReadings.length - 1]
        : undefined;
    let glicemia: string | number;
    let timestamp: string | number;
    let trend: number;

    if (!isSensorConnected || !hasAccepted) {
      if (historyLast) {
        glicemia = formatMmol(historyLast.mmol);
        timestamp = historyLast.timestamp;
      } else if (typeof prev.current === 'string' || typeof prev.current === 'number') {
        glicemia = prev.current;
        timestamp = Date.now();
      } else {
        glicemia = '--';
        timestamp = Date.now();
      }
      const mapped = mapCareLinkTrend(patientData.lastSGTrend);
      trend =
        mapped ??
        trendFromSlope(slopePerMinWindow(historyReadings)) ??
        (typeof prev.trend === 'number' ? prev.trend : 0);
      if (!isSensorConnected) {
        data.senzor.push({ text: 'Sensor disconnected', warn: true });
        data.senzor.push({
          text: `Last reading ${formatDurationEn(
            (Date.now() - new Date(timestamp).getTime()) / 60000
          )}`,
          warn: false,
        });
      }
    } else {
      glicemia = formatMmol(toMmol(Number(currentSg!.sg)));
      timestamp = currentSg!.timestamp;
      const mapped = mapCareLinkTrend(patientData.lastSGTrend);
      trend =
        mapped ?? trendFromSlope(slopePerMinWindow(historyReadings));
    }

    data.since = (() => {
      const minutes = Math.max(
        0,
        Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000)
      );
      return minutes === 0 ? 'just now' : `${formatMinutesLong(minutes)} ago`;
    })();

    const unitsLeft = patientData.reservoirRemainingUnits || 0;
    const sensorState =
      currentSg?.sensorState ||
      patientData.lastSG?.sensorState ||
      'UNKNOWN';

    const dt = new Date(timestamp);
    const datePart = dt.toLocaleDateString('en-GB', {
      month: 'long',
      day: '2-digit',
      year: 'numeric',
    });
    const timePart = dt.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const lastTime = `${datePart} · ${timePart}`;

    if (!isSensorConnected && historyLast) {
      data.glicemia.push({ text: `Last glucose ${glicemia}`, warn: false });
      data.glicemia.push({ text: `From ${lastTime}`, warn: false });
    }

    const activeInsulin = patientData.activeInsulin?.amount != null
      ? Number(patientData.activeInsulin.amount).toFixed(1)
      : '0.0';

    const sensorBattery = patientData.gstBatteryLevel || 0;
    const pumpBattery =
      patientData.pumpBatteryLevelPercent ??
      patientData.pumpBatteryLevel ??
      0;
    const conduitBattery = patientData.conduitBatteryLevel || 0;

    const meanMmol = toMmol(patientData?.averageSG || 0);
    const gmi = formatMmol(gmiFromMean(meanMmol));

    let timeInRange = '-';
    if ('timeInRange' in patientData) {
      timeInRange = `${patientData.timeInRange}%`;
    }

    const belowHypoLimit = `${patientData.belowHypoLimit || 0}%`;
    const aboveHyperLimit = `${patientData.aboveHyperLimit || 0}%`;

    data.current = glicemia;
    data.trend = trend;

    // sensorDurationMinutes is elapsed wear; DURABLE Guardian ≈ 7 days total.
    const DURABLE_LIFE_MIN = 7 * 24 * 60;
    const elapsedMin = Number(patientData.sensorDurationMinutes) || 0;
    const sensorType = patientData.cgmInfo?.sensorType || 'DURABLE';
    if (isSensorConnected && elapsedMin > 0) {
      const remainingMin =
        sensorType === 'DURABLE'
          ? Math.max(0, DURABLE_LIFE_MIN - elapsedMin)
          : -1;
      if (remainingMin >= 0) {
        const days = Math.floor(remainingMin / 1440);
        const hours = Math.floor((remainingMin % 1440) / 60);
        const minutes = remainingMin % 60;
        const sensorExpiring = remainingMin > 0 && remainingMin < 1440;
        data.senzor.push({
          text: `Sensor life ${days}d ${formatMinutesLong(hours * 60 + minutes)} left`,
          warn: sensorExpiring,
        });
      }
    }

    const calibrationMinutes = patientData.timeToNextCalibrationMinutes || 0;
    const calibrationSoon = calibrationMinutes > 0 && calibrationMinutes < 10;
    if (isSensorConnected) {
      data.senzor.push({
        text: `Next calibration in ${formatMinutesLong(calibrationMinutes)}`,
        warn: calibrationSoon,
      });
    }

    if (sensorState === 'CHANGE_SENSOR') {
      data.senzor.push({ text: 'Replace sensor', warn: true });
    }

    const banner = patientData.pumpBannerState || [];
    this.addDebug('basal: ' + JSON.stringify({ banner, basal: patientData.basal, currentBasal: patientData.currentBasal, basalRate: patientData.basalRate })?.substring(0, 300));
    const tempBasal = banner.find((b: any) => b.type === 'TEMP_BASAL');
    if (tempBasal) {
      const remaining = tempBasal.timeRemaining || 0;
      const rate = patientData.lastAlarm?.tempRate ?? patientData.currentBasal?.tempRate ?? null;
      if (rate !== null) {
        data.insulin.push({ text: `Temp basal ${rate} u/h · ${formatMinutesLong(remaining)} left`, warn: false });
      } else {
        data.insulin.push({ text: `Temp basal · ${formatMinutesLong(remaining)} left`, warn: false });
      }
    }

    const basalRate = patientData.basal?.basalRate ?? patientData.currentBasal?.basalRate ?? null;
    if (basalRate !== null) {
      data.insulin.push({ text: `Basal ${basalRate} u/h`, warn: false });
    }

    if (patientData.activeInsulin?.amount != null) {
      data.insulin.push({ text: `Active insulin ${activeInsulin} u`, warn: false });
    }

    if (patientData.pumpSuspended) {
      data.pump.push({ text: 'Pump suspended', warn: true });
    }

    data.glicemia.push({ text: `GMI ${gmi}%`, warn: false });
    if (meanMmol > 0) {
      data.glicemia.push({ text: `Mean ${formatMmol(meanMmol)}`, warn: false });
    }

    if ('timeInRange' in patientData) {
      timeInRange && data.glicemia.push({ text: `In range ${timeInRange}`, warn: false });
      data.glicemia.push({ text: `Low ${belowHypoLimit}`, warn: false });
      data.glicemia.push({ text: `High ${aboveHyperLimit}`, warn: false });
    }

    data.insulin.push({ text: `Reservoir ${unitsLeft} u`, warn: unitsLeft < 20 });

    if (isSensorConnected) {
      data.senzor.push({
        text: `Sensor battery ${sensorBattery}%`,
        warn: sensorBattery < 20,
      });
    }
    if (pumpBattery > 0) {
      data.pump.push({
        text: `Pump battery ${pumpBattery}%`,
        warn: pumpBattery < 20,
      });
    }
    if (conduitBattery > 0) {
      const status = patientData.conduitBatteryStatus
        ? ` · ${String(patientData.conduitBatteryStatus).toLowerCase()}`
        : '';
      data.pump.push({
        text: `Phone link ${conduitBattery}%${status}`,
        warn: conduitBattery < 20 || patientData.conduitBatteryStatus === 'LOW',
      });
    }

    return data;
  }

  logout() {
    this.cleanUp();
    this.login();
  }

  cleanUp() {
    this.clearTokens();
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
      this.bckg.setTokens(this.getTokens());
      this.addDebug('Token exchange: pushed fresh tokens to background plugin');
      this.loginInProgress = false;
      this.loginCooldownUntil = Date.now() + 5000;
      this.addDebug('Token exchange: loginInProgress=false, cooldown 5s');

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
      this.loginInProgress = false;
      this.addDebug('Token exchange: FAILED ' + JSON.stringify(err)?.substring(0, 300));
      this.setTokens({});
      this.logout();
    }
  }

  async login() {
    if (this.loginInProgress) {
      this.addDebug('login: already in progress, skipping');
      return;
    }
    this.loginInProgress = true;
    this.addDebug('login: opening browser...');

    const authUrl = `${this.loginEndpoint}?response_type=code&client_id=${this.clientId
      }&redirect_uri=${encodeURIComponent(
        this.redirectUri
      )}&scope=${encodeURIComponent(this.scope
      )}&audience=${encodeURIComponent(this.audience)}`;

    await Browser.open({ url: authUrl });
  }

  sendLogsViaEmail() {
    const logs = this.debugLog$.value.join('\n') || '(no logs)';
    const subject = encodeURIComponent(
      'JejkaLink Debug Logs - ' + new Date().toLocaleString()
    );
    const body = encodeURIComponent(logs);
    window.open(
      `mailto:jovanca.cvetkovic@gmail.com?subject=${subject}&body=${body}`,
      '_system'
    );
  }

  clearDebugLogs() {
    localStorage.removeItem(AuthenticationService.LOG_STORAGE_KEY);
    this.debugLog$.next([]);
  }

  /** Zip full API captures and open the share/email sheet with the attachment. */
  async sendApiCapturesViaEmail(captures: { formatForEmail(): string }) {
    const text = captures.formatForEmail() || '(no captures)';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    try {
      await this.bckg.shareEmailZip({
        text,
        subject: 'JejkaLink API payloads - ' + new Date().toLocaleString(),
        email: 'jovanca.cvetkovic@gmail.com',
        body: 'Full API captures are in the attached zip.',
        fileName: `jejkalink-api-${stamp}.zip`,
        entryName: 'api-captures.txt',
      });
      this.addDebug('sendApiCaptures: zip share opened (' + text.length + ' chars)');
    } catch (e) {
      this.addDebug(
        'sendApiCaptures failed: ' + ((e as Error)?.message || String(e))
      );
    }
  }
}
