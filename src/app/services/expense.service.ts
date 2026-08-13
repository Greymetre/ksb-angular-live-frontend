import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '../config/api.config';
import { UserOption } from './user.service';
import { ExpenseType } from './expense-type.service';

export interface Expense {
  id: number;
  expensesType: number | null;
  expenseTypeName?: string | null;
  userId: number | null;
  userName?: string | null;
  employeeCode?: string | null;
  designationName?: string | null;
  branchId?: number | null;
  branchName?: string | null;
  divisionId?: number | null;
  divisionName?: string | null;
  payroll?: string | null;
  date: string;
  claimAmount: number;
  approveAmount?: number | null;
  startKm?: string | null;
  stopKm?: string | null;
  totalKm?: string | null;
  note?: string | null;
  checkerStatus: number;
  checkerStatusName: string;
  reason?: string | null;
  createdAt?: string | null;
  attachments: ExpenseAttachment[];
}

export interface ExpenseAttachment {
  id: number;
  fileName: string;
  mimeType?: string | null;
  size: number;
  url: string;
}

export interface ExpensePayload {
  expensesType: number | null;
  userId: number | null;
  date: string;
  claimAmount: number | null;
  approveAmount?: number | null;
  startKm?: string | null;
  stopKm?: string | null;
  totalKm?: string | null;
  note?: string | null;
  reason?: string | null;
  attachments?: File[];
}

export interface ExpenseFilters {
  executiveId?: number | null;
  expensesType?: number | null;
  branchId?: number | null;
  divisionId?: number | null;
  payroll?: string | null;
  status?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  expenseId?: number | null;
  search?: string | null;
}

export interface ExpenseOptions {
  users: UserOption[];
  expenseTypes: ExpenseType[];
  branches: UserOption[];
  divisions: UserOption[];
  payrolls: UserOption[];
  statuses: UserOption[];
}

export interface ExpenseActionResult {
  expense?: Expense;
  message: string;
}

