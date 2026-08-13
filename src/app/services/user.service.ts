import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '../config/api.config';
import { asPagedArray, PagedArray } from '../shared/utils/paged-array';

export interface UserOption {
  id: number;
  name: string;
}

export interface UserRole {
  id: number;
  name: string;
}

export interface User {
  id: number;
  active: string;
  name: string;
  firstName: string;
  lastName: string;
  employeeCodes?: string | null;
  mobile?: string | null;
  email?: string | null;
  branchId?: string | null;
  branchNames?: string | null;
  designationId?: number | null;
  designationName?: string | null;
  divisionId?: number | null;
  divisionName?: string | null;
  departmentId?: number | null;
  departmentName?: string | null;
  reportingId?: number | null;
  reportingName?: string | null;
  location?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  payroll?: string | null;
  warehouseId?: number | null;
  salesType?: string | null;
  showAttandanceReport?: string | null;
  dateOfJoining?: string | null;
  passwordString?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  cityIds: number[];
  roles: UserRole[];
}

export interface UserOptions {
  roles: UserOption[];
  branches: UserOption[];
  designations: UserOption[];
  divisions: UserOption[];
  departments: UserOption[];
  reportings: UserOption[];
  cities: UserOption[];
}

export interface UserFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  userType?: string;
  active?: string;
  divisionId?: number | null;
  branchId?: string | null;
  departmentId?: number | null;
}

export interface UserPayload {
  active?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  employeeCodes?: string;
  mobile?: string;
  email?: string;
  password?: string;
  branchId?: string;
  branchIds?: number[];
  designationId?: number | null;
  divisionId?: number | null;
  departmentId?: number | null;
  reportingId?: number | null;
  location?: string;
  baseLocationCoordinates?: string;
  payroll?: string;
  warehouseId?: number | null;
  salesType?: string;
  showAttandanceReport?: string;
  dateOfJoining?: string | null;
  roles?: number[];
  cityIds?: number[];
}

export interface UserActionResult {
  user?: User;
  message: string;
}

