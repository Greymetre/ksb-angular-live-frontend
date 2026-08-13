import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize, timeout } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { RedemptionCustomerOption, RedemptionFilter, RedemptionItem, RedemptionSchemeOption, RedemptionService, RedemptionSummary } from '../../services/redemption.service';
import { formatKolkataDate, kolkataTodayInput } from '../../shared/utils/date-time';

interface SelectOption {
  id: number | string;
  label: string;
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
  filter: RedemptionFilter = {};
  summary: RedemptionSummary = { totalRequests: 0, approved: 0, pending: 0, rejectedOrHold: 0 };
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
    { id: 2, label: 'Rejected' },
    { id: 3, label: 'Hold' }
  ];

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
    return this.authService.hasPermission('redemption_create');
  }

  get canExport(): boolean {
    return this.authService.hasPermission('redemption_download');
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
    this.redemptionService.customers(search).subscribe({
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
      next: blob => this.downloadBlob(blob, `redemptions-${this.dateStamp()}.xlsx`),
      error: error => this.showToast(error.message, 'error')
    });
  }

  openCreateModal(): void {
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
    this.redemptionService.create({
      customer_id: this.selectedCustomer.id,
      loyalty_scheme_id: this.selectedScheme.schemeId,
      wallet_type: this.selectedWallet,
      redeem_mode: this.redeemMode,
      points: this.redeemPoints,
      bank_confirmed: this.bankConfirmed
    }).pipe(finalize(() => {
      this.saving = false;
      this.refreshView();
    })).subscribe({
      next: message => {
        this.showToast(message, 'success');
        this.showModal = false;
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
