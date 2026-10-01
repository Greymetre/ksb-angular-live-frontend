import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { BeatRouteService, RoutePlan, RouteStop, UserBeats } from '../../services/beat-route.service';
import { GOOGLE_MAPS_API_KEY } from '../../config/api.config';

/**
 * Beats Management > Route Optimized.
 *
 * Pick an employee and a day and the screen answers in what order their counters should be
 * visited, and roughly when each will be reached. The order comes from the server; this
 * screen draws it as a numbered list beside a map with the same numbers on it, so a manager
 * can read the walk either way round.
 */
@Component({
  standalone: false,
  selector: 'app-beat-route-optimizer',
  templateUrl: './beat-route-optimizer.component.html',
  styleUrls: ['./beat-route-optimizer.component.scss']
})
export class BeatRouteOptimizerComponent implements OnInit {
  @ViewChild('routeMap') mapElement?: ElementRef<HTMLDivElement>;

  users: Array<{ id: number; name: string }> = [];
  usersLoading = false;

  userId: number | null = null;
  date = new Date().toISOString().slice(0, 10);

  /** The employee's beats for the chosen date. A beat scheduled that day settles the plan,
   *  so the dropdown only appears when nothing is scheduled. */
  beatChoice: UserBeats | null = null;
  beatsLoading = false;
  beatId: number | null = null;

  plan: RoutePlan | null = null;
  building = false;
  error = '';
  /** Which stop the list has highlighted, so the map and the list agree. */
  selectedStop: number | null = null;
  /** Why the map could not be drawn. The list is unaffected, so this is not a page error. */
  mapError = '';

  private static mapsLoader: Promise<void> | null = null;
  private markers: any[] = [];

  constructor(public auth: AuthService, private service: BeatRouteService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.usersLoading = true;
    this.service.users().pipe(finalize(() => { this.usersLoading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: users => this.users = users,
        error: () => this.error = 'Could not load the employee list. Please refresh the page.'
      });
  }

  get stops(): RouteStop[] { return this.plan?.stops ?? []; }
  /** Nothing scheduled that day, and the employee carries at least one beat to choose from. */
  get showBeatPicker(): boolean { return !!this.beatChoice && !this.beatChoice.has_schedule && this.beatChoice.beats.length > 0; }
  get scheduledBeatName(): string { return this.beatChoice?.has_schedule ? (this.beatChoice.scheduled_beat_name || '') : ''; }

  /** The employee or the date changing makes the previous beat answer stale, so it is
   *  fetched again and the route already on screen is cleared. */
  selectionChanged(): void {
    this.plan = null;
    this.beatChoice = null;
    this.beatId = null;
    this.error = '';
    if (!this.userId || !this.date) { this.cdr.detectChanges(); return; }

    this.beatsLoading = true;
    this.service.beats(this.userId, this.date)
      .pipe(finalize(() => { this.beatsLoading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: choice => { this.beatChoice = choice; this.beatId = choice.has_schedule ? null : choice.default_beat_id; },
        error: error => this.error = error?.error?.message || 'Could not load this employee\'s beats.'
      });
  }
  get hasRoute(): boolean { return !!this.plan && !this.plan.empty && this.stops.length > 0; }

  build(): void {
    this.error = '';
    if (!this.userId) { this.error = 'Please select an employee.'; return; }
    if (!this.date) { this.error = 'Please select a date.'; return; }

    this.building = true;
    this.plan = null;
    this.selectedStop = null;
    this.mapError = '';
    this.service.build(this.userId, this.date, this.showBeatPicker ? this.beatId : null)
      .pipe(finalize(() => { this.building = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: plan => {
          this.plan = plan;
          if (this.hasRoute) setTimeout(() => this.drawMap(), 0);
        },
        error: error => this.error = error?.error?.message || error?.message || 'Could not build the route.'
      });
  }

  selectStop(stop: RouteStop): void {
    this.selectedStop = stop.sequence;
    const marker = this.markers[stop.sequence - 1];
    if (marker && (window as any).google) {
      const map = marker.getMap();
      map.panTo(marker.getPosition());
      if (map.getZoom() < 15) map.setZoom(15);
    }
  }

  priorityClass(stop: RouteStop): string {
    switch (stop.priority) {
      case 'visited': return 'done';
      case 'overdue': return 'overdue';
      case 'followup': return 'due';
      case 'new': return 'never';
      default: return 'recent';
    }
  }

  private async drawMap(): Promise<void> {
    const points = this.stops.filter(x => x.latitude !== null && x.longitude !== null);
    if (!points.length || !this.mapElement) return;
    try {
      await this.loadGoogleMaps();
      const google = (window as any).google;
      const map = new google.maps.Map(this.mapElement.nativeElement, {
        zoom: 13,
        center: { lat: points[0].latitude!, lng: points[0].longitude! },
        mapTypeControl: false,
        streetViewControl: false,
      });
      const bounds = new google.maps.LatLngBounds();
      this.markers = [];

      const start = this.plan?.start;
      if (start?.latitude != null && start?.longitude != null) {
        const position = { lat: start.latitude, lng: start.longitude };
        bounds.extend(position);
        new google.maps.Marker({
          map, position, title: `${start.source}${start.time ? ' · ' + start.time : ''}`,
          label: { text: 'S', color: '#fff', fontWeight: '700' },
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 11, fillColor: '#174a8b', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
        });
      }

      points.forEach(stop => {
        const position = { lat: stop.latitude!, lng: stop.longitude! };
        bounds.extend(position);
        const marker = new google.maps.Marker({
          map, position, title: `${stop.sequence}. ${stop.name}`,
          label: { text: String(stop.sequence), color: '#fff', fontSize: '11px', fontWeight: '700' },
          icon: {
            path: google.maps.SymbolPath.CIRCLE, scale: 12,
            fillColor: stop.visited ? '#10a66d' : '#8A5A08', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2,
          },
        });
        marker.addListener('click', () => { this.selectedStop = stop.sequence; this.cdr.detectChanges(); });
        this.markers.push(marker);
      });

      const path = points.map(stop => ({ lat: stop.latitude!, lng: stop.longitude! }));
      if (start?.latitude != null && start?.longitude != null) path.unshift({ lat: start.latitude, lng: start.longitude });
      if (path.length > 1) {
        new google.maps.Polyline({ map, path, geodesic: true, strokeColor: '#8A5A08', strokeOpacity: 0.85, strokeWeight: 3 });
      }
      map.fitBounds(bounds);
    } catch (error: any) {
      this.mapError = error?.message || 'Unable to draw the route map.';
      this.cdr.detectChanges();
    }
  }

  /** Google Maps is loaded once per page life, the way the monitoring screen loads it. */
  private loadGoogleMaps(): Promise<void> {
    const w = window as any;
    if (w.google?.maps) return Promise.resolve();
    if (BeatRouteOptimizerComponent.mapsLoader) return BeatRouteOptimizerComponent.mapsLoader;
    if (!GOOGLE_MAPS_API_KEY) return Promise.reject(new Error('Google Maps API key is not configured.'));
    BeatRouteOptimizerComponent.mapsLoader = new Promise<void>((resolve, reject) => {
      const callback = `ksbRouteMapReady${Date.now()}`;
      w[callback] = () => { delete w[callback]; resolve(); };
      const script = document.createElement('script');
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error('Unable to load Google Maps.'));
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&callback=${callback}`;
      document.head.appendChild(script);
    });
    return BeatRouteOptimizerComponent.mapsLoader;
  }
}
