import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { PagedArray, asPagedArray } from '../shared/utils/paged-array';
import { AuthService } from './auth.service';
import { API_BASE_URL, API_ORIGIN } from '../config/api.config';

export interface AppDocument {
  id: number;
  documentName: string;
  filePath: string;
  fileName: string;
  fileSize: number | null;
  showInSfa: boolean;
  showInVriddhi: boolean;
  createdByName: string;
  updatedByName: string;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Which apps the document is meant for. Either, both or neither. */
export interface AppDocumentApps {
  sfa: boolean;
  vriddhi: boolean;
}

export interface AppDocumentActionResult {
  item?: AppDocument;
  message: string;
}

type ApiResponse = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class AppDocumentService {
  private readonly baseUrl = `${API_BASE_URL}/app-documents`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  list(search = '', page = 1, pageSize = 10): Observable<PagedArray<AppDocument>> {
    let params = new HttpParams().set('page', String(page)).set('page_size', String(pageSize));
    if (search.trim()) params = params.set('search', search.trim());
    return this.http.get<ApiResponse>(this.baseUrl, { headers: this.authHeaders(), params }).pipe(
      map(response => asPagedArray(
        this.asArray(response['app_documents'] ?? response['appDocuments']).map(row => this.normalize(row)),
        response, page, pageSize)),
      catchError(error => this.handleError(error))
    );
  }

  show(id: number): Observable<AppDocument> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/${id}`, { headers: this.authHeaders() }).pipe(
      map(response => this.normalize(response['app_document'] ?? response['appDocument'])),
      catchError(error => this.handleError(error))
    );
  }

  create(documentName: string, attachment: File, apps: AppDocumentApps): Observable<AppDocumentActionResult> {
    return this.http.post<ApiResponse>(this.baseUrl, this.formData(documentName, attachment, apps), { headers: this.authHeaders() }).pipe(
      map(response => this.actionResult(response, 'Document added successfully.')),
      catchError(error => this.handleError(error))
    );
  }

  /** Without a new file the document keeps the PDF it already has. */
  update(id: number, documentName: string, attachment: File | null, apps: AppDocumentApps): Observable<AppDocumentActionResult> {
    return this.http.put<ApiResponse>(`${this.baseUrl}/${id}`, this.formData(documentName, attachment, apps), { headers: this.authHeaders() }).pipe(
      map(response => this.actionResult(response, 'Document updated successfully.')),
      catchError(error => this.handleError(error))
    );
  }

  delete(id: number): Observable<AppDocumentActionResult> {
    return this.http.delete<ApiResponse>(`${this.baseUrl}/${id}`, { headers: this.authHeaders() }).pipe(
      map(response => ({ message: this.readString(response['message']) || 'Document deleted successfully.' })),
      catchError(error => this.handleError(error))
    );
  }

  fileUrl(path: string): string {
    if (!path) return '';
    if (/^(https?:)?\/\//i.test(path)) return path;
    return `${API_ORIGIN}${path.startsWith('/') ? path : '/' + path}`;
  }

  private formData(documentName: string, attachment: File | null, apps: AppDocumentApps): FormData {
    const data = new FormData();
    data.append('document_name', documentName.trim());
    data.append('show_in_sfa', String(apps.sfa));
    data.append('show_in_vriddhi', String(apps.vriddhi));
    if (attachment) data.append('attachment', attachment, attachment.name);
    return data;
  }

  private actionResult(response: ApiResponse, fallback: string): AppDocumentActionResult {
    const item = response['app_document'] ?? response['appDocument'];
    return {
      item: item ? this.normalize(item) : undefined,
      message: this.readString(response['message']) || fallback
    };
  }

  private normalize(value: unknown): AppDocument {
    const row = this.asRecord(value);
    const size = row['file_size'] ?? row['fileSize'];
    return {
      id: Number(row['id'] ?? 0),
      documentName: this.readString(row['document_name'] ?? row['documentName']),
      filePath: this.readString(row['file_path'] ?? row['filePath']),
      fileName: this.readString(row['file_name'] ?? row['fileName']),
      fileSize: size === null || size === undefined ? null : Number(size),
      showInSfa: this.readBool(row['show_in_sfa'] ?? row['showInSfa']),
      showInVriddhi: this.readBool(row['show_in_vriddhi'] ?? row['showInVriddhi']),
      createdByName: this.readString(row['created_by_name'] ?? row['createdByName']),
      updatedByName: this.readString(row['updated_by_name'] ?? row['updatedByName']),
      createdAt: this.readString(row['created_at'] ?? row['createdAt']) || null,
      updatedAt: this.readString(row['updated_at'] ?? row['updatedAt']) || null
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private readBool(value: unknown): boolean {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  private readString(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private handleError(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 413) return throwError(() => new Error('The PDF is too large to upload.'));
      const message = error.error?.message;
      return throwError(() => new Error(typeof message === 'string' && message ? message : error.message || 'App Document API request failed.'));
    }
    return throwError(() => error instanceof Error ? error : new Error('App Document API request failed.'));
  }
}
