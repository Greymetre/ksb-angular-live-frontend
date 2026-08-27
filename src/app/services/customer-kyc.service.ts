import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '../config/api.config';

export type KycStatus = 'approved' | 'rejected' | 'pending';

/** Which tile a customer is counted under. Rejected is not a stage of its own - a turned
 *  down document still sits somewhere in the submission ladder - so it is filtered
 *  separately rather than counted as a step. */
export type KycStage = 'approved' | 'complete_pending' | 'partial' | 'none';

/** One document's standing: is the file in, are the matching details in, and has a
 *  reviewer signed it off. The screen shows all three, so none of them is collapsed. */
export interface KycDetailRow {
  label: string;
  value: string | null;
}

export interface KycDocumentState {
  key: string;
  label: string;
  uploaded: boolean;
  /** Stored path of the uploaded file; the screen turns it into a URL. */
  attachmentPath: string | null;
  detailsFilled: boolean;
  detailSummary: string | null;
  /** Every field this document carries, filled or not, for the popup. */
  details: KycDetailRow[];
  status: KycStatus;
  remark: string | null;
  actionByName: string | null;
  actionAt: string | null;
}

export interface KycCustomerItem {
  id: number;
  ownerName: string;
  firmName: string;
  mobile: string | null;
  customerCode: string | null;
  dealerName: string | null;
  customerTypeName: string;
  active: string;
  documents: KycDocumentState[];
  documentCount: number;
  uploadedCount: number;
  detailsCount: number;
  approvedCount: number;
  rejectedCount: number;
  stage: KycStage;
  overallStatus: KycStatus;
  lastActionAt: string | null;
}

export interface KycSummary {
  totalCustomers: number;
  approved: number;
  completePending: number;
  partial: number;
  notStarted: number;
  rejected: number;
}

export interface KycDealerOption {
  id: number;
  name: string;
}

export interface KycListResult {
  items: KycCustomerItem[];
  summary: KycSummary;
  total: number;
  page: number;
  pageSize: number;
}

export interface KycFilter {
  page?: number;
  page_size?: number;
  search?: string | null;
  customer_type?: number | null;
  kyc_status?: string | null;
  dealer_id?: number | null;
  active?: string | null;
}

type ApiResponse = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class CustomerKycService {
  private readonly baseUrl = API_BASE_URL;

  constructor(private http: HttpClient, private authService: AuthService) {}

  list(filter: KycFilter): Observable<KycListResult> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/customer-kyc`, {
      headers: this.authHeaders(),
      params: this.params(filter)
    }).pipe(
      map(response => ({
        items: this.readArray(response['customers']).map(row => this.toItem(row)),
        summary: this.toSummary(response['summary']),
        total: this.num(response['total']),
        page: this.num(response['page']) || filter.page || 1,
        pageSize: this.num(response['page_size']) || filter.page_size || 10
      })),
      catchError(error => this.handleError(error))
    );
  }

  dealers(): Observable<KycDealerOption[]> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/customer-kyc/dealers`, { headers: this.authHeaders() }).pipe(
      map(response => this.readArray(response['dealers']).map(row => {
        const dealer = this.asRecord(row);
        return { id: this.num(dealer['id']), name: this.str(dealer['name']) };
      })),
      catchError(error => this.handleError(error))
    );
  }

  private params(filter: KycFilter): HttpParams {
    let params = new HttpParams();
    Object.entries(filter).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') return;
      params = params.set(key, String(value));
    });
    return params;
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  // The API answers in snake_case; older deployments of the same shape used camelCase,
  // so both spellings are read rather than assuming one.
  private pick(row: ApiResponse, snake: string, camel: string): unknown {
    return row[snake] ?? row[camel];
  }

  private toItem(value: unknown): KycCustomerItem {
    const row = this.asRecord(value);
    return {
      id: this.num(row['id']),
      ownerName: this.str(this.pick(row, 'owner_name', 'ownerName')),
      firmName: this.str(this.pick(row, 'firm_name', 'firmName')),
      mobile: this.nullableStr(row['mobile']),
      customerCode: this.nullableStr(this.pick(row, 'customer_code', 'customerCode')),
      dealerName: this.nullableStr(this.pick(row, 'dealer_name', 'dealerName')),
      customerTypeName: this.str(this.pick(row, 'customer_type_name', 'customerTypeName')),
      active: this.str(row['active']) || 'Y',
      documents: this.readArray(row['documents']).map(document => this.toDocument(document)),
      documentCount: this.num(this.pick(row, 'document_count', 'documentCount')),
      uploadedCount: this.num(this.pick(row, 'uploaded_count', 'uploadedCount')),
      detailsCount: this.num(this.pick(row, 'details_count', 'detailsCount')),
      approvedCount: this.num(this.pick(row, 'approved_count', 'approvedCount')),
      rejectedCount: this.num(this.pick(row, 'rejected_count', 'rejectedCount')),
      stage: this.stage(row['stage']),
      overallStatus: this.status(this.pick(row, 'overall_status', 'overallStatus')),
      lastActionAt: this.nullableStr(this.pick(row, 'last_action_at', 'lastActionAt'))
    };
  }

  private toDocument(value: unknown): KycDocumentState {
    const row = this.asRecord(value);
    return {
      key: this.str(row['key']),
      label: this.str(row['label']),
      uploaded: row['uploaded'] === true,
      attachmentPath: this.nullableStr(this.pick(row, 'attachment_path', 'attachmentPath')),
      detailsFilled: this.pick(row, 'details_filled', 'detailsFilled') === true,
      detailSummary: this.nullableStr(this.pick(row, 'detail_summary', 'detailSummary')),
      details: this.readArray(row['details']).map(detail => {
        const value = this.asRecord(detail);
        return { label: this.str(value['label']), value: this.nullableStr(value['value']) };
      }),
      status: this.status(row['status']),
      remark: this.nullableStr(row['remark']),
      actionByName: this.nullableStr(this.pick(row, 'action_by_name', 'actionByName')),
      actionAt: this.nullableStr(this.pick(row, 'action_at', 'actionAt'))
    };
  }

  private toSummary(value: unknown): KycSummary {
    const row = this.asRecord(value);
    return {
      totalCustomers: this.num(this.pick(row, 'total_customers', 'totalCustomers')),
      approved: this.num(row['approved']),
      completePending: this.num(this.pick(row, 'complete_pending', 'completePending')),
      partial: this.num(row['partial']),
      notStarted: this.num(this.pick(row, 'not_started', 'notStarted')),
      rejected: this.num(row['rejected'])
    };
  }

  private stage(value: unknown): KycStage {
    const stage = String(value ?? '').toLowerCase();
    return stage === 'approved' || stage === 'complete_pending' || stage === 'partial' ? stage : 'none';
  }

  private status(value: unknown): KycStatus {
    const status = String(value ?? '').toLowerCase();
    return status === 'approved' || status === 'rejected' ? status : 'pending';
  }

  private readArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private asRecord(value: unknown): ApiResponse {
    return value && typeof value === 'object' ? value as ApiResponse : {};
  }

  private num(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private str(value: unknown): string {
    return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
  }

  private nullableStr(value: unknown): string | null {
    const text = this.str(value).trim();
    return text ? text : null;
  }

  private handleError(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse) {
      return throwError(() => new Error(error.error?.message || error.message || 'KYC list could not be loaded.'));
    }
    return throwError(() => error instanceof Error ? error : new Error('KYC list could not be loaded.'));
  }
}
