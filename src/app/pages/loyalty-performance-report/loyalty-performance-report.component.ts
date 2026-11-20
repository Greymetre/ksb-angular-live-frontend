import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { LoyaltyPerformanceOptions, ReportManagementService, ReportOption } from '../../services/report-management.service';

type LoyaltyDownload = 'asr' | 'dealer' | 'retailer' | 'invoiced-retailer';

/**
 * Reports > Loyalty > Performance Report.
 *
 * Laid out like ASR Performance: five filters, all required, and two downloads - ASR wise
 * and Dealer wise - each behind a permission of its own.
 */
@Component({
  standalone: false,
  selector: 'app-loyalty-performance-report',
  templateUrl: './loyalty-performance-report.component.html',
  styleUrls: ['./loyalty-performance-report.component.scss']
})
export class LoyaltyPerformanceReportComponent implements OnInit {
  options: LoyaltyPerformanceOptions = { segments: [], zones: [], schemes: [], branches: [] };
  schemeOptions: ReportOption[] = [];
  optionsLoading = false;

  segmentId: number | null = null;
  /** Employee Status filter: '' both, 'Y' active only, 'N' inactive only. */
  employeeStatus = '';
  zoneIds: number[] = [];
  schemeId: number | null = null;
  startDate = '';
  endDate = '';

  downloading: LoyaltyDownload | null = null;
  error = '';

  constructor(public auth: AuthService, private service: ReportManagementService, private cdr: ChangeDetectorRef) {}

  get canDownloadAny(): boolean {
    return this.auth.hasPermission('loyalty_performance_report.export_asr')
      || this.auth.hasPermission('loyalty_performance_report.export_dealer')
      || this.auth.hasPermission('loyalty_performance_report.export_retailer')
      || this.auth.hasPermission('loyalty_performance_report.export_invoiced_retailer');
  }

  ngOnInit(): void {
    this.optionsLoading = true;
    this.service.loyaltyPerformanceOptions().pipe(finalize(() => {
      this.optionsLoading = false;
      this.cdr.detectChanges();
    })).subscribe({
      next: options => {
        this.options = options;
        this.rebuildSchemeOptions();
      },
      error: () => this.error = 'Could not load the filters. Please refresh the page.'
    });
  }

  /**
   * The scheme list is filtered by the selected zone(s): a scheme shows only when one of the
   * zones chosen here is among its "Report Zones". With no zone selected every scheme shows.
   * A scheme tagged to no zones is hidden once any zone is selected (strict).
   */
  private rebuildSchemeOptions(): void {
    const zones = this.zoneIds || [];
    this.schemeOptions = this.options.schemes
      .filter(scheme => zones.length === 0 || (scheme.zone_ids || []).some(z => zones.includes(z)))
      .map(scheme => ({ id: scheme.id, name: scheme.code ? `${scheme.name} (${scheme.code})` : scheme.name }));
    if (this.schemeId && !this.schemeOptions.some(o => o.id === this.schemeId)) this.schemeId = null;
    this.cdr.detectChanges();
  }

  onZoneChange(ids: number[]): void {
    this.zoneIds = ids;
    this.rebuildSchemeOptions();
  }

  /**
   * Picking a scheme auto-fills the date range with that scheme's own start and end
   * dates (the report period defaults to the scheme period). Both dates stay editable,
   * so the user can still narrow the range afterwards.
   */
  onSchemeChange(id: number | null): void {
    this.schemeId = id;
    const scheme = this.options.schemes.find(s => s.id === id);
    if (scheme) {
      if (scheme.start_date) this.startDate = (scheme.start_date + '').slice(0, 10);
      if (scheme.end_date) this.endDate = (scheme.end_date + '').slice(0, 10);
    }
    this.cdr.detectChanges();
  }

  download(kind: LoyaltyDownload): void {
    this.error = '';
    const invalid = this.validate();
    if (invalid) {
      this.error = invalid;
      this.cdr.detectChanges();
      return;
    }

    this.downloading = kind;
    this.service.downloadLoyaltyPerformance(kind, {
      segmentId: this.segmentId!,
      employeeStatus: this.employeeStatus || null,
      zoneIds: this.zoneIds,
      schemeId: this.schemeId!,
      startDate: this.startDate,
      endDate: this.endDate
    }).pipe(finalize(() => {
      this.downloading = null;
      this.cdr.detectChanges();
    })).subscribe({
      next: blob => this.saveBlob(blob, kind === 'asr' ? 'Loyalty_Performance_ASR_Wise.xlsx' : kind === 'dealer' ? 'Loyalty_Performance_Dealer_Wise.xlsx' : kind === 'invoiced-retailer' ? 'Loyalty_Performance_Invoiced_Retailers.xlsx' : 'Loyalty_Performance_Retailer_Wise.xlsx'),
      error: error => this.handleBlobError(error)
    });
  }

  private validate(): string {
    const missing = [
      !this.zoneIds.length && 'Zone',
      !this.schemeId && 'Scheme Name',
      !this.startDate && 'Start Date',
      !this.endDate && 'End Date'
    ].filter(Boolean);
    if (missing.length) return `Please select ${missing.join(', ')}.`;
    if (this.endDate < this.startDate) return 'End date cannot be before start date.';
    return '';
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  private handleBlobError(error: any): void {
    if (error?.error instanceof Blob) {
      error.error.text().then((text: string) => {
        try { this.error = JSON.parse(text).message || 'Report download failed.'; } catch { this.error = 'Report download failed.'; }
        this.cdr.detectChanges();
      });
      return;
    }
    this.error = error?.error?.message || error?.message || 'Report download failed.';
  }
}
