import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
} from '@angular/common/http';
import { Observable, from, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { isTokenExpired } from './token.util';
import { Log } from './log';

@Injectable()
export class TokenInterceptor implements HttpInterceptor {
  constructor(private authService: AuthService) {}

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    const skipUrls = ['mdtlogin-ocl.medtronic.com', 'clcloud.minimed.eu'];

    const shouldSkip = skipUrls.some((url) => req.url.includes(url));

    if (shouldSkip) {
      // Bypass this interceptor
      return next.handle(req);
    }

    const token = this.authService.getToken();

    Log().info('Intercepted token is: ', token);
    if (token && !isTokenExpired(token)) {
      // Use the token as-is
      const cloned = req.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      });
      return next.handle(cloned);
    }

    // Token expired → refresh it
    return this.authService.refreshToken().pipe(
      switchMap((res: any) => {
        this.authService.setTokens(res);

        Log().info('Intercepted refresh token: ', res.access_token);
        const cloned = req.clone({
          setHeaders: { Authorization: `Bearer ${res.access_token}` },
        });

        return next.handle(cloned);
      }),
      catchError((err) => {
        this.authService.logout();
        return throwError(() => err);
      })
    );
  }
}
