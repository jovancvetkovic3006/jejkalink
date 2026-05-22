import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthenticationService } from '../services/authentication.service';
import { isTokenExpired, isTokenExpiringSoon } from './token.util';
import { Log } from './log';

@Injectable()
export class TokenInterceptor implements HttpInterceptor {
  constructor(private authService: AuthenticationService) { }

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    const skipUrls = ['mdtlogin-ocl.medtronic.com', 'carelink-login.minimed.eu', 'clcloud.minimed.eu', 'carelink.minimed.eu'];

    const shouldSkip = skipUrls.some((url) => req.url.includes(url));

    if (shouldSkip) {
      // Bypass this interceptor
      return next.handle(req);
    }

    const token = this.authService.getToken();

    Log().info('Intercepted token is: ', token);
    if (token && !isTokenExpired(token) && !isTokenExpiringSoon(token, 300)) {
      const cloned = req.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      });
      return next.handle(cloned);
    }

    return this.authService.refreshToken().pipe(
      switchMap((res: any) => {
        if (!res?.access_token) {
          return throwError(() => new Error('No access_token after refresh'));
        }

        this.authService.setTokens(res);
        Log().info('Intercepted refresh token: ', res.access_token);
        const cloned = req.clone({
          setHeaders: { Authorization: `Bearer ${res.access_token}` },
        });

        return next.handle(cloned);
      }),
      catchError((err) => {
        return throwError(() => err);
      })
    );
  }
}
