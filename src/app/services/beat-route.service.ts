import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { AuthService } from './auth.service';

/** One counter on the day's walk, in the order it should be reached. */
export interface RouteStop {
  entity_id: number;
  entity_type: 'dealer' | 'retailer';
  name: string;
  code: string;
  category: string;
  mobile: string;
  address: string;
  city: string;
  beat_name: string;
  latitude: number | null;
  longitude: number | null;
  sequence: number;
  leg_km: number | null;
  eta: string | null;
  visited: boolean;
  last_visited: string | null;
  days_since_visit: number | null;
  visited_at: string | null;
  priority: string;
  priority_label: string;
}

export interface RouteStart {
  source: string;
  latitude: number | null;
  longitude: number | null;
  time: string | null;
  address: string | null;
}

/** What the Beat dropdown shows, and whether it should be shown at all. */
export interface UserBeats {
  has_schedule: boolean;
  scheduled_beat_name: string | null;
  default_beat_id: number | null;
  beats: Array<{ id: number; name: string }>;
}

export interface RoutePlan {
  status: boolean;
  empty?: boolean;
  message?: string;
  plan_source?: 'scheduled' | 'assigned';
  user?: { id: number; name: string; designation: string };
  beat_name?: string;
  date?: string;
  start?: RouteStart | null;
  summary?: {
    stops: number; mapped_stops: number; unmapped_stops: number;
    beat_counters: number; beat_unmapped: number; day_plan_limit: number; capped: boolean;
    visited: number; route_km: number; start_time: string; finish_time: string | null;
  };
  stops: RouteStop[];
}

@Injectable({ providedIn: 'root' })
export class BeatRouteService {
  constructor(private http: HttpClient, private auth: AuthService) {}

  users(): Observable<Array<{ id: number; name: string }>> {
    return this.http.get<any>(`${API_BASE_URL}/beat-route/options`, { headers: this.headers() })
      .pipe(map(response => Array.isArray(response?.users) ? response.users : []));
  }

  /** The beat the day will be planned from: the scheduled one, or the assigned list to pick from. */
  beats(userId: number, date: string): Observable<UserBeats> {
    const params = new HttpParams().set('user_id', String(userId)).set('date', date);
    return this.http.get<any>(`${API_BASE_URL}/beat-route/beats`, { headers: this.headers(), params }).pipe(
      map(response => ({
        has_schedule: !!response?.has_schedule,
        scheduled_beat_name: response?.scheduled_beat_name ?? null,
        default_beat_id: response?.default_beat_id ?? null,
        beats: Array.isArray(response?.beats) ? response.beats : [],
      }))
    );
  }

  build(userId: number, date: string, beatId: number | null): Observable<RoutePlan> {
    let params = new HttpParams().set('user_id', String(userId)).set('date', date);
    if (beatId) params = params.set('beat_id', String(beatId));
    return this.http.get<RoutePlan>(`${API_BASE_URL}/beat-route`, { headers: this.headers(), params });
  }

  private headers(): HttpHeaders {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
