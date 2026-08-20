import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '../config/api.config';

export interface NewInvoiceItem {
  id: number;
  secondaryCustomerId: number;
  retailerCode: string;
  customerName: string;
  shopName: string;
  mobileNumber: string;
  cityName?: string | null;
  address?: string | null;
  zoneName?: string | null;
  branchName?: string | null;
  assignedDistributorName?: string | null;
  assignedEmployeeName?: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  points: number;
  schemeId?: number | null;
  schemeName?: string | null;
  schemeCode?: string | null;
  schemeTag?: string | null;
  schemeBasedOn?: string | null;
  schemeRewardValue?: number | null;
  schemePoints: number;
  expectedSchemePoints: number;
  tierName?: string | null;
  schemeHintMessage?: string | null;
  attachment?: string | null;
  approvalStatus: number;
  approvalStatusLabel: string;
  approvalRemark?: string | null;
  ssApprovedAmount?: number | null;
  ssApprovalRemark?: string | null;
  salesApprovedAmount?: number | null;
  salesApprovalRemark?: string | null;
  hoApprovedAmount?: number | null;
  hoApprovalRemark?: string | null;
  createdBy: number;
  createdByName?: string | null;
  createdAt?: string | null;
  approvalLogs: NewInvoiceApprovalLog[];
}

export interface NewInvoiceApprovalLog {
  id: number;
  logDate?: string | null;
  createdBy?: number | null;
  createdByName?: string | null;
  employeeCode?: string | null;
  statusType: string;
  fromStatus?: number | null;
  toStatus?: number | null;
  approvedAmount?: number | null;
  remark?: string | null;
  createdAt?: string | null;
}

export interface NewInvoicePayload {
  secondary_customer_id: number;
  scheme_id: number;
  invoice_number: string;
  invoice_date: string;
  amount: number;
  points: number;
  attachment?: string | null;
}

export interface InvoiceSchemeOption {
  id: number;
  name: string;
  code: string;
  startDate: string;
  endDate: string;
}

