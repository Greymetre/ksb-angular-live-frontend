import { ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { DashboardService, DealerDashboard, DealerScheme } from '../../services/dashboard.service';

@Component({
  standalone: false,
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  data: DealerDashboard | null = null;
  loading = false;
  error = '';

  // The scheme strip scrolls continuously like a news ticker rather than stepping
  // card by card. It runs on requestAnimationFrame outside Angular so the constant
  // motion never triggers change detection, and it pauses while the pointer is over it.
  private static readonly TickerPixelsPerSecond = 22;
  @ViewChild('schemeTrack') schemeTrack?: ElementRef<HTMLElement>;
  private tickerOffset = 0;
  private tickerFrame?: number;
  private tickerLastTime = 0;
  private paused = false;

  constructor(
    private dashboardService: DashboardService,
    private auth: AuthService,
    private router: Router,
    private zone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Only dealer users have a dealer dashboard; everyone else keeps the welcome screen.
    if (!this.auth.isDistributorUser()) return;

    this.loading = true;
    this.dashboardService.dealer().pipe(finalize(() => {
      this.loading = false;
      this.cdr.detectChanges();
    })).subscribe({
      next: data => {
        this.data = data.isDealer ? data : null;
        this.cdr.detectChanges();
        this.startTicker();
      },
      error: error => { this.error = error.message; this.cdr.detectChanges(); }
    });
  }

  ngOnDestroy(): void {
    this.stopTicker();
  }

  get schemes(): DealerScheme[] {
    return this.data?.schemes ?? [];
  }

  /// The list twice over, so scrolling one full copy wraps seamlessly.
  get tickerSchemes(): DealerScheme[] {
    const schemes = this.schemes;
    return schemes.length ? [...schemes, ...schemes] : schemes;
  }

  get liveSchemeCount(): number {
    return this.schemes.filter(scheme => scheme.isLive).length;
  }

  pauseSchemes(): void { this.paused = true; }
  resumeSchemes(): void { this.paused = false; }

  private startTicker(): void {
    this.stopTicker();
    if (!this.schemes.length) return;

    this.zone.runOutsideAngular(() => {
      this.tickerLastTime = 0;
      const step = (time: number) => {
        const track = this.schemeTrack?.nativeElement;
        if (track) {
          const elapsed = this.tickerLastTime ? (time - this.tickerLastTime) / 1000 : 0;
          this.tickerLastTime = time;
          if (!this.paused) {
            this.tickerOffset += elapsed * DashboardComponent.TickerPixelsPerSecond;
            // One copy of the list; wrapping here keeps the motion unbroken.
            const half = track.scrollWidth / 2;
            if (half > 0 && this.tickerOffset >= half) this.tickerOffset -= half;
            track.style.transform = `translateX(-${this.tickerOffset}px)`;
          }
        }
        this.tickerFrame = requestAnimationFrame(step);
      };
      this.tickerFrame = requestAnimationFrame(step);
    });
  }

  private stopTicker(): void {
    if (this.tickerFrame) cancelAnimationFrame(this.tickerFrame);
    this.tickerFrame = undefined;
  }

  schemeDate(value: string): string {
    if (!value) return '';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? value
      : parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }

  get greeting(): string {
    const hour = Number(new Date().toLocaleString('en-IN', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }));
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  }

  get activeRetailerPercent(): number {
    const total = this.data?.retailers.total ?? 0;
    return total === 0 ? 0 : Math.round(((this.data?.retailers.active ?? 0) * 100) / total);
  }

  get invoiceRetailerPercent(): number {
    const total = this.data?.retailers.total ?? 0;
    return total === 0 ? 0 : Math.round(((this.data?.invoices.retailers ?? 0) * 100) / total);
  }

  get approvedInvoicePercent(): number {
    const total = this.data?.invoices.total ?? 0;
    return total === 0 ? 0 : Math.round(((this.data?.invoices.approved ?? 0) * 100) / total);
  }

  money(value: number): string {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0);
  }

  openScheme(id: number): void {
    this.router.navigate(['/dealer/schemes', id]);
  }

  /// Opens the invoice page with the pre-GST notice already showing.
  createInvoice(): void {
    this.router.navigate(['/new-invoices'], { queryParams: { create: 1 } });
  }

  go(path: string): void {
    this.router.navigate([path]);
  }

  can(permission: string): boolean {
    return this.auth.hasPermission(permission);
  }
}
