import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '../config/api.config';

export interface LoyaltySchemeSlab {
  id?: number;
  tierName: string;
  valueFrom: number;
  valueTo: number | null;
  rewardValue: number;
  sortOrder?: number;
}

export interface LoyaltyScheme {
  id: number;
  active: string;
  schemeName: string;
  schemeCode: string;
  schemeDescription?: string | null;
  schemeTag: string;
  customerType: string;
  areaScope: string;
  areaValues: string[];
  areaDisplay: string;
  startDate: string;
  endDate: string;
  schemeType: string;
  basedOn: string;
  redemptionEnabled: boolean;
  status: string;
  workflowStatus: string;
  brochurePath?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  approvalRemark?: string | null;
  rejectedAt?: string | null;
  rejectionRemark?: string | null;
  createdByName?: string | null;
  createdAt?: string | null;
  slabs: LoyaltySchemeSlab[];
}

export interface LoyaltySchemePayload {
  active: string;
  scheme_name: string;
  scheme_code: string;
  scheme_description?: string | null;
  scheme_tag: string;
  customer_type: string;
  area_scope: string;
  area_values: string[];
  start_date: string;
  end_date: string;
  scheme_type: string;
  based_on: string;
  redemption_enabled: boolean;
  slabs: Array<{
    tier_name: string;
    value_from: number;
    value_to: number | null;
    reward_value: number;
  }>;
}

export interface LoyaltySchemeFilter {
  search?: string;
  status?: string;
}

export interface LoyaltySchemeOption {
  id: number;
  name: string;
}

export interface LoyaltySchemeOptions {
  branches: LoyaltySchemeOption[];
  zones: LoyaltySchemeOption[];
  states: LoyaltySchemeOption[];
  customers: LoyaltySchemeOption[];
}

