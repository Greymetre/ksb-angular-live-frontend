import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '../config/api.config';

export interface MasterItem {
  id: number;
  active: string;
  branchName?: string;
  branchCode?: string | null;
  divisionName?: string;
  designationName?: string;
  name?: string;
  createdBy?: number | null;
  createdByName?: string | null;
  createdAt?: string | null;
}

export interface MasterPayload {
  active?: string;
  branch_name?: string;
  branch_code?: string;
  division_name?: string;
  designation_name?: string;
  branchName?: string;
  branchCode?: string;
  divisionName?: string;
  designationName?: string;
  name?: string;
}

export interface MasterConfig {
  path: string;
  listKey: string;
  itemKey: string;
}

export interface MasterActionResult {
  item?: MasterItem;
  message: string;
}

type MasterApiResponse = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class MasterCrudService {
  private readonly baseUrl = API_BASE_URL;

  constructor(private http: HttpClient, private authService: AuthService) {}

  list(config: MasterConfig, search = ''): Observable<MasterItem[]> {
    let params = new HttpParams();
    if (search.trim()) params = params.set('search', search.trim());

    return this.http.get<MasterApiResponse>(`${this.baseUrl}/${config.path}`, {
      headers: this.authHeaders(),
      params
    }).pipe(
      map(response => this.readItems(response, config.listKey)),
      catchError(error => this.handleError(error))
    );
  }

  create(config: MasterConfig, payload: MasterPayload): Observable<MasterActionResult> {
    return this.http.post<MasterApiResponse>(`${this.baseUrl}/${config.path}`, payload, {
      headers: this.authHeaders()
    }).pipe(
      map(response => this.actionResult(response, config.itemKey, 'Record saved successfully')),
      catchError(error => this.handleError(error))
    );
  }

  update(config: MasterConfig, id: number, payload: MasterPayload): Observable<MasterActionResult> {
    return this.http.put<MasterApiResponse>(`${this.baseUrl}/${config.path}/${id}`, payload, {
      headers: this.authHeaders()
    }).pipe(
      map(response => this.actionResult(response, config.itemKey, 'Record updated successfully')),
      catchError(error => this.handleError(error))
    );
  }

  setActive(config: MasterConfig, id: number, active: string): Observable<MasterActionResult> {
    return this.http.patch<MasterApiResponse>(`${this.baseUrl}/${config.path}/${id}/status`, { active }, {
      headers: this.authHeaders()
    }).pipe(
      map(response => this.actionResult(response, config.itemKey, 'Status changed successfully')),
      catchError(error => this.handleError(error))
    );
  }

  delete(config: MasterConfig, id: number): Observable<MasterActionResult> {
    return this.http.delete<MasterApiResponse>(`${this.baseUrl}/${config.path}/${id}`, {
      headers: this.authHeaders()
    }).pipe(
      map(response => ({ message: this.responseMessage(response) || 'Record deleted successfully' })),
      catchError(error => this.handleError(error))
    );
  }

  export(config: MasterConfig): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${config.path}/export`, {
      headers: this.authHeaders(),
      responseType: 'blob'
    }).pipe(catchError(error => this.handleError(error)));
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private readItems(response: MasterApiResponse, listKey: string): MasterItem[] {
    const rows = this.pickArray(response, [listKey, this.pascal(listKey), `data.${listKey}`, `result.${listKey}`, 'data', 'items', 'records']);
    return rows.map(row => this.normalizeItem(row)).filter(item => item.id > 0 || this.itemName(item));
  }

  private actionResult(response: MasterApiResponse, itemKey: string, fallbackMessage: string): MasterActionResult {
    const item = this.pickFirstValue(response, [itemKey, this.pascal(itemKey), `data.${itemKey}`, `result.${itemKey}`]);
    return {
      item: item ? this.normalizeItem(item) : undefined,
      message: this.responseMessage(response) || fallbackMessage
    };
  }

  private normalizeItem(value: unknown): MasterItem {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id'] ?? row['Id']),
      active: this.readString(row['active'] ?? row['Active']) || 'Y',
      branchName: this.readString(row['branchName'] ?? row['BranchName'] ?? row['branch_name']),
      branchCode: this.readNullableString(row['branchCode'] ?? row['BranchCode'] ?? row['branch_code']),
      divisionName: this.readString(row['divisionName'] ?? row['DivisionName'] ?? row['division_name']),
      designationName: this.readString(row['designationName'] ?? row['DesignationName'] ?? row['designation_name']),
      name: this.readString(row['name'] ?? row['Name']),
      createdBy: this.readNullableNumber(row['createdBy'] ?? row['CreatedBy'] ?? row['created_by']),
      createdByName: this.readNullableString(row['createdByName'] ?? row['CreatedByName'] ?? row['created_by_name']),
      createdAt: this.readNullableString(row['createdAt'] ?? row['CreatedAt'] ?? row['created_at'])
    };
  }

  private itemName(item: MasterItem): string {
    return item.branchName || item.divisionName || item.designationName || item.name || '';
  }

  private responseMessage(response: MasterApiResponse): string {
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
      return throwError(() => new Error(this.readMessage(error.error?.message) || error.message || 'Master API request failed.'));
    }
    if (error instanceof Error) return throwError(() => error);
    return throwError(() => new Error('Master API request failed.'));
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

  private pascal(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
