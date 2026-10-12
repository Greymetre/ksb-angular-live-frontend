import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '../config/api.config';

export interface DealerFeedbackRow {
  id: number;
  customerId: number;
  dealerName: string;
  dealerMobile?: string | null;
  category: string;
  message: string;
  rating: number;
  createdAt?: string | null;
}

export interface DealerFeedbackFilter {
  category?: string;
  search?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  page_size?: number;
}

export interface DealerFeedbackListResult {
  rows: DealerFeedbackRow[];
  total: number;
  page: number;
  pageSize: number;
  lastPage: number;
}

// The categories a dealer may pick - kept here so the dealer form and the internal filter
// read the same list.
export const DEALER_FEEDBACK_CATEGORIES: string[] = [
  'Product Quality',
  'Delivery / Logistics',
  'Scheme & Pricing',
  'Service / Support',
  'App / Portal',
  'Other'
];

type ApiResponse = Record<string, any>;

@Injectable({ providedIn: 'root' })
export class DealerFeedbackService {
  private readonly baseUrl = `${API_BASE_URL}/dealer-feedback`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  submit(category: string, message: string, rating: number): Observable<string> {
    return this.http.post<ApiResponse>(this.baseUrl, { category, message, rating }, { headers: this.authHeaders() }).pipe(
      map(response => (response?.['message'] as string) || 'Thank you - your feedback has been sent.')
    );
  }

  mine(): Observable<DealerFeedbackRow[]> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/mine`, { headers: this.authHeaders() }).pipe(
      map(response => ((response?.['data'] as any[]) ?? []).map(row => this.normalize(row)))
    );
  }

  list(filter: DealerFeedbackFilter): Observable<DealerFeedbackListResult> {
    return this.http.get<ApiResponse>(this.baseUrl, { headers: this.authHeaders(), params: this.params(filter) }).pipe(
      map(response => {
        const pagination = (response?.['pagination'] as ApiResponse) ?? {};
        return {
          rows: ((response?.['data'] as any[]) ?? []).map(row => this.normalize(row)),
          total: Number(pagination['total'] ?? 0),
          page: Number(pagination['current_page'] ?? 1),
          pageSize: Number(pagination['page_size'] ?? filter.page_size ?? 10),
          lastPage: Number(pagination['last_page'] ?? 1)
        };
      })
    );
  }

  export(filter: DealerFeedbackFilter): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/export`, {
      headers: this.authHeaders(),
      params: this.params(filter),
      responseType: 'blob'
    });
  }

  private params(filter: DealerFeedbackFilter): HttpParams {
    let params = new HttpParams();
    if (filter.category) params = params.set('category', filter.category);
    if (filter.search) params = params.set('search', filter.search);
    if (filter.from_date) params = params.set('from_date', filter.from_date);
    if (filter.to_date) params = params.set('to_date', filter.to_date);
    if (filter.page) params = params.set('page', String(filter.page));
    if (filter.page_size) params = params.set('page_size', String(filter.page_size));
    return params;
  }

  private normalize(row: any): DealerFeedbackRow {
    return {
      id: Number(row?.id ?? 0),
      customerId: Number(row?.customerId ?? row?.customer_id ?? 0),
      dealerName: String(row?.dealerName ?? row?.dealer_name ?? ''),
      dealerMobile: row?.dealerMobile ?? row?.dealer_mobile ?? null,
      category: String(row?.category ?? ''),
      message: String(row?.message ?? ''),
      rating: Number(row?.rating ?? 0),
      createdAt: row?.createdAt ?? row?.created_at ?? null
    };
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
