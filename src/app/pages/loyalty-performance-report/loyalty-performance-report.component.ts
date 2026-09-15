import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { LoyaltyPerformanceOptions, ReportManagementService, ReportOption } from '../../services/report-management.service';

type LoyaltyDownload = 'asr' | 'dealer';

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
  options: LoyaltyPerformanceOptions = { segments: [], zones: [], schemes: [] };
  schemeOptions: ReportOption[] = [];
  optionsLoading = false;

  segmentId: number | null = null;
  zoneId: number | null = null;
  schemeId: number | null = null;
  startDate = '';
  endDate = '';

  downloading: LoyaltyDownload | null = null;
  error = '';

  constructor(public auth: AuthService, private service: ReportManagementService, private cdr: ChangeDetectorRef) {}

  get canDownloadAny(): boolean {
    return this.auth.hasPermission('loyalty_performance_report.export_asr')
      || this.auth.hasPermission('loyalty_performance_report.export_dealer');
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
      zoneId: this.zoneId!,
      schemeId: this.schemeId!,
      startDate: this.startDate,
      endDate: this.endDate
    }).pipe(finalize(() => {
      this.downloading = null;
      this.cdr.detectChanges();
    })).subscribe({
      next: blob => this.saveBlob(blob, kind === 'asr' ? 'Loyalty_Performance_ASR_Wise.xlsx' : 'Loyalty_Performance_Dealer_Wise.xlsx'),
      error: error => this.handleBlobError(error)
    });
  }

  private validate(): string {
    const missing = [
      !this.segmentId && 'Segment',
      !this.zoneId && 'Zone',
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
