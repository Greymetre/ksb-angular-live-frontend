import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '../config/api.config';
import { UserOption } from './user.service';

export interface UserTarget {
  id: number;
  userId: number | null;
  branchId: number | null;
  employeeCode?: string | null;
  userName?: string | null;
  designationName?: string | null;
  branchName?: string | null;
  divisionId?: number | null;
  divisionName?: string | null;
  type: string;
  month: string;
  year: string;
  target: number;
  achievement: number;
  achievementPercent: string;
  quantityTarget?: number | null;
  quantityAchievement?: number | null;
  quantityAchievementPercent?: string | null;
}

export interface UserTargetFilters {
  branchId?: number | null;
  userId?: number | null;
  divisionId?: number | null;
  type?: string | null;
  month?: string | null;
  financialYear?: string | null;
  search?: string | null;
}

export interface UserTargetPayload {
  userId: number | null;
  type: string;
  month: string;
  year: string;
  target: number | null;
}

export interface UserTargetOptions {
  users: UserOption[];
  branches: UserOption[];
  divisions: UserOption[];
  years: number[];
}

export interface UserTargetActionResult {
  target?: UserTarget;
  message: string;
}

type ApiResponse = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class UserTargetService {
  private readonly baseUrl = API_BASE_URL;

  constructor(private http: HttpClient, private authService: AuthService) {}

  getTargets(filters: UserTargetFilters = {}): Observable<UserTarget[]> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/user-targets`, {
      headers: this.authHeaders(),
      params: this.filterParams(filters)
    }).pipe(
      map(response => this.readTargets(response)),
      catchError(error => this.handleError(error))
    );
  }

  getOptions(): Observable<UserTargetOptions> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/user-targets/options`, {
      headers: this.authHeaders()
    }).pipe(
      map(response => this.readOptions(response)),
      catchError(error => this.handleError(error))
    );
  }

  createTarget(payload: UserTargetPayload): Observable<UserTargetActionResult> {
    return this.http.post<ApiResponse>(`${this.baseUrl}/user-targets`, this.toApiPayload(payload), {
      headers: this.authHeaders()
    }).pipe(
      map(response => this.actionResult(response, 'User Target created successfully')),
      catchError(error => this.handleError(error))
    );
  }

  updateTarget(id: number, payload: UserTargetPayload): Observable<UserTargetActionResult> {
    return this.http.put<ApiResponse>(`${this.baseUrl}/user-targets/${id}`, this.toApiPayload(payload), {
      headers: this.authHeaders()
    }).pipe(
      map(response => this.actionResult(response, 'User Target updated successfully')),
      catchError(error => this.handleError(error))
    );
  }

  deleteTarget(id: number): Observable<UserTargetActionResult> {
    return this.http.delete<ApiResponse>(`${this.baseUrl}/user-targets/${id}`, {
      headers: this.authHeaders()
    }).pipe(
      map(response => ({ message: this.responseMessage(response) || 'User Target deleted successfully' })),
      catchError(error => this.handleError(error))
    );
  }

  exportTargets(filters: UserTargetFilters = {}): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/user-targets/export`, {
      headers: this.authHeaders(),
      params: this.filterParams(filters),
      responseType: 'blob'
    }).pipe(catchError(error => this.handleError(error)));
  }

  downloadTemplate(): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/user-targets/template`, {
      headers: this.authHeaders(),
      responseType: 'blob'
    }).pipe(catchError(error => this.handleError(error)));
  }

  uploadTargets(file: File): Observable<UserTargetActionResult> {
    const formData = new FormData();
    formData.append('import_file', file);
    return this.http.post<ApiResponse>(`${this.baseUrl}/user-targets/upload`, formData, {
      headers: this.authHeaders()
    }).pipe(
      map(response => ({ message: this.responseMessage(response) || 'User Target import completed' })),
      catchError(error => this.handleError(error))
    );
  }

  private filterParams(filters: UserTargetFilters): HttpParams {
    let params = new HttpParams();
    if (filters.branchId) params = params.set('branch_id', String(filters.branchId));
    if (filters.userId) params = params.set('user_id', String(filters.userId));
    if (filters.divisionId) params = params.set('division_id', String(filters.divisionId));
    if (filters.type) params = params.set('type', filters.type);
    if (filters.month) params = params.set('month', filters.month);
    if (filters.financialYear) params = params.set('financial_year', filters.financialYear);
    if (filters.search?.trim()) params = params.set('search', filters.search.trim());
    return params;
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private toApiPayload(payload: UserTargetPayload): Record<string, unknown> {
    return {
      user_id: payload.userId,
      type: payload.type,
      month: payload.month,
      year: payload.year,
      target: payload.target
    };
  }

  private readTargets(response: ApiResponse): UserTarget[] {
    const rows = this.pickArray(response, ['user_targets', 'userTargets', 'UserTargets', 'data.user_targets', 'data']);
    return rows.map(row => this.normalizeTarget(row)).filter(row => row.id > 0);
  }

  private readOptions(response: ApiResponse): UserTargetOptions {
    const source = this.asRecord(this.pickFirstValue(response, ['options', 'data.options', 'result.options']) ?? response);
    return {
      users: this.readOptionsArray(source, 'users', 'Users'),
      branches: this.readOptionsArray(source, 'branches', 'Branches'),
      divisions: this.readOptionsArray(source, 'divisions', 'Divisions'),
      years: this.asArray(source['years'] ?? source['Years']).map(value => this.readNumber(value)).filter(value => value > 0)
    };
  }

  private actionResult(response: ApiResponse, fallbackMessage: string): UserTargetActionResult {
    const target = this.pickFirstValue(response, ['user_target', 'userTarget', 'UserTarget', 'data.user_target']);
    return {
      target: target ? this.normalizeTarget(target) : undefined,
      message: this.responseMessage(response) || fallbackMessage
    };
  }

  private readOptionsArray(source: Record<string, unknown>, camelKey: string, pascalKey: string): UserOption[] {
    return this.asArray(source[camelKey] ?? source[pascalKey])
      .map(value => {
        const row = this.asRecord(value);
        return { id: this.readNumber(row['id'] ?? row['Id']), name: this.readString(row['name'] ?? row['Name']) };
      })
      .filter(option => option.id > 0 || option.name);
  }

  private normalizeTarget(value: unknown): UserTarget {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id'] ?? row['Id']),
      userId: this.readNullableNumber(row['userId'] ?? row['UserId'] ?? row['user_id']),
      branchId: this.readNullableNumber(row['branchId'] ?? row['BranchId'] ?? row['branch_id']),
      employeeCode: this.readNullableString(row['employeeCode'] ?? row['EmployeeCode'] ?? row['employee_code']),
      userName: this.readNullableString(row['userName'] ?? row['UserName'] ?? row['user_name']),
      designationName: this.readNullableString(row['designationName'] ?? row['DesignationName'] ?? row['designation_name']),
      branchName: this.readNullableString(row['branchName'] ?? row['BranchName'] ?? row['branch_name']),
      divisionId: this.readNullableNumber(row['divisionId'] ?? row['DivisionId'] ?? row['division_id']),
      divisionName: this.readNullableString(row['divisionName'] ?? row['DivisionName'] ?? row['division_name']),
      type: this.readString(row['type'] ?? row['Type']),
      month: this.readString(row['month'] ?? row['Month']),
      year: this.readString(row['year'] ?? row['Year']),
      target: this.readNumber(row['target'] ?? row['Target']),
      achievement: this.readNumber(row['achievement'] ?? row['Achievement']),
      achievementPercent: this.readString(row['achievementPercent'] ?? row['AchievementPercent'] ?? row['achievement_percent']),
      quantityTarget: this.readNullableNumber(row['quantityTarget'] ?? row['QuantityTarget'] ?? row['quantity_target']),
      quantityAchievement: this.readNullableNumber(row['quantityAchievement'] ?? row['QuantityAchievement'] ?? row['quantity_achievement']),
      quantityAchievementPercent: this.readNullableString(row['quantityAchievementPercent'] ?? row['QuantityAchievementPercent'] ?? row['quantity_achievement_percent'])
    };
  }

  private responseMessage(response: ApiResponse): string {
    return this.readMessage(response['message'] ?? response['Message']);
  }

  private pickArray(source: unknown, paths: string[]): unknown[] {
    for (const path of paths) {
      const value = this.pickValue(source, path.split('.'));
      const rows = this.asArray(value);
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

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  }

  private asArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    const row = this.asRecord(value);
    const values = row['$values'] ?? row['values'] ?? row['items'] ?? row['data'];
    return Array.isArray(values) ? values : [];
  }

  private readNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace('%', ''));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private readNullableNumber(value: unknown): number | null {
    const number = this.readNumber(value);
    return number > 0 ? number : null;
  }

  private readString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return '';
  }

  private readNullableString(value: unknown): string | null {
    const text = this.readString(value);
    return text || null;
  }

  private handleError(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse) {
      return throwError(() => new Error(this.readMessage(error.error?.message) || error.message || 'User Target API request failed.'));
    }
    return throwError(() => error instanceof Error ? error : new Error('User Target API request failed.'));
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