type ApiResponse = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class LoyaltySchemeService {
  private readonly baseUrl = `${API_BASE_URL}/loyalty-schemes`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  list(filter: LoyaltySchemeFilter): Observable<LoyaltyScheme[]> {
    return this.http.get<ApiResponse>(this.baseUrl, {
      headers: this.authHeaders(),
      params: this.filterParams(filter)
    }).pipe(
      map(response => this.pickArray(response, ['schemes', 'data.schemes', 'data']).map(row => this.normalizeScheme(row))),
      catchError(error => this.handleError(error))
    );
  }

  get(id: number): Observable<LoyaltyScheme> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/${id}`, { headers: this.authHeaders() }).pipe(
      map(response => this.normalizeScheme(this.pickFirstValue(response, ['scheme', 'data.scheme', 'data']) ?? response)),
      catchError(error => this.handleError(error))
    );
  }

  options(): Observable<LoyaltySchemeOptions> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/options`, { headers: this.authHeaders() }).pipe(
      map(response => this.normalizeOptions(this.pickFirstValue(response, ['options', 'data.options', 'data']) ?? response)),
      catchError(error => this.handleError(error))
    );
  }

  generateCode(schemeName: string, schemeTag: string, basedOn: string): Observable<string> {
    const params = new HttpParams()
      .set('scheme_name', schemeName || 'Scheme')
      .set('scheme_tag', schemeTag || 'Regular')
      .set('based_on', basedOn || 'Value');

    return this.http.get<ApiResponse>(`${this.baseUrl}/generate-code`, { headers: this.authHeaders(), params }).pipe(
      map(response => this.readString(this.pickFirstValue(response, ['scheme_code', 'data.scheme_code', 'data']) ?? '')),
      catchError(error => this.handleError(error))
    );
  }

  create(payload: LoyaltySchemePayload): Observable<{ message: string; scheme: LoyaltyScheme }> {
    return this.http.post<ApiResponse>(this.baseUrl, payload, { headers: this.jsonHeaders() }).pipe(
      map(response => ({ message: this.responseMessage(response) || 'Scheme created successfully', scheme: this.normalizeScheme(this.pickFirstValue(response, ['scheme', 'data.scheme']) ?? {}) })),
      catchError(error => this.handleError(error))
    );
  }

  update(id: number, payload: LoyaltySchemePayload): Observable<{ message: string; scheme: LoyaltyScheme }> {
    return this.http.put<ApiResponse>(`${this.baseUrl}/${id}`, payload, { headers: this.jsonHeaders() }).pipe(
      map(response => ({ message: this.responseMessage(response) || 'Scheme updated successfully', scheme: this.normalizeScheme(this.pickFirstValue(response, ['scheme', 'data.scheme']) ?? {}) })),
      catchError(error => this.handleError(error))
    );
  }

  delete(id: number): Observable<string> {
    return this.http.delete<ApiResponse>(`${this.baseUrl}/${id}`, { headers: this.authHeaders() }).pipe(
      map(response => this.responseMessage(response) || 'Scheme deleted successfully'),
      catchError(error => this.handleError(error))
    );
  }

  approve(id: number, remark = ''): Observable<string> {
    return this.http.post<ApiResponse>(`${this.baseUrl}/${id}/approve`, { remark }, { headers: this.jsonHeaders() }).pipe(
      map(response => this.responseMessage(response) || 'Scheme approved successfully'),
      catchError(error => this.handleError(error))
    );
  }

  submit(id: number): Observable<string> { return this.workflow(id, 'submit', {}); }
  sendToDraft(id: number): Observable<string> { return this.workflow(id, 'draft', {}); }
  reject(id: number, remark: string): Observable<string> { return this.workflow(id, 'reject', { remark }); }
  publish(id: number): Observable<string> { return this.workflow(id, 'publish', {}); }

  uploadBrochure(id: number, file: File): Observable<string> {
    const data = new FormData();
    data.append('brochure', file);
    return this.http.post<ApiResponse>(`${this.baseUrl}/${id}/brochure`, data, { headers: this.authHeaders() }).pipe(
      map(response => this.responseMessage(response) || 'Scheme brochure uploaded successfully'),
      catchError(error => this.handleError(error))
    );
  }

  private workflow(id: number, action: string, body: Record<string, unknown>): Observable<string> {
    return this.http.post<ApiResponse>(`${this.baseUrl}/${id}/${action}`, body, { headers: this.jsonHeaders() }).pipe(
      map(response => this.responseMessage(response) || `Scheme ${action} completed`),
      catchError(error => this.handleError(error))
    );
  }

  private filterParams(filter: LoyaltySchemeFilter): HttpParams {
    let params = new HttpParams();
    Object.entries(filter).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') params = params.set(key, String(value));
    });
    return params;
  }

  private jsonHeaders(): HttpHeaders {
    return this.authHeaders().set('Content-Type', 'application/json');
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private normalizeScheme(value: unknown): LoyaltyScheme {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id']),
      active: this.readString(row['active']) || 'Y',
      schemeName: this.readString(row['scheme_name'] ?? row['schemeName']),
      schemeCode: this.readString(row['scheme_code'] ?? row['schemeCode']),
      schemeDescription: this.readNullableString(row['scheme_description'] ?? row['schemeDescription']),
      schemeTag: this.readString(row['scheme_tag'] ?? row['schemeTag']) || 'Regular',
      customerType: this.readString(row['customer_type'] ?? row['customerType']),
      areaScope: this.readString(row['area_scope'] ?? row['areaScope']) || 'All',
      areaValues: this.asArray(row['area_values'] ?? row['areaValues']).map(item => this.readString(item)).filter(Boolean),
      areaDisplay: this.readString(row['area_display'] ?? row['areaDisplay']) || 'All India',
      startDate: this.readString(row['start_date'] ?? row['startDate']),
      endDate: this.readString(row['end_date'] ?? row['endDate']),
      schemeType: this.readString(row['scheme_type'] ?? row['schemeType']) || 'Invoice',
      basedOn: this.readString(row['based_on'] ?? row['basedOn']) || 'Value',
      redemptionEnabled: this.readBoolean(row['redemption_enabled'] ?? row['redemptionEnabled'], false),
      status: this.readString(row['status']) || 'Draft',
      workflowStatus: this.readString(row['workflow_status'] ?? row['workflowStatus'] ?? row['status']) || 'Draft',
      brochurePath: this.readNullableString(row['brochure_path'] ?? row['brochurePath']),
      submittedAt: this.readNullableString(row['submitted_at'] ?? row['submittedAt']),
      approvedAt: this.readNullableString(row['approved_at'] ?? row['approvedAt']),
      approvalRemark: this.readNullableString(row['approval_remark'] ?? row['approvalRemark']),
      rejectedAt: this.readNullableString(row['rejected_at'] ?? row['rejectedAt']),
      rejectionRemark: this.readNullableString(row['rejection_remark'] ?? row['rejectionRemark']),
      createdByName: this.readNullableString(row['created_by_name'] ?? row['createdByName']),
      createdAt: this.readNullableString(row['created_at'] ?? row['createdAt']),
      slabs: this.pickArray(row, ['slabs']).map(slab => this.normalizeSlab(slab))
    };
  }

  private normalizeSlab(value: unknown): LoyaltySchemeSlab {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id']),
      tierName: this.readString(row['tier_name'] ?? row['tierName']),
      valueFrom: this.readNumber(row['value_from'] ?? row['valueFrom']),
      valueTo: this.nullableNumber(row['value_to'] ?? row['valueTo']),
      rewardValue: this.readNumber(row['reward_value'] ?? row['rewardValue']),
      sortOrder: this.readNumber(row['sort_order'] ?? row['sortOrder'])
    };
  }

  private normalizeOptions(value: unknown): LoyaltySchemeOptions {
    const row = this.asRecord(value);
    return {
      branches: this.pickArray(row, ['branches']).map(option => this.normalizeOption(option)),
      zones: this.pickArray(row, ['zones']).map(option => this.normalizeOption(option)),
      states: this.pickArray(row, ['states']).map(option => this.normalizeOption(option)),
      customers: this.pickArray(row, ['customers']).map(option => this.normalizeOption(option))
    };
  }

  private normalizeOption(value: unknown): LoyaltySchemeOption {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id']),
      name: this.readString(row['name'])
    };
  }

  private responseMessage(response: ApiResponse): string {
    return this.readMessage(response['message']);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  }

  private asArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    const row = this.asRecord(value);
    const values = row['$values'] ?? row['values'] ?? row['items'] ?? row['data'];
    return Array.isArray(values) ? values : [];
  }

  private pickArray(source: unknown, paths: string[]): unknown[] {
    for (const path of paths) {
      const rows = this.asArray(this.pickValue(source, path.split('.')));
      if (rows.length > 0) return rows;
    }
    return Array.isArray(source) ? source : [];
  }

  private pickFirstValue(source: unknown, paths: string[]): unknown {
    for (const path of paths) {
      const value = this.pickValue(source, path.split('.'));
      if (value !== undefined && value !== null) return value;
    }
    return undefined;
  }

  private pickValue(source: unknown, path: string[]): unknown {
    let current: unknown = source;
    for (const part of path) {
      const row = this.asRecord(current);
      current = row[part];
      if (current === undefined || current === null) return undefined;
    }
    return current;
  }

  private nullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    return this.readNumber(value);
  }

  private readNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private readBoolean(value: unknown, fallback = false): boolean {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return ['true', '1', 'yes', 'y', 'on'].includes(String(value).toLowerCase());
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
  }

  private readNullableString(value: unknown): string | null {
    const text = this.readString(value);
    return text || null;
  }

  private handleError(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse) {
      return throwError(() => new Error(this.readMessage(error.error?.message) || error.message || 'Loyalty scheme API request failed.'));
    }
    if (error instanceof Error) return throwError(() => error);
    return throwError(() => new Error('Loyalty scheme API request failed.'));
  }

  private readMessage(message: unknown): string {
    if (typeof message === 'string') return message;
    if (message && typeof message === 'object') {
      return Object.values(message).flatMap(value => Array.isArray(value) ? value : [value]).filter((value): value is string => typeof value === 'string').join(' ');
    }
    return '';
  }
}
