import { Injectable } from '@angular/core';
import { CapacitorHttp, HttpOptions } from '@capacitor/core';
import { from } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class HttpService {
  private discoverUrl =
    'https://clcloud.minimed.eu/connect/carepartner/v11/discover/android/3.3';

  constructor() {}

  getDiscoverInfo() {
    return this.get(this.discoverUrl).pipe();
  }

  getCarePartner() {
    this.get(
      'https://carelink.minimed.eu/configs/v1/oauth20_sso_carepartner_eu_v6.json'
    ).subscribe({
      next: (res) => {
        console.log(res);
      },
    });
  }

  post(url: string, body: any = {}, headers: any = {}) {
    const options: HttpOptions = {
      url,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      data: {
        ...body,
      },
    };
    return from(CapacitorHttp.post(options));
  }

  get(url: string, headers: any = {}) {
    const options: HttpOptions = {
      url,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
    };
    return from(CapacitorHttp.get(options));
  }
}
