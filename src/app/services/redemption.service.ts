import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '../config/api.config';

export interface RedemptionItem {
  id: number;
  transactionNo: string;
  customerId: number;
  customerCode: string;
  customerName: string;
  customerTypeName: string;
  mobileNumber?: string | null;
  cityName?: string | null;
  distributorName?: string | null;
  loyaltySchemeId?: number | null;
  schemeName: string;
  walletType: string;
  redeemMode: string;
  points: number;
  accountHolder: string;
  accountNumber: string;
  bankName: string;
  ifscCode: string;
  status: number;
  statusLabel: string;
  remark?: string | null;
  createdByName?: string | null;
  createdAt?: string | null;
}

export interface RedemptionSummary {
  totalRequests: number;
  approved: number;
  pending: number;
  rejectedOrHold: number;
}

export interface RedemptionFilter {
  search?: string;
  status?: number | null;
  redeem_mode?: string;
}

export interface RedemptionSchemeOption {
  schemeId?: number | null;
  schemeName: string;
  walletType: string;
  earnedPoints: number;
  redeemedPoints: number;
  availablePoints: number;
}

export interface RedemptionCustomerOption {
  id: number;
  customerCode: string;
  name: string;
  shopName: string;
  mobileNumber: string;
  customerTypeName: string;
  cityName?: string | null;
  distributorName?: string | null;
  kycApproved: boolean;
  kycState: 'approved' | 'missing' | 'pending' | 'rejected' | string;
  kycMessage: string;
  accountHolder: string;
  accountNumber: string;
  maskedAccountNumber: string;
  bankName: string;
  ifscCode: string;
  regularPoints: number;
  boosterPoints: number;
  regularSchemes: RedemptionSchemeOption[];
  boosterSchemes: RedemptionSchemeOption[];
}

export interface RedemptionListResult {
  redemptions: RedemptionItem[];
  summary: RedemptionSummary;
}