export interface NewInvoiceFilter {
  scheme_id?: number | null;
  retailer_search?: string;
  invoice_number?: string;
  approval_status?: number | 'in_process' | null;
  zone_id?: number | null;
  branch_id?: number | null;
  from_date?: string;
  to_date?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface NewInvoiceSummary {
  totalInvoices: number;
  totalRetailers: number;
  approvedSs: number;
  approvedSales: number;
  approvedHo: number;
  pending: number;
  rejected: number;
  totalPoints: number;
  totalAmount: number;
  ssApprovalAmount: number;
  salesApprovalAmount: number;
  hoApprovalAmount: number;
  totalDealerNos: number;
  totalRewardEarned: number;
  totalExpectedReward: number;
}

/** Counts per approval stage across the filters, ignoring the selected stage. */
export interface NewInvoiceStageCounts {
  pending: number;
  approvedSs: number;
  approvedSales: number;
  approvedHo: number;
  rejected: number;
}

export interface RetailerOption {
  id: number;
  ownerName: string;
  shopName: string;
  mobileNumber: string;
  cityName?: string | null;
  address?: string | null;
}

export interface NewInvoiceListResult {
  invoices: NewInvoiceItem[];
  summary: NewInvoiceSummary;
  stageCounts: NewInvoiceStageCounts;
  total: number;
  page: number;
  pageSize: number;
}

type ApiResponse = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class NewInvoiceService {
  private readonly baseUrl = `${API_BASE_URL}/new-invoices`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  list(filter: NewInvoiceFilter): Observable<NewInvoiceListResult> {
    return this.http.get<ApiResponse>(this.baseUrl, {
      headers: this.authHeaders(),
      params: this.filterParams(filter)
    }).pipe(
      map(response => {
        const data = this.asRecord(this.pickFirstValue(response, ['new_invoices', 'data.new_invoices', 'data']) ?? response);
        const summary = this.normalizeSummary(data['summary']);
        const stageCounts = data['stage_counts'] ?? data['stageCounts'];
        return {
          invoices: this.pickArray(data, ['invoices', 'new_invoices', 'data']).map(row => this.normalizeInvoice(row)),
          summary,
          // An API that predates stage_counts still carries the same counts inside
          // the summary, so the tiles keep working until that server is updated.
          stageCounts: stageCounts ? this.normalizeStageCounts(stageCounts) : this.stageCountsFromSummary(summary),
          total: this.readNumber(data['total']),
          page: this.readNumber(data['page']) || Number(filter.page) || 1,
          pageSize: this.readNumber(data['page_size'] ?? data['pageSize']) || Number(filter.page_size) || 10
        };
      }),
      catchError(error => this.handleError(error))
    );
  }

  retailers(search = ''): Observable<RetailerOption[]> {
    const params = search ? new HttpParams().set('search', search) : new HttpParams();
    return this.http.get<ApiResponse>(`${this.baseUrl}/retailers`, { headers: this.authHeaders(), params }).pipe(
      map(response => this.pickArray(response, ['retailers', 'data.retailers', 'data']).map(row => this.normalizeRetailer(row))),
      catchError(error => this.handleError(error))
    );
  }

  schemes(customerId: number, invoiceDate: string): Observable<InvoiceSchemeOption[]> {
    const params = new HttpParams().set('customer_id', customerId).set('invoice_date', invoiceDate);
    return this.http.get<ApiResponse>(`${this.baseUrl}/schemes`, { headers: this.authHeaders(), params }).pipe(
      map(response => this.pickArray(response, ['schemes', 'data.schemes', 'data']).map(value => {
        const row = this.asRecord(value);
        return {
          id: this.readNumber(row['id']),
          name: this.readString(row['name']),
          code: this.readString(row['code']),
          startDate: this.readString(row['start_date'] ?? row['startDate']),
          endDate: this.readString(row['end_date'] ?? row['endDate'])
        };
      })),
      catchError(error => this.handleError(error))
    );
  }

  filterSchemes(): Observable<InvoiceSchemeOption[]> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/filter-schemes`, { headers: this.authHeaders() }).pipe(
      map(response => this.pickArray(response, ['schemes', 'data.schemes', 'data']).map(value => {
        const row = this.asRecord(value);
        return {
          id: this.readNumber(row['id']),
          name: this.readString(row['name']),
          code: this.readString(row['code']),
          startDate: this.readString(row['start_date'] ?? row['startDate']),
          endDate: this.readString(row['end_date'] ?? row['endDate'])
        };
      })),
      catchError(error => this.handleError(error))
    );
  }

  get(id: number): Observable<NewInvoiceItem> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/${id}`, { headers: this.authHeaders() }).pipe(
      map(response => this.normalizeInvoice(this.pickFirstValue(response, ['new_invoice', 'data.new_invoice', 'data']) ?? response)),
      catchError(error => this.handleError(error))
    );
  }

  create(payload: NewInvoicePayload, file?: File | null): Observable<string> {
    return this.http.post<ApiResponse>(this.baseUrl, this.toFormData(payload, file), { headers: this.authHeaders() }).pipe(
      map(response => this.responseMessage(response) || 'Invoice created successfully'),
      catchError(error => this.handleError(error))
    );
  }

  update(id: number, payload: NewInvoicePayload, file?: File | null): Observable<string> {
    return this.http.put<ApiResponse>(`${this.baseUrl}/${id}`, this.toFormData(payload, file), { headers: this.authHeaders() }).pipe(
      map(response => this.responseMessage(response) || 'Invoice updated successfully'),
      catchError(error => this.handleError(error))
    );
  }

  delete(id: number): Observable<string> {
    return this.http.delete<ApiResponse>(`${this.baseUrl}/${id}`, { headers: this.authHeaders() }).pipe(
      map(response => this.responseMessage(response) || 'Invoice deleted successfully'),
      catchError(error => this.handleError(error))
    );
  }

  export(filter: NewInvoiceFilter): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/export`, {
      headers: this.authHeaders(),
      params: this.filterParams(filter),
      responseType: 'blob'
    }).pipe(catchError(error => this.handleError(error)));
  }

  approve(id: number, level: 'ss' | 'sales' | 'ho', remark = '', approvedAmount?: number | null): Observable<string> {
    return this.http.post<ApiResponse>(`${this.baseUrl}/${id}/approve/${level}`, { remark, approved_amount: approvedAmount }, { headers: this.authHeaders() }).pipe(
      map(response => this.responseMessage(response) || 'Invoice approved successfully'),
      catchError(error => this.handleError(error))
    );
  }

  reject(id: number, remark: string): Observable<string> {
    return this.http.post<ApiResponse>(`${this.baseUrl}/${id}/reject`, { remark }, { headers: this.authHeaders() }).pipe(
      map(response => this.responseMessage(response) || 'Invoice rejected successfully'),
      catchError(error => this.handleError(error))
    );
  }

  private filterParams(filter: NewInvoiceFilter): HttpParams {
    let params = new HttpParams();
    Object.entries(filter).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') return;
      // The customer view collapses the two internal stages into one choice, which
      // the API takes as a repeated approval_statuses parameter.
      if (key === 'approval_status' && value === 'in_process') {
        params = params.append('approval_statuses', '1').append('approval_statuses', '2');
        return;
      }
      params = params.set(key, String(value));
    });
    return params;
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private toFormData(payload: NewInvoicePayload, file?: File | null): FormData {
    const form = new FormData();
    this.append(form, 'secondary_customer_id', payload.secondary_customer_id);
    this.append(form, 'scheme_id', payload.scheme_id);
    this.append(form, 'invoice_number', payload.invoice_number);
    this.append(form, 'invoice_date', payload.invoice_date);
    this.append(form, 'amount', payload.amount);
    this.append(form, 'points', payload.points);
    this.append(form, 'attachment', payload.attachment);
    if (file) form.append('attachment_file', file);
    return form;
  }

  private append(form: FormData, key: string, value: unknown): void {
    if (value !== undefined && value !== null && value !== '') form.append(key, String(value));
  }

  private normalizeInvoice(value: unknown): NewInvoiceItem {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id']),
      secondaryCustomerId: this.readNumber(row['secondary_customer_id'] ?? row['secondaryCustomerId']),
      retailerCode: this.readString(row['retailer_code'] ?? row['retailerCode']),
      customerName: this.readString(row['customer_name'] ?? row['customerName']),
      shopName: this.readString(row['shop_name'] ?? row['shopName']),
      mobileNumber: this.readString(row['mobile_number'] ?? row['mobileNumber']),
      cityName: this.readNullableString(row['city_name'] ?? row['cityName']),
      zoneName: this.readNullableString(row['zone_name'] ?? row['zoneName']),
      branchName: this.readNullableString(row['branch_name'] ?? row['branchName']),
      assignedDistributorName: this.readNullableString(row['assigned_distributor_name'] ?? row['assignedDistributorName']),
      assignedEmployeeName: this.readNullableString(row['assigned_employee_name'] ?? row['assignedEmployeeName']),
      invoiceNumber: this.readString(row['invoice_number'] ?? row['invoiceNumber']),
      invoiceDate: this.readString(row['invoice_date'] ?? row['invoiceDate']),
      amount: this.readNumber(row['amount']),
      points: this.readNumber(row['points']),
      schemeId: this.readNumber(row['scheme_id'] ?? row['schemeId']) || null,
      schemeName: this.readNullableString(row['scheme_name'] ?? row['schemeName']),
      schemeCode: this.readNullableString(row['scheme_code'] ?? row['schemeCode']),
      schemeTag: this.readNullableString(row['scheme_tag'] ?? row['schemeTag']),
      schemeBasedOn: this.readNullableString(row['scheme_based_on'] ?? row['schemeBasedOn']),
      schemeRewardValue: this.nullableNumber(row['scheme_reward_value'] ?? row['schemeRewardValue']),
      schemePoints: this.readNumber(row['scheme_points'] ?? row['schemePoints']),
      expectedSchemePoints: this.readNumber(row['expected_scheme_points'] ?? row['expectedSchemePoints']),
      tierName: this.readNullableString(row['tier_name'] ?? row['tierName']),
      schemeHintMessage: this.readNullableString(row['scheme_hint_message'] ?? row['schemeHintMessage']),
      attachment: this.readNullableString(row['attachment']),
      approvalStatus: this.readNumber(row['approval_status'] ?? row['approvalStatus']),
      approvalStatusLabel: this.readString(row['approval_status_label'] ?? row['approvalStatusLabel']) || 'Pending',
      approvalRemark: this.readNullableString(row['approval_remark'] ?? row['approvalRemark']),
      ssApprovedAmount: this.nullableNumber(row['ss_approved_amount'] ?? row['ssApprovedAmount']),
      ssApprovalRemark: this.readNullableString(row['ss_approval_remark'] ?? row['ssApprovalRemark']),
      salesApprovedAmount: this.nullableNumber(row['sales_approved_amount'] ?? row['salesApprovedAmount']),
      salesApprovalRemark: this.readNullableString(row['sales_approval_remark'] ?? row['salesApprovalRemark']),
      hoApprovedAmount: this.nullableNumber(row['ho_approved_amount'] ?? row['hoApprovedAmount']),
      hoApprovalRemark: this.readNullableString(row['ho_approval_remark'] ?? row['hoApprovalRemark']),
      createdBy: this.readNumber(row['created_by'] ?? row['createdBy']),
      createdByName: this.readNullableString(row['created_by_name'] ?? row['createdByName']),
      createdAt: this.readNullableString(row['created_at'] ?? row['createdAt']),
      approvalLogs: this.pickArray(row, ['approval_logs', 'approvalLogs']).map(log => this.normalizeApprovalLog(log))
    };
  }

  private normalizeApprovalLog(value: unknown): NewInvoiceApprovalLog {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id']),
      logDate: this.readNullableString(row['log_date'] ?? row['logDate']),
      createdBy: this.readNumber(row['created_by'] ?? row['createdBy']) || null,
      createdByName: this.readNullableString(row['created_by_name'] ?? row['createdByName']),
      employeeCode: this.readNullableString(row['employee_code'] ?? row['employeeCode']),
      statusType: this.readString(row['status_type'] ?? row['statusType']),
      fromStatus: this.readNumber(row['from_status'] ?? row['fromStatus']) || null,
      toStatus: this.readNumber(row['to_status'] ?? row['toStatus']) || null,
      approvedAmount: this.nullableNumber(row['approved_amount'] ?? row['approvedAmount']),
      remark: this.readNullableString(row['remark']),
      createdAt: this.readNullableString(row['created_at'] ?? row['createdAt'])
    };
  }

  private normalizeRetailer(value: unknown): RetailerOption {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id']),
      ownerName: this.readString(row['owner_name'] ?? row['ownerName']),
      shopName: this.readString(row['shop_name'] ?? row['shopName']),
      mobileNumber: this.readString(row['mobile_number'] ?? row['mobileNumber']),
      cityName: this.readNullableString(row['city_name'] ?? row['cityName']),
      address: this.readNullableString(row['address'] ?? row['Address'])
    };
  }

  private stageCountsFromSummary(summary: NewInvoiceSummary): NewInvoiceStageCounts {
    return {
      pending: summary.pending,
      approvedSs: summary.approvedSs,
      approvedSales: summary.approvedSales,
      approvedHo: summary.approvedHo,
      rejected: summary.rejected
    };
  }

  private normalizeStageCounts(value: unknown): NewInvoiceStageCounts {
    const row = this.asRecord(value);
    return {
      pending: this.readNumber(row['pending']),
      approvedSs: this.readNumber(row['approved_ss'] ?? row['approvedSs']),
      approvedSales: this.readNumber(row['approved_sales'] ?? row['approvedSales']),
      approvedHo: this.readNumber(row['approved_ho'] ?? row['approvedHo']),
      rejected: this.readNumber(row['rejected'])
    };
  }

  private normalizeSummary(value: unknown): NewInvoiceSummary {
    const row = this.asRecord(value);
    return {
      totalInvoices: this.readNumber(row['total_invoices'] ?? row['totalInvoices']),
      totalRetailers: this.readNumber(row['total_retailers'] ?? row['totalRetailers']),
      approvedSs: this.readNumber(row['approved_ss'] ?? row['approvedSs']),
      approvedSales: this.readNumber(row['approved_sales'] ?? row['approvedSales']),
      approvedHo: this.readNumber(row['approved_ho'] ?? row['approvedHo']),
      pending: this.readNumber(row['pending']),
      rejected: this.readNumber(row['rejected']),
      totalPoints: this.readNumber(row['total_points'] ?? row['totalPoints']),
      totalAmount: this.readNumber(row['total_amount'] ?? row['totalAmount']),
      ssApprovalAmount: this.readNumber(row['ss_approval_amount'] ?? row['ssApprovalAmount']),
      salesApprovalAmount: this.readNumber(row['sales_approval_amount'] ?? row['salesApprovalAmount']),
      hoApprovalAmount: this.readNumber(row['ho_approval_amount'] ?? row['hoApprovalAmount']),
      totalDealerNos: this.readNumber(row['total_dealer_nos'] ?? row['totalDealerNos']),
      totalRewardEarned: this.readNumber(row['total_reward_earned'] ?? row['totalRewardEarned']),
      totalExpectedReward: this.readNumber(row['total_expected_reward'] ?? row['totalExpectedReward'])
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

  private readNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private nullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    return this.readNumber(value);
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
      return throwError(() => new Error(this.readMessage(error.error?.message) || error.message || 'New invoice API request failed.'));
    }
    if (error instanceof Error) return throwError(() => error);
    return throwError(() => new Error('New invoice API request failed.'));
  }

  private readMessage(message: unknown): string {
    if (typeof message === 'string') return message;
    if (message && typeof message === 'object') {
      return Object.values(message).flatMap(value => Array.isArray(value) ? value : [value]).filter((value): value is string => typeof value === 'string').join(' ');
    }
    return '';
  }
}
