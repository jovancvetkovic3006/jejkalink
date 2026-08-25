import * as jwt_decode from 'jwt-decode';

interface JWTPayload {
  exp?: number;
  [key: string]: any;
}

export function isTokenExpired(token: string | null): boolean {
  try {
    if (!token) return true;

    const decoded = jwt_decode.jwtDecode<JWTPayload>(token);
    const now = Math.floor(Date.now() / 1000);
    return !decoded.exp || decoded.exp < now;
  } catch (e) {
    return true;
  }
}

export function isTokenExpiringSoon(token: string | null, bufferSeconds = 120): boolean {
  try {
    if (!token) return true;

    const decoded = jwt_decode.jwtDecode<JWTPayload>(token);
    const now = Math.floor(Date.now() / 1000);
    return !decoded.exp || decoded.exp < (now + bufferSeconds);
  } catch (e) {
    return true;
  }
}

export function tokenExpiresAtMs(token: string | null): number | null {
  try {
    if (!token) return null;
    const decoded = jwt_decode.jwtDecode<JWTPayload>(token);
    if (!decoded.exp) return null;
    return decoded.exp * 1000;
  } catch {
    return null;
  }
}

export function getTokenMag(token: string | null): string {
  try {
    if (!token) return '';

    const decoded = jwt_decode.jwtDecode<JWTPayload>(token);
    return decoded['mag-identifier'];
  } catch (e) {
    return 'true';
  }
}
