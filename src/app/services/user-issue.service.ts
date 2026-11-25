import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '../config/api.config';

export interface UserIssueRow {
  id: number;
  zone: string;
  branch: string;
  employee_code: string;
  employee_name: string;
  designation: string;
  issue_date: string;
  issue_description: string;
  status: string;
  issue_created_by: string;
  solved_by: number | null;
  solved_by_name: string;
  solve_remark: string;
}

export interface UserIssueListResponse {
  data: UserIssueRow[];
  total: number;
  page: number;
  page_size: number;
}

export interface SolverOption {
  id: number;
  name: string;
  employee_code: string;
}

export interface UserIssueFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable({ providedIn: 'root' })
export class UserIssueService {
  private readonly baseUrl = API_BASE_URL;

  constructor(private http: HttpClient, private auth: AuthService) {}

  list(filters: UserIssueFilters = {}): Observable<UserIssueListResponse> {
    return this.http.get<any>(`${this.baseUrl}/user-issues`, {
      headers: this.headers(), params: this.params(filters)
    }).pipe(catchError(error => this.handleError(error)));
  }

  solverOptions(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/user-issues/solver-options`, {
      headers: this.headers()
    }).pipe(catchError(error => this.handleError(error)));
  }

  create(body: { user_id: number; issue: string }): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/user-issues`, body, {
      headers: this.headers()
    }).pipe(catchError(error => this.handleError(error)));
  }

  resolve(id: number, body: { status: string; solved_by: number | null; solve_remark: string | null }): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/user-issues/${id}/resolve`, body, {
      headers: this.headers()
    }).pipe(catchError(error => this.handleError(error)));
  }

  download(filters: UserIssueFilters = {}): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/user-issues/export`, {
      headers: this.headers(), params: this.params(filters), responseType: 'blob'
    }).pipe(catchError(error => this.handleError(error)));
  }

  private params(filters: UserIssueFilters): HttpParams {
    let params = new HttpParams();
    if (filters.page) params = params.set('page', String(filters.page));
    if (filters.pageSize) params = params.set('page_size', String(filters.pageSize));
    if (filters.search?.trim()) params = params.set('search', filters.search.trim());
    if (filters.status) params = params.set('status', filters.status);
    if (filters.startDate) params = params.set('start_date', filters.startDate);
    if (filters.endDate) params = params.set('end_date', filters.endDate);
    return params;
  }

  private headers(): HttpHeaders {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private handleError(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse) {
      const message = typeof error.error?.message === 'string'
        ? error.error.message
        : this.flatten(error.error?.message) || error.message;
      return throwError(() => new Error(message || 'User Issues request failed.'));
    }
    return throwError(() => new Error('User Issues request failed.'));
  }

  private flatten(message: unknown): string {
    if (message && typeof message === 'object') {
      return Object.values(message)
        .flatMap(value => Array.isArray(value) ? value : [value])
        .filter((value): value is string => typeof value === 'string')
        .join(' ');
    }
    return '';
  }
}
