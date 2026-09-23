import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { PagedArray, asPagedArray } from '../shared/utils/paged-array';
import { AuthService } from './auth.service';
import { API_BASE_URL, API_ORIGIN } from '../config/api.config';

export interface PromotionalActivity {
  id: number;
  activityCode: string;
  activityType: string;
  typeLabel: string;
  activityName: string;
  activityDate: string;
  status: string;
  statusLabel: string;
  userName: string;
  userCode: string;
  createdByName: string;
  reportingManagerName: string;
  branchName: string;
  zoneName: string;
  distributorName: string;
  dealerName: string;
  hotelName: string;
  locationText: string;
  participantCount: number;
  photoCount: number;
  giftCount: number;
  totalExpense: number;
  dealerShareAmount: number;
  feedback: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ActivityParticipant {
  name: string;
  shopName: string;
  proprietorName: string;
  participantType: string;
  profession: string;
  mobile: string;
  giftName: string;
  remarks: string;
  isInfluencer: boolean;
  socialType: string;
  socialLink: string;
}

export interface ActivityExpense {
  expenseType: string;
  totalAmount: number;
  dealerShareAmount: number;
  remarks: string;
  invoiceUrl: string;
}

export interface ActivityPhoto {
  id: number;
  photoUrl: string;
  latitude: number;
  longitude: number;
  takenAt: string | null;
}

export interface PromotionalActivityDetail {
  activity: PromotionalActivity;
  userId: number;
  distributorId: number | null;
  expenseTypes: string[];
  participants: ActivityParticipant[];
  expenses: ActivityExpense[];
  photos: ActivityPhoto[];
}

export interface ActivityEditPayload {
  activityName: string;
  activityDate: string;
  userId: number | null;
  distributorId: number | null;
  distributorName: string;
  dealerName: string;
  hotelName: string;
  locationText: string;
  giftCount: number;
  feedback: string;
  participants: ActivityParticipant[];
  expenses: ActivityExpense[];
  keepPhotoIds: number[];
}

export interface ActivityFilters {
  search?: string;
  activityType?: string | null;
  status?: string | null;
  userId?: number | null;
  branchId?: number | null;
  zoneId?: number | null;
  startDate?: string;
  endDate?: string;
}

export interface ActivityCounts {
  all: number;
  retailer: number;
  nukkad: number;
  farmer: number;
  influencer: number;
}

export interface Option { id: any; name: string; /** Branch options only: the branch's zone. */ zone_id?: number | null; }

export interface ActivityOptions {
  users: Option[];
  branches: Option[];
  zones: Option[];
  types: Option[];
  statuses: Option[];
}

type ApiResponse = Record<string, unknown>;

/** User Management > Promotional Activities. */
@Injectable({ providedIn: 'root' })
export class PromotionalActivityService {
  private readonly baseUrl = `${API_BASE_URL}/promotional-activities`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  list(filters: ActivityFilters, page = 1, pageSize = 10): Observable<{ rows: PagedArray<PromotionalActivity>; counts: ActivityCounts }> {
    const params = this.params(filters).set('page', String(page)).set('page_size', String(pageSize));
    return this.http.get<ApiResponse>(this.baseUrl, { headers: this.authHeaders(), params }).pipe(
      map(response => {
        const counts = this.record(response['counts']);
        return {
          rows: asPagedArray(this.array(response['data']).map(row => this.normalize(row)), response, page, pageSize),
          counts: {
            all: Number(counts['all'] ?? 0),
            retailer: Number(counts['retailer'] ?? 0),
            nukkad: Number(counts['nukkad'] ?? 0),
            farmer: Number(counts['farmer'] ?? 0),
            influencer: Number(counts['influencer'] ?? 0)
          }
        };
      }),
      catchError(error => this.handleError(error))
    );
  }

