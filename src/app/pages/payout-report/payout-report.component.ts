import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { LoyaltyPerformanceOptions, ReportManagementService, ReportOption } from '../../services/report-management.service';

/**
 * Reports > Loyalty > Payout Report.
 *
 * Same filters as the Loyalty Performance report with a single export: the Retailer Wise
 * sheet plus each retailer's payout/KYC details (bank, UPI, PAN, Aadhar, GST, proprietor).
 */
@Component({
  standalone: false,
  selector: 'app-payout-report',
  templateUrl: './payout-report.component.html',
  styleUrls: ['./payout-report.component.scss']
})
export class PayoutReportComponent implements OnInit {
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

  downloading = false;
  error = '';

  constructor(public auth: AuthService, private service: ReportManagementService, private cdr: ChangeDetectorRef) {}

  get canDownload(): boolean {
    return this.auth.hasPermission('loyalty_performance_report.export_payout');
  }

  ngOnInit(): void {
    this.optionsLoading = true;
    this.service.loyaltyPerformanceOptions().pipe(finalize(() => {
      this.optionsLoading = false;
      this.cdr.detectChanges();
    })).subscribe({
      next: options => {
        this.options = options;
        this.schemeOptions = options.schemes.map(scheme => ({
          id: scheme.id,
          name: scheme.code ? `${scheme.name} (${scheme.code})` : scheme.name
        }));
      },
      error: () => this.error = 'Could not load the filters. Please refresh the page.'
    });
  }

  download(): void {
    this.error = '';
    const invalid = this.validate();
    if (invalid) {
      this.error = invalid;
      this.cdr.detectChanges();
      return;
    }

    this.downloading = true;
    this.service.downloadLoyaltyPerformance('payout', {
      segmentId: this.segmentId!,
      employeeStatus: this.employeeStatus || null,
      zoneIds: this.zoneIds,
      schemeId: this.schemeId!,
      startDate: this.startDate,
      endDate: this.endDate
    }).pipe(finalize(() => {
      this.downloading = false;
      this.cdr.detectChanges();
    })).subscribe({
      next: blob => this.saveBlob(blob, 'Loyalty_Payout_Report.xlsx'),
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
