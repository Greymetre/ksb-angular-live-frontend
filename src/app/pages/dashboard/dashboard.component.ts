import { ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import {
  ActivityDashboard, AttendanceDayPoint, DashboardService, DealerDashboard, DealerScheme,
  LoyaltyDashboard, LoyaltyTrendPoint, OverviewActivity, OverviewCount, OverviewTarget,
  OverviewTrendPoint, TeamDashboard
} from '../../services/dashboard.service';

type DashboardTab = 'secondary' | 'loyalty' | 'activity';

interface TabDefinition { key: DashboardTab; label: string; icon: string; permission: string; }

@Component({
  standalone: false,
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  data: DealerDashboard | null = null;
  team: TeamDashboard | null = null;
  loyalty: LoyaltyDashboard | null = null;
  activity: ActivityDashboard | null = null;
  loading = false;
  error = '';

  /// One tab per dashboard. A tab is only offered when the role holds its
  /// permission, and each tab loads the first time it is opened.
  private static readonly AllTabs: TabDefinition[] = [
    { key: 'secondary', label: 'Secondary Sale', icon: 'insights', permission: 'dashboard_secondary' },
    { key: 'loyalty', label: 'Loyalty', icon: 'loyalty', permission: 'dashboard_loyalty' },
    { key: 'activity', label: 'Activity', icon: 'directions_walk', permission: 'dashboard_activity' }
  ];
  tabs: TabDefinition[] = [];
  activeTab: DashboardTab = 'secondary';
  private loaded = new Set<DashboardTab>();

  /// Field activity and target blocks are the same shape over three windows, so
  /// one selector drives each rather than repeating the card three times.
  activityRange: 'today' | 'month' | 'year' = 'month';
  targetRange: 'month' | 'ytd' = 'ytd';

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
    // Dealer logins get their own network summary and no tabs.
    if (this.auth.isDistributorUser()) {
      this.loading = true;
      this.loadDealer();
      return;
    }

    this.tabs = DashboardComponent.AllTabs.filter(tab => this.can(tab.permission));
    if (!this.tabs.length) return;

    this.activeTab = this.tabs[0].key;
    this.load(this.activeTab);
  }

  selectTab(tab: DashboardTab): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.load(tab);
  }

  private load(tab: DashboardTab): void {
    if (this.loaded.has(tab)) return;
    this.loaded.add(tab);
    this.error = '';
    this.loading = true;

    const request: Observable<TeamDashboard | LoyaltyDashboard | ActivityDashboard> =
      tab === 'secondary' ? this.dashboardService.overview()
      : tab === 'loyalty' ? this.dashboardService.loyalty()
      : this.dashboardService.activity();

    request.pipe(finalize(() => {
      this.loading = false;
      this.cdr.detectChanges();
    })).subscribe({
      next: (data: TeamDashboard | LoyaltyDashboard | ActivityDashboard) => {
        if (!data.isTeam) return;
        if (tab === 'secondary') this.team = data as TeamDashboard;
        else if (tab === 'loyalty') this.loyalty = data as LoyaltyDashboard;
        else this.activity = data as ActivityDashboard;
        this.cdr.detectChanges();
      },
      error: error => {
        // A failed tab may be retried by opening it again.
        this.loaded.delete(tab);
        this.error = error.message;
        this.cdr.detectChanges();
      }
    });
  }

  private loadDealer(): void {
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


  // ---------------------------------------------------------- team dashboard

  get fieldActivity(): OverviewActivity | null {
    if (!this.team) return null;
    return this.team.activities[this.activityRange];
  }

  get fieldActivityTotal(): number {
    const row = this.fieldActivity;
    return row ? row.retailerVisit + row.retailerMeet + row.nukkadMeet + row.fieldDemo + row.other : 0;
  }

  get activityRangeLabel(): string {
    return this.activityRange === 'today' ? 'Today' : this.activityRange === 'month' ? 'This month' : 'This year';
  }

  get target(): OverviewTarget | null {
    if (!this.team) return null;
    return this.team.target[this.targetRange];
  }

  get targetRangeLabel(): string {
    return this.targetRange === 'month' ? this.team?.target.monthLabel ?? 'This month' : `YTD ${new Date().getFullYear()}`;
  }

  /// Bar heights for the monthly sales chart, as a percentage of the best month.
  get trend(): OverviewTrendPoint[] { return this.team?.orders.trend ?? []; }

  get trendPeak(): number {
    return this.trend.reduce((peak, point) => Math.max(peak, point.value), 0);
  }

  trendHeight(point: OverviewTrendPoint): number {
    const peak = this.trendPeak;
    if (peak <= 0) return 0;
    // A month with sales always shows a sliver, so an active month is never invisible.
    return Math.max(point.value > 0 ? 3 : 0, Math.round((point.value * 100) / peak));
  }

  /// Share of a top-SKU row against the leader of its own list.
  share(value: number, rows: { quantity: number; value: number }[], valueWise: boolean): number {
    const peak = rows.reduce((best, row) => Math.max(best, valueWise ? row.value : row.quantity), 0);
    return peak <= 0 ? 0 : Math.round((value * 100) / peak);
  }

  percent(part: number, whole: number): number {
    return whole <= 0 ? 0 : Math.min(100, Math.round((part * 100) / whole));
  }

  /// Percentages above 100 still have to fit inside the bar.
  barWidth(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  compact(value: number): string {
    if (value >= 10000000) return `${(value / 10000000).toFixed(2)} Cr`;
    if (value >= 100000) return `${(value / 100000).toFixed(2)} L`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)} K`;
    return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value || 0);
  }

  orderValue(row: OverviewCount): string { return this.money(row.value); }

  get todayLabel(): string {
    return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  }


  // ------------------------------------------------------------ loyalty tab

  get loyaltyTrend(): LoyaltyTrendPoint[] { return this.loyalty?.trend ?? []; }

  get loyaltyPeak(): number {
    return this.loyaltyTrend.reduce((peak, point) => Math.max(peak, point.amount), 0);
  }

  loyaltyHeight(point: LoyaltyTrendPoint): number {
    const peak = this.loyaltyPeak;
    if (peak <= 0) return 0;
    return Math.max(point.amount > 0 ? 3 : 0, Math.round((point.amount * 100) / peak));
  }

  /// Approval chain, widest stage first, for the funnel bars.
  get loyaltyStages(): { label: string; value: number; tone: string }[] {
    const rows = this.loyalty?.invoices;
    if (!rows) return [];
    return [
      { label: 'Pending', value: rows.pending, tone: 'amber' },
      { label: 'Approved by SS', value: rows.approvedSs, tone: 'blue' },
      { label: 'Approved by Sales', value: rows.approvedSales, tone: 'purple' },
      { label: 'Approved by HO', value: rows.approvedHo, tone: 'green' },
      { label: 'Rejected', value: rows.rejected, tone: 'red' }
    ];
  }

  // ----------------------------------------------------------- activity tab

  get attendanceTrend(): AttendanceDayPoint[] { return this.activity?.attendance.trend ?? []; }

  get attendancePeak(): number {
    return this.attendanceTrend.reduce((peak, point) => Math.max(peak, point.present), 0);
  }

  attendanceHeight(point: AttendanceDayPoint): number {
    const peak = this.attendancePeak;
    if (peak <= 0) return 0;
    return Math.max(point.present > 0 ? 4 : 0, Math.round((point.present * 100) / peak));
  }

  get workingActivity(): OverviewActivity | null {
    if (!this.activity) return null;
    return this.activity.working[this.activityRange];
  }

  get workingTotal(): number {
    const row = this.workingActivity;
    return row ? row.retailerVisit + row.retailerMeet + row.nukkadMeet + row.fieldDemo + row.other : 0;
  }

  can(permission: string): boolean {
    return this.auth.hasPermission(permission);
  }
}