type ApiResponse = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class RedemptionService {
  private readonly baseUrl = `${API_BASE_URL}/redemptions`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  list(filter: RedemptionFilter): Observable<RedemptionListResult> {
    return this.http.get<ApiResponse>(this.baseUrl, { headers: this.authHeaders(), params: this.filterParams(filter) }).pipe(
      map(response => {
        const data = this.asRecord(this.pickFirstValue(response, ['redemptions', 'data.redemptions', 'data']) ?? response);
        return {
          redemptions: this.pickArray(data, ['redemptions', 'data']).map(row => this.normalizeItem(row)),
          summary: this.normalizeSummary(data['summary'])
        };
      }),
      catchError(error => this.handleError(error))
    );
  }

  customers(search = ''): Observable<RedemptionCustomerOption[]> {
    const params = search ? new HttpParams().set('search', search) : new HttpParams();
    return this.http.get<ApiResponse>(`${this.baseUrl}/customers`, { headers: this.authHeaders(), params }).pipe(
      map(response => this.pickArray(response, ['customers', 'data.customers', 'data']).map(row => this.normalizeCustomer(row))),
      catchError(error => this.handleError(error))
    );
  }

  create(payload: { customer_id: number; loyalty_scheme_id?: number | null; wallet_type: string; redeem_mode: string; points: number; bank_confirmed: boolean }): Observable<string> {
    return this.http.post<ApiResponse>(this.baseUrl, payload, { headers: this.authHeaders() }).pipe(
      map(response => this.responseMessage(response) || 'Redemption submitted successfully'),
      catchError(error => this.handleError(error))
    );
  }

  export(filter: RedemptionFilter): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/export`, {
      headers: this.authHeaders(),
      params: this.filterParams(filter),
      responseType: 'blob'
    }).pipe(catchError(error => this.handleError(error)));
  }

  private normalizeItem(value: unknown): RedemptionItem {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id']),
      transactionNo: this.readString(row['transaction_no'] ?? row['transactionNo']),
      customerId: this.readNumber(row['customer_id'] ?? row['customerId']),
      customerCode: this.readString(row['customer_code'] ?? row['customerCode']),
      customerName: this.readString(row['customer_name'] ?? row['customerName']),
      customerTypeName: this.readString(row['customer_type_name'] ?? row['customerTypeName']),
      mobileNumber: this.readNullableString(row['mobile_number'] ?? row['mobileNumber']),
      cityName: this.readNullableString(row['city_name'] ?? row['cityName']),
      distributorName: this.readNullableString(row['distributor_name'] ?? row['distributorName']),
      loyaltySchemeId: this.readNumber(row['loyalty_scheme_id'] ?? row['loyaltySchemeId']) || null,
      schemeName: this.readString(row['scheme_name'] ?? row['schemeName']),
      walletType: this.readString(row['wallet_type'] ?? row['walletType']),
      redeemMode: this.readString(row['redeem_mode'] ?? row['redeemMode']),
      points: this.readNumber(row['points']),
      accountHolder: this.readString(row['account_holder'] ?? row['accountHolder']),
      accountNumber: this.readString(row['account_number'] ?? row['accountNumber']),
      bankName: this.readString(row['bank_name'] ?? row['bankName']),
      ifscCode: this.readString(row['ifsc_code'] ?? row['ifscCode']),
      status: this.readNumber(row['status']),
      statusLabel: this.readString(row['status_label'] ?? row['statusLabel']),
      remark: this.readNullableString(row['remark']),
      createdByName: this.readNullableString(row['created_by_name'] ?? row['createdByName']),
      createdAt: this.readNullableString(row['created_at'] ?? row['createdAt'])
    };
  }

  private normalizeCustomer(value: unknown): RedemptionCustomerOption {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id']),
      customerCode: this.readString(row['customer_code'] ?? row['customerCode']),
      name: this.readString(row['name']),
      shopName: this.readString(row['shop_name'] ?? row['shopName']),
      mobileNumber: this.readString(row['mobile_number'] ?? row['mobileNumber']),
      customerTypeName: this.readString(row['customer_type_name'] ?? row['customerTypeName']),
      cityName: this.readNullableString(row['city_name'] ?? row['cityName']),
      distributorName: this.readNullableString(row['distributor_name'] ?? row['distributorName']),
      kycApproved: this.readBoolean(row['kyc_approved'] ?? row['kycApproved']),
      kycState: this.readString(row['kyc_state'] ?? row['kycState']) || 'pending',
      kycMessage: this.readString(row['kyc_message'] ?? row['kycMessage']),
      accountHolder: this.readString(row['account_holder'] ?? row['accountHolder']),
      accountNumber: this.readString(row['account_number'] ?? row['accountNumber']),
      maskedAccountNumber: this.readString(row['masked_account_number'] ?? row['maskedAccountNumber']),
      bankName: this.readString(row['bank_name'] ?? row['bankName']),
      ifscCode: this.readString(row['ifsc_code'] ?? row['ifscCode']),
      regularPoints: this.readNumber(row['regular_points'] ?? row['regularPoints']),
      boosterPoints: this.readNumber(row['booster_points'] ?? row['boosterPoints']),
      regularSchemes: this.pickArray(row, ['regular_schemes', 'regularSchemes']).map(item => this.normalizeScheme(item)),
      boosterSchemes: this.pickArray(row, ['booster_schemes', 'boosterSchemes']).map(item => this.normalizeScheme(item))
    };
  }

  private normalizeScheme(value: unknown): RedemptionSchemeOption {
    const row = this.asRecord(value);
    return {
      schemeId: this.readNumber(row['scheme_id'] ?? row['schemeId']) || null,
      schemeName: this.readString(row['scheme_name'] ?? row['schemeName']),
      walletType: this.readString(row['wallet_type'] ?? row['walletType']),
      earnedPoints: this.readNumber(row['earned_points'] ?? row['earnedPoints']),
      redeemedPoints: this.readNumber(row['redeemed_points'] ?? row['redeemedPoints']),
      availablePoints: this.readNumber(row['available_points'] ?? row['availablePoints'])
    };
  }

  private normalizeSummary(value: unknown): RedemptionSummary {
    const row = this.asRecord(value);
    return {
      totalRequests: this.readNumber(row['total_requests'] ?? row['totalRequests']),
      approved: this.readNumber(row['approved']),
      pending: this.readNumber(row['pending']),
      rejectedOrHold: this.readNumber(row['rejected_or_hold'] ?? row['rejectedOrHold'])
    };
  }

  private filterParams(filter: RedemptionFilter): HttpParams {
    let params = new HttpParams();
    Object.entries(filter).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') params = params.set(key, String(value));
    });
    return params;
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
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
      current = this.asRecord(current)[part];
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
    return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
  }

  private readNullableString(value: unknown): string | null {
    const text = this.readString(value);
    return text || null;
  }

  private readBoolean(value: unknown): boolean {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  private handleError(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse) {
      return throwError(() => new Error(this.readMessage(error.error?.message) || error.message || 'Redemption API request failed.'));
    }
    if (error instanceof Error) return throwError(() => error);
    return throwError(() => new Error('Redemption API request failed.'));
  }

  private readMessage(message: unknown): string {
    if (typeof message === 'string') return message;
    if (message && typeof message === 'object') {
      return Object.values(message).flatMap(value => Array.isArray(value) ? value : [value]).filter((value): value is string => typeof value === 'string').join(' ');
    }
    return '';
  }
}
