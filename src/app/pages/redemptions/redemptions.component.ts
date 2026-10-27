import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { finalize, timeout } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { RedemptionCustomerOption, RedemptionFilter, RedemptionImportResult, RedemptionItem, RedemptionSchemeOption, RedemptionService, RedemptionSummary } from '../../services/redemption.service';
import { formatKolkataDate, kolkataTodayInput } from '../../shared/utils/date-time';

interface SelectOption {
  id: number | string;
  label: string;
}

/** A SweetAlert-style popup, mirroring the one the Orders screen uses, with up to two inputs. */
interface SwalModel {
  visible: boolean;
  title: string;
  text: string;
  icon: 'warning' | 'success' | 'error' | 'info' | 'question';
  confirmText: string;
  cancelText: string;
  showCancel: boolean;
  input: boolean;
  inputLabel: string;
  inputValue: string;
  inputPlaceholder: string;
  inputType: 'text' | 'number';
  input2: boolean;
  input2Label: string;
  input2Value: string;
  input2Placeholder: string;
  input2Type: 'text' | 'number';
  inputError: string;
  // For the Success popup: show a live "Final Payable" computed from points and the TDS % in input2.
  showFinal: boolean;
  points: number;
  resolver?: (result: { isConfirmed: boolean; value?: string; value2?: string }) => void;
}

@Component({
  standalone: false,
  selector: 'app-redemptions',
  templateUrl: './redemptions.component.html',
  styleUrls: ['./redemptions.component.scss']
})
export class RedemptionsComponent implements OnInit {
  redemptions: RedemptionItem[] = [];
  customers: RedemptionCustomerOption[] = [];
  customerOptions: SelectOption[] = [];
  customersLoading = false;
  filter: RedemptionFilter = {};
  summary: RedemptionSummary = { totalRequests: 0, approved: 0, pending: 0, rejectedOrHold: 0, hold: 0, success: 0, failed: 0 };
  loading = false;
  exporting = false;
  saving = false;
  showFilters = false;
  showModal = false;
  step = 1;
  selectedCustomer: RedemptionCustomerOption | null = null;
  selectedWallet: 'Regular' | 'Booster' | null = null;
  selectedScheme: RedemptionSchemeOption | null = null;
  redeemMode: 'NEFT' | 'IMPS' | null = null;
  bankConfirmed = false;
  redeemPoints: number | null = null;
  errorMessage = '';
  toast = { visible: false, message: '', type: 'success' as 'success' | 'error' };
  private toastTimeoutId?: number;
  private filterSearchTimeoutId?: number;

  readonly statusOptions: SelectOption[] = [
    { id: '', label: 'All Status' },
    { id: 0, label: 'Pending' },
    { id: 1, label: 'Approved' },
    { id: 2, label: 'Rejected' }
  ];

  // Detail popup (View) + per-row action state.
  showDetail = false;
  detailRow: RedemptionItem | null = null;
  actionBusy = false;
  // When set, the wizard modal is editing this redemption instead of creating a new one.
  editId: number | null = null;
  swal: SwalModel = this.emptySwal();

  readonly modeOptions: SelectOption[] = [
    { id: '', label: 'All Modes' },
    { id: 'NEFT', label: 'NEFT' },
    { id: 'IMPS', label: 'IMPS' }
  ];

  constructor(
    private redemptionService: RedemptionService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadRedemptions();
    this.loadCustomers();
  }

  get canCreate(): boolean {
    return this.authService.hasPermission('redemption.create');
  }

  get canExport(): boolean {
    return this.authService.hasPermission('redemption.export');
  }

  get canImport(): boolean {
    return this.authService.hasPermission('redemption.import');
  }

  get canUpdateImport(): boolean {
    return this.authService.hasPermission('redemption.update');
  }

  get canView(): boolean {
    return this.authService.hasPermission('redemption.view');
  }

  get canEdit(): boolean {
    return this.authService.hasPermission('redemption.edit');
  }

