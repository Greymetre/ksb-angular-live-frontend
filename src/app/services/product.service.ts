import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '../config/api.config';

export interface ProductSegment {
  id: number;
  active: string;
  name: string;
  createdByName?: string | null;
  createdAt?: string | null;
}

export interface ProductFamily {
  id: number;
  active: string;
  name: string;
  segmentId?: number | null;
  segmentName?: string | null;
  createdByName?: string | null;
  createdAt?: string | null;
}

export interface ProductItem {
  id: number;
  active: string;
  segmentId?: number | null;
  segmentName?: string | null;
  familyId?: number | null;
  familyName?: string | null;
  partNo: string;
  productName: string;
  mrp?: number | null;
  attachment?: string | null;
  createdByName?: string | null;
  createdAt?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly baseUrl = API_BASE_URL;

  constructor(private http: HttpClient, private authService: AuthService) {}

  listSegments(search?: string): Observable<ProductSegment[]> {
    return this.getArray<ProductSegment>('segments', 'segments', { search });
  }

  listSegmentOptions(search?: string): Observable<ProductSegment[]> {
    return this.getArray<ProductSegment>('getsegments', 'segments', { search });
  }

  listFamilies(segmentId?: number | null, search?: string): Observable<ProductFamily[]> {
    return this.getArray<ProductFamily>('families', 'families', { segment_id: segmentId, search });
  }

  listFamilyOptions(segmentId?: number | null, search?: string): Observable<ProductFamily[]> {
    return this.getArray<ProductFamily>('getfamilies', 'families', { segment_id: segmentId, search });
  }

  listProducts(segmentId?: number | null, familyId?: number | null, search?: string): Observable<ProductItem[]> {
    return this.getArray<ProductItem>('products', 'products', { segment_id: segmentId, family_id: familyId, search });
  }

  saveSegment(payload: Partial<ProductSegment>, id?: number): Observable<string> {
    const body = { active: payload.active, name: payload.name };
    return this.saveJson('segments', body, id);
  }

  saveFamily(payload: Partial<ProductFamily>, id?: number): Observable<string> {
    const body = { active: payload.active, name: payload.name, segment_id: payload.segmentId };
    return this.saveJson('families', body, id);
  }

  saveProduct(payload: Partial<ProductItem>, file?: File | null, id?: number): Observable<string> {
    const form = new FormData();
    this.append(form, 'active', payload.active);
    this.append(form, 'segment_id', payload.segmentId);
    this.append(form, 'family_id', payload.familyId);
    this.append(form, 'part_no', payload.partNo);
    this.append(form, 'product_name', payload.productName);
    this.append(form, 'mrp', payload.mrp);
    this.append(form, 'attachment', payload.attachment);
    if (file) form.append('attachment_file', file);
    const request = id
      ? this.http.put<Record<string, unknown>>(`${this.baseUrl}/products/${id}`, form, { headers: this.authHeaders() })
      : this.http.post<Record<string, unknown>>(`${this.baseUrl}/products`, form, { headers: this.authHeaders() });
    return request.pipe(map(response => this.message(response)), catchError(error => this.handleError(error)));
  }

  setActive(path: string, id: number, active: string): Observable<string> {
    return this.http.patch<Record<string, unknown>>(`${this.baseUrl}/${path}/${id}/status`, { active }, { headers: this.authHeaders() })
      .pipe(map(response => this.message(response)), catchError(error => this.handleError(error)));
  }

  delete(path: string, id: number): Observable<string> {
    return this.http.delete<Record<string, unknown>>(`${this.baseUrl}/${path}/${id}`, { headers: this.authHeaders() })
      .pipe(map(response => this.message(response)), catchError(error => this.handleError(error)));
  }

  export(path: string, values: Record<string, unknown> = {}): Observable<Blob> {
    let params = new HttpParams();
    Object.entries(values).forEach(([name, value]) => {
      if (value !== undefined && value !== null && value !== '') params = params.set(name, String(value));
    });
    return this.http.get(`${this.baseUrl}/${path}/export`, { headers: this.authHeaders(), params, responseType: 'blob' })
      .pipe(catchError(error => this.handleError(error)));
  }

  template(path: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${path}/template`, { headers: this.authHeaders(), responseType: 'blob' })
      .pipe(catchError(error => this.handleError(error)));
  }

  upload(path: string, file: File): Observable<string> {
    const form = new FormData();
    form.append('import_file', file);
    return this.http.post<Record<string, unknown>>(`${this.baseUrl}/${path}/upload`, form, { headers: this.authHeaders() })
      .pipe(map(response => this.message(response)), catchError(error => this.handleError(error)));
  }

  private getArray<T>(path: string, key: string, values: Record<string, unknown>): Observable<T[]> {
    let params = new HttpParams();
    Object.entries(values).forEach(([name, value]) => {
      if (value !== undefined && value !== null && value !== '') params = params.set(name, String(value));
    });
    return this.http.get<Record<string, unknown>>(`${this.baseUrl}/${path}`, { headers: this.authHeaders(), params })
      .pipe(map(response => this.array(response, key).map(row => this.camelize(row) as T)), catchError(error => this.handleError(error)));
  }

  private saveJson(path: string, body: Record<string, unknown>, id?: number): Observable<string> {
    const request = id
      ? this.http.put<Record<string, unknown>>(`${this.baseUrl}/${path}/${id}`, body, { headers: this.authHeaders() })
      : this.http.post<Record<string, unknown>>(`${this.baseUrl}/${path}`, body, { headers: this.authHeaders() });
    return request.pipe(map(response => this.message(response)), catchError(error => this.handleError(error)));
  }

  private append(form: FormData, key: string, value: unknown): void {
    if (value !== undefined && value !== null && value !== '') form.append(key, String(value));
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private array(response: Record<string, unknown>, key: string): unknown[] {
    const value = response[key] ?? response['data'];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>)['$values'])) return (value as Record<string, unknown>)['$values'] as unknown[];
    return [];
  }

  private camelize(value: unknown): Record<string, unknown> {
    const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const result: Record<string, unknown> = {};
    Object.entries(row).forEach(([key, val]) => {
      result[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] = val;
    });
    return result;
  }

  private message(response: Record<string, unknown>): string {
    return typeof response['message'] === 'string' ? response['message'] as string : 'Saved successfully';
  }

  private handleError(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse) return throwError(() => new Error(this.readMessage(error.error?.message) || error.message));
    return throwError(() => error instanceof Error ? error : new Error('Request failed'));
  }

  private readMessage(message: unknown): string {
    if (typeof message === 'string') return message;
    if (message && typeof message === 'object') return Object.values(message).flat().filter(x => typeof x === 'string').join(' ');
    return '';
  }
}
