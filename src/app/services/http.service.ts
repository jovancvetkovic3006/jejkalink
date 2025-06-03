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
    return this.get(this.discoverUrl).subscribe({
      next: (discoverInfo) => {
        console.log(discoverInfo);
      },
      error: (error) => {
        console.error(error);
      },
    });
  }

  post(url: string) {
    const options: HttpOptions = {
      url,
      headers: {
        Authorization: 'Basic writekey:password',
        'Content-Type': 'application/json',
      },
      data: {
        userId: '019mr8mf4r',
        event: 'API Called',
        context: {
          ip: '24.5.68.47',
        },
      },
    };
    return from(CapacitorHttp.post(options));
  }

  get(url: string) {
    const options: HttpOptions = {
      url,
      // headers: {
      //   Authorization: 'Basic writekey:password',
      //   'Content-Type': 'application/json',
      // },
    };
    return from(CapacitorHttp.get(options));
  }
}