type ApiResponse = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private readonly baseUrl = `${API_BASE_URL}/expenses`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  list(filters: ExpenseFilters = {}): Observable<Expense[]> {
    return this.http.get<ApiResponse>(this.baseUrl, { headers: this.authHeaders(), params: this.filterParams(filters) }).pipe(
      map(response => this.pickArray(response, ['expenses', 'Expenses', 'data.expenses', 'data']).map(row => this.normalize(row))),
      catchError(error => this.handleError(error))
    );
  }

  options(): Observable<ExpenseOptions> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/options`, { headers: this.authHeaders() }).pipe(
      map(response => {
        const source = this.asRecord(this.pickFirstValue(response, ['options', 'data.options']) ?? response);
        return {
          users: this.optionArray(source, 'users'),
          expenseTypes: this.asArray(source['expenseTypes'] ?? source['expense_types']).map(row => this.normalizeExpenseType(row)),
          branches: this.optionArray(source, 'branches'),
          divisions: this.optionArray(source, 'divisions'),
          payrolls: this.optionArray(source, 'payrolls'),
          statuses: this.optionArray(source, 'statuses')
        };
      }),
      catchError(error => this.handleError(error))
    );
  }

  create(payload: ExpensePayload): Observable<ExpenseActionResult> {
    return this.http.post<ApiResponse>(this.baseUrl, this.toFormData(payload), { headers: this.authHeaders() }).pipe(
      map(response => this.actionResult(response, 'expense added successfully')),
      catchError(error => this.handleError(error))
    );
  }

  update(id: number, payload: ExpensePayload): Observable<ExpenseActionResult> {
    return this.http.put<ApiResponse>(`${this.baseUrl}/${id}`, this.toFormData(payload), { headers: this.authHeaders() }).pipe(
      map(response => this.actionResult(response, 'expense updated successfully')),
      catchError(error => this.handleError(error))
    );
  }

  status(id: number, status: number, approveAmount?: number | null, reason?: string | null): Observable<ExpenseActionResult> {
    return this.http.patch<ApiResponse>(`${this.baseUrl}/${id}/status`, { status, approve_amount: approveAmount, reason }, { headers: this.authHeaders() }).pipe(
      map(response => this.actionResult(response, 'Status changed successfully')),
      catchError(error => this.handleError(error))
    );
  }

  delete(id: number): Observable<ExpenseActionResult> {
    return this.http.delete<ApiResponse>(`${this.baseUrl}/${id}`, { headers: this.authHeaders() }).pipe(
      map(response => ({ message: this.responseMessage(response) || 'Expense deleted successfully!' })),
      catchError(error => this.handleError(error))
    );
  }

  private filterParams(filters: ExpenseFilters): HttpParams {
    let params = new HttpParams();
    if (filters.executiveId) params = params.set('executive_id', String(filters.executiveId));
    if (filters.expensesType) params = params.set('expenses_type', String(filters.expensesType));
    if (filters.branchId) params = params.set('branch_id', String(filters.branchId));
    if (filters.divisionId) params = params.set('division_id', String(filters.divisionId));
    if (filters.payroll) params = params.set('payroll', filters.payroll);
    if (filters.status !== null && filters.status !== undefined) params = params.set('status', String(filters.status));
    if (filters.startDate) params = params.set('start_date', filters.startDate);
    if (filters.endDate) params = params.set('end_date', filters.endDate);
    if (filters.expenseId) params = params.set('expense_id', String(filters.expenseId));
    if (filters.search?.trim()) params = params.set('search', filters.search.trim());
    return params;
  }

  private toFormData(payload: ExpensePayload): FormData {
    const data = new FormData();
    this.append(data, 'expenses_type', payload.expensesType);
    this.append(data, 'user_id', payload.userId);
    this.append(data, 'date', payload.date);
    this.append(data, 'claim_amount', payload.claimAmount);
    this.append(data, 'approve_amount', payload.approveAmount);
    this.append(data, 'start_km', payload.startKm);
    this.append(data, 'stop_km', payload.stopKm);
    this.append(data, 'total_km', payload.totalKm);
    this.append(data, 'note', payload.note);
    this.append(data, 'reason', payload.reason);
    (payload.attachments ?? []).forEach(file => data.append('expense_file', file, file.name));
    return data;
  }

  private append(data: FormData, key: string, value: string | number | null | undefined): void {
    if (value === null || value === undefined || value === '') return;
    data.append(key, String(value));
  }

  private actionResult(response: ApiResponse, fallback: string): ExpenseActionResult {
    const expense = this.pickFirstValue(response, ['expense', 'Expense', 'data.expense']);
    return { expense: expense ? this.normalize(expense) : undefined, message: this.responseMessage(response) || fallback };
  }

  private normalize(value: unknown): Expense {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id'] ?? row['Id']),
      expensesType: this.readNullableNumber(row['expensesType'] ?? row['ExpensesType'] ?? row['expenses_type']),
      expenseTypeName: this.readNullableString(row['expenseTypeName'] ?? row['ExpenseTypeName'] ?? row['expense_type_name']),
      userId: this.readNullableNumber(row['userId'] ?? row['UserId'] ?? row['user_id']),
      userName: this.readNullableString(row['userName'] ?? row['UserName'] ?? row['user_name']),
      employeeCode: this.readNullableString(row['employeeCode'] ?? row['EmployeeCode'] ?? row['employee_code']),
      designationName: this.readNullableString(row['designationName'] ?? row['DesignationName'] ?? row['designation_name']),
      branchId: this.readNullableNumber(row['branchId'] ?? row['BranchId'] ?? row['branch_id']),
      branchName: this.readNullableString(row['branchName'] ?? row['BranchName'] ?? row['branch_name']),
      divisionId: this.readNullableNumber(row['divisionId'] ?? row['DivisionId'] ?? row['division_id']),
      divisionName: this.readNullableString(row['divisionName'] ?? row['DivisionName'] ?? row['division_name']),
      payroll: this.readNullableString(row['payroll'] ?? row['Payroll']),
      date: this.readString(row['date'] ?? row['Date']),
      claimAmount: this.readNumber(row['claimAmount'] ?? row['ClaimAmount'] ?? row['claim_amount']),
      approveAmount: this.readNullableNumber(row['approveAmount'] ?? row['ApproveAmount'] ?? row['approve_amount']),
      startKm: this.readNullableString(row['startKm'] ?? row['StartKm'] ?? row['start_km']),
      stopKm: this.readNullableString(row['stopKm'] ?? row['StopKm'] ?? row['stop_km']),
      totalKm: this.readNullableString(row['totalKm'] ?? row['TotalKm'] ?? row['total_km']),
      note: this.readNullableString(row['note'] ?? row['Note']),
      checkerStatus: this.readNumber(row['checkerStatus'] ?? row['CheckerStatus'] ?? row['checker_status']),
      checkerStatusName: this.readString(row['checkerStatusName'] ?? row['CheckerStatusName'] ?? row['checker_status_name']),
      reason: this.readNullableString(row['reason'] ?? row['Reason']),
      createdAt: this.readNullableString(row['createdAt'] ?? row['CreatedAt'] ?? row['created_at']),
      attachments: this.asArray(row['attachments'] ?? row['Attachments']).map(attachment => this.normalizeAttachment(attachment))
    };
  }

  private normalizeAttachment(value: unknown): ExpenseAttachment {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id'] ?? row['Id']),
      fileName: this.readString(row['fileName'] ?? row['FileName'] ?? row['file_name']),
      mimeType: this.readNullableString(row['mimeType'] ?? row['MimeType'] ?? row['mime_type']),
      size: this.readNumber(row['size'] ?? row['Size']),
      url: this.readString(row['url'] ?? row['Url'])
    };
  }

  private normalizeExpenseType(value: unknown): ExpenseType {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id'] ?? row['Id']),
      name: this.readString(row['name'] ?? row['Name']),
      rate: this.readNumber(row['rate'] ?? row['Rate']),
      isActive: this.readNumber(row['isActive'] ?? row['IsActive']),
      active: this.readString(row['active'] ?? row['Active']) || 'Y',
      allowanceTypeId: this.readNumber(row['allowanceTypeId'] ?? row['AllowanceTypeId'] ?? row['allowance_type_id']),
      allowanceTypeName: this.readString(row['allowanceTypeName'] ?? row['AllowanceTypeName'] ?? row['allowance_type_name']),
      payrollId: this.readNullableNumber(row['payrollId'] ?? row['PayrollId'] ?? row['payroll_id']),
      payrollName: this.readString(row['payrollName'] ?? row['PayrollName'] ?? row['payroll_name'])
    };
  }

  private optionArray(source: Record<string, unknown>, key: string): UserOption[] {
    return this.asArray(source[key])
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

  private responseMessage(response: ApiResponse): string {
    return this.readMessage(response['message'] ?? response['Message']);
  }

  private handleError(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse) {
      return throwError(() => new Error(this.readMessage(error.error?.message) || error.message || 'Expense API request failed.'));
    }
    return throwError(() => error instanceof Error ? error : new Error('Expense API request failed.'));
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
