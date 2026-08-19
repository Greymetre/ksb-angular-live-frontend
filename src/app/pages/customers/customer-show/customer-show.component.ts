import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, timeout } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { CustomerItem, CustomerService } from '../../../services/customer.service';
import { NewInvoiceItem, NewInvoiceService } from '../../../services/new-invoice.service';
import { RedemptionItem, RedemptionService } from '../../../services/redemption.service';
import { UserService } from '../../../services/user.service';
import { API_ORIGIN } from '../../../config/api.config';
import { formatKolkataDate, formatKolkataDateTime } from '../../../shared/utils/date-time';

interface InfoRow {
  label: string;
  value: string | null | undefined;
}

interface PointCard {
  label: string;
  value: number;
  tone: 'primary' | 'success' | 'danger' | 'info';
}

interface TabItem {
  id: string;
  label: string;
  icon: string;
}

interface KycDocument {
  key: string;
  label: string;
  url: string;
  rows: InfoRow[];
  status: 'pending' | 'approved' | 'rejected';
  remark: string;
  actionBy: string;
  actionAt: string;
}

interface KycDialogModel {
  visible: boolean;
  action: 'approve' | 'reject' | null;
  document: KycDocument | null;
  remark: string;
}

@Component({
  standalone: false,
  selector: 'app-customer-show',
  templateUrl: './customer-show.component.html',
  styleUrls: ['./customer-show.component.scss']
})
export class CustomerShowComponent implements OnInit {
  customer: CustomerItem | null = null;
  invoices: NewInvoiceItem[] = [];
  redemptions: RedemptionItem[] = [];
  loading = false;
  loadingTransactions = false;
  loadingRedemptions = false;
  errorMessage = '';
  activeTab = 'details';
  transactionSchemeTag: 'Regular' | 'Booster' = 'Regular';
  redemptionWallet: 'Regular' | 'Booster' = 'Regular';
  selectedKycDocument: KycDocument | null = null;
  kycDialog: KycDialogModel = this.emptyKycDialog();
  savingKyc = false;
  toast = { visible: false, message: '', type: 'success' as 'success' | 'error' };
  private lookupLabels: Record<string, string> = {};
  private readonly backendOrigin = this.resolveBackendOrigin();
  private toastTimeoutId?: number;
  private readonly curatedCustomKeys = new Set([
    'first_name', 'last_name', 'owner_name', 'mobile_number', 'mobile_numbers', 'whatsapp_number', 'alternate_mobile',
    'gender', 'address1', 'address_line', 'shipping_address', 'belt_area_market_name', 'gps_location',
    'customer_type', 'name', 'mobile', 'email', 'customer_code', 'distributor_code', 'legal_name', 'shop_name',
    'trade_name', 'parent_id', 'distributor_name', 'distributor_name_name', 'agri_distributor',
    'agri_distributor_name', 'beat_id', 'beat_id_name', 'beat_name', 'beat_route', 'manager_name', 'manager_phone', 'contact_person',
    'registration_type', 'business_status', 'business_start_date', 'customer_segment', 'sales_executive_id',
    'supervisor_id', 'employee_id', 'gst_number', 'gstin_no', 'pan_number', 'pan_no', 'aadhar_no',
    'aadhaar_no', 'aadhaar_number', 'aadhar_number', 'bank_account_type', 'bank_name', 'bank_account_number',
    'bank_account_number_confirm', 'ifsc_code', 'account_holder_name', 'profile_image', 'shop_image',
    'shop_photo', 'gst_attachment', 'gst_image', 'pan_attachment', 'pan_image', 'aadhar_attachment',
    'aadhaar_attachment', 'adharcard', 'bank_proof', 'blank_cheque', 'passbook', 'mou_file', 'documents',
    'country_id', 'state_id', 'district_id', 'city_id', 'pincode_id', 'created_by', 'updated_by',
    'gst_kyc_status', 'gst_kyc_remark', 'gst_kyc_action_by', 'gst_kyc_action_by_name', 'gst_kyc_action_at',
    'pan_kyc_status', 'pan_kyc_remark', 'pan_kyc_action_by', 'pan_kyc_action_by_name', 'pan_kyc_action_at',
    'aadhar_kyc_status', 'aadhar_kyc_remark', 'aadhar_kyc_action_by', 'aadhar_kyc_action_by_name', 'aadhar_kyc_action_at',
    'bank_kyc_status', 'bank_kyc_remark', 'bank_kyc_action_by', 'bank_kyc_action_by_name', 'bank_kyc_action_at'
  ]);

