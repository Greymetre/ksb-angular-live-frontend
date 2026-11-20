import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { BranchOption, LoyaltyPerformanceOptions, ReportManagementService, ReportOption } from '../../services/report-management.service';

/**
 * Reports > Loyalty > Wallet Report.
 *
 * Zone (multi) + Branch + Scheme filter, one export. The sheet lists every retailer with at
 * least one invoice under the scheme in the selected zone/branch, and carries its wallet
 * points - the same figures as the customer detail page's cards (redeemed = APPROVED only).
 */
@Component({
  standalone: false,
  selector: 'app-wallet-report',
  templateUrl: './wallet-report.component.html',
  styleUrls: ['./wallet-report.component.scss']
})
export class WalletReportComponent implements OnInit {
  options: LoyaltyPerformanceOptions = { segments: [], zones: [], schemes: [], branches: [] };
  schemeOptions: ReportOption[] = [];
  optionsLoading = false;

  zoneIds: number[] = [];
  branchId: number | null = null;
  schemeId: number | null = null;
  /** Employee Status filter: '' both, 'Y' active only, 'N' inactive only. */
  employeeStatus = '';

  downloading = false;
  error = '';

  constructor(public auth: AuthService, private service: ReportManagementService, private cdr: ChangeDetectorRef) {}

  /** Branches of the selected zone(s); every branch while no zone is picked. */
  get zoneBranches(): BranchOption[] {
    return this.zoneIds.length ? this.options.branches.filter(b => this.zoneIds.includes(Number(b.zone_id))) : this.options.branches;
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
   * zones chosen here is among its "Report Zones". No zone selected shows every scheme; a scheme
   * tagged to no zones is hidden once any zone is selected (strict).
   */
  private rebuildSchemeOptions(): void {
    const zones = this.zoneIds || [];
    this.schemeOptions = this.options.schemes
      .filter(scheme => zones.length === 0 || (scheme.zone_ids || []).some(z => zones.includes(z)))
      .map(scheme => ({ id: scheme.id, name: scheme.code ? `${scheme.name} (${scheme.code})` : scheme.name }));
    if (this.schemeId && !this.schemeOptions.some(o => o.id === this.schemeId)) this.schemeId = null;
    this.cdr.detectChanges();
  }

  onZoneChange(value: number[]): void {
    this.zoneIds = value;
    // A branch of another zone would contradict the zone just picked.
    if (this.branchId && !this.zoneBranches.some(b => Number(b.id) === Number(this.branchId))) this.branchId = null;
    this.rebuildSchemeOptions();
  }

  download(): void {
    this.error = '';
    const missing = [!this.zoneIds.length && 'Zone', !this.schemeId && 'Scheme Name'].filter(Boolean);
    if (missing.length) {
      this.error = `Please select ${missing.join(', ')}.`;
      this.cdr.detectChanges();
      return;
    }

    this.downloading = true;
    this.service.downloadWalletReport({
      zoneIds: this.zoneIds,
      branchId: this.branchId,
      schemeId: this.schemeId!,
      employeeStatus: this.employeeStatus || null
    }).pipe(finalize(() => {
      this.downloading = false;
      this.cdr.detectChanges();
    })).subscribe({
      next: blob => this.saveBlob(blob, 'Loyalty_Wallet_Report.xlsx'),
      error: error => this.handleBlobError(error)
    });
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
