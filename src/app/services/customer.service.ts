import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '../config/api.config';

export interface CustomerItem {
  id: number;
  active: string;
  name: string;
  mobile?: string | null;
  contactNumber?: string | null;
  email?: string | null;
  customerCode?: string | null;
  profileImage?: string | null;
  shopImage?: string | null;
  customerType?: number | null;
  customerTypeName?: string | null;
  sapCode?: string | null;
  parentId?: number | null;
  parentName?: string | null;
  countryId?: number | null;
  countryName?: string | null;
  stateId?: number | null;
  stateName?: string | null;
  districtId?: number | null;
  districtName?: string | null;
  cityId?: number | null;
  cityName?: string | null;
  pincodeId?: number | null;
  pincode?: string | null;
  createdBy?: number | null;
  createdByName?: string | null;
  createdAt?: string | null;
  totalPoints: number;
  totalRegularPoints: number;
  totalBoosterPoints: number;
  totalRedeemPoints: number;
  totalRejectedPoints: number;
  totalBalancePoints: number;
  customFields: Record<string, string | null>;
}

export interface CustomerPayload {
  active?: string;
  name?: string;
  mobile?: string;
  contact_number?: string;
  email?: string;
  customer_code?: string;
  customer_type?: number | null;
  parent_id?: number | null;
  sap_code?: string;
  custom_fields?: Record<string, string | null>;
}

export interface CustomerFilter {
  page?: number;
  page_size?: number;
  customer_type?: number | null;
  active?: string;
  search?: string;
  state_id?: number | null;
  city_id?: number | null;
  pincode_id?: number | null;
  user_id?: number | null;
  owner_name?: string;
  shop_name?: string;
  mobile?: string;
  beat_id?: number | null;
  status?: string;
  designation_ids?: number[];
  start_date?: string;
  end_date?: string;
}

export interface CustomerListResult {
  items: CustomerItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerActionResult {
  item?: CustomerItem;
  message: string;
  importResult?: CustomerImportResult;
}

export interface CustomerImportResult {
  totalRows: number;
  importedRows: number;
  updatedRows: number;
  failedRows: number;
  errors: string[];
}

export interface AddressOption {
  id: number;
  name?: string | null;
  countryName?: string | null;
  stateName?: string | null;
  districtName?: string | null;
  cityName?: string | null;
  pincode?: string | null;
}

export interface LocationDetails {
  country?: AddressOption | null;
  state?: AddressOption | null;
  district?: AddressOption | null;
  city?: AddressOption | null;
  pincodes: AddressOption[];
}

type ApiResponse = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly baseUrl = API_BASE_URL;

  constructor(private http: HttpClient, private authService: AuthService) {}

