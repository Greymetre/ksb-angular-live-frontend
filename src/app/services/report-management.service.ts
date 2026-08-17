import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { AuthService } from './auth.service';

export type ReportMode = 'asr' | 'rating' | 'retailer' | 'dealer' | 'market' | 'activity';
export interface ReportResult { rows: Record<string, any>[]; summary: Record<string, any>; }
export interface ReportOption { id: number; name: string; }
export interface AsrReportOptions {
  users: ReportOption[];
  divisions: ReportOption[];
  branches: ReportOption[];
  designations: ReportOption[];
  default_designation_id: number | null;
  states?: ReportOption[];
  retailers?: ReportOption[];
  dealers?: ReportOption[];
  default_retailer_designation_ids?: number[];
  default_dealer_designation_ids?: number[];
}
export interface AsrReportFilters {
  employeeId?: number | null;
  divisionId?: number | null;
  branchId?: number | null;
  designationId?: number | null;
  startDate: string;
  endDate: string;
}
export interface RatingReportFilters {
  designationId: number;
  year: number;
  month?: number | 'weekly' | null;
  divisionId?: number | null;
  branchId?: number | null;
}
export interface RatingDashboardFilters {
  designationId: number;
  divisionId?: number | null;
  branchId?: number | null;
  search?: string;
  page: number;
  pageSize: number;
}
export interface RatingTrendRow {
  user_id: number; branch: string; employee_code: string; employee_name: string; reporting_manager: string; zone: string;
  average_rating: number; monthly_ratings: Record<string, number>; monthly_details: Record<string, RatingTrendMonthDetail>;
}
export interface RatingTrendComponent {
  key: string; label: string; percentage: number; actual: number; target: number; weight: number; weighted_score: number; description: string;
}
export interface RatingTrendMonthDetail { final_rating: number; components: RatingTrendComponent[]; }
export interface RatingReportDashboard {
  period: { label: string; start_date: string; end_date: string; months: Array<{ key: string; label: string; full_label: string }> };
  summary: {
    total_employees: number; total_zones: number; average_rating: number; oldest_month_average: number; average_change: number; comparison_month: string;
    monthly_averages: Record<string, number>;
    top_rated: { name: string; employee_code: string; branch: string; zone: string; rating: number } | null;
    needs_attention: { name: string; employee_code: string; branch: string; zone: string; rating: number } | null;
  };
  pagination: { page: number; page_size: number; total: number; total_pages: number; from: number; to: number };
  rows: RatingTrendRow[];
}

@Injectable({ providedIn: 'root' })
export class ReportManagementService {
  constructor(private http: HttpClient, private auth: AuthService) {}

  load(mode: ReportMode, filters: { branch?: string; zone?: string; userId?: number | null }): Observable<ReportResult> {
    let params = new HttpParams();
    if (filters.branch) params = params.set('branch', filters.branch);
    if (filters.zone) params = params.set('zone', filters.zone);
    if (filters.userId) params = params.set('user_id', filters.userId);
    if (mode === 'market') {
      return this.http.get<any>(`${API_BASE_URL}/reports/market-intelligence`, { headers: this.headers(), params }).pipe(
        map(response => ({ rows: this.array(response.data), summary: response.summary || { total_records: +(response.total || 0) } }))
      );
    }
    const path = mode === 'asr' ? 'sales/sales-summary' : 'sales/retailer-sales-summary';
    params = params.set('designation', 'asr');
    return this.http.get<any>(`${API_BASE_URL}/${path}`, { headers: this.headers(), params }).pipe(map(response => {
      const data = response.data || {};
      const rows = this.array(data.zones).flatMap((zone: any) => this.array(zone.users).map((user: any) => ({ zone: zone.zone, ...user, reporting_name: user.reporting?.name || '', reporting_mobile: user.reporting?.mobile || '' })));
      return { rows, summary: data.summary || {} };
    }));
  }

  asrOptions(): Observable<AsrReportOptions> {
    return this.http.get<any>(`${API_BASE_URL}/reports/asr-performance/options`, { headers: this.headers() }).pipe(
      map(response => ({
        users: this.array(response.users),
        divisions: this.array(response.divisions),
        branches: this.array(response.branches),
        designations: this.array(response.designations),
        default_designation_id: response.default_designation_id == null ? null : Number(response.default_designation_id)
      }))
    );
  }

  ratingOptions(): Observable<AsrReportOptions> {
    return this.http.get<any>(`${API_BASE_URL}/reports/rating-report/options`, { headers: this.headers() }).pipe(
      map(response => ({
        users: this.array(response.users), divisions: this.array(response.divisions), branches: this.array(response.branches),
        designations: this.array(response.designations), default_designation_id: response.default_designation_id == null ? null : Number(response.default_designation_id)
      }))
    );
  }