  readonly tabs: TabItem[] = [
    { id: 'details', label: 'Details', icon: 'preview' },
    { id: 'orders', label: 'Orders', icon: 'add_shopping_cart' },
    { id: 'sales', label: 'Sales', icon: 'shopping_bag' },
    { id: 'payments', label: 'Payments', icon: 'currency_rupee' },
    { id: 'activity', label: 'Activity', icon: 'add_task' },
    { id: 'kyc', label: 'KYC', icon: 'verified' },
    { id: 'transaction', label: 'Transaction', icon: 'payment' },
    { id: 'redemption', label: 'Redemption', icon: 'account_balance_wallet' }
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private customerService: CustomerService,
    private newInvoiceService: NewInvoiceService,
    private redemptionService: RedemptionService,
    private userService: UserService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isFinite(id) || id <= 0) {
      this.errorMessage = 'Customer not found.';
      return;
    }
    this.loadCustomer(id);
    this.loadLookupOptions();
  }

  get displayName(): string {
    if (!this.customer) return '';
    return this.field('legal_name') || this.field('shop_name') || this.field('owner_name') || this.customer.name;
  }

  get imageUrl(): string {
    if (!this.customer) return 'assets/img/images-placeholder.png';
    return this.mediaUrl(this.field('shop_photo') || this.customer.shopImage || this.field('shop_image') || this.customer.profileImage || this.field('profile_image')) || 'assets/img/images-placeholder.png';
  }

  get pointCards(): PointCard[] {
    return [
      { label: 'Total Points', value: this.customer?.totalPoints || 0, tone: 'primary' },
      { label: 'Total Regular Points', value: this.customer?.totalRegularPoints || 0, tone: 'primary' },
      { label: 'Total Booster Points', value: this.customer?.totalBoosterPoints || 0, tone: 'primary' },
      { label: 'Total Redeem Point', value: this.customer?.totalRedeemPoints || 0, tone: 'success' },
      { label: 'Total Rejected Point', value: this.customer?.totalRejectedPoints || 0, tone: 'danger' },
      { label: 'Total Balance Point', value: this.customer?.totalBalancePoints || 0, tone: 'info' }
    ];
  }

  get personalRows(): InfoRow[] {
    if (!this.customer) return [];
    return this.presentRows([
      { label: 'Full Name', value: [this.field('first_name'), this.field('last_name')].filter(Boolean).join(' ') || this.customer.name },
      { label: 'Owner Name', value: this.field('owner_name') },
      { label: 'Mobile', value: this.customer.mobile || this.field('mobile_number') || this.field('mobile_numbers') },
      { label: 'WhatsApp / Alternate', value: this.customer.contactNumber || this.field('whatsapp_number') || this.field('alternate_mobile') },
      { label: 'Email', value: this.customer.email },
      { label: 'Gender', value: this.field('gender') }
    ]);
  }

  get addressRows(): InfoRow[] {
    if (!this.customer) return [];
    return this.presentRows([
      { label: 'Address', value: this.field('address1') || this.field('address_line') },
      { label: 'Shipping Address', value: this.field('shipping_address') },
      { label: 'Country', value: this.customer.countryName },
      { label: 'State', value: this.customer.stateName },
      { label: 'District', value: this.customer.districtName },
      { label: 'City', value: this.customer.cityName },
      { label: 'Pincode', value: this.customer.pincode },
      { label: 'Market', value: this.field('belt_area_market_name') },
      { label: 'GPS Location', value: this.field('gps_location') }
    ]);
  }

  get customerRows(): InfoRow[] {
    if (!this.customer) return [];
    return this.presentRows([
      { label: 'Customer Type', value: this.customer.customerTypeName },
      { label: 'Customer Code', value: this.customer.customerCode || this.field('distributor_code') },
      { label: 'Legal Name', value: this.field('legal_name') },
      { label: 'Shop Name', value: this.field('shop_name') },
      { label: 'Trade / Business Name', value: this.field('trade_name') },
      { label: 'Primary Contact Person', value: this.field('contact_person') },
      { label: 'Parent', value: this.customer.parentName },
      { label: 'Dealer', value: this.lookupName('distributor_name') },
      { label: 'Agri Dealer', value: this.lookupName('agri_distributor') },
      { label: 'Beat', value: this.field('beat_id_name') || this.field('beat_name') || this.field('beat_route') || this.field('beat_id') },
      { label: 'Assigned Sales Executive', value: this.lookupName('sales_executive_id') },
      { label: 'Supervisor / ASM / RSM', value: this.lookupName('supervisor_id') },
      { label: 'Employee', value: this.lookupName('employee_id') },
      { label: 'Manager Name', value: this.field('manager_name') },
      { label: 'Manager Phone', value: this.field('manager_phone') },
      { label: 'Created By', value: this.customer.createdByName || this.customer.createdBy?.toString() },
      { label: 'Created At', value: this.formatDate(this.customer.createdAt) }
    ]);
  }

  get complianceRows(): InfoRow[] {
    return this.presentRows([
      { label: 'GST Number', value: this.field('gst_number') || this.field('gstin_no') },
      { label: 'PAN Number', value: this.field('pan_number') || this.field('pan_no') },
      { label: 'Aadhaar Number', value: this.firstField('aadhar_no', 'aadhaar_no', 'aadhaar_number', 'aadhar_number') },
      { label: 'Registration Type', value: this.field('registration_type') },
      { label: 'Business Status', value: this.field('business_status') },
      { label: 'Business Start Date', value: this.field('business_start_date') },
      { label: 'Customer Segment', value: this.field('customer_segment') }
    ]);
  }

  get bankRows(): InfoRow[] {
    return this.presentRows([
      { label: 'Bank Account Type', value: this.field('bank_account_type') },
      { label: 'Bank Name', value: this.field('bank_name') },
      { label: 'Account Number', value: this.field('bank_account_number') },
      { label: 'IFSC Code', value: this.field('ifsc_code') },
      { label: 'Account Holder Name', value: this.field('account_holder_name') }
    ]);
  }

  get kycDocuments(): KycDocument[] {
    return [
      this.kycDocument('gst', 'GST', this.firstField('gst_attachment', 'gst_image'), [
        { label: 'GST Number', value: this.field('gst_number') || this.field('gstin_no') }
      ]),
      this.kycDocument('pan', 'PAN', this.firstField('pan_attachment', 'pan_image'), [
        { label: 'PAN Number', value: this.field('pan_number') || this.field('pan_no') }
      ]),
      this.kycDocument('aadhar', 'Aadhaar Card', this.firstField('aadhar_attachment', 'aadhaar_attachment', 'adharcard'), [
        { label: 'Aadhaar Number', value: this.firstField('aadhar_no', 'aadhaar_no', 'aadhaar_number', 'aadhar_number') }
      ]),
      this.kycDocument('bank', 'Blank Cheque / Passbook', this.firstField('bank_proof', 'blank_cheque', 'passbook'), this.bankRows)
    ].filter(document => !!document.url || document.rows.length > 0);
  }

  get canApproveKyc(): boolean {
    return this.authService.hasPermission('customer_kyc_access');
  }

  get customRows(): InfoRow[] {
    if (!this.customer) return [];
    return Object.entries(this.customer.customFields)
      .filter(([key, value]) => !this.curatedCustomKeys.has(key) && !!value)
      .map(([key, value]) => ({ label: this.titleCase(key), value }));
  }

  get filteredInvoices(): NewInvoiceItem[] {
    return this.invoices.filter(invoice => this.schemeTag(invoice) === this.transactionSchemeTag);
  }

  get filteredRedemptions(): RedemptionItem[] {
    return this.redemptions.filter(redemption => (redemption.walletType || 'Regular').toLowerCase() === this.redemptionWallet.toLowerCase());
  }

  loadCustomer(id: number): void {
    this.loading = true;
    this.errorMessage = '';
    this.customerService.get(id).pipe(
      timeout(20000),
      finalize(() => {
        this.loading = false;
        this.refreshView();
      })
    ).subscribe({
      next: customer => {
        this.customer = customer;
        this.loadTransactions();
        this.loadRedemptions();
        this.refreshView();
      },
      error: error => {
        this.errorMessage = error.name === 'TimeoutError' ? 'Customer API request timed out.' : error.message;
        this.refreshView();
      }
    });
  }

  backToList(): void {
    this.router.navigate(['/customers']);
  }

  setTab(tab: string): void {
    this.activeTab = tab;
  }

  setTransactionSchemeTag(tag: 'Regular' | 'Booster'): void {
    this.transactionSchemeTag = tag;
  }

  setRedemptionWallet(wallet: 'Regular' | 'Booster'): void {
    this.redemptionWallet = wallet;
  }

  loadTransactions(): void {
    if (!this.customer) return;
    this.loadingTransactions = true;
    this.newInvoiceService.list({}).pipe(
      finalize(() => {
        this.loadingTransactions = false;
        this.refreshView();
      })
    ).subscribe({
      next: result => this.invoices = result.invoices.filter(invoice => invoice.secondaryCustomerId === this.customer?.id),
      error: error => this.showToast(error.message, 'error')
    });
  }

  loadRedemptions(): void {
    if (!this.customer) return;
    this.loadingRedemptions = true;
    this.redemptionService.list({}).pipe(
      finalize(() => {
        this.loadingRedemptions = false;
        this.refreshView();
      })
    ).subscribe({
      next: result => this.redemptions = result.redemptions.filter(redemption => redemption.customerId === this.customer?.id),
      error: error => this.showToast(error.message, 'error')
    });
  }

  openKycPreview(document: KycDocument): void {
    if (!document.url) return;
    this.selectedKycDocument = document;
    this.refreshView();
  }

  closeKycPreview(): void {
    this.selectedKycDocument = null;
    this.refreshView();
  }

  openKycDialog(document: KycDocument, action: 'approve' | 'reject'): void {
    this.kycDialog = { visible: true, document, action, remark: action === 'reject' ? document.remark : '' };
    this.refreshView();
  }

  closeKycDialog(): void {
    if (this.savingKyc) return;
    this.kycDialog = this.emptyKycDialog();
    this.refreshView();
  }

  submitKycAction(): void {
    if (!this.customer || !this.kycDialog.document || !this.kycDialog.action) return;
    if (this.kycDialog.action === 'reject' && !this.kycDialog.remark.trim()) {
      this.showToast('Remark is required to reject KYC.', 'error');
      return;
    }

    const request = this.kycDialog.action === 'approve'
      ? this.customerService.approveKyc(this.customer.id, this.kycDialog.document.key, this.kycDialog.remark)
      : this.customerService.rejectKyc(this.customer.id, this.kycDialog.document.key, this.kycDialog.remark);

    this.savingKyc = true;
    request.pipe(finalize(() => {
      this.savingKyc = false;
      this.refreshView();
    })).subscribe({
      next: result => {
        if (result.item) this.customer = result.item;
        this.kycDialog = this.emptyKycDialog();
        this.showToast(result.message, 'success');
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  field(key: string): string {
    return this.customer?.customFields?.[key] || '';
  }

  firstField(...keys: string[]): string {
    return keys.map(key => this.field(key)).find(value => !!value) || '';
  }

  mediaUrl(value?: string | null): string {
    if (!value) return '';
    const path = value.trim();
    if (!path) return '';
    if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
    if (path.startsWith('/assets/')) return path.slice(1);
    if (path.startsWith('assets/')) return path;
    const normalizedPath = /^(secondary-customers|secondary_customers|distributors)\//i.test(path)
      ? `storage/${path}`
      : path;
    const cleanPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
    return `${this.backendOrigin}${cleanPath}`;
  }

  formatDate(value?: string | null): string {
    return formatKolkataDateTime(value, '');
  }

  formatShortDate(value?: string | null): string {
    return formatKolkataDate(value, '-');
  }

  /// Customers never see the internal SS/Sales stages; both read as In Process.
  invoiceStatusLabel(invoice: { approvalStatus: number; approvalStatusLabel: string }): string {
    if (!this.authService.isDistributorUser()) return invoice.approvalStatusLabel;
    switch (invoice.approvalStatus) {
      case 0: return 'Pending';
      case 1:
      case 2: return 'In Process';
      case 3: return 'Approved';
      case 4: return 'Rejected';
      default: return invoice.approvalStatusLabel;
    }
  }

  statusClass(status: number): string {
    return `status-${status}`;
  }

  redemptionStatusClass(status: number): string {
    return `redemption-status-${status}`;
  }

  activeTabIcon(): string {
    return this.tabs.find(tab => tab.id === this.activeTab)?.icon || 'info';
  }

  statusLabel(status: KycDocument['status']): string {
    if (status === 'approved') return 'Approved';
    if (status === 'rejected') return 'Rejected';
    return 'Pending';
  }

  kycDialogTitle(): string {
    if (!this.kycDialog.document || !this.kycDialog.action) return 'KYC Approval';
    return `${this.kycDialog.action === 'approve' ? 'Approve' : 'Reject'} ${this.kycDialog.document.label}`;
  }

  private kycDocument(key: string, label: string, path: string, rows: InfoRow[]): KycDocument {
    const prefix = `${key}_kyc`;
    return {
      key,
      label,
      url: this.mediaUrl(path),
      rows: this.presentRows(rows),
      status: this.kycStatus(this.field(`${prefix}_status`)),
      remark: this.field(`${prefix}_remark`),
      actionBy: this.field(`${prefix}_action_by_name`) || this.field(`${prefix}_action_by`),
      actionAt: this.field(`${prefix}_action_at`)
    };
  }

  private kycStatus(value: string): KycDocument['status'] {
    const status = value.toLowerCase();
    return status === 'approved' || status === 'rejected' ? status : 'pending';
  }

  private schemeTag(invoice: NewInvoiceItem): 'Regular' | 'Booster' {
    return (invoice.schemeTag || '').toLowerCase() === 'booster' ? 'Booster' : 'Regular';
  }

  private numberField(key: string): number {
    const value = Number(this.field(key));
    return Number.isFinite(value) ? value : 0;
  }

  private emptyKycDialog(): KycDialogModel {
    return { visible: false, action: null, document: null, remark: '' };
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

  private lookupName(key: string): string {
    const nameKey = `${key}_name`;
    const name = this.field(nameKey);
    if (name) return name;

    const value = this.field(key);
    if (!value) return '';

    const labels = this.readIds(value)
      .map(id => this.lookupLabels[`${key}:${id}`])
      .filter(Boolean);

    return labels.length > 0 ? labels.join(', ') : value;
  }

  private loadLookupOptions(): void {
    this.customerService.list({ customer_type: 1, active: 'Y', page: 1, page_size: 200 }).subscribe({
      next: result => {
        const remainingPages = Array.from(
          { length: Math.max(0, Math.ceil(result.total / result.pageSize) - 1) },
          (_, index) => this.customerService.list({ customer_type: 1, active: 'Y', page: index + 2, page_size: 200 })
        );
        const setLabels = (items: CustomerItem[]) => {
          items.forEach(distributor => {
            const label = this.distributorLabel(distributor);
            this.lookupLabels[`distributor_name:${distributor.id}`] = label;
            this.lookupLabels[`agri_distributor:${distributor.id}`] = label;
          });
          this.refreshView();
        };
        if (remainingPages.length === 0) return setLabels(result.items);
        forkJoin(remainingPages).subscribe({
          next: pages => setLabels([...result.items, ...pages.flatMap(page => page.items)]),
          error: () => undefined
        });
      },
      error: () => undefined
    });

    this.userService.getOptions().subscribe({
      next: options => {
        options.reportings.forEach(user => {
          this.lookupLabels[`employee_id:${user.id}`] = user.name;
          this.lookupLabels[`sales_executive_id:${user.id}`] = user.name;
          this.lookupLabels[`supervisor_id:${user.id}`] = user.name;
        });
        this.refreshView();
      },
      error: () => undefined
    });
  }

  private distributorLabel(customer: CustomerItem): string {
    const code = customer.customerCode || customer.customFields['distributor_code'];
    const legalName = customer.customFields['legal_name'] || customer.customFields['shop_name'] || customer.name;
    return [code, legalName].filter(Boolean).join(' - ') || customer.name;
  }

  private readIds(value: string): number[] {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const values = JSON.parse(trimmed);
        return Array.isArray(values) ? values.map(item => Number(item)).filter(id => Number.isFinite(id) && id > 0) : [];
      } catch {
        return [];
      }
    }

    return trimmed
      .split(',')
      .map(item => Number(item.trim()))
      .filter(id => Number.isFinite(id) && id > 0);
  }

  private presentRows(rows: InfoRow[]): InfoRow[] {
    return rows.filter(row => row.value !== null && row.value !== undefined && String(row.value).trim() !== '');
  }

  private titleCase(key: string): string {
    return key.replace(/_/g, ' ').replace(/\w\S*/g, text => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase());
  }

  private refreshView(): void {
    this.cdr.detectChanges();
  }

  private resolveBackendOrigin(): string {
    return API_ORIGIN;
  }
}