  list(filter: CustomerFilter): Observable<CustomerListResult> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/customers`, {
      headers: this.authHeaders(),
      params: this.filterParams(filter)
    }).pipe(
      map(response => ({
        items: this.readItems(response, 'customers'),
        total: Number(response['total'] || 0),
        page: Number(response['page'] || filter.page || 1),
        pageSize: Number(response['page_size'] || filter.page_size || 10)
      })),
      catchError(error => this.handleError(error))
    );
  }

  get(id: number): Observable<CustomerItem> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/customers/${id}`, { headers: this.authHeaders() }).pipe(
      map(response => this.normalizeItem(this.pickFirstValue(response, ['customer', 'Customer', 'data.customer', 'data']) || {})),
      catchError(error => this.handleError(error))
    );
  }

  create(payload: CustomerPayload | FormData): Observable<CustomerActionResult> {
    return this.http.post<ApiResponse>(`${this.baseUrl}/customers`, payload, { headers: this.authHeaders() }).pipe(
      map(response => this.actionResult(response, 'customer', 'Customer saved successfully')),
      catchError(error => this.handleError(error))
    );
  }

  update(id: number, payload: CustomerPayload | FormData): Observable<CustomerActionResult> {
    return this.http.put<ApiResponse>(`${this.baseUrl}/customers/${id}`, payload, { headers: this.authHeaders() }).pipe(
      map(response => this.actionResult(response, 'customer', 'Customer updated successfully')),
      catchError(error => this.handleError(error))
    );
  }

  setActive(id: number, active: string): Observable<CustomerActionResult> {
    return this.http.patch<ApiResponse>(`${this.baseUrl}/customers/${id}/status`, { active }, { headers: this.authHeaders() }).pipe(
      map(response => this.actionResult(response, 'customer', 'Customer status changed successfully')),
      catchError(error => this.handleError(error))
    );
  }

  delete(id: number): Observable<CustomerActionResult> {
    return this.http.delete<ApiResponse>(`${this.baseUrl}/customers/${id}`, { headers: this.authHeaders() }).pipe(
      map(response => ({ message: this.responseMessage(response) || 'Customer deleted successfully' })),
      catchError(error => this.handleError(error))
    );
  }

  approveKyc(id: number, documentKey: string, remark = ''): Observable<CustomerActionResult> {
    return this.http.post<ApiResponse>(`${this.baseUrl}/customers/${id}/kyc/${documentKey}/approve`, { remark }, { headers: this.authHeaders() }).pipe(
      map(response => this.actionResult(response, 'customer', 'KYC document approved successfully')),
      catchError(error => this.handleError(error))
    );
  }

  rejectKyc(id: number, documentKey: string, remark: string): Observable<CustomerActionResult> {
    return this.http.post<ApiResponse>(`${this.baseUrl}/customers/${id}/kyc/${documentKey}/reject`, { remark }, { headers: this.authHeaders() }).pipe(
      map(response => this.actionResult(response, 'customer', 'KYC document rejected successfully')),
      catchError(error => this.handleError(error))
    );
  }

  setApprovalStatus(id: number, status: 'APPROVED' | 'REJECTED' | 'PENDING', remark?: string | null): Observable<CustomerActionResult> {
    const action = status === 'APPROVED' ? 'approve' : status === 'REJECTED' ? 'reject' : 'pending';
    return this.http.post<ApiResponse>(`${this.baseUrl}/customers/${id}/approval-status/${action}`, { status, remark }, { headers: this.authHeaders() }).pipe(
      map(response => this.actionResult(response, 'customer', 'Status updated successfully')),
      catchError(error => this.handleError(error))
    );
  }

  export(filter: CustomerFilter): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/customers/export`, {
      headers: this.authHeaders(),
      params: this.filterParams(filter),
      responseType: 'blob'
    }).pipe(catchError(error => this.handleError(error)));
  }

  template(): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/customers/template`, {
      headers: this.authHeaders(),
      responseType: 'blob'
    }).pipe(catchError(error => this.handleError(error)));
  }

  upload(file: File): Observable<CustomerActionResult> {
    const formData = new FormData();
    formData.append('import_file', file);
    return this.http.post<ApiResponse>(`${this.baseUrl}/customers/upload`, formData, { headers: this.authHeaders() }).pipe(
      map(response => {
        const raw = this.asRecord(this.pickFirstValue(response, ['import', 'data.import', 'extra.import']));
        const importResult: CustomerImportResult = {
          totalRows: this.readNumber(raw['totalRows'] ?? raw['total_rows'] ?? raw['TotalRows']),
          importedRows: this.readNumber(raw['importedRows'] ?? raw['imported_rows'] ?? raw['ImportedRows']),
          updatedRows: this.readNumber(raw['updatedRows'] ?? raw['updated_rows'] ?? raw['UpdatedRows']),
          failedRows: this.readNumber(raw['failedRows'] ?? raw['failed_rows'] ?? raw['FailedRows']),
          errors: this.asArray(raw['errors'] ?? raw['Errors']).map(error => String(error))
        };
        return { message: this.responseMessage(response) || 'Customer import completed', importResult };
      }),
      catchError(error => this.handleError(error))
    );
  }

  options(path: string, key: string, params: Record<string, number | string | null> = {}): Observable<CustomerItem[]> {
    let httpParams = new HttpParams();
    Object.entries(params).forEach(([paramKey, value]) => {
      if (value !== null && value !== '') httpParams = httpParams.set(paramKey, String(value));
    });

    return this.http.get<ApiResponse>(`${this.baseUrl}/${path}`, { headers: this.authHeaders(), params: httpParams }).pipe(
      map(response => this.readItems(response, key)),
      catchError(error => this.handleError(error))
    );
  }

  locationDetails(params: { pincode?: string; city_id?: number | null; city?: string }): Observable<LocationDetails[]> {
    let httpParams = new HttpParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') httpParams = httpParams.set(key, String(value));
    });

    return this.http.get<ApiResponse>(`${this.baseUrl}/getlocationdetails`, { headers: this.authHeaders(), params: httpParams }).pipe(
      map(response => this.pickArray(response, ['locations', 'Locations', 'data.locations', 'data']).map(row => this.normalizeLocation(row))),
      catchError(error => this.handleError(error))
    );
  }

  private filterParams(filter: CustomerFilter): HttpParams {
    let params = new HttpParams();
    const aliases: Record<string, string> = {
      page_size: 'pageSize',
      owner_name: 'ownerName',
      shop_name: 'shopName',
      beat_id: 'beatId',
      designation_ids: 'designationIds',
      start_date: 'startDate',
      end_date: 'endDate'
    };
    Object.entries(filter).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') return;
      const apiKey = aliases[key] || key;
      if (Array.isArray(value)) value.forEach(item => params = params.append(apiKey, String(item)));
      else params = params.set(apiKey, String(value));
    });
    return params;
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private readItems(response: ApiResponse, key: string): CustomerItem[] {
    return this.pickArray(response, [key, this.pascal(key), `data.${key}`, 'data', 'items', 'records'])
      .map(row => this.normalizeItem(row))
      .filter(item => item.id > 0 || item.name);
  }

  private actionResult(response: ApiResponse, key: string, fallbackMessage: string): CustomerActionResult {
    const item = this.pickFirstValue(response, [key, this.pascal(key), `data.${key}`]);
    return { item: item ? this.normalizeItem(item) : undefined, message: this.responseMessage(response) || fallbackMessage };
  }

  private normalizeItem(value: unknown): CustomerItem {
    const row = this.asRecord(value);
    const fields = this.normalizeFields(row['custom_fields'] ?? row['customFields'] ?? row['CustomFields']);
    return {
      id: this.readNumber(row['id'] ?? row['Id']),
      active: this.readString(row['active'] ?? row['Active']) || 'Y',
      name: this.readString(row['name'] ?? row['Name']),
      mobile: this.readNullableString(row['mobile'] ?? row['Mobile']),
      contactNumber: this.readNullableString(row['contact_number'] ?? row['contactNumber'] ?? row['ContactNumber']),
      email: this.readNullableString(row['email'] ?? row['Email']),
      customerCode: this.readNullableString(row['customer_code'] ?? row['customerCode'] ?? row['CustomerCode']),
      profileImage: this.readNullableString(row['profile_image'] ?? row['profileImage'] ?? row['ProfileImage']),
      shopImage: this.readNullableString(row['shop_image'] ?? row['shopImage'] ?? row['ShopImage']),
      customerType: this.readNullableNumber(row['customer_type'] ?? row['customerType'] ?? row['CustomerType']),
      customerTypeName: this.readNullableString(row['customer_type_name'] ?? row['customerTypeName'] ?? row['CustomerTypeName']),
      sapCode: this.readNullableString(row['sap_code'] ?? row['sapCode'] ?? row['SapCode']),
      parentId: this.readNullableNumber(row['parent_id'] ?? row['parentId'] ?? row['ParentId']),
      parentName: this.readNullableString(row['parent_name'] ?? row['parentName'] ?? row['ParentName']),
      countryId: this.readNullableNumber(row['country_id'] ?? row['countryId'] ?? row['CountryId'] ?? fields['country_id']),
      countryName: this.readNullableString(row['country_name'] ?? row['countryName'] ?? row['CountryName']),
      stateId: this.readNullableNumber(row['state_id'] ?? row['stateId'] ?? row['StateId'] ?? fields['state_id']),
      stateName: this.readNullableString(row['state_name'] ?? row['stateName'] ?? row['StateName']),
      districtId: this.readNullableNumber(row['district_id'] ?? row['districtId'] ?? row['DistrictId'] ?? fields['district_id']),
      districtName: this.readNullableString(row['district_name'] ?? row['districtName'] ?? row['DistrictName']),
      cityId: this.readNullableNumber(row['city_id'] ?? row['cityId'] ?? row['CityId'] ?? fields['city_id']),
      cityName: this.readNullableString(row['city_name'] ?? row['cityName'] ?? row['CityName']),
      pincodeId: this.readNullableNumber(row['pincode_id'] ?? row['pincodeId'] ?? row['PincodeId'] ?? fields['pincode_id']),
      pincode: this.readNullableString(row['pincode'] ?? row['Pincode']),
      createdBy: this.readNullableNumber(row['created_by'] ?? row['createdBy'] ?? row['CreatedBy']),
      createdByName: this.readNullableString(row['created_by_name'] ?? row['createdByName'] ?? row['CreatedByName']),
      createdAt: this.readNullableString(row['created_at'] ?? row['createdAt'] ?? row['CreatedAt']),
      totalPoints: this.readNumber(row['total_points'] ?? row['totalPoints'] ?? row['TotalPoints']),
      totalRegularPoints: this.readNumber(row['total_regular_points'] ?? row['totalRegularPoints'] ?? row['TotalRegularPoints']),
      totalBoosterPoints: this.readNumber(row['total_booster_points'] ?? row['totalBoosterPoints'] ?? row['TotalBoosterPoints']),
      totalRedeemPoints: this.readNumber(row['total_redeem_points'] ?? row['totalRedeemPoints'] ?? row['TotalRedeemPoints']),
      totalRejectedPoints: this.readNumber(row['total_rejected_points'] ?? row['totalRejectedPoints'] ?? row['TotalRejectedPoints']),
      totalBalancePoints: this.readNumber(row['total_balance_points'] ?? row['totalBalancePoints'] ?? row['TotalBalancePoints']),
      customFields: fields
    };
  }

  private normalizeFields(value: unknown): Record<string, string | null> {
    const row = typeof value === 'string' ? this.parseJsonRecord(value) : this.asRecord(value);
    const fields: Record<string, string | null> = {};
    Object.entries(row).forEach(([key, item]) => fields[key] = this.readNullableString(item));
    return fields;
  }

  private parseJsonRecord(value: string): Record<string, unknown> {
    if (!value.trim()) return {};
    try {
      const parsed = JSON.parse(value);
      return this.asRecord(parsed);
    } catch {
      return {};
    }
  }

  private normalizeLocation(value: unknown): LocationDetails {
    const row = this.asRecord(value);
    return {
      country: this.normalizeAddressOption(row['country'] ?? row['Country']),
      state: this.normalizeAddressOption(row['state'] ?? row['State']),
      district: this.normalizeAddressOption(row['district'] ?? row['District']),
      city: this.normalizeAddressOption(row['city'] ?? row['City']),
      pincodes: this.asArray(row['pincodes'] ?? row['Pincodes'])
        .map(item => this.normalizeAddressOption(item))
        .filter((item): item is AddressOption => item !== null && item.id > 0)
    };
  }

  private normalizeAddressOption(value: unknown): AddressOption | null {
    const row = this.asRecord(value);
    const id = this.readNumber(row['id'] ?? row['Id']);
    if (id <= 0) return null;
    return {
      id,
      name: this.readNullableString(row['name'] ?? row['Name']),
      countryName: this.readNullableString(row['countryName'] ?? row['CountryName'] ?? row['country_name']),
      stateName: this.readNullableString(row['stateName'] ?? row['StateName'] ?? row['state_name']),
      districtName: this.readNullableString(row['districtName'] ?? row['DistrictName'] ?? row['district_name']),
      cityName: this.readNullableString(row['cityName'] ?? row['CityName'] ?? row['city_name']),
      pincode: this.readNullableString(row['pincode'] ?? row['Pincode'])
    };
  }

  private responseMessage(response: ApiResponse): string {
    return this.readMessage(response['message'] ?? response['Message']);
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
    if (typeof value === 'boolean') return value ? 'Y' : 'N';
    return null;
  }

  private handleError(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse) {
      return throwError(() => new Error(this.readMessage(error.error?.message) || error.message || 'Customer API request failed.'));
    }
    if (error instanceof Error) return throwError(() => error);
    return throwError(() => new Error('Customer API request failed.'));
  }

  private readMessage(message: unknown): string {
    if (typeof message === 'string') return message;
    if (message && typeof message === 'object') {
      return Object.values(message).flatMap(value => Array.isArray(value) ? value : [value]).filter((value): value is string => typeof value === 'string').join(' ');
    }
    return '';
  }

  private pascal(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
