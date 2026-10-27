import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { AuthService } from './auth.service';

export interface AssistantChip { label: string; send: string; }
export interface AssistantAction { type: string; method: string; url: string; params: Record<string, string>; file_name: string; route: string; }
export interface AssistantReply { reply: string; chips: AssistantChip[]; action: AssistantAction | null; context: Record<string, string> | null; }

@Injectable({ providedIn: 'root' })
export class AssistantService {
  constructor(private http: HttpClient, private auth: AuthService) {}

  private headers(): HttpHeaders {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  ask(message: string, context: Record<string, string> | null, history: string[] = []): Observable<AssistantReply> {
    return this.http.post<AssistantReply>(`${API_BASE_URL}/assistant/ask`, { message, context, history }, { headers: this.headers() });
  }

  /** Downloads the file an export action points at. A comma-joined param value (e.g. zone_id)
   *  is expanded into one repeated query param per value. */
  download(action: AssistantAction): Observable<Blob> {
    let params = new HttpParams();
    Object.entries(action.params || {}).forEach(([key, value]) => {
      String(value).split(',').filter(piece => piece !== '').forEach(piece => params = params.append(key, piece));
    });
    return this.http.get(`${API_BASE_URL}/${action.url}`, { headers: this.headers(), params, responseType: 'blob' });
  }
}