  get canDelete(): boolean {
    return this.authService.hasPermission('redemption.delete');
  }

  get canApprove(): boolean {
    return this.authService.hasPermission('redemption.approve');
  }

  get canReject(): boolean {
    return this.authService.hasPermission('redemption.reject');
  }

  get canReopen(): boolean {
    return this.authService.hasPermission('redemption.reopen');
  }

  get canHold(): boolean {
    return this.authService.hasPermission('redemption.hold');
  }

  get canSuccess(): boolean {
    return this.authService.hasPermission('redemption.success');
  }

  get canFailed(): boolean {
    return this.authService.hasPermission('redemption.failed');
  }

  /** True when the Action column should render at all (any of its buttons is permitted). */
  get showActionsColumn(): boolean {
    return this.canView || this.canEdit || this.canDelete;
  }

  get isSuperAdmin(): boolean {
    return this.authService.isSuperAdminUser();
  }

  readonly STATUS_PENDING = 0;
  readonly STATUS_APPROVED = 1;
  readonly STATUS_REJECTED = 2;
  readonly STATUS_HOLD = 3;
  readonly STATUS_SUCCESS = 4;
  readonly STATUS_FAILED = 5;

  /** Edit/Delete are limited to Pending rows for everyone except superadmin (who can act anytime). */
  canEditRow(row: RedemptionItem): boolean {
    return this.canEdit && (this.isSuperAdmin || row.status === this.STATUS_PENDING);
  }

  canDeleteRow(row: RedemptionItem): boolean {
    return this.canDelete && (this.isSuperAdmin || row.status === this.STATUS_PENDING);
  }

  openDetail(row: RedemptionItem): void {
    this.detailRow = row;
    this.showDetail = true;
    this.refreshView();
  }

