import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '../config/api.config';

export interface CityAssignment {
  id: number;
  userId: number;
  userName?: string | null;
  userDesignation?: string | null;
  reportingId?: number | null;
  reportingName?: string | null;
  reportingDesignation?: string | null;
  cityId?: number | null;
  cityName?: string | null;
  grade?: string | null;
  districtId?: number | null;
  districtName?: string | null;
  stateId?: number | null;
  stateName?: string | null;
  createdAt?: string | null;
}

export interface CityAssignmentOption { id: number; name: string; }

export interface CityAssignmentOptions {
  users: CityAssignmentOption[];
  cities: CityAssignmentOption[];
}

export interface CityAssignmentPage { rows: CityAssignment[]; total: number; page: number; pageSize: number; }

@Injectable({ providedIn: 'root' })
export class CityAssignmentService {
  private readonly baseUrl = `${API_BASE_URL}/city-assignments`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  list(filters: Record<string, unknown> = {}): Observable<CityAssignmentPage> {
    return this.http.get<Record<string, unknown>>(this.baseUrl, { headers: this.authHeaders(), params: this.params(filters) }).pipe(
      map(response => ({
        rows: this.asArray(response['assignments']).map(row => this.normalize(row)),
        total: this.number(response['total']),
        page: this.number(response['page']) || 1,
        pageSize: this.number(response['page_size']) || 10
      })),
      catchError(error => this.handleError(error))
    );
  }

  options(): Observable<CityAssignmentOptions> {
    return this.http.get<Record<string, unknown>>(`${this.baseUrl}/options`, { headers: this.authHeaders() }).pipe(
      map(response => {
        const options = this.asRecord(response['options']);
        return {
          users: this.asArray(options['users']).map(row => this.option(row)),
          cities: this.asArray(options['cities']).map(row => this.option(row))
        };
      }),
      catchError(error => this.handleError(error))
    );
  }

  create(payload: Record<string, unknown>): Observable<string> {
    return this.http.post<Record<string, unknown>>(this.baseUrl, payload, { headers: this.authHeaders() }).pipe(
      map(response => this.message(response) || 'User city assigned successfully.'),
      catchError(error => this.handleError(error))
    );
  }

  delete(id: number): Observable<string> {
    return this.http.delete<Record<string, unknown>>(`${this.baseUrl}/${id}`, { headers: this.authHeaders() }).pipe(
      map(response => this.message(response) || 'User city assignment deleted successfully.'),
      catchError(error => this.handleError(error))
    );
  }

  export(filters: Record<string, unknown> = {}): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/export`, { headers: this.authHeaders(), params: this.params(filters), responseType: 'blob' }).pipe(
      catchError(error => this.handleError(error))
    );
  }

  template(): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/template`, { headers: this.authHeaders(), responseType: 'blob' }).pipe(
      catchError(error => this.handleError(error))
    );
  }

  upload(file: File): Observable<string> {
    const data = new FormData();
    data.append('import_file', file);
    return this.http.post<Record<string, unknown>>(`${this.baseUrl}/upload`, data, { headers: this.authHeaders() }).pipe(
      map(response => this.message(response) || 'User city import completed.'),
      catchError(error => this.handleError(error))
    );
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private params(filters: Record<string, unknown>): HttpParams {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') params = params.set(key, String(value));
    });
    return params;
  }

  private normalize(value: unknown): CityAssignment {
    const row = this.asRecord(value);
    return {
      id: this.number(row['id']),
      userId: this.number(row['user_id'] ?? row['userId']),
      userName: this.string(row['user_name'] ?? row['userName']),
      userDesignation: this.string(row['user_designation'] ?? row['userDesignation']),
      reportingId: this.nullNumber(row['reporting_id'] ?? row['reportingId']),
      reportingName: this.string(row['reporting_name'] ?? row['reportingName']),
      reportingDesignation: this.string(row['reporting_designation'] ?? row['reportingDesignation']),
      cityId: this.nullNumber(row['city_id'] ?? row['cityId']),
      cityName: this.string(row['city_name'] ?? row['cityName']),
      grade: this.string(row['grade']),
      districtId: this.nullNumber(row['district_id'] ?? row['districtId']),
      districtName: this.string(row['district_name'] ?? row['districtName']),
      stateId: this.nullNumber(row['state_id'] ?? row['stateId']),
      stateName: this.string(row['state_name'] ?? row['stateName']),
      createdAt: this.string(row['created_at'] ?? row['createdAt'])
    };
  }

  private option(value: unknown): CityAssignmentOption {
    const row = this.asRecord(value);
    return { id: this.number(row['id']), name: this.string(row['name']) || String(row['id'] || '') };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  }

  private asArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    const row = this.asRecord(value);
    return Array.isArray(row['$values']) ? row['$values'] as unknown[] : [];
  }

  private number(value: unknown): number {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private nullNumber(value: unknown): number | null {
    const parsed = this.number(value);
    return parsed > 0 ? parsed : null;
  }

  private string(value: unknown): string | null {
    if (typeof value === 'string') return value || null;
    if (typeof value === 'number') return String(value);
    return null;
  }

  private message(response: Record<string, unknown>): string {
    const message = response['message'];
    if (typeof message === 'string') return message;
    if (message && typeof message === 'object') return Object.values(message).flat().join(' ');
    return '';
  }

  private handleError(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse) {
      return throwError(() => new Error(this.message(this.asRecord(error.error)) || error.message || 'City assignment API request failed.'));
    }
    return throwError(() => error instanceof Error ? error : new Error('City assignment API request failed.'));
  }
}
