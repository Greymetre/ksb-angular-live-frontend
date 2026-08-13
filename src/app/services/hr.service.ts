import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '../config/api.config';
import { asPagedArray, PagedArray } from '../shared/utils/paged-array';

export interface HrOption { id: number; name: string; }
export interface HrOptions {
  users: HrOption[];
  branches: HrOption[];
  divisions: HrOption[];
  designations: HrOption[];
  leave_types: string[];
  balance_types: string[];
  working_types: string[];
}

export type HrRecord = Record<string, any>;

export interface AttendancePlan {
  tour?: { exists?: boolean; data?: HrRecord | null };
  beat?: { exists?: boolean; data?: HrRecord | null };
}

@Injectable({ providedIn: 'root' })
export class HrService {
  private readonly baseUrl = API_BASE_URL;

  constructor(private http: HttpClient, private authService: AuthService) {}

  options(): Observable<HrOptions> {
    return this.http.get<any>(`${this.baseUrl}/hr/options`, { headers: this.authHeaders() }).pipe(
      map(response => response.options || {}),
      catchError(error => this.handleError(error))
    );
  }

  list(path: string, filters: HrRecord = {}, key = path): Observable<HrRecord[]> {
    return this.http.get<any>(`${this.baseUrl}/${path}`, {
      headers: this.authHeaders(),
      params: this.params(filters)
    }).pipe(
      map(response => this.asArray(response[key] ?? response.data ?? response.items)),
      catchError(error => this.handleError(error))
    );
  }

  listPaged(path: string, filters: HrRecord = {}, key = path): Observable<PagedArray<HrRecord>> {
    return this.http.get<any>(`${this.baseUrl}/${path}`, {
      headers: this.authHeaders(),
      params: this.params(filters)
    }).pipe(
      map(response => asPagedArray(this.asArray(response[key] ?? response.data ?? response.items), response, Number(filters['page']) || 1, Number(filters['page_size']) || 10)),
      catchError(error => this.handleError(error))
    );
  }

  districtsByUser(userId: number): Observable<HrOption[]> {
    return this.http.get<any>(`${this.baseUrl}/tours/ajax-user-districts`, {
      headers: this.authHeaders(),
      params: this.params({ user_id: userId })
    }).pipe(
      map(response => this.asArray(response.districts) as HrOption[]),
      catchError(error => this.handleError(error))
    );
  }

  citiesByUserDistrict(userId: number, districtId: number): Observable<HrOption[]> {
    return this.http.get<any>(`${this.baseUrl}/tours/ajax-user-cities-by-district`, {
      headers: this.authHeaders(),
      params: this.params({ user_id: userId, district_id: districtId })
    }).pipe(
      map(response => this.asArray(response.cities) as HrOption[]),
      catchError(error => this.handleError(error))
    );
  }

  attendancePlan(userId: number, date: string): Observable<AttendancePlan> {
    return this.http.get<any>(`${this.baseUrl}/attendance-plan`, {
      headers: this.authHeaders(),
      params: this.params({ user_id: userId, date })
    }).pipe(
      map(response => response.plan || {}),
      catchError(error => this.handleError(error))
    );
  }

  get(path: string, id: number, key: string): Observable<HrRecord> {
    return this.http.get<any>(`${this.baseUrl}/${path}/${id}`, { headers: this.authHeaders() }).pipe(
      map(response => response[key] || {}),
      catchError(error => this.handleError(error))
    );
  }

  create(path: string, payload: HrRecord): Observable<string> {
    return this.http.post<any>(`${this.baseUrl}/${path}`, payload, { headers: this.authHeaders() }).pipe(
      map(response => this.message(response) || 'Record saved successfully'),
      catchError(error => this.handleError(error))
    );
  }

  update(path: string, id: number, payload: HrRecord): Observable<string> {
    return this.http.put<any>(`${this.baseUrl}/${path}/${id}`, payload, { headers: this.authHeaders() }).pipe(
      map(response => this.message(response) || 'Record updated successfully'),
      catchError(error => this.handleError(error))
    );
  }

  delete(path: string, id: number): Observable<string> {
    return this.http.delete<any>(`${this.baseUrl}/${path}/${id}`, { headers: this.authHeaders() }).pipe(
      map(response => this.message(response) || 'Record deleted successfully'),
      catchError(error => this.handleError(error))
    );
  }

  post(path: string, payload: HrRecord): Observable<string> {
    return this.http.post<any>(`${this.baseUrl}/${path}`, payload, { headers: this.authHeaders() }).pipe(
      map(response => this.message(response) || 'Action completed successfully'),
      catchError(error => this.handleError(error))
    );
  }

  export(path: string, filters: HrRecord = {}): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${path}`, {
      headers: this.authHeaders(),
      params: this.params(filters),
      responseType: 'blob'
    }).pipe(catchError(error => this.handleError(error)));
  }

  upload(path: string, file: File): Observable<string> {
    const data = new FormData();
    data.append('import_file', file);
    return this.http.post<any>(`${this.baseUrl}/${path}`, data, { headers: this.authHeaders(false) }).pipe(
      map(response => this.message(response) || 'Import completed'),
      catchError(error => this.handleError(error))
    );
  }

  private params(filters: HrRecord): HttpParams {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') params = params.set(key, String(value));
    });
    return params;
  }

  private authHeaders(json = true): HttpHeaders {
    const token = this.authService.getToken();
    let headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
    if (json) headers = headers.set('Content-Type', 'application/json');
    return headers;
  }

  private asArray(value: unknown): HrRecord[] {
    if (Array.isArray(value)) return value as HrRecord[];
    const record = value && typeof value === 'object' ? value as HrRecord : {};
    return Array.isArray(record['$values']) ? record['$values'] : [];
  }

  private message(response: any): string {
    const message = response?.message;
    if (typeof message === 'string') return message;
    if (message && typeof message === 'object') return Object.values(message).flat().join(' ');
    return '';
  }

  private handleError(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse) {
      return throwError(() => new Error(this.message(error.error) || error.message || 'HR API request failed.'));
    }
    return throwError(() => error instanceof Error ? error : new Error('HR API request failed.'));
  }
}
