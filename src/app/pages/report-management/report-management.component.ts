import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { AsrReportOptions, ReportManagementService, ReportMode } from '../../services/report-management.service';

@Component({ standalone: false, selector: 'app-report-management', templateUrl: './report-management.component.html', styleUrls: ['./report-management.component.scss'] })
export class ReportManagementComponent implements OnInit {
  mode: ReportMode = 'asr'; rows: Record<string, any>[] = []; summary: Record<string, any> = {}; loading = false; error = '';
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
  constructor(private route: ActivatedRoute, private service: ReportManagementService, private cdr: ChangeDetectorRef) {}
  ngOnInit(): void { this.route.data.subscribe(data => { this.mode = data['reportMode'] || 'asr'; this.mode === 'asr' ? this.loadAsrOptions() : this.mode === 'rating' ? this.loadRatingOptions() : (this.mode === 'retailer' || this.mode === 'dealer') ? this.loadProductivityOptions() : this.load(); }); }
  get title(): string { return this.mode === 'asr' ? 'ASR Performance' : this.mode === 'rating' ? 'Rating Report' : this.mode === 'retailer' ? 'Retailer Performance' : this.mode === 'dealer' ? 'Dealer Performance' : 'Market Intelligence'; }
  get isProductivity(): boolean { return this.mode === 'retailer' || this.mode === 'dealer'; }
  get years(): number[] { const current = new Date().getFullYear(); return Array.from({ length: current - 2019 }, (_, index) => current - index); }
  get months(): Array<{ id: number; name: string }> { return Array.from({ length: 12 }, (_, index) => ({ id: index + 1, name: new Date(2000, index, 1).toLocaleString('en', { month: 'long' }) })); }
  get columns(): string[] { const keys = new Set<string>(); this.visibleRows.forEach(row => Object.keys(row).forEach(key => { if (key !== 'reporting') keys.add(key); })); return [...keys]; }
  get visibleRows(): Record<string, any>[] { const q = this.search.trim().toLowerCase(); return q ? this.rows.filter(row => Object.values(row).some(value => String(value ?? '').toLowerCase().includes(q))) : this.rows; }
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
      next: options => { this.asrOptions = options; this.designationId = options.default_designation_id; },
      error: error => this.error = error?.error?.message || error.message || 'Unable to load rating report filters.'
    });
  }

  downloadRating(): void {
    if (!this.designationId || (this.month !== 'weekly' && !this.year)) { this.error = this.month === 'weekly' ? 'Designation is required.' : 'Designation and year are required.'; return; }
    this.loading = true; this.error = '';
    this.service.downloadRating({ designationId: this.designationId, year: this.year, month: this.month, divisionId: this.divisionId, branchId: this.branchId })
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