  options(): Observable<ActivityOptions> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/options`, { headers: this.authHeaders() }).pipe(
      map(response => {
        const data = this.record(response['data']);
        const list = (key: string) => this.array(data[key]).map(item => {
          const row = this.record(item);
          const code = this.text(row['employee_code']);
          const zoneId = Number(row['zone_id'] ?? 0);
          return { id: row['id'], name: code ? `${this.text(row['name'])} (${code})` : this.text(row['name']), zone_id: zoneId > 0 ? zoneId : null };
        });
        return { users: list('users'), branches: list('branches'), zones: list('zones'), types: list('types'), statuses: list('statuses') };
      }),
      catchError(error => this.handleError(error))
    );
  }

  show(id: number): Observable<PromotionalActivityDetail> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/${id}`, { headers: this.authHeaders() }).pipe(
      map(response => {
        const data = this.record(response['data']);
        return {
          activity: this.normalize(data['activity']),
          userId: Number(data['user_id'] ?? 0),
          distributorId: data['distributor_id'] == null ? null : Number(data['distributor_id']),
          expenseTypes: this.array(data['expense_types']).map(x => this.text(x)),
          participants: this.array(data['participants']).map(item => {
            const row = this.record(item);
            return {
              name: this.text(row['name']),
              shopName: this.text(row['shop_name']),
              proprietorName: this.text(row['proprietor_name']),
              participantType: this.text(row['participant_type']),
              profession: this.text(row['profession']),
              mobile: this.text(row['mobile']),
              giftName: this.text(row['gift_name']),
              remarks: this.text(row['remarks']),
              isInfluencer: row['is_influencer'] === true,
              socialType: this.text(row['social_type']),
              socialLink: this.text(row['social_link'])
            };
          }),
          expenses: this.array(data['expenses']).map(item => {
            const row = this.record(item);
            return {
              expenseType: this.text(row['expense_type']),
              totalAmount: Number(row['total_amount'] ?? 0),
              dealerShareAmount: Number(row['dealer_share_amount'] ?? 0),
              remarks: this.text(row['remarks']),
              invoiceUrl: this.text(row['invoice_url'])
            };
          }),
          photos: this.array(data['photos']).map(item => {
            const row = this.record(item);
            return {
              id: Number(row['id'] ?? 0),
              photoUrl: this.text(row['photo_url']),
              latitude: Number(row['latitude'] ?? 0),
              longitude: Number(row['longitude'] ?? 0),
              takenAt: this.text(row['taken_at']) || null
            };
          })
        };
      }),
      catchError(error => this.handleError(error))
    );
  }

  update(id: number, payload: ActivityEditPayload): Observable<string> {
    const body = {
      activity_name: payload.activityName,
      activity_date: payload.activityDate,
      user_id: payload.userId,
      distributor_id: payload.distributorId,
      distributor_name: payload.distributorName,
      dealer_name: payload.dealerName,
      hotel_name: payload.hotelName,
      location_text: payload.locationText,
      gift_count: payload.giftCount,
      feedback: payload.feedback,
      participants: payload.participants.map(x => ({
        name: x.name, shop_name: x.shopName, proprietor_name: x.proprietorName, participant_type: x.participantType,
        profession: x.profession, mobile: x.mobile, gift_name: x.giftName, remarks: x.remarks,
        is_influencer: x.isInfluencer, social_type: x.socialType, social_link: x.socialLink
      })),
      expenses: payload.expenses.map(x => ({
        expense_type: x.expenseType, total_amount: Number(x.totalAmount) || 0,
        dealer_share_amount: Number(x.dealerShareAmount) || 0, remarks: x.remarks, invoice_url: x.invoiceUrl
      })),
      keep_photo_ids: payload.keepPhotoIds
    };
    return this.http.put<ApiResponse>(`${this.baseUrl}/${id}`, body, { headers: this.authHeaders() }).pipe(
      map(response => this.text(response['message']) || 'Promotional activity updated successfully.'),
      catchError(error => this.handleError(error))
    );
  }

  delete(id: number): Observable<string> {
    return this.http.delete<ApiResponse>(`${this.baseUrl}/${id}`, { headers: this.authHeaders() }).pipe(
      map(response => this.text(response['message']) || 'Promotional activity deleted successfully.'),
      catchError(error => this.handleError(error))
    );
  }

  export(filters: ActivityFilters): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/export`, { headers: this.authHeaders(), params: this.params(filters), responseType: 'blob' }).pipe(
      catchError(error => this.handleError(error))
    );
  }

  /** The distributors the chosen ASR / DSR is assigned to - the same list the field app offers. */
  distributors(userId: number, search = ''): Observable<Option[]> {
    const params = new HttpParams().set('user', String(userId)).set('q', search.trim());
    return this.http.get<ApiResponse>(`${API_BASE_URL}/distributors/search`, { headers: this.authHeaders(), params }).pipe(
      map(response => this.array(response['data']).map(item => {
        const row = this.record(item);
        const code = this.text(row['code']);
        return { id: Number(row['id']), name: code ? `${code} · ${this.text(row['name'])}` : this.text(row['name']) };
      })),
      catchError(error => this.handleError(error))
    );
  }

  fileUrl(path: string): string {
    if (!path) return '';
    if (/^(https?:)?\/\//i.test(path)) return path;
    return `${API_ORIGIN}${path.startsWith('/') ? path : '/' + path}`;
  }

  private params(filters: ActivityFilters): HttpParams {
    let params = new HttpParams();
    const set = (key: string, value: unknown) => {
      if (value !== null && value !== undefined && String(value).trim() !== '') params = params.set(key, String(value).trim());
    };
    set('search', filters.search);
    set('activity_type', filters.activityType);
    set('status', filters.status);
    set('user_id', filters.userId);
    set('branch_id', filters.branchId);
    set('zone_id', filters.zoneId);
    set('start_date', filters.startDate);
    set('end_date', filters.endDate);
    return params;
  }

  private normalize(value: unknown): PromotionalActivity {
    const row = this.record(value);
    return {
      id: Number(row['id'] ?? 0),
      activityCode: this.text(row['activity_code']),
      activityType: this.text(row['activity_type']),
      typeLabel: this.text(row['type_label']),
      activityName: this.text(row['activity_name']),
      activityDate: this.text(row['activity_date']),
      status: this.text(row['status']),
      statusLabel: this.text(row['status_label']),
      userName: this.text(row['user_name']),
      userCode: this.text(row['user_code']),
      createdByName: this.text(row['created_by_name']),
      reportingManagerName: this.text(row['reporting_manager_name']),
      branchName: this.text(row['branch_name']),
      zoneName: this.text(row['zone_name']),
      distributorName: this.text(row['distributor_name']),
      dealerName: this.text(row['dealer_name']),
      hotelName: this.text(row['hotel_name']),
      locationText: this.text(row['location_text']),
      participantCount: Number(row['participant_count'] ?? 0),
      photoCount: Number(row['photo_count'] ?? 0),
      giftCount: Number(row['gift_count'] ?? 0),
      totalExpense: Number(row['total_expense'] ?? 0),
      dealerShareAmount: Number(row['dealer_share_amount'] ?? 0),
      feedback: this.text(row['feedback']),
      createdAt: this.text(row['created_at']) || null,
      updatedAt: this.text(row['updated_at']) || null
    };
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private text(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private handleError(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse) {
      let message = error.error?.message;
      // An export error comes back as a Blob; its message is not readable here.
      if (error.error instanceof Blob) message = error.status === 403 ? 'You do not have permission to export.' : 'Export failed.';
      return throwError(() => new Error(typeof message === 'string' && message ? message : error.message || 'Promotional Activity API request failed.'));
    }
    return throwError(() => error instanceof Error ? error : new Error('Promotional Activity API request failed.'));
  }
}