type UserApiResponse = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly baseUrl = API_BASE_URL;

  constructor(private http: HttpClient, private authService: AuthService) {}

  getUsers(filters: UserFilters = {}): Observable<PagedArray<User>> {
    return this.http.get<UserApiResponse>(`${this.baseUrl}/users`, {
      headers: this.authHeaders(),
      params: this.filterParams(filters)
    }).pipe(
      map(response => asPagedArray(this.readUsers(response), response, filters.page, filters.pageSize)),
      catchError(error => this.handleError(error))
    );
  }

  getUser(userId: number): Observable<User> {
    return this.http.get<UserApiResponse>(`${this.baseUrl}/users/${userId}`, {
      headers: this.authHeaders()
    }).pipe(
      map(response => this.requireUser(response)),
      catchError(error => this.handleError(error))
    );
  }

  getOptions(): Observable<UserOptions> {
    return this.http.get<UserApiResponse>(`${this.baseUrl}/users/options`, {
      headers: this.authHeaders()
    }).pipe(
      map(response => this.readOptions(response)),
      catchError(error => this.handleError(error))
    );
  }

  createUser(payload: UserPayload): Observable<UserActionResult> {
    return this.http.post<UserApiResponse>(`${this.baseUrl}/users`, this.toApiPayload(payload), {
      headers: this.authHeaders()
    }).pipe(
      map(response => this.actionResult(response, 'User created successfully')),
      catchError(error => this.handleError(error))
    );
  }

  updateUser(userId: number, payload: UserPayload): Observable<UserActionResult> {
    return this.http.put<UserApiResponse>(`${this.baseUrl}/users/${userId}`, this.toApiPayload(payload), {
      headers: this.authHeaders()
    }).pipe(
      map(response => this.actionResult(response, 'User updated successfully')),
      catchError(error => this.handleError(error))
    );
  }

  setUserActive(userId: number, active: string): Observable<UserActionResult> {
    return this.http.patch<UserApiResponse>(`${this.baseUrl}/users/${userId}/status`, { active }, {
      headers: this.authHeaders()
    }).pipe(
      map(response => this.actionResult(response, 'User status updated successfully')),
      catchError(error => this.handleError(error))
    );
  }

  deleteUser(userId: number): Observable<UserActionResult> {
    return this.http.delete<UserApiResponse>(`${this.baseUrl}/users/${userId}`, {
      headers: this.authHeaders()
    }).pipe(
      map(response => ({ message: this.responseMessage(response) || 'User deleted successfully' })),
      catchError(error => this.handleError(error))
    );
  }

  downloadUsers(filters: UserFilters = {}): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/users/export`, {
      headers: this.authHeaders(),
      params: this.filterParams(filters),
      responseType: 'blob'
    }).pipe(catchError(error => this.handleError(error)));
  }

  downloadTemplate(): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/users/template`, {
      headers: this.authHeaders(),
      responseType: 'blob'
    }).pipe(catchError(error => this.handleError(error)));
  }

  uploadUsers(file: File): Observable<UserActionResult> {
    const formData = new FormData();
    formData.append('import_file', file);

    return this.http.post<UserApiResponse>(`${this.baseUrl}/users/upload`, formData, {
      headers: this.authHeaders()
    }).pipe(
      map(response => ({ message: this.responseMessage(response) || 'Users imported successfully' })),
      catchError(error => this.handleError(error))
    );
  }

  private filterParams(filters: UserFilters): HttpParams {
    let params = new HttpParams();

    if (filters.page) params = params.set('page', String(filters.page));
    if (filters.pageSize) params = params.set('page_size', String(filters.pageSize));

    if (filters.search?.trim()) params = params.set('search', filters.search.trim());
    if (filters.userType) params = params.set('user_type', filters.userType);
    if (filters.active) params = params.set('active', filters.active);
    if (filters.divisionId) params = params.set('division_id', String(filters.divisionId));
    if (filters.branchId) params = params.set('branch_id', filters.branchId);
    if (filters.departmentId) params = params.set('department_id', String(filters.departmentId));

    return params;
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private toApiPayload(payload: UserPayload): Record<string, unknown> {
    return {
      active: payload.active,
      name: payload.name,
      first_name: payload.firstName,
      last_name: payload.lastName,
      employee_codes: payload.employeeCodes,
      mobile: payload.mobile,
      email: payload.email,
      password: payload.password,
      branch_id: payload.branchId,
      branch_ids: payload.branchIds,
      designation_id: payload.designationId,
      division_id: payload.divisionId,
      department_id: payload.departmentId,
      reporting_id: payload.reportingId,
      location: payload.location,
      base_location_coordinates: payload.baseLocationCoordinates,
      payroll: payload.payroll,
      warehouse_id: payload.warehouseId,
      sales_type: payload.salesType,
      show_attandance_report: payload.showAttandanceReport,
      date_of_joining: payload.dateOfJoining,
      roles: payload.roles,
      city_ids: payload.cityIds
    };
  }

  private requireUser(response: UserApiResponse): User {
    const user = this.pickFirstValue(response, ['user', 'User', 'data.user', 'extra.user', 'result.user', 'data']);
    if (!user) {
      throw new Error('User API did not return a user.');
    }

    return this.normalizeUser(user);
  }

  private actionResult(response: UserApiResponse, fallbackMessage: string): UserActionResult {
    const user = this.pickFirstValue(response, ['user', 'User', 'data.user', 'extra.user', 'result.user']);
    return {
      user: user ? this.normalizeUser(user) : undefined,
      message: this.responseMessage(response) || fallbackMessage
    };
  }

  private responseMessage(response: UserApiResponse): string {
    return this.readMessage(response['message'] ?? response['Message']);
  }

  private readUsers(response: UserApiResponse): User[] {
    const rows = this.pickArray(response, ['users', 'Users', 'data.users', 'extra.users', 'result.users', 'data', 'items', 'records']);
    return rows.map(user => this.normalizeUser(user)).filter(user => user.id > 0 || user.name);
  }

  private readOptions(response: UserApiResponse): UserOptions {
    const options = this.asRecord(this.pickFirstValue(response, ['options', 'Options', 'data.options', 'extra.options', 'result.options']) ?? response);
    return {
      roles: this.readOptionsArray(options, 'roles', 'Roles'),
      branches: this.readOptionsArray(options, 'branches', 'Branches'),
      designations: this.readOptionsArray(options, 'designations', 'Designations'),
      divisions: this.readOptionsArray(options, 'divisions', 'Divisions'),
      departments: this.readOptionsArray(options, 'departments', 'Departments'),
      reportings: this.readOptionsArray(options, 'reportings', 'Reportings'),
      cities: this.readOptionsArray(options, 'cities', 'Cities')
    };
  }

  private readOptionsArray(source: Record<string, unknown>, camelKey: string, pascalKey: string): UserOption[] {
    return this.asArray(source[camelKey] ?? source[pascalKey])
      .map(value => this.normalizeOption(value))
      .filter(option => option.id > 0 || option.name);
  }

  private normalizeUser(value: unknown): User {
    const row = this.asRecord(value);
    const roles = this.asArray(row['roles'] ?? row['Roles']).map(role => this.normalizeRole(role));

    return {
      id: this.readNumber(row['id'] ?? row['Id']),
      active: this.readString(row['active'] ?? row['Active']) || 'Y',
      name: this.readString(row['name'] ?? row['Name']),
      firstName: this.readString(row['firstName'] ?? row['FirstName'] ?? row['first_name']),
      lastName: this.readString(row['lastName'] ?? row['LastName'] ?? row['last_name']),
      employeeCodes: this.readNullableString(row['employeeCodes'] ?? row['EmployeeCodes'] ?? row['employee_codes']),
      mobile: this.readNullableString(row['mobile'] ?? row['Mobile']),
      email: this.readNullableString(row['email'] ?? row['Email']),
      branchId: this.readNullableString(row['branchId'] ?? row['BranchId'] ?? row['branch_id']),
      branchNames: this.readNullableString(row['branchNames'] ?? row['BranchNames'] ?? row['branch_names']),
      designationId: this.readNullableNumber(row['designationId'] ?? row['DesignationId'] ?? row['designation_id']),
      designationName: this.readNullableString(row['designationName'] ?? row['DesignationName'] ?? row['designation_name']),
      divisionId: this.readNullableNumber(row['divisionId'] ?? row['DivisionId'] ?? row['division_id']),
      divisionName: this.readNullableString(row['divisionName'] ?? row['DivisionName'] ?? row['division_name']),
      departmentId: this.readNullableNumber(row['departmentId'] ?? row['DepartmentId'] ?? row['department_id']),
      departmentName: this.readNullableString(row['departmentName'] ?? row['DepartmentName'] ?? row['department_name']),
      reportingId: this.readNullableNumber(row['reportingId'] ?? row['ReportingId'] ?? row['reporting_id']),
      reportingName: this.readNullableString(row['reportingName'] ?? row['ReportingName'] ?? row['reporting_name']),
      location: this.readNullableString(row['location'] ?? row['Location']),
      latitude: this.readNullableString(row['latitude'] ?? row['Latitude']),
      longitude: this.readNullableString(row['longitude'] ?? row['Longitude']),
      payroll: this.readNullableString(row['payroll'] ?? row['Payroll']),
      warehouseId: this.readNullableNumber(row['warehouseId'] ?? row['WarehouseId'] ?? row['warehouse_id']),
      salesType: this.readNullableString(row['salesType'] ?? row['SalesType'] ?? row['sales_type']),
      showAttandanceReport: this.readNullableString(row['showAttandanceReport'] ?? row['ShowAttandanceReport'] ?? row['show_attandance_report']),
      dateOfJoining: this.readNullableString(row['dateOfJoining'] ?? row['DateOfJoining'] ?? row['date_of_joining']),
      passwordString: this.readNullableString(row['passwordString'] ?? row['PasswordString'] ?? row['password_string']),
      createdAt: this.readNullableString(row['createdAt'] ?? row['CreatedAt'] ?? row['created_at']),
      updatedAt: this.readNullableString(row['updatedAt'] ?? row['UpdatedAt'] ?? row['updated_at']),
      cityIds: this.asArray(row['cityIds'] ?? row['CityIds'] ?? row['city_ids'])
        .map(value => this.readNumber(value))
        .filter(value => value > 0),
      roles
    };
  }

  private normalizeRole(value: unknown): UserRole {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id'] ?? row['Id']),
      name: this.readString(row['name'] ?? row['Name'])
    };
  }

  private normalizeOption(value: unknown): UserOption {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id'] ?? row['Id']),
      name: this.readString(row['name'] ?? row['Name'])
    };
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
      return throwError(() => new Error(this.readMessage(error.error?.message) || error.message || 'User API request failed.'));
    }

    if (error instanceof Error) {
      return throwError(() => error);
    }

    return throwError(() => new Error('User API request failed.'));
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
