import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '../config/api.config';

export interface AddressItem {
  id: number;
  active: string;
  countryName?: string;
  stateName?: string;
  districtName?: string;
  cityName?: string;
  pincode?: string;
  countryId?: number | null;
  stateId?: number | null;
  districtId?: number | null;
  cityId?: number | null;
  gstCode?: string | null;
  grade?: string | null;
  createdBy?: number | null;
  createdByName?: string | null;
  createdAt?: string | null;
}

export interface AddressPayload {
  active?: string;
  country_name?: string;
  state_name?: string;
  district_name?: string;
  city_name?: string;
  pincode?: string;
  country_id?: number | null;
  state_id?: number | null;
  district_id?: number | null;
  city_id?: number | null;
  gst_code?: string;
  grade?: string;
}

export interface AddressConfig {
  path: string;
  listKey: string;
  itemKey: string;
}

export interface AddressActionResult {
  item?: AddressItem;
  message: string;
}

export interface AddressListResult {
  items: AddressItem[];
  total: number;
  page: number;
  pageSize: number;
}

type ApiResponse = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class AddressMasterService {
  private readonly baseUrl = API_BASE_URL;

  constructor(private http: HttpClient, private authService: AuthService) {}

  list(config: AddressConfig, search = ''): Observable<AddressItem[]> {
    let params = new HttpParams();
    if (search.trim()) params = params.set('search', search.trim());
    return this.http.get<ApiResponse>(`${this.baseUrl}/${config.path}`, { headers: this.authHeaders(), params }).pipe(
      map(response => this.readItems(response, config.listKey)),
      catchError(error => this.handleError(error))
    );
  }

  listPaged(config: AddressConfig, page: number, pageSize: number, search = ''): Observable<AddressListResult> {
    let params = new HttpParams().set('page', String(page)).set('page_size', String(pageSize));
    if (search.trim()) params = params.set('search', search.trim());
    return this.http.get<ApiResponse>(`${this.baseUrl}/${config.path}`, { headers: this.authHeaders(), params }).pipe(
      map(response => ({
        items: this.readItems(response, config.listKey),
        total: this.readNumber(response['total']),
        page: this.readNumber(response['page']) || page,
        pageSize: this.readNumber(response['page_size']) || pageSize
      })),
      catchError(error => this.handleError(error))
    );
  }

  options(path: string, key: string): Observable<AddressItem[]> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/${path}`, { headers: this.authHeaders() }).pipe(
      map(response => this.readItems(response, key)),
      catchError(error => this.handleError(error))
    );
  }

  create(config: AddressConfig, payload: AddressPayload): Observable<AddressActionResult> {
    return this.http.post<ApiResponse>(`${this.baseUrl}/${config.path}`, payload, { headers: this.authHeaders() }).pipe(
      map(response => this.actionResult(response, config.itemKey, 'Record saved successfully')),
      catchError(error => this.handleError(error))
    );
  }

  update(config: AddressConfig, id: number, payload: AddressPayload): Observable<AddressActionResult> {
    return this.http.put<ApiResponse>(`${this.baseUrl}/${config.path}/${id}`, payload, { headers: this.authHeaders() }).pipe(
      map(response => this.actionResult(response, config.itemKey, 'Record updated successfully')),
      catchError(error => this.handleError(error))
    );
  }

  setActive(config: AddressConfig, id: number, active: string): Observable<AddressActionResult> {
    return this.http.patch<ApiResponse>(`${this.baseUrl}/${config.path}/${id}/status`, { active }, { headers: this.authHeaders() }).pipe(
      map(response => this.actionResult(response, config.itemKey, 'Status changed successfully')),
      catchError(error => this.handleError(error))
    );
  }

  delete(config: AddressConfig, id: number): Observable<AddressActionResult> {
    return this.http.delete<ApiResponse>(`${this.baseUrl}/${config.path}/${id}`, { headers: this.authHeaders() }).pipe(
      map(response => ({ message: this.responseMessage(response) || 'Record deleted successfully' })),
      catchError(error => this.handleError(error))
    );
  }

  export(config: AddressConfig): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${config.path}/export`, { headers: this.authHeaders(), responseType: 'blob' }).pipe(
      catchError(error => this.handleError(error))
    );
  }

  template(config: AddressConfig): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${config.path}/template`, { headers: this.authHeaders(), responseType: 'blob' }).pipe(
      catchError(error => this.handleError(error))
    );
  }

  upload(config: AddressConfig, file: File): Observable<AddressActionResult> {
    const formData = new FormData();
    formData.append('import_file', file);
    return this.http.post<ApiResponse>(`${this.baseUrl}/${config.path}/upload`, formData, { headers: this.authHeaders() }).pipe(
      map(response => ({ message: this.responseMessage(response) || 'Import completed successfully' })),
      catchError(error => this.handleError(error))
    );
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private readItems(response: ApiResponse, key: string): AddressItem[] {
    const rows = this.pickArray(response, [key, this.pascal(key), `data.${key}`, `result.${key}`, 'data', 'items', 'records']);
    return rows.map(row => this.normalizeItem(row)).filter(item => item.id > 0 || this.itemName(item));
  }

  private actionResult(response: ApiResponse, key: string, fallbackMessage: string): AddressActionResult {
    const item = this.pickFirstValue(response, [key, this.pascal(key), `data.${key}`, `result.${key}`]);
    return { item: item ? this.normalizeItem(item) : undefined, message: this.responseMessage(response) || fallbackMessage };
  }

  private normalizeItem(value: unknown): AddressItem {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id'] ?? row['Id']),
      active: this.readString(row['active'] ?? row['Active']) || 'Y',
      countryName: this.readString(row['country_name'] ?? row['countryName'] ?? row['CountryName']),
      stateName: this.readString(row['state_name'] ?? row['stateName'] ?? row['StateName']),
      districtName: this.readString(row['district_name'] ?? row['districtName'] ?? row['DistrictName']),
      cityName: this.readString(row['city_name'] ?? row['cityName'] ?? row['CityName']),
      pincode: this.readString(row['pincode'] ?? row['Pincode']),
      countryId: this.readNullableNumber(row['country_id'] ?? row['countryId'] ?? row['CountryId']),
      stateId: this.readNullableNumber(row['state_id'] ?? row['stateId'] ?? row['StateId']),
      districtId: this.readNullableNumber(row['district_id'] ?? row['districtId'] ?? row['DistrictId']),
      cityId: this.readNullableNumber(row['city_id'] ?? row['cityId'] ?? row['CityId']),
      gstCode: this.readNullableString(row['gst_code'] ?? row['gstCode'] ?? row['GstCode']),
      grade: this.readNullableString(row['grade'] ?? row['Grade']),
      createdBy: this.readNullableNumber(row['created_by'] ?? row['createdBy'] ?? row['CreatedBy']),
      createdByName: this.readNullableString(row['created_by_name'] ?? row['createdByName'] ?? row['CreatedByName']),
      createdAt: this.readNullableString(row['created_at'] ?? row['createdAt'] ?? row['CreatedAt'])
    };
  }

  private itemName(item: AddressItem): string {
    return item.countryName || item.stateName || item.districtName || item.cityName || item.pincode || '';
  }

  private responseMessage(response: ApiResponse): string {
    return this.readMessage(response['message'] ?? response['Message']);
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

  private readNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private readNullableNumber(value: unknown): number | null {
    const number = this.readNumber(value);
    return number > 0 ? number : null;
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private readNullableString(value: unknown): string | null {
    if (typeof value === 'string') return value || null;
    if (typeof value === 'number') return String(value);
    return null;
  }

  private handleError(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse) {
      return throwError(() => new Error(this.readMessage(error.error?.message) || error.message || 'Address master API request failed.'));
    }
    if (error instanceof Error) return throwError(() => error);
    return throwError(() => new Error('Address master API request failed.'));
  }

  private readMessage(message: unknown): string {
    if (typeof message === 'string') return message;
    if (message && typeof message === 'object') {
      return Object.values(message).flatMap(value => Array.isArray(value) ? value : [value]).filter((value): value is string => typeof value === 'string').join(' ');
    }
    return '';
  }

  private pascal(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
