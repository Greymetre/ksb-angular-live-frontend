import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { API_BASE_URL } from '../config/api.config';

interface LoginUserInfo {
  id: number;
  name?: string;
  email?: string;
  mobile?: string;
  access_token?: string;
  token?: string;
  provider?: string;
  roles?: number[];
  permissions?: string[];
  user_type?: string[];
  profile_image?: string | null;
}

interface LoginResponse {
  status: string;
  message?: unknown;
  userinfo?: LoginUserInfo;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly loginUrl = `${API_BASE_URL}/login`;
  private readonly tokenKey = 'netproject_access_token';
  private readonly userKey = 'netproject_user';
  private readonly deviceKey = 'netproject_device_id';
  private readonly permissionSchemaKey = 'netproject_permission_schema';
  private readonly permissionSchemaVersion = 'role-only-v1';
  private permissionRefresh$?: Observable<LoginUserInfo>;
  private permissionRefreshAt = 0;
  private static readonly permissionRefreshTtlMs = 60_000;
  private readonly profileImageSubject = new BehaviorSubject<string>(this.readStoredProfileImage());

  /** Emits the signed-in user's profile image path so the header updates live. */
  readonly profileImage$ = this.profileImageSubject.asObservable();

  constructor(private http: HttpClient) {}

  login(username: string, password: string): Observable<LoginUserInfo> {
    return this.http.post<LoginResponse>(this.loginUrl, {
      username,
      password,
      unique_id: this.getDeviceId(),
      device_type: 'web',
      device_name: window.navigator.userAgent,
      app_version: 'netproject-frontend',
      login_at: new Date().toISOString()
    }).pipe(
      map(response => {
        const userinfo = response.userinfo;
        const token = userinfo?.access_token ?? userinfo?.token;

        if (response.status !== 'success' || !userinfo || !token) {
          throw new Error(this.readMessage(response.message) || 'Login failed. Please try again.');
        }

        localStorage.setItem(this.tokenKey, token);
        localStorage.setItem(this.userKey, JSON.stringify(userinfo));
        localStorage.setItem(this.permissionSchemaKey, this.permissionSchemaVersion);
        this.permissionRefresh$ = undefined;
        return userinfo;
      }),
      catchError(error => throwError(() => new Error(this.getErrorMessage(error))))
    );
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    localStorage.removeItem(this.permissionSchemaKey);
    this.permissionRefresh$ = undefined;
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getCurrentUser(): LoginUserInfo | null {
    if (localStorage.getItem(this.permissionSchemaKey) !== this.permissionSchemaVersion) {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.userKey);
      return null;
    }

    const stored = localStorage.getItem(this.userKey);
    if (!stored) return null;

    try {
      return JSON.parse(stored) as LoginUserInfo;
    } catch {
      return null;
    }
  }

  /** Drops the cached profile so the next guarded navigation re-reads the permissions.
   *  Called after a role is saved, so an admin editing their own role sees the effect
   *  without signing out. */
  invalidatePermissions(): void {
    this.permissionRefresh$ = undefined;
    this.permissionRefreshAt = 0;
  }

  refreshCurrentUser(): Observable<LoginUserInfo> {
    // The profile used to be cached for the whole session, so a permission granted or
    // taken away only reached the user after a full reload. It is now re-read once the
    // cache is older than permissionRefreshTtlMs; concurrent navigations still share
    // one request.
    if (this.permissionRefresh$ && Date.now() - this.permissionRefreshAt < AuthService.permissionRefreshTtlMs) {
      return this.permissionRefresh$;
    }

    const token = this.getToken();
    const current = this.getCurrentUser();
    if (!token || !current) {
      return throwError(() => new Error('Unauthenticated.'));
    }

    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    this.permissionRefreshAt = Date.now();
    this.permissionRefresh$ = this.http.get<LoginResponse>(`${API_BASE_URL}/getProfile`, { headers }).pipe(
      map(response => {
        if (response.status !== 'success' || !response.userinfo) {
          throw new Error(this.readMessage(response.message) || 'Unable to refresh permissions.');
        }

        const refreshed: LoginUserInfo = {
          ...current,
          ...response.userinfo,
          access_token: current.access_token ?? current.token ?? token,
          token: current.token
        };
        localStorage.setItem(this.userKey, JSON.stringify(refreshed));
        return refreshed;
      }),
      catchError(error => {
        this.invalidatePermissions();
        return throwError(() => error);
      }),
      shareReplay(1)
    );

    return this.permissionRefresh$;
  }

  /** Keeps the cached login payload in step after a profile picture upload. */
  setStoredProfileImage(path: string): void {
    const user = this.getCurrentUser();
    if (user) localStorage.setItem(this.userKey, JSON.stringify({ ...user, profile_image: path }));
    this.profileImageSubject.next(path);
  }

  private readStoredProfileImage(): string {
    return (this.getCurrentUser()?.profile_image ?? '').trim();
  }

  hasPermission(permission?: string): boolean {
    if (!permission) return false;
    if (this.isSuperAdmin()) return true;

    const permissions = this.getCurrentUser()?.permissions;
    if (!permissions?.length) return false;

    return permissions.includes(permission);
  }

  hasAnyPermission(permissions?: string[]): boolean {
    if (!permissions?.length) return false;
    if (this.isSuperAdmin()) return true;

    const currentPermissions = this.getCurrentUser()?.permissions;
    if (!currentPermissions?.length) return false;

    return permissions.some(permission => currentPermissions.includes(permission));
  }

  isSuperAdminUser(): boolean {
    return this.isSuperAdmin();
  }

  // Dealer/distributor CRM users get a catalogue-style product listing instead of
  // the master data table. Superadmin keeps the full master view for support.
  isDistributorUser(): boolean {
    if (this.isSuperAdmin()) return false;
    return this.getCurrentUser()?.user_type?.some(role => {
      const name = role.trim().toLowerCase();
      return name === 'distributor' || name === 'dealer';
    }) ?? false;
  }

  isSuperAdmin(): boolean {
    return this.getCurrentUser()?.user_type?.some(role =>
      role.toLowerCase() === 'superadmin'
    ) ?? false;
  }

  private getDeviceId(): string {
    const existing = localStorage.getItem(this.deviceKey);
    if (existing) return existing;

    const generated = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    localStorage.setItem(this.deviceKey, generated);
    return generated;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      return this.readMessage(error.error?.message) || error.message || 'Unable to reach login API.';
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Unable to reach login API.';
  }

  private readMessage(message: unknown): string {
    if (typeof message === 'string') return message;

    if (message && typeof message === 'object') {
      return Object.values(message)
        .flatMap(value => Array.isArray(value) ? value : [value])
        .filter((value): value is string => typeof value === 'string')
        .join(' ');
    }

    return '';
  }
}
