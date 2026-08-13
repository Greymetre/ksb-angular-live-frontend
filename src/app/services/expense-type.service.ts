import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '../config/api.config';
import { UserOption } from './user.service';

export interface ExpenseType {
  id: number;
  name: string;
  rate: number;
  isActive: number;
  active: string;
  allowanceTypeId: number;
  allowanceTypeName: string;
  payrollId: number | null;
  payrollName: string;
  createdAt?: string | null;
}

export interface ExpenseTypePayload {
  name: string;
  rate: number | null;
  allowanceTypeId: number | null;
  payrollId: number | null;
  active: string;
}

export interface ExpenseTypeOptions {
  allowanceTypes: UserOption[];
  payrolls: UserOption[];
}

export interface ExpenseTypeActionResult {
  item?: ExpenseType;
  message: string;
}

type ApiResponse = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class ExpenseTypeService {
  private readonly baseUrl = `${API_BASE_URL}/expenses-types`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  list(search = ''): Observable<ExpenseType[]> {
    let params = new HttpParams();
    if (search.trim()) params = params.set('search', search.trim());
    return this.http.get<ApiResponse>(this.baseUrl, { headers: this.authHeaders(), params }).pipe(
      map(response => this.pickArray(response, ['expenses_types', 'expensesTypes', 'data.expenses_types', 'data']).map(row => this.normalize(row))),
      catchError(error => this.handleError(error))
    );
  }

  options(): Observable<ExpenseTypeOptions> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/options`, { headers: this.authHeaders() }).pipe(
      map(response => {
        const source = this.asRecord(this.pickFirstValue(response, ['options', 'data.options']) ?? response);
        return {
          allowanceTypes: this.optionsArray(source, 'allowanceTypes', 'allowance_types'),
          payrolls: this.optionsArray(source, 'payrolls', 'payrolls')
        };
      }),
      catchError(error => this.handleError(error))
    );
  }

  create(payload: ExpenseTypePayload): Observable<ExpenseTypeActionResult> {
    return this.http.post<ApiResponse>(this.baseUrl, this.toApiPayload(payload), { headers: this.authHeaders() }).pipe(
      map(response => this.actionResult(response, 'Data Store Successfully')),
      catchError(error => this.handleError(error))
    );
  }

  update(id: number, payload: ExpenseTypePayload): Observable<ExpenseTypeActionResult> {
    return this.http.put<ApiResponse>(`${this.baseUrl}/${id}`, this.toApiPayload(payload), { headers: this.authHeaders() }).pipe(
      map(response => this.actionResult(response, 'Data Updated Successfully')),
      catchError(error => this.handleError(error))
    );
  }

  setActive(id: number, active: string): Observable<ExpenseTypeActionResult> {
    return this.http.patch<ApiResponse>(`${this.baseUrl}/${id}/status`, { active }, { headers: this.authHeaders() }).pipe(
      map(response => this.actionResult(response, 'Status changed successfully')),
      catchError(error => this.handleError(error))
    );
  }

  delete(id: number): Observable<ExpenseTypeActionResult> {
    return this.http.delete<ApiResponse>(`${this.baseUrl}/${id}`, { headers: this.authHeaders() }).pipe(
      map(response => ({ message: this.responseMessage(response) || 'Expense Type deleted successfully' })),
      catchError(error => this.handleError(error))
    );
  }

  private toApiPayload(payload: ExpenseTypePayload): Record<string, unknown> {
    return {
      name: payload.name,
      rate: payload.rate,
      allowance_type_id: payload.allowanceTypeId,
      payroll_id: payload.payrollId,
      active: payload.active
    };
  }

  private actionResult(response: ApiResponse, fallback: string): ExpenseTypeActionResult {
    const item = this.pickFirstValue(response, ['expenses_type', 'expensesType', 'data.expenses_type']);
    return {
      item: item ? this.normalize(item) : undefined,
      message: this.responseMessage(response) || fallback
    };
  }

  private normalize(value: unknown): ExpenseType {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id'] ?? row['Id']),
      name: this.readString(row['name'] ?? row['Name']),
      rate: this.readNumber(row['rate'] ?? row['Rate']),
      isActive: this.readNumber(row['isActive'] ?? row['IsActive'] ?? row['is_active']),
      active: this.readString(row['active'] ?? row['Active']) || (this.readNumber(row['is_active']) === 1 ? 'Y' : 'N'),
      allowanceTypeId: this.readNumber(row['allowanceTypeId'] ?? row['AllowanceTypeId'] ?? row['allowance_type_id']),
      allowanceTypeName: this.readString(row['allowanceTypeName'] ?? row['AllowanceTypeName'] ?? row['allowance_type_name']),
      payrollId: this.readNullableNumber(row['payrollId'] ?? row['PayrollId'] ?? row['payroll_id']),
      payrollName: this.readString(row['payrollName'] ?? row['PayrollName'] ?? row['payroll_name']),
      createdAt: this.readNullableString(row['createdAt'] ?? row['CreatedAt'] ?? row['created_at'])
    };
  }

  private optionsArray(source: Record<string, unknown>, camelKey: string, snakeKey: string): UserOption[] {
    return this.asArray(source[camelKey] ?? source[snakeKey])
      .map(value => {
        const row = this.asRecord(value);
        return { id: this.readNumber(row['id'] ?? row['Id']), name: this.readString(row['name'] ?? row['Name']) };
      })
      .filter(option => option.id > 0);
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private responseMessage(response: ApiResponse): string {
    return this.readMessage(response['message'] ?? response['Message']);
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
      return throwError(() => new Error(this.readMessage(error.error?.message) || error.message || 'Expense Type API request failed.'));
    }
    return throwError(() => error instanceof Error ? error : new Error('Expense Type API request failed.'));
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
