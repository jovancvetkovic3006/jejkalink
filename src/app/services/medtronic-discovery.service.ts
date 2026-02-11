import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { CapacitorHttp } from '@capacitor/core';
import { Log } from '../utils/log';

export interface SSOConfig {
  server: {
    hostname: string;
    port: number;
    prefix: string;
  };
  client: {
    client_id: string;
    client_secret: string;
    scope: string;
    redirect_uri: string;
    audience: string;
  };
  system_endpoints: {
    authorization_endpoint_path: string;
    token_endpoint_path: string;
    token_revocation_endpoint_path: string;
    usersession_logout_endpoint_path: string;
    usersession_status_endpoint_path: string;
    configuration_endpoint_path: string;
  };
  oauth_protected_endpoints: {
    userinfo_endpoint_path: string;
  };
}

export interface RegionConfig {
  region: string;
  SSOConfiguration: string;
  Layer7SSOConfiguration: string;
  Auth0SSOConfiguration: string;
  UseSSOConfiguration: string;
  baseUrlCms: string;
  baseUrlCareLink: string;
  baseUrlCumulus: string;
  baseUrlPde: string;
  baseUrlAem: string;
}

export interface MedtronicEndpoints {
  clientId: string;
  scope: string;
  redirectUri: string;
  audience: string;
  tokenEndpoint: string;
  loginEndpoint: string;
  logoutEndpoint: string;
  userEndpoint: string;
  dataEndpoint: string;
}

const DISCOVERY_URL =
  'https://clcloud.minimed.eu/connect/carepartner/v13/discover/android/3.6';

const DEFAULT_REGION = 'EU';

const DEFAULT_ENDPOINTS: MedtronicEndpoints = {
  clientId: 'PeAhkbhQWlQRxJiQxWfcFBiGus1lxfe9',
  scope: 'profile openid offline_access',
  redirectUri: 'com.medtronic.carepartner:/sso',
  audience: 'carepartner.patient.ous',
  tokenEndpoint: 'https://carelink-login.minimed.eu/oauth/token',
  loginEndpoint: 'https://carelink-login.minimed.eu/authorize',
  logoutEndpoint: 'https://carelink-login.minimed.eu/oidc/logout',
  userEndpoint: 'https://carelink-login.minimed.eu/userinfo',
  dataEndpoint: 'https://clcloud.minimed.eu/connect/carepartner/v13/display/message',
};

@Injectable({
  providedIn: 'root',
})
export class MedtronicDiscoveryService {
  private endpoints$ = new BehaviorSubject<MedtronicEndpoints>(DEFAULT_ENDPOINTS);
  private initialized = false;

  getEndpoints(): MedtronicEndpoints {
    return this.endpoints$.value;
  }

  async discover(region: string = DEFAULT_REGION): Promise<MedtronicEndpoints> {
    if (this.initialized) {
      return this.endpoints$.value;
    }

    try {
      Log().info('[Discovery] Fetching discovery config from', DISCOVERY_URL);
      const discoResponse = await CapacitorHttp.get({ url: DISCOVERY_URL });
      const discoData = discoResponse.data;

      const regionConfig = (discoData.CP as RegionConfig[])?.find(
        (c) => c.region === region
      );

      if (!regionConfig) {
        Log().warn(`[Discovery] Region ${region} not found, using defaults`);
        Log().info('[Discovery] Available regions: ' + JSON.stringify((discoData.CP as any[])?.map((c: any) => c.region)));
        return this.endpoints$.value;
      }

      Log().info('[Discovery] RegionConfig: ' + JSON.stringify(regionConfig).substring(0, 500));

      const ssoConfigKey = regionConfig.UseSSOConfiguration || 'Auth0SSOConfiguration';
      const ssoConfigUrl = (regionConfig as any)[ssoConfigKey];

      if (!ssoConfigUrl) {
        Log().warn(`[Discovery] SSO config URL not found for key ${ssoConfigKey}, using defaults`);
        return this.endpoints$.value;
      }

      Log().info('[Discovery] Fetching SSO config from', ssoConfigUrl);
      const ssoResponse = await CapacitorHttp.get({ url: ssoConfigUrl });
      const ssoConfig: SSOConfig = ssoResponse.data;

      const baseUrl = `https://${ssoConfig.server.hostname}:${ssoConfig.server.port}${ssoConfig.server.prefix}`;

      const endpoints: MedtronicEndpoints = {
        clientId: ssoConfig.client.client_id,
        scope: ssoConfig.client.scope,
        redirectUri: ssoConfig.client.redirect_uri,
        audience: ssoConfig.client.audience,
        tokenEndpoint: `${baseUrl}${ssoConfig.system_endpoints.token_endpoint_path}`,
        loginEndpoint: `${baseUrl}${ssoConfig.system_endpoints.authorization_endpoint_path}`,
        logoutEndpoint: `${baseUrl}${ssoConfig.system_endpoints.usersession_logout_endpoint_path}`,
        userEndpoint: `${baseUrl}${ssoConfig.oauth_protected_endpoints.userinfo_endpoint_path}`,
        dataEndpoint: `${regionConfig.baseUrlCumulus}/display/message`,
      };

      Log().info('[Discovery] Endpoints resolved:', JSON.stringify(endpoints));
      this.endpoints$.next(endpoints);
      this.initialized = true;
      return endpoints;
    } catch (err) {
      Log().error('[Discovery] Failed to fetch config, using defaults:', err);
      return this.endpoints$.value;
    }
  }
}