  /**
   * Opens the SAME wizard as Create, pre-filled from the row, in edit mode. Every step and every
   * validation is identical to Create - only the fields arrive filled and can be changed.
   */
  openEdit(row: RedemptionItem): void {
    if (!this.canEditRow(row)) return;
    this.editId = row.id;
    this.step = 1;
    this.selectedCustomer = null;
    this.selectedWallet = null;
    this.selectedScheme = null;
    this.redeemMode = null;
    this.bankConfirmed = false;
    this.redeemPoints = null;
    this.showModal = true;
    this.customersLoading = true;
    this.refreshView();

    // Fetch this customer (with its wallets + schemes) so the wizard can be pre-filled.
    const search = row.mobileNumber || row.customerCode || row.customerName;
    this.redemptionService.customers(search).pipe(finalize(() => { this.customersLoading = false; this.refreshView(); })).subscribe({
      next: customers => {
        this.customers = customers;
        this.customerOptions = customers.map(customer => ({ id: customer.id, label: this.customerLabel(customer) }));
        const match = customers.find(customer => customer.id === row.customerId) || null;
        this.selectedCustomer = match;
        if (match) {
          this.selectedWallet = row.walletType === 'Booster' ? 'Booster' : 'Regular';
          const list = this.selectedWallet === 'Booster' ? match.boosterSchemes : match.regularSchemes;
          let scheme = list.find(s => s.schemeId === row.loyaltySchemeId) || list.find(s => s.schemeName === row.schemeName) || null;
          if (scheme) {
            // Available already has THIS redemption subtracted - add its points back so the user can
            // keep or raise the amount up to the real allowance (mirrors the backend).
            scheme.availablePoints = scheme.availablePoints + row.points;
          } else {
            // The scheme was fully consumed by this redemption (so it was filtered out) - rebuild it
            // from the row; the allowance is exactly the points this redemption is holding.
            scheme = { schemeId: row.loyaltySchemeId ?? null, schemeName: row.schemeName, walletType: this.selectedWallet, earnedPoints: 0, redeemedPoints: 0, availablePoints: row.points };
            list.push(scheme);
          }
          this.selectedScheme = scheme;
          this.redeemMode = row.redeemMode === 'IMPS' ? 'IMPS' : 'NEFT';
          this.redeemPoints = row.points;
          this.bankConfirmed = true;
        }
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  closeDetail(): void {
    if (this.actionBusy) return;
    this.showDetail = false;
    this.detailRow = null;
    this.refreshView();
  }

  payoutLabel(state: string): string {
    switch (state) {
      case 'hold': return 'Hold';
      case 'success': return 'Success';
      case 'failed': return 'Failed';
      case 'pending': return 'Move to Pending';
      default: return state;
    }
  }

  payoutIcon(state: string): string {
    switch (state) {
      case 'hold': return 'pause_circle';
      case 'success': return 'check_circle';
      case 'failed': return 'cancel';
      case 'pending': return 'undo';
      default: return 'bolt';
    }
  }

  /** Which payout actions the detail popup should offer for a given status. Each action is gated
   *  by its own permission (hold/success/failed/reopen), so unpermitted ones are dropped. */
  payoutActions(status: number): string[] {
    let actions: string[];
    switch (status) {
      case this.STATUS_APPROVED: actions = ['hold', 'success', 'failed']; break;
      case this.STATUS_HOLD: actions = ['success', 'failed', 'pending']; break;
      case this.STATUS_FAILED: actions = ['success', 'hold', 'pending']; break;
      case this.STATUS_SUCCESS: actions = ['pending']; break;
      default: actions = [];
    }
    const allowed: Record<string, boolean> = {
      hold: this.canHold,
      success: this.canSuccess,
      failed: this.canFailed,
      pending: this.canReopen
    };
    return actions.filter(a => allowed[a]);
  }

  async approveRow(row: RedemptionItem): Promise<void> {
    if (this.actionBusy || !this.canApprove) return;
    const result = await this.fireSwal({ title: 'Approve redemption?', text: `${row.transactionNo} will be approved.`, icon: 'question', confirmText: 'Yes, approve', cancelText: 'Cancel' });
    if (!result.isConfirmed) return;
    this.runAction(this.redemptionService.approve(row.id));
  }

  async rejectRow(row: RedemptionItem): Promise<void> {
    if (this.actionBusy || !this.canReject) return;
    const result = await this.fireSwal({ title: 'Reject redemption?', text: 'Add a short reason for the rejection.', icon: 'warning', confirmText: 'Reject', cancelText: 'Cancel', input: true, inputLabel: 'Reason', inputPlaceholder: 'Reason for rejection', inputValue: row.remark || '' });
    if (!result.isConfirmed) return;
    this.runAction(this.redemptionService.reject(row.id, result.value));
  }

  async deleteRow(row: RedemptionItem): Promise<void> {
    if (this.actionBusy || !this.canDelete) return;
    const result = await this.fireSwal({ title: 'Delete redemption?', text: `${row.transactionNo} will be deleted. This cannot be undone.`, icon: 'error', confirmText: 'Yes, delete', cancelText: 'Cancel' });
    if (!result.isConfirmed) return;
    this.runAction(this.redemptionService.delete(row.id));
  }

  /** Hold / Success / Failed / re-Pending - driven by the single payout endpoint. */
  async payoutRow(row: RedemptionItem, state: string): Promise<void> {
    if (this.actionBusy || !this.canApprove) return;
    const body: { state: string; remark?: string; transaction_no?: string; tds_percent?: number } = { state };

    if (state === 'hold' || state === 'failed') {
      const isHold = state === 'hold';
      const result = await this.fireSwal({
        title: isHold ? 'Put on hold?' : 'Mark as failed?',
        text: isHold ? 'Add a note for why this is on hold.' : 'Add a note for why the payout failed.',
        icon: 'warning', confirmText: isHold ? 'Hold' : 'Mark failed', cancelText: 'Cancel',
        input: true, inputLabel: 'Note', inputPlaceholder: 'Note', inputValue: row.remark || ''
      });
      if (!result.isConfirmed) return;
      body.remark = result.value;
    } else if (state === 'success') {
      const result = await this.fireSwal({
        title: 'Mark as success?', text: 'Enter the payout transaction number and TDS %. The final payable is calculated for you.',
        icon: 'success', confirmText: 'Mark success', cancelText: 'Cancel',
        input: true, inputLabel: 'UTR / Transaction number', inputPlaceholder: 'e.g. UTR / reference number',
        input2: true, input2Label: 'TDS %', input2Placeholder: '0', input2Type: 'number', input2Value: '0',
        showFinal: true, points: row.points
      });
      if (!result.isConfirmed) return;
      body.transaction_no = result.value;
      body.tds_percent = Number(result.value2) || 0;
    } else if (state === 'pending') {
      const result = await this.fireSwal({ title: 'Move back to pending?', text: `${row.transactionNo} will return to Pending.`, icon: 'question', confirmText: 'Yes', cancelText: 'Cancel' });
      if (!result.isConfirmed) return;
    }

    this.runAction(this.redemptionService.payout(row.id, body));
  }

  /** Shared completion: toast, close the popup, refresh the list. */
  private runAction(request$: Observable<string>): void {
    this.actionBusy = true;
    this.refreshView();
    request$.pipe(finalize(() => { this.actionBusy = false; this.refreshView(); })).subscribe({
      next: message => {
        this.showToast(message, 'success');
        // Close the detail popup directly - closeDetail() would bail out here because actionBusy
        // is still true until finalize runs.
        this.showDetail = false;
        this.detailRow = null;
        this.loadRedemptions();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  // ---- SweetAlert-style popup (same behaviour as the Orders screen) ----
  private fireSwal(options: Partial<Omit<SwalModel, 'visible' | 'resolver'>>): Promise<{ isConfirmed: boolean; value?: string; value2?: string }> {
    return new Promise(resolve => {
      this.swal = { ...this.emptySwal(), ...options, visible: true, resolver: resolve };
      this.refreshView();
    });
  }

  confirmSwal(): void {
    if (this.swal.input && !this.swal.inputValue.trim()) { this.swal = { ...this.swal, inputError: 'This field is required.' }; this.refreshView(); return; }
    if (this.swal.input2 && !this.swal.input2Value.trim()) { this.swal = { ...this.swal, inputError: 'This field is required.' }; this.refreshView(); return; }
    this.swal.resolver?.({ isConfirmed: true, value: this.swal.inputValue.trim(), value2: this.swal.input2Value.trim() });
    this.swal = this.emptySwal();
    this.refreshView();
  }

  cancelSwal(): void {
    this.swal.resolver?.({ isConfirmed: false });
    this.swal = this.emptySwal();
    this.refreshView();
  }

  private emptySwal(): SwalModel {
    return {
      visible: false, title: '', text: '', icon: 'warning', confirmText: 'Yes', cancelText: 'Cancel', showCancel: true,
      input: false, inputLabel: '', inputValue: '', inputPlaceholder: '', inputType: 'text',
      input2: false, input2Label: '', input2Value: '', input2Placeholder: '', input2Type: 'text', inputError: '',
      showFinal: false, points: 0
    };
  }

  /** Re-render the popup on each keystroke (the app is zoneless, so the computed value needs this). */
  onSwalChange(): void { this.cdr.detectChanges(); }

  /** Live "Final Payable" for the Success popup: points minus the TDS % entered in input2. */
  swalFinalPayable(): number {
    const tds = Math.min(100, Math.max(0, Number(this.swal.input2Value) || 0));
    const deduction = Math.round((this.swal.points * tds / 100) * 100) / 100;
    return this.swal.points - deduction;
  }

  importing = false;
  importResult: RedemptionImportResult | null = null;
  showImportResult = false;

  downloadTemplate(): void {
    this.redemptionService.downloadTemplate().subscribe({
      next: blob => this.downloadBlob(blob, 'Redemption Import Template.xlsx'),
      error: error => this.showToast(error.message, 'error')
    });
  }

  onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importing = true;
    this.refreshView();
    this.redemptionService.import(file).pipe(finalize(() => {
      this.importing = false;
      input.value = '';
      this.refreshView();
    })).subscribe({
      next: result => {
        this.importResult = result;
        this.showImportResult = true;
        this.loadRedemptions();
        this.showToast(`Import done: ${result.created} created, ${result.failed} failed.`, result.failed > 0 ? 'error' : 'success');
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  onUpdateImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importing = true;
    this.refreshView();
    this.redemptionService.updateImport(file).pipe(finalize(() => {
      this.importing = false;
      input.value = '';
      this.refreshView();
    })).subscribe({
      next: result => {
        this.importResult = result;
        this.showImportResult = true;
        this.loadRedemptions();
        this.showToast(`Update done: ${result.created} updated, ${result.failed} failed.`, result.failed > 0 ? 'error' : 'success');
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  closeImportResult(): void {
    this.showImportResult = false;
    this.importResult = null;
    this.refreshView();
  }

  get availableSchemes(): RedemptionSchemeOption[] {
    if (!this.selectedCustomer || !this.selectedWallet) return [];
    return this.selectedWallet === 'Booster' ? this.selectedCustomer.boosterSchemes : this.selectedCustomer.regularSchemes;
  }

  get selectedWalletPoints(): number {
    if (!this.selectedCustomer || !this.selectedWallet) return 0;
    return this.selectedWallet === 'Booster' ? this.selectedCustomer.boosterPoints : this.selectedCustomer.regularPoints;
  }

  get canSubmit(): boolean {
    return !!this.selectedCustomer && !!this.selectedScheme && !!this.redeemMode && this.bankConfirmed
      && !!this.redeemPoints && this.redeemPoints >= 500 && this.redeemPoints <= this.selectedScheme.availablePoints;
  }

  loadRedemptions(): void {
    this.loading = true;
    this.errorMessage = '';
    this.redemptionService.list(this.filter).pipe(
      timeout(20000),
      finalize(() => {
        this.loading = false;
        this.refreshView();
      })
    ).subscribe({
      next: result => {
        this.redemptions = result.redemptions;
        this.summary = result.summary;
      },
      error: error => this.errorMessage = error.message
    });
  }

  loadCustomers(search = ''): void {
    this.customersLoading = true;
    this.refreshView();
    this.redemptionService.customers(search).pipe(finalize(() => {
      this.customersLoading = false;
      this.refreshView();
    })).subscribe({
      next: customers => {
        this.customers = customers;
        this.customerOptions = customers.map(customer => ({ id: customer.id, label: this.customerLabel(customer) }));
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  exportRedemptions(): void {
    this.exporting = true;
    this.redemptionService.export(this.filter).pipe(finalize(() => {
      this.exporting = false;
      this.refreshView();
    })).subscribe({
      next: blob => this.downloadBlob(blob, 'Redemption Report.xlsx'),
      error: error => this.showToast(error.message, 'error')
    });
  }

  openCreateModal(): void {
    this.editId = null;
    this.step = 1;
    this.selectedCustomer = null;
    this.selectedWallet = null;
    this.selectedScheme = null;
    this.redeemMode = null;
    this.bankConfirmed = false;
    this.redeemPoints = null;
    this.showModal = true;
    this.refreshView();
  }

  closeModal(): void {
    if (this.saving) return;
    this.showModal = false;
    this.editId = null;
    this.refreshView();
  }

  selectCustomer(id: number | string | null): void {
    const customerId = Number(id || 0);
    this.selectedCustomer = this.customers.find(customer => customer.id === customerId) || null;
    this.selectedWallet = null;
    this.selectedScheme = null;
    this.redeemMode = null;
    this.bankConfirmed = false;
    this.redeemPoints = null;
    this.refreshView();
  }

  setStep(step: number): void {
    this.step = step;
    this.refreshView();
  }

  selectWallet(wallet: 'Regular' | 'Booster'): void {
    this.selectedWallet = wallet;
    this.selectedScheme = null;
    this.redeemPoints = null;
  }

  selectScheme(scheme: RedemptionSchemeOption): void {
    this.selectedScheme = scheme;
    this.redeemPoints = null;
  }

  selectMode(mode: 'NEFT' | 'IMPS'): void {
    this.redeemMode = mode;
  }

  submit(): void {
    if (!this.canSubmit || !this.selectedCustomer || !this.selectedScheme || !this.selectedWallet || !this.redeemMode || !this.redeemPoints) return;
    this.saving = true;
    const payload = {
      customer_id: this.selectedCustomer.id,
      loyalty_scheme_id: this.selectedScheme.schemeId,
      wallet_type: this.selectedWallet,
      redeem_mode: this.redeemMode,
      points: this.redeemPoints,
      bank_confirmed: this.bankConfirmed
    };
    const request$ = this.editId
      ? this.redemptionService.update(this.editId, payload)
      : this.redemptionService.create(payload);
    request$.pipe(finalize(() => {
      this.saving = false;
      this.refreshView();
    })).subscribe({
      next: message => {
        this.showToast(message, 'success');
        this.showModal = false;
        this.editId = null;
        this.loadRedemptions();
        this.loadCustomers();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  onStatusFilterChange(value: number | string | null): void {
    this.filter.status = value === '' || value === null ? null : Number(value);
    this.loadRedemptions();
  }

  /** Clicking a summary card filters the list by that status (Total clears the filter). */
  filterByStatus(status: number | null): void {
    this.filter.status = status;
    this.loadRedemptions();
  }

  onModeFilterChange(value: number | string | null): void {
    this.filter.redeem_mode = value ? String(value) : '';
    this.loadRedemptions();
  }

  scheduleFilterSearch(): void {
    if (this.filterSearchTimeoutId) window.clearTimeout(this.filterSearchTimeoutId);
    this.filterSearchTimeoutId = window.setTimeout(() => {
      this.loadRedemptions();
      this.refreshView();
    }, 400);
  }

  customerLabel(customer: RedemptionCustomerOption): string {
    return [customer.name, customer.shopName, customer.mobileNumber].filter(Boolean).join(' - ');
  }

  statusClass(status: number): string {
    return `status-${status}`;
  }

  rowTdsAmount(row: RedemptionItem): number {
    const tds = row.tdsPercent || 0;
    return Math.round((row.points * tds / 100) * 100) / 100;
  }

  rowPayable(row: RedemptionItem): number {
    return row.points - this.rowTdsAmount(row);
  }

  formatDate(value?: string | null): string {
    return formatKolkataDate(value, '-');
  }

  stepTitle(): string {
    return ['Customer', 'KYC', 'Wallet', 'Mode', 'Submit'][this.step - 1] || 'Redemption';
  }

  kycStatusLabel(customer: RedemptionCustomerOption): string {
    if (customer.kycApproved) return 'KYC Approved';
    switch ((customer.kycState || '').toLowerCase()) {
      case 'missing': return 'Documents Required';
      case 'rejected': return 'KYC Rejected';
      case 'pending': return 'Approval Pending';
      default: return 'KYC Pending';
    }
  }

  kycStatusClass(customer: RedemptionCustomerOption): string {
    if (customer.kycApproved) return 'approved';
    const state = (customer.kycState || '').toLowerCase();
    return state === 'missing' || state === 'rejected' ? state : 'pending';
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    if (!message) return;
    this.toast = { visible: true, message, type };
    if (this.toastTimeoutId) window.clearTimeout(this.toastTimeoutId);
    this.toastTimeoutId = window.setTimeout(() => {
      this.toast = { ...this.toast, visible: false };
      this.refreshView();
    }, 3500);
    this.refreshView();
  }

  private refreshView(): void {
    this.cdr.detectChanges();
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  private dateStamp(): string {
    return kolkataTodayInput().replace(/-/g, '');
  }
}
