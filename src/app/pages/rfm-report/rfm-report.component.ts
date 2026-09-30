import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { BranchOption, DistrictOption, ReportManagementService, ReportOption, RfmDownloadKind, RfmReportOptions } from '../../services/report-management.service';

/** The sheets these screens download. */
type RfmDownload = RfmDownloadKind;

/**
 * Reports > Customers > RFM Report.
 *
 * Download only - there is no listing, the file is the report. Four optional filters, laid
 * out like ASR Performance: the branch list follows the zone and the district list follows
 * the state, so a filter can never offer a branch outside the zone it is paired with.
 */
@Component({
  standalone: false,
  selector: 'app-rfm-report',
  templateUrl: './rfm-report.component.html',
  styleUrls: ['./rfm-report.component.scss']
})
export class RfmReportComponent implements OnInit {
  options: RfmReportOptions = { zones: [], branches: [], states: [], districts: [] };
  optionsLoading = false;

  /** The movement sheet compares this month with the one before it; both are required. */
  year: number = new Date().getFullYear();
  month: number = new Date().getMonth() + 1;

  zoneId: number | null = null;
  branchId: number | null = null;
  stateId: number | null = null;
  districtId: number | null = null;

  /** Which sheet is being prepared, if any. */
  downloading: RfmDownload | null = null;
  error = '';

  /** 'report' is the Retailer/Dealer pair; 'movement' is the month-on-month sheet. */
  mode: 'report' | 'movement' | 'activation' = 'report';

  /** Employee Status: '' both, 'Y' switched on, 'N' switched off. ASR wise only. */
  employeeStatus = '';

  /** The month filters belong to the two month-based screens. */
  get needsMonth(): boolean { return this.mode === 'movement' || this.mode === 'activation'; }

  constructor(public auth: AuthService, private service: ReportManagementService,
    private route: ActivatedRoute, private cdr: ChangeDetectorRef) {
    const routeMode = this.route.snapshot.data['rfmMode'];
    this.mode = routeMode === 'movement' || routeMode === 'activation' ? routeMode : 'report';
  }

  get zoneBranches(): BranchOption[] {
    return this.zoneId ? this.options.branches.filter(x => Number(x.zone_id) === Number(this.zoneId)) : this.options.branches;
  }

  get years(): number[] {
    const thisYear = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, index) => thisYear - index);
  }

  get months(): Array<{ id: number; name: string }> {
    return Array.from({ length: 12 }, (_, index) => ({ id: index + 1, name: new Date(2000, index, 1).toLocaleString('en', { month: 'long' }) }));
  }

  get stateDistricts(): DistrictOption[] {
    return this.stateId ? this.options.districts.filter(x => Number(x.state_id) === Number(this.stateId)) : this.options.districts;
  }

  ngOnInit(): void {
    this.optionsLoading = true;
    this.service.rfmOptions().pipe(finalize(() => {
      this.optionsLoading = false;
      this.cdr.detectChanges();
    })).subscribe({
      next: options => this.options = options,
      error: () => this.error = 'Could not load the filters. Please refresh the page.'
    });
  }

  download(kind: RfmDownload): void {
    this.error = '';
    this.downloading = kind;
    this.service.downloadRfm(kind, {
      zone_id: this.zoneId,
      branch_id: this.branchId,
      state_id: this.stateId,
      district_id: this.districtId,
      // Only the movement sheet stands on a month; the other two read every order ever.
      ...(this.needsMonth ? { year: this.year, month: this.month } : {}),
      // Only the ASR-wise activation sheet lists employees.
      ...(kind === 'activation-asr' && this.employeeStatus ? { employee_status: this.employeeStatus } : {})
    }).pipe(finalize(() => {
      this.downloading = null;
      this.cdr.detectChanges();
    })).subscribe({
      next: blob => this.saveBlob(blob, this.fileName(kind)),
      error: error => this.handleBlobError(error)
    });
  }

  private fileName(kind: RfmDownload): string {
    const month = this.months.find(x => x.id === this.month)?.name || this.month;
    if (kind === 'movement') return `RFM_Movement_${month}_${this.year}.xlsx`;
    if (kind === 'activation-asr') return `RFM_Activation_ASR_Wise_${month}_${this.year}.xlsx`;
    if (kind === 'activation-dealer') return `RFM_Activation_Dealer_Wise_${month}_${this.year}.xlsx`;
    return `RFM_Report_${kind === 'dealer' ? 'Dealer' : 'Retailer'}_Wise_${new Date().toISOString().slice(0, 10)}.xlsx`;
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
