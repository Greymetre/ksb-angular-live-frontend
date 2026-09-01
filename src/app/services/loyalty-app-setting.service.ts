import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { AuthService } from './auth.service';

export interface LoyaltyAppSetting {
  id: number;
  androidVersion: string;
  iosVersion: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface LoyaltyAppSettingPayload {
  androidVersion: string;
  iosVersion: string;
}

interface ApiResponse {
  status?: string;
  message?: string;
  data?: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class LoyaltyAppSettingService {
  private readonly url = `${API_BASE_URL}/loyalty-app-setting`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  get(): Observable<LoyaltyAppSetting> {
    return this.http.get<ApiResponse>(this.url, { headers: this.authHeaders() }).pipe(
      map(response => this.normalize(response.data ?? {})),
      catchError(error => this.handleError(error))
    );
  }

  save(payload: LoyaltyAppSettingPayload): Observable<{ setting: LoyaltyAppSetting; message: string }> {
    return this.http.put<ApiResponse>(this.url, {
      android_version: payload.androidVersion.trim(),
      ios_version: payload.iosVersion.trim()
    }, { headers: this.authHeaders() }).pipe(
      map(response => ({
        setting: this.normalize(response.data ?? {}),
        message: response.message || 'Loyalty app settings saved successfully.'
      })),
      catchError(error => this.handleError(error))
    );
  }

  private normalize(row: Record<string, unknown>): LoyaltyAppSetting {
    return {
      id: Number(row['id'] ?? 0),
      androidVersion: String(row['android_version'] ?? ''),
      iosVersion: String(row['ios_version'] ?? ''),
      createdAt: row['created_at'] ? String(row['created_at']) : null,
      updatedAt: row['updated_at'] ? String(row['updated_at']) : null
    };
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    const body = error.error as Record<string, unknown> | null;
    const message = body && typeof body['message'] === 'string'
      ? body['message']
      : 'Unable to process Loyalty app settings.';
    return throwError(() => new Error(message));
  }
}
