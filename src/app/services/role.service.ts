import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '../config/api.config';

export interface Permission {
  id: number;
  name: string;
  guard_name: string;
}

export interface Role {
  id: number;
  name: string;
  guard_name: string;
  created_at?: string | null;
  updated_at?: string | null;
  permissions: Permission[];
}

export interface RolePayload {
  name: string;
  guard_name: string;
  permissions?: number[];
}

export interface RoleActionResult {
  role?: Role;
  message: string;
}

type RoleApiResponse = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class RoleService {
  private readonly baseUrl = API_BASE_URL;

  constructor(private http: HttpClient, private authService: AuthService) {}

  getRoles(search = '', includePermissions = true): Observable<Role[]> {
    let params = new HttpParams().set('include_permissions', String(includePermissions));
    if (search.trim()) {
      params = params.set('search', search.trim());
    }

    return this.http.get<RoleApiResponse>(`${this.baseUrl}/roles`, {
      headers: this.authHeaders(),
      params
    }).pipe(
      map(response => this.readRoles(response)),
      catchError(error => this.handleError(error))
    );
  }

  getPermissions(search = ''): Observable<Permission[]> {
    let params = new HttpParams();
    if (search.trim()) {
      params = params.set('search', search.trim());
    }

    return this.http.get<RoleApiResponse>(`${this.baseUrl}/permissions`, {
      headers: this.authHeaders(),
      params
    }).pipe(
      map(response => this.readPermissions(response)),
      catchError(error => this.handleError(error))
    );
  }

  createRole(payload: RolePayload): Observable<RoleActionResult> {
    return this.http.post<RoleApiResponse>(`${this.baseUrl}/roles`, payload, {
      headers: this.authHeaders()
    }).pipe(
      map(response => this.actionResult(response, 'Role created successfully')),
      catchError(error => this.handleError(error))
    );
  }

  updateRole(roleId: number, payload: RolePayload): Observable<RoleActionResult> {
    return this.http.put<RoleApiResponse>(`${this.baseUrl}/roles/${roleId}`, payload, {
      headers: this.authHeaders()
    }).pipe(
      map(response => this.actionResult(response, 'Role updated successfully')),
      catchError(error => this.handleError(error))
    );
  }

  deleteRole(roleId: number): Observable<RoleActionResult> {
    return this.http.delete<RoleApiResponse>(`${this.baseUrl}/roles/${roleId}`, {
      headers: this.authHeaders()
    }).pipe(
      map(response => ({ message: this.responseMessage(response) || 'Role deleted successfully' })),
      catchError(error => this.handleError(error))
    );
  }

  saveRolePermissions(permissions: Record<string, number[]>): Observable<void> {
    return this.http.post<RoleApiResponse>(`${this.baseUrl}/roles/save-permissions`, { permissions }, {
      headers: this.authHeaders()
    }).pipe(
      map(() => undefined),
      catchError(error => this.handleError(error))
    );
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private requireRole(response: RoleApiResponse): Role {
    const role = this.pickFirstValue(response, ['role', 'data.role', 'extra.role', 'result.role']);
    if (!role) {
      throw new Error('Role API did not return a role.');
    }

    return this.normalizeRole(role);
  }

  private actionResult(response: RoleApiResponse, fallbackMessage: string): RoleActionResult {
    const role = this.pickFirstValue(response, ['role', 'data.role', 'extra.role', 'result.role']);
    return {
      role: role ? this.normalizeRole(role) : undefined,
      message: this.responseMessage(response) || fallbackMessage
    };
  }

  private responseMessage(response: RoleApiResponse): string {
    return this.readMessage(response['message']);
  }

  private readRoles(response: RoleApiResponse): Role[] {
    const rows = this.pickArray(response, ['roles', 'Roles', 'data.roles', 'extra.roles', 'result.roles', 'data', 'items', 'records']);
    return rows.map(role => this.normalizeRole(role)).filter(role => role.id > 0 || role.name);
  }

  private readPermissions(response: RoleApiResponse): Permission[] {
    const rows = this.pickArray(response, ['permissions', 'Permissions', 'data.permissions', 'extra.permissions', 'result.permissions', 'data', 'items', 'records']);
    return rows.map(permission => this.normalizePermission(permission)).filter(permission => permission.id > 0 || permission.name);
  }

  private normalizeRole(value: unknown): Role {
    const row = this.asRecord(value);
    const permissions = this.asArray(row['permissions'] ?? row['Permissions']).map(permission => this.normalizePermission(permission));

    return {
      id: this.readNumber(row['id'] ?? row['Id']),
      name: this.readString(row['name'] ?? row['Name']),
      guard_name: this.readString(row['guard_name'] ?? row['guardName'] ?? row['GuardName']) || 'users',
      created_at: this.readNullableString(row['created_at'] ?? row['createdAt'] ?? row['CreatedAt']),
      updated_at: this.readNullableString(row['updated_at'] ?? row['updatedAt'] ?? row['UpdatedAt']),
      permissions
    };
  }

  private normalizePermission(value: unknown): Permission {
    const row = this.asRecord(value);

    return {
      id: this.readNumber(row['id'] ?? row['Id']),
      name: this.readString(row['name'] ?? row['Name']),
      guard_name: this.readString(row['guard_name'] ?? row['guardName'] ?? row['GuardName']) || 'users'
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

  private pickValue(source: unknown, path: string | string[]): unknown {
    const parts = Array.isArray(path) ? path : path.split('.');
    let current: unknown = source;

    for (const part of parts) {
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

  private readString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private readNullableString(value: unknown): string | null {
    return typeof value === 'string' && value ? value : null;
  }

  private handleError(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse) {
      return throwError(() => new Error(this.readMessage(error.error?.message) || error.message || 'Role API request failed.'));
    }

    if (error instanceof Error) {
      return throwError(() => error);
    }

    return throwError(() => new Error('Role API request failed.'));
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