  ratingDashboard(filters: RatingDashboardFilters): Observable<RatingReportDashboard> {
    let params = new HttpParams()
      .set('designation_id', String(filters.designationId))
      .set('page', String(filters.page))
      .set('page_size', String(filters.pageSize));
    if (filters.divisionId) params = params.set('division_id', String(filters.divisionId));
    if (filters.branchId) params = params.set('branch_id', String(filters.branchId));
    if (filters.search?.trim()) params = params.set('search', filters.search.trim());
    return this.http.get<RatingReportDashboard>(`${API_BASE_URL}/reports/rating-report/dashboard`, { headers: this.headers(), params });
  }

  downloadRating(filters: RatingReportFilters): Observable<Blob> {
    const params = this.ratingParams(filters);
    return this.http.get(`${API_BASE_URL}/reports/rating-report/export`, { headers: this.headers(), params, responseType: 'blob' });
  }

  productivityOptions(): Observable<AsrReportOptions> {
    return this.http.get<any>(`${API_BASE_URL}/reports/productivity/options`, { headers: this.headers() }).pipe(map(response => ({
      users: this.array(response.users), divisions: this.array(response.divisions), branches: this.array(response.branches), designations: this.array(response.designations),
      states: this.array(response.states), retailers: this.array(response.retailers), dealers: this.array(response.dealers), default_designation_id: null,
      default_retailer_designation_ids: this.array(response.default_retailer_designation_ids).map(Number), default_dealer_designation_ids: this.array(response.default_dealer_designation_ids).map(Number)
    })));
  }

  downloadProductivity(mode: 'retailer' | 'dealer', filters: Record<string, any>): Observable<Blob> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) value.forEach(item => params = params.append(key, String(item)));
      else if (value !== null && value !== undefined && value !== '') params = params.set(key, String(value));
    });
    return this.http.get(`${API_BASE_URL}/reports/${mode}-performance/export`, { headers: this.headers(), params, responseType: 'blob' });
  }

  downloadAsr(filters: AsrReportFilters): Observable<Blob> {
    let params = new HttpParams()
      .set('start_date', filters.startDate)
      .set('end_date', filters.endDate);
    if (filters.employeeId) params = params.set('employee_id', filters.employeeId);
    if (filters.divisionId) params = params.set('division_id', filters.divisionId);
    if (filters.branchId) params = params.set('branch_id', filters.branchId);
    if (filters.designationId) params = params.set('designation_id', filters.designationId);
    return this.http.get(`${API_BASE_URL}/reports/asr-performance/export`, {
      headers: this.headers(), params, responseType: 'blob'
    });
  }

  activityOptions(): Observable<{ zones: ReportOption[]; branches: Array<ReportOption & { zone_id?: number }>; meets: Array<{ id: string; name: string }> }> {
    return this.http.get<any>(`${API_BASE_URL}/reports/activity-report/options`, { headers: this.headers() }).pipe(map(response => ({ zones: this.array(response.zones), branches: this.array(response.branches), meets: this.array(response.meets) })));
  }

  downloadActivity(kind: 'sales-engineer' | 'distributor' | 'gift-summary', filters: Record<string, any>): Observable<Blob> {
    let params = new HttpParams(); Object.entries(filters).forEach(([key, value]) => { if (value !== null && value !== undefined && value !== '') params = params.set(key, String(value)); });
    return this.http.get(`${API_BASE_URL}/reports/activity-report/${kind}-export`, { headers: this.headers(), params, responseType: 'blob' });
  }

  activityPreview(filters: Record<string, any>): Observable<any> {
    let params = new HttpParams(); Object.entries(filters).forEach(([key, value]) => { if (value !== null && value !== undefined && value !== '') params = params.set(key, String(value)); });
    return this.http.get<any>(`${API_BASE_URL}/reports/activity-report/preview`, { headers: this.headers(), params }).pipe(map(response => response.data || {}));
  }

  private array(value: any): any[] { return Array.isArray(value) ? value : Array.isArray(value?.$values) ? value.$values : []; }
  private ratingParams(filters: RatingReportFilters): HttpParams {
    let params = new HttpParams().set('designation_id', filters.designationId);
    if (filters.month === 'weekly') params = params.set('period', 'weekly');
    else {
      params = params.set('year', filters.year);
      if (filters.month) params = params.set('month', filters.month);
    }
    if (filters.divisionId) params = params.set('division_id', filters.divisionId);
    if (filters.branchId) params = params.set('branch_id', filters.branchId);
    return params;
  }
  private headers(): HttpHeaders { const token = this.auth.getToken(); return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders(); }
}
