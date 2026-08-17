import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { AsrReportOptions, RatingDashboardFilters, RatingReportDashboard, RatingReportFilters, RatingTrendComponent, RatingTrendRow, ReportManagementService, ReportMode } from '../../services/report-management.service';
import { AuthService } from '../../services/auth.service';

@Component({ standalone: false, selector: 'app-report-management', templateUrl: './report-management.component.html', styleUrls: ['./report-management.component.scss'] })
export class ReportManagementComponent implements OnInit, OnDestroy {
  mode: ReportMode = 'asr'; rows: Record<string, any>[] = []; summary: Record<string, any> = {}; loading = false; error = '';
  showRatingFilters = false;
  ratingDashboardLoading = false;
  ratingSearch = '';
  ratingPage = 1;
  ratingPageSize = 10;
  ratingDashboard: RatingReportDashboard | null = null;
  selectedRatingEmployee: RatingTrendRow | null = null;
  selectedRatingMonthKey = '';
  private ratingSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private ratingRequestId = 0;
  branch = ''; zone = ''; search = '';
  asrOptions: AsrReportOptions = { users: [], divisions: [], branches: [], designations: [], default_designation_id: null };
  employeeId: number | null = null;
  divisionId: number | null = null;
  branchId: number | null = null;
  designationId: number | null = null;
  designationIds: number[] = [];
  designationOptions: Array<{ id: number; label: string }> = [];
  retailerId: number | null = null;
  dealerId: number | null = null;
  stateId: number | null = null;
  year = new Date().getFullYear();
  month: number | 'weekly' | null = new Date().getMonth() + 1;
  startDate = this.firstDayOfMonth();
  endDate = this.today();
  activityOptions: { zones: Array<{id:number;name:string}>; branches: Array<{id:number;name:string;zone_id?:number}>; meets: Array<{id:string;name:string}> } = { zones: [], branches: [], meets: [] };
  get activityBranches(): Array<{id:number;name:string;zone_id?:number}> { return this.divisionId ? this.activityOptions.branches.filter(x => Number(x.zone_id) === Number(this.divisionId)) : this.activityOptions.branches; }
  meet = 'retailer';
  activityPreview: any = { summary: {}, sales_engineer_wise: [], distributor_wise: [], gift_summary: [] };
  activityView: 'sales'|'distributor'|'gifts' = 'sales';
  previewLoading = false;
  constructor(private route: ActivatedRoute, private service: ReportManagementService, public auth: AuthService, private cdr: ChangeDetectorRef) {}
  ngOnInit(): void { this.route.data.subscribe(data => { this.mode = data['reportMode'] || 'asr'; this.showRatingFilters = false; this.mode === 'asr' ? this.loadAsrOptions() : this.mode === 'rating' ? this.loadRatingOptions() : (this.mode === 'retailer' || this.mode === 'dealer') ? this.loadProductivityOptions() : this.mode === 'activity' ? this.loadActivityOptions() : this.load(); }); }
  ngOnDestroy(): void { if (this.ratingSearchTimer) clearTimeout(this.ratingSearchTimer); }
  @HostListener('document:keydown.escape') closeRatingDetailsOnEscape(): void { this.closeRatingDetails(); }
  get title(): string { return this.mode === 'asr' ? 'ASR Performance' : this.mode === 'rating' ? 'Rating Report' : this.mode === 'retailer' ? 'Retailer Performance' : this.mode === 'dealer' ? 'Dealer Performance' : this.mode === 'activity' ? 'Activity Reports' : 'Market Intelligence'; }
  get isProductivity(): boolean { return this.mode === 'retailer' || this.mode === 'dealer'; }
  get years(): number[] { const current = new Date().getFullYear(); return Array.from({ length: current - 2019 }, (_, index) => current - index); }
  get months(): Array<{ id: number; name: string }> { return Array.from({ length: 12 }, (_, index) => ({ id: index + 1, name: new Date(2000, index, 1).toLocaleString('en', { month: 'long' }) })); }
  get columns(): string[] { const keys = new Set<string>(); this.visibleRows.forEach(row => Object.keys(row).forEach(key => { if (key !== 'reporting') keys.add(key); })); return [...keys]; }
  get visibleRows(): Record<string, any>[] { const q = this.search.trim().toLowerCase(); return q ? this.rows.filter(row => Object.values(row).some(value => String(value ?? '').toLowerCase().includes(q))) : this.rows; }
  get ratingRows(): RatingTrendRow[] { return this.ratingDashboard?.rows || []; }
  get selectedRatingMonth(): { key: string; label: string; full_label: string } | null {
    return this.ratingDashboard?.period.months.find(item => item.key === this.selectedRatingMonthKey) || null;
  }
  get selectedRatingComponents(): RatingTrendComponent[] {
    return this.selectedRatingEmployee?.monthly_details?.[this.selectedRatingMonthKey]?.components || [];
  }
  get selectedWeakRatingComponents(): RatingTrendComponent[] {
    return this.selectedRatingComponents.filter(item => Number(item.percentage) < 85);
  }
  load(): void { this.loading = true; this.error = ''; this.service.load(this.mode, { branch: this.branch, zone: this.zone }).pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); })).subscribe({ next: result => { this.rows = result.rows; this.summary = result.summary; }, error: error => this.error = error?.error?.message || error.message || 'Report request failed.' }); }
  label(value: string): string { return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()); }
  display(value: any): string { if (value === null || value === undefined || value === '') return '-'; if (typeof value === 'object') return Object.values(value).filter(Boolean).join(' / '); return String(value); }
  download(): void { const columns = this.columns; const quote = (value: any) => `"${this.display(value).replace(/"/g, '""')}"`; const csv = [columns.map(x => quote(this.label(x))).join(','), ...this.visibleRows.map(row => columns.map(column => quote(row[column])).join(','))].join('\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = `${this.mode}-report.csv`; link.click(); URL.revokeObjectURL(link.href); }

  loadAsrOptions(): void {
    this.loading = true; this.error = '';
    this.service.asrOptions().pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); })).subscribe({
      next: options => { this.asrOptions = options; this.designationId = options.default_designation_id; },
      error: error => this.error = error?.error?.message || error.message || 'Unable to load report filters.'
    });
  }

  loadRatingOptions(): void {
    this.loading = true; this.error = '';
    this.service.ratingOptions().pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); })).subscribe({
      next: options => { this.asrOptions = options; this.designationId = options.default_designation_id; if (this.designationId) this.loadRatingDashboard(); },
      error: error => this.error = error?.error?.message || error.message || 'Unable to load rating report filters.'
    });
  }

  ratingDashboardFilters(): RatingDashboardFilters | null {
    if (!this.designationId) {
      this.error = 'Designation is required.';
      return null;
    }
    return {
      designationId: this.designationId, divisionId: this.divisionId, branchId: this.branchId,
      search: this.ratingSearch, page: this.ratingPage, pageSize: this.ratingPageSize
    };
  }

  ratingExportFilters(): RatingReportFilters | null {
    if (!this.designationId || (this.month !== 'weekly' && !this.year)) {
      this.error = this.month === 'weekly' ? 'Designation is required.' : 'Designation and year are required.';
      return null;
    }
    return { designationId: this.designationId, year: this.year, month: this.month, divisionId: this.divisionId, branchId: this.branchId };
  }

  loadRatingDashboard(): void {
    const filters = this.ratingDashboardFilters(); if (!filters) return;
    const requestId = ++this.ratingRequestId;
    this.ratingDashboardLoading = true; this.error = '';
    this.service.ratingDashboard(filters).pipe(finalize(() => {
      if (requestId === this.ratingRequestId) { this.ratingDashboardLoading = false; this.cdr.detectChanges(); }
    })).subscribe({
      next: dashboard => {
        if (requestId !== this.ratingRequestId) return;
        this.ratingDashboard = dashboard;
        this.ratingPage = dashboard.pagination?.page || 1;
        this.ratingPageSize = dashboard.pagination?.page_size || this.ratingPageSize;
      },
      error: error => { if (requestId === this.ratingRequestId) this.error = error?.error?.message || error.message || 'Unable to load rating dashboard.'; }
    });
  }

  applyRatingFilters(): void {
    if (this.ratingSearchTimer) { clearTimeout(this.ratingSearchTimer); this.ratingSearchTimer = null; }
    this.ratingPage = 1;
    this.loadRatingDashboard();
  }

  ratingSearchChanged(value: string): void {
    this.ratingSearch = value || '';
    this.ratingPage = 1;
    if (this.ratingSearchTimer) clearTimeout(this.ratingSearchTimer);
    this.ratingSearchTimer = setTimeout(() => this.loadRatingDashboard(), 350);
  }

  ratingPageChanged(page: number): void {
    if (page === this.ratingPage) return;
    if (this.ratingSearchTimer) { clearTimeout(this.ratingSearchTimer); this.ratingSearchTimer = null; }
    this.ratingPage = page;
    this.loadRatingDashboard();
  }

  ratingPageSizeChanged(value: number): void {
    if (this.ratingSearchTimer) { clearTimeout(this.ratingSearchTimer); this.ratingSearchTimer = null; }
    const pageSize = Number(value);
    this.ratingPageSize = [10, 25, 50, 100].includes(pageSize) ? pageSize : 10;
    this.ratingPage = 1;
    this.loadRatingDashboard();
  }

  openRatingDetails(row: RatingTrendRow): void {
    this.selectedRatingEmployee = row;
    this.selectedRatingMonthKey = this.ratingDashboard?.period.months[0]?.key || Object.keys(row.monthly_ratings || {})[0] || '';
  }

  closeRatingDetails(): void {
    this.selectedRatingEmployee = null;
    this.selectedRatingMonthKey = '';
  }

  selectRatingMonth(monthKey: string): void { this.selectedRatingMonthKey = monthKey; }
  ratingBarHeight(value: any): number { return Math.max(4, Math.min(100, Number(value || 0))); }
  ratingTrendPoint(value: any): number { return Math.max(2, Math.min(98, Number(value || 0))); }
  ratingTrendPoints(employee: RatingTrendRow): string {
    const months = this.ratingDashboard?.period.months || [];
    if (!months.length) return '';
    return months.map((item, index) => {
      const x = ((index + .5) * 100) / months.length;
      const y = 100 - this.ratingTrendPoint(employee.monthly_ratings?.[item.key]);
      return `${x.toFixed(3)},${y.toFixed(3)}`;
    }).join(' ');
  }

  clearRatingFilters(): void {
    if (this.ratingSearchTimer) { clearTimeout(this.ratingSearchTimer); this.ratingSearchTimer = null; }
    this.designationId = this.asrOptions.default_designation_id;
    this.year = new Date().getFullYear(); this.month = new Date().getMonth() + 1;
    this.divisionId = null; this.branchId = null; this.ratingSearch = ''; this.ratingPage = 1; this.ratingPageSize = 10;
    this.loadRatingDashboard();
  }

  downloadRating(): void {
    const filters = this.ratingExportFilters(); if (!filters) return;
    this.loading = true; this.error = '';
    this.service.downloadRating(filters)
      .pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
      .subscribe({ next: blob => this.saveBlob(blob, this.month === 'weekly' ? 'Rating_Report_Weekly.xlsx' : this.month ? `Rating_Report_${this.year}_${String(this.month).padStart(2, '0')}.xlsx` : `Rating_Report_YTD_${this.year}.xlsx`), error: error => this.handleBlobError(error) });
  }

  downloadAsr(): void {
    if (!this.designationId || !this.startDate || !this.endDate) { this.error = 'Designation, start date and end date are required.'; return; }
    if (this.startDate > this.endDate) { this.error = 'Start date cannot be after end date.'; return; }
    this.loading = true; this.error = '';
    this.service.downloadAsr({ employeeId: this.employeeId, divisionId: this.divisionId, branchId: this.branchId, designationId: this.designationId, startDate: this.startDate, endDate: this.endDate })
      .pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
      .subscribe({ next: blob => this.saveBlob(blob, 'Asr_performance_report.xlsx'), error: error => this.handleBlobError(error) });
  }

  loadActivityOptions(): void { this.loading = true; this.error = ''; this.service.activityOptions().pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); })).subscribe({ next: options => { this.activityOptions = options; this.loadActivityPreview(); }, error: error => this.error = error?.error?.message || error.message || 'Unable to load activity report filters.' }); }
  activityFilters(): Record<string, any> { return { start_date: this.startDate, end_date: this.endDate, zone_id: this.divisionId, branch_id: this.branchId, meet: this.meet }; }
  activityFilterChanged(): void { if (this.startDate && this.endDate && this.meet && this.startDate <= this.endDate) this.loadActivityPreview(); }
  loadActivityPreview(): void { if (!this.meet) return; this.previewLoading = true; this.error = ''; this.service.activityPreview(this.activityFilters()).pipe(finalize(() => { this.previewLoading = false; this.cdr.detectChanges(); })).subscribe({ next: data => this.activityPreview = { summary: data.summary || {}, sales_engineer_wise: data.sales_engineer_wise || [], distributor_wise: data.distributor_wise || [], gift_summary: data.gift_summary || [] }, error: error => this.error = error?.error?.message || error.message || 'Unable to load activity report preview.' }); }
  downloadActivity(kind: 'sales-engineer'|'distributor'|'gift-summary'): void { if (!this.startDate || !this.endDate) { this.error = 'Date range is required.'; return; } if (!this.meet) { this.error = 'Please select a meet before downloading the report.'; return; } if (this.startDate > this.endDate) { this.error = 'Start date cannot be after end date.'; return; } this.loading = true; this.error = ''; this.service.downloadActivity(kind, this.activityFilters()).pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); })).subscribe({ next: blob => this.saveBlob(blob, `${this.selectedMeetName.replace(/\s*\/\s*|\s+/g, '_')}_${kind}_${this.startDate}_${this.endDate}.xlsx`), error: error => this.handleBlobError(error) }); }
  get selectedMeetName(): string { return this.activityOptions.meets.find(x => x.id === this.meet)?.name || 'Retailer Meet'; }
  ratingScoreClass(value: any): string { const rating = Number(value || 0); return rating >= 85 ? 'excellent' : rating >= 65 ? 'good' : rating >= 35 ? 'attention' : 'critical'; }
  fixed(value: any): string { return Number(value || 0).toFixed(2); }
  percent(value: any): string { return `${(Number(value || 0) * 100).toFixed(2)}%`; }
  money(value: any): string { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0)); }
  giftPercent(count: any): number { const max = Math.max(1, ...(this.activityPreview.gift_summary || []).map((x: any) => Number(x.count || 0))); return Math.max(4, Math.round(Number(count || 0) * 100 / max)); }

  loadProductivityOptions(): void {
    this.loading = true; this.error = '';
    this.service.productivityOptions().pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); })).subscribe({
      next: options => { this.asrOptions = options; this.designationOptions = options.designations.map(item => ({ id: item.id, label: item.name })); this.designationIds = this.mode === 'retailer' ? (options.default_retailer_designation_ids || []) : (options.default_dealer_designation_ids || []); },
      error: error => this.error = error?.error?.message || error.message || 'Unable to load report filters.'
    });
  }

  designationChange(values: Array<number | string>): void {
    this.designationIds = (values || []).map(Number).filter(value => Number.isFinite(value) && value > 0);
  }

  downloadProductivity(): void {
    if (this.mode === 'retailer' && !this.divisionId) { this.error = 'Please select a zone before downloading the report.'; return; }
    this.loading = true; this.error = '';
    const filters: Record<string, any> = { employee_id: this.employeeId, dealer_id: this.dealerId, year: this.year, designation_id: this.designationIds };
    if (this.mode === 'retailer') Object.assign(filters, { retailer_id: this.retailerId, zone_id: this.divisionId, state_id: this.stateId });
    else Object.assign(filters, { division_id: this.divisionId, branch_id: this.branchId });
    this.service.downloadProductivity(this.mode as 'retailer' | 'dealer', filters).pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); })).subscribe({
      next: blob => this.saveBlob(blob, this.mode === 'retailer' ? 'Retailer_Productivity_Report.xlsx' : 'Distributors_Productivity_Report.xlsx'), error: error => this.handleBlobError(error)
    });
  }

  private saveBlob(blob: Blob, fileName: string): void { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = fileName; link.click(); URL.revokeObjectURL(url); }
  private handleBlobError(error: any): void { if (error?.error instanceof Blob) { error.error.text().then((text: string) => { try { this.error = JSON.parse(text).message || 'Report download failed.'; } catch { this.error = 'Report download failed.'; } this.cdr.detectChanges(); }); } else this.error = error?.error?.message || error.message || 'Report download failed.'; }
  private today(): string { return new Date().toISOString().slice(0, 10); }
  private firstDayOfMonth(): string { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`; }
}
