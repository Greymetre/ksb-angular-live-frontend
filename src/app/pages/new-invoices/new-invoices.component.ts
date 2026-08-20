import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, timeout } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { InvoiceSchemeOption, NewInvoiceFilter, NewInvoiceItem, NewInvoicePayload, NewInvoiceService, NewInvoiceSummary, RetailerOption } from '../../services/new-invoice.service';
import { API_ORIGIN } from '../../config/api.config';
import { isPdfOrImageFile } from '../../shared/utils/file-validation';
import { formatKolkataDate, formatKolkataLongDateTime, kolkataDateInput, kolkataTodayInput } from '../../shared/utils/date-time';
import { MasterCrudService } from '../../services/master-crud.service';

interface SelectOption {
  id: number | string;
  label: string;
}

interface ToastModel {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

interface InvoiceFormModel {
  id: number | null;
  secondaryCustomerId: number | null;
  schemeId: number | null;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number | null;
  points: number;
  attachment: string | null;
}

interface ApprovalDialogModel {
  visible: boolean;
  invoice: NewInvoiceItem | null;
  level: 'ss' | 'sales' | 'ho' | 'reject' | null;
  approvedAmount: number | null;
  remark: string;
}

@Component({
  standalone: false,
  selector: 'app-new-invoices',
  templateUrl: './new-invoices.component.html',
  styleUrls: ['./new-invoices.component.scss']
})
export class NewInvoicesComponent implements OnInit {
  invoices: NewInvoiceItem[] = [];
  retailers: RetailerOption[] = [];
  retailerOptions: SelectOption[] = [];
  schemeOptions: InvoiceSchemeOption[] = [];
  schemeSelectOptions: SelectOption[] = [];
  schemeFilterOptions: SelectOption[] = [];
  zoneFilterOptions: SelectOption[] = [];
  branchFilterOptions: SelectOption[] = [];
  filter: NewInvoiceFilter = {};
  summary: NewInvoiceSummary = this.emptySummary();
  form: InvoiceFormModel = this.emptyForm();
  selectedAttachmentFile: File | null = null;
  approvalDialog: ApprovalDialogModel = this.emptyApprovalDialog();
  selectedInvoice: NewInvoiceItem | null = null;
  selectedRetailer: RetailerOption | null = null;
  showEntries = 10;
  currentPage = 1;
  totalInvoices = 0;
  loading = false;
  retailersLoading = false;
  saving = false;
  exporting = false;
  showFilters = false;
  showModal = false;
  showPreGstNotice = false;
  approvalHistoryVisible = false;
  attachmentZoom = 1;
  attachmentFullscreen = false;
  attachmentViewerResourceUrl: SafeResourceUrl | null = null;
  errorMessage = '';
  toast: ToastModel = { visible: false, message: '', type: 'success' };
  private readonly backendOrigin = this.resolveBackendOrigin();
  private filterSearchTimeoutId?: number;

  // Internal users see every approval stage. Customers (dealer/distributor) must only
  // ever see Pending, In Process, Approved, Rejected — SS and Sales are internal.
  private readonly internalStatusOptions: SelectOption[] = [
    { id: '', label: 'All Status' },
    { id: 0, label: 'Pending' },
    { id: 1, label: 'Approved By SS' },
    { id: 2, label: 'Approved By Sales' },
    { id: 3, label: 'Approved By HO' },
    { id: 4, label: 'Rejected' }
  ];

  private readonly customerStatusOptions: SelectOption[] = [
    { id: '', label: 'All Status' },
    { id: 0, label: 'Pending' },
    { id: 'in_process', label: 'In Process' },
    { id: 3, label: 'Approved' },
    { id: 4, label: 'Rejected' }
  ];

  get isCustomerView(): boolean {
    return this.authService.isDistributorUser();
  }

  get approvalStatusOptions(): SelectOption[] {
    return this.isCustomerView ? this.customerStatusOptions : this.internalStatusOptions;
  }

  /// Collapses the two internal stages for customers; internal users keep the detail.
  statusLabel(invoice: { approvalStatus: number; approvalStatusLabel: string }): string {
    if (!this.isCustomerView) return invoice.approvalStatusLabel;
    switch (invoice.approvalStatus) {
      case 0: return 'Pending';
      case 1:
      case 2: return 'In Process';
      case 3: return 'Approved';
      case 4: return 'Rejected';
      default: return invoice.approvalStatusLabel;
    }
  }

  private toastTimeoutId?: number;

  constructor(
    private newInvoiceService: NewInvoiceService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private masterCrudService: MasterCrudService
  ) {}

  ngOnInit(): void {
    this.loadRetailers();
    this.loadSchemeFilters();
    this.loadLocationFilters();
    this.route.paramMap.subscribe(params => {
      const id = Number(params.get('id') || 0);
      if (id > 0) this.loadInvoice(id);
      else {
        this.selectedInvoice = null;
        this.loadInvoices();
      }
    });

    // The dealer dashboard links here with ?create=1 so the pre-GST notice opens
    // straight away instead of making the dealer hunt for the add button.
    this.route.queryParamMap.subscribe(params => {
      if (params.get('create') !== '1' || !this.canCreate) return;
      this.openCreateModal();
      // Drop the flag so a refresh or a back-navigation does not reopen it.
      this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    });
  }

  loadLocationFilters(): void {
    this.masterCrudService.list({ path: 'divisions', listKey: 'divisions', itemKey: 'division' }).subscribe({
      next: rows => {
        this.zoneFilterOptions = rows.filter(row => row.active !== '0').map(row => ({ id: row.id, label: row.divisionName || row.name || `Zone ${row.id}` }));
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
    this.masterCrudService.list({ path: 'branches', listKey: 'branches', itemKey: 'branch' }).subscribe({
      next: rows => {
        this.branchFilterOptions = rows.filter(row => row.active !== '0').map(row => ({ id: row.id, label: row.branchName || row.name || `Branch ${row.id}` }));
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  onZoneFilterChange(value: number | string | null): void {
    const id = Number(value || 0);
    this.filter.zone_id = id > 0 ? id : null;
    this.resetPage();
    this.loadInvoices();
  }

  onBranchFilterChange(value: number | string | null): void {
    const id = Number(value || 0);
    this.filter.branch_id = id > 0 ? id : null;
    this.resetPage();
    this.loadInvoices();
  }

  loadSchemeFilters(): void {
    this.newInvoiceService.filterSchemes().subscribe({
      next: schemes => {
        this.schemeFilterOptions = schemes.map(scheme => ({ id: scheme.id, label: `${scheme.name} (${scheme.code})` }));
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  onSchemeFilterChange(value: number | string | null): void {
    const id = Number(value || 0);
    this.filter.scheme_id = id > 0 ? id : null;
    this.currentPage = 1;
    this.loadInvoices();
  }

  get filteredInvoices(): NewInvoiceItem[] {
    return this.invoices;
  }

  get pageStart(): number {
    return (this.currentPage - 1) * this.safeShowEntries;
  }

  get pendingFromSs(): number {
    return this.invoices.filter(invoice => invoice.approvalStatus === 0).length;
  }

  get pendingFromSales(): number {
    return this.invoices.filter(invoice => invoice.approvalStatus === 1).length;
  }

  get pendingFromHo(): number {
    return this.invoices.filter(invoice => invoice.approvalStatus === 2).length;
  }

  get canCreate(): boolean {
    return this.authService.hasPermission('new_invoice_create');
  }

  get canAccess(): boolean {
    return this.authService.hasPermission('new_invoice_access');
  }

  get canEdit(): boolean {
    return this.authService.hasPermission('new_invoice_edit');
  }

  get canDelete(): boolean {
    return this.authService.hasPermission('new_invoice_delete');
  }

  /**
   * Everyone else may only delete a pending invoice; a superadmin can remove one at
   * any stage, so the button stays available to them.
   */
  get canDeleteAnyStatus(): boolean {
    return this.authService.isSuperAdmin();
  }

  get canApproveSs(): boolean {
    return this.authService.hasPermission('new_invoice_approve_ss');
  }

  get canApproveSales(): boolean {
    return this.authService.hasPermission('new_invoice_approve_sales');
  }

  get canApproveHo(): boolean {
    return this.authService.hasPermission('new_invoice_approve_ho');
  }

  get canReject(): boolean {
    return this.authService.hasPermission('new_invoice_reject');
  }

  get canExport(): boolean {
    return this.authService.hasPermission('new_invoice_export');
  }

  loadInvoices(resetPage = true): void {
    this.loading = true;
    this.errorMessage = '';
    if (resetPage) this.currentPage = 1;
    this.newInvoiceService.list({ ...this.filter, page: this.currentPage, page_size: this.safeShowEntries }).pipe(
      timeout(20000),
      finalize(() => {
        this.loading = false;
        this.refreshView();
      })
    ).subscribe({
      next: result => {
        this.invoices = result.invoices;
        this.summary = result.summary;
        this.totalInvoices = result.total;
        this.refreshView();
      },
      error: error => {
        this.errorMessage = error.name === 'TimeoutError' ? 'New invoices API request timed out.' : error.message;
        this.refreshView();
      }
    });
  }

  loadRetailers(): void {
    this.retailersLoading = true;
    this.newInvoiceService.retailers().pipe(
      finalize(() => {
        this.retailersLoading = false;
        this.refreshView();
      })
    ).subscribe({
      next: retailers => {
        this.retailers = retailers;
        this.retailerOptions = retailers.map(retailer => ({ id: retailer.id, label: this.retailerLabel(retailer) }));
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  loadInvoice(id: number): void {
    this.loading = true;
    this.errorMessage = '';
    this.newInvoiceService.get(id).pipe(
      timeout(20000),
      finalize(() => {
        this.loading = false;
        this.refreshView();
      })
    ).subscribe({
      next: invoice => {
        this.selectedInvoice = invoice;
        this.attachmentZoom = 1;
        this.attachmentFullscreen = false;
        this.attachmentViewerResourceUrl = invoice.attachment && this.isPdfAttachment(invoice.attachment)
          ? this.sanitizer.bypassSecurityTrustResourceUrl(this.mediaUrl(invoice.attachment))
          : null;
        this.refreshView();
      },
      error: error => {
        this.errorMessage = error.name === 'TimeoutError' ? 'New invoice API request timed out.' : error.message;
        this.refreshView();
      }
    });
  }

  openShowPage(invoice: NewInvoiceItem): void {
    this.router.navigate(['/new-invoices', invoice.id]);
  }

  openCustomerShow(invoice: NewInvoiceItem): void {
    if (invoice.secondaryCustomerId > 0) this.router.navigate(['/customers', invoice.secondaryCustomerId]);
  }

  backToList(): void {
    this.approvalHistoryVisible = false;
    this.attachmentFullscreen = false;
    this.router.navigate(['/new-invoices']);
  }

  openApprovalHistory(): void {
    this.approvalHistoryVisible = true;
    this.refreshView();
  }

  closeApprovalHistory(): void {
    this.approvalHistoryVisible = false;
    this.refreshView();
  }

  openCreateModal(): void {
    this.showPreGstNotice = true;
    this.refreshView();
  }

  closePreGstNotice(): void {
    this.showPreGstNotice = false;
    this.refreshView();
  }

  continueCreateInvoice(): void {
    this.showPreGstNotice = false;
    this.form = this.emptyForm();
    this.selectedRetailer = null;
    this.selectedAttachmentFile = null;
    this.showModal = true;
    this.refreshView();
  }

  openEditModal(invoice: NewInvoiceItem): void {
    if (invoice.approvalStatus !== 0) {
      this.showToast('Only pending invoices can be edited.', 'error');
      return;
    }
    this.form = {
      id: invoice.id,
      secondaryCustomerId: invoice.secondaryCustomerId,
      schemeId: invoice.schemeId || null,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: this.toDateInput(invoice.invoiceDate),
      amount: invoice.amount,
      points: 0,
      attachment: invoice.attachment || null
    };
    this.selectedAttachmentFile = null;
    this.selectedRetailer = this.retailers.find(retailer => retailer.id === invoice.secondaryCustomerId) || {
      id: invoice.secondaryCustomerId,
      ownerName: invoice.customerName,
      shopName: invoice.shopName,
      mobileNumber: invoice.mobileNumber,
      cityName: invoice.cityName,
      address: null
    };
    this.showModal = true;
    this.loadSchemeOptions(false);
    this.refreshView();
  }

  closeModal(): void {
    if (this.saving) return;
    this.showModal = false;
    this.refreshView();
  }

  onRetailerChange(id: number | string | null): void {
    const retailerId = Number(id || 0);
    this.form.secondaryCustomerId = retailerId > 0 ? retailerId : null;
    this.selectedRetailer = this.retailers.find(retailer => retailer.id === retailerId) || null;
    this.form.schemeId = null;
    this.loadSchemeOptions(true);
    this.refreshView();
  }

  onInvoiceDateChange(): void {
    this.form.schemeId = null;
    this.loadSchemeOptions(true);
  }

  onSchemeChange(id: number | string | null): void {
    const schemeId = Number(id || 0);
    this.form.schemeId = schemeId > 0 ? schemeId : null;
    this.refreshView();
  }

  loadSchemeOptions(clearSelection: boolean): void {
    if (!this.form.secondaryCustomerId || !this.form.invoiceDate) {
      this.schemeOptions = [];
      this.schemeSelectOptions = [];
      if (clearSelection) this.form.schemeId = null;
      return;
    }
    const selected = this.form.schemeId;
    this.newInvoiceService.schemes(this.form.secondaryCustomerId, this.form.invoiceDate).subscribe({
      next: schemes => {
        this.schemeOptions = schemes;
        this.schemeSelectOptions = schemes.map(scheme => ({
          id: scheme.id,
          label: `${scheme.name} (${scheme.code})`
        }));
        if (!clearSelection && selected && schemes.some(scheme => scheme.id === selected)) this.form.schemeId = selected;
        else if (clearSelection) this.form.schemeId = null;
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  submit(): void {
    const payload = this.buildPayload();
    if (!payload) return;

    this.saving = true;
    const request = this.form.id
      ? this.newInvoiceService.update(this.form.id, payload, this.selectedAttachmentFile)
      : this.newInvoiceService.create(payload, this.selectedAttachmentFile);

    request.pipe(finalize(() => {
      this.saving = false;
      this.refreshView();
    })).subscribe({
      next: message => {
        this.showModal = false;
        this.showToast(message, 'success');
        if (this.selectedInvoice?.id) this.loadInvoice(this.selectedInvoice.id);
        else this.loadInvoices();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  deleteInvoice(invoice: NewInvoiceItem): void {
    // Deleting takes the attachments and the retailer's points for this invoice with
    // it, which matters most once the invoice has moved past pending.
    const warning = invoice.approvalStatus === 0
      ? ''
      : `\n\nThis invoice is ${this.statusLabel(invoice)}. Its attachments and the retailer's loyalty points for it will be removed as well.`;
    if (!confirm(`Delete invoice "${invoice.invoiceNumber}"?${warning}`)) return;
    this.newInvoiceService.delete(invoice.id).subscribe({
      next: message => {
        this.showToast(message, 'success');
        if (this.selectedInvoice?.id === invoice.id) this.backToList();
        else this.loadInvoices();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  openApprovalDialog(invoice: NewInvoiceItem, level: 'ss' | 'sales' | 'ho' | 'reject'): void {
    this.approvalDialog = {
      visible: true,
      invoice,
      level,
      approvedAmount: level === 'reject' ? null : this.lastApprovedAmount(invoice, level),
      remark: ''
    };
    this.refreshView();
  }

  closeApprovalDialog(): void {
    if (this.saving) return;
    this.approvalDialog = this.emptyApprovalDialog();
    this.refreshView();
  }

  submitApproval(): void {
    const invoice = this.approvalDialog.invoice;
    const level = this.approvalDialog.level;
    if (!invoice || !level) return;
    if (level === 'reject' && !this.approvalDialog.remark.trim()) {
      this.showToast('Remark is required to reject an invoice.', 'error');
      return;
    }
    if (level !== 'reject' && (!this.approvalDialog.approvedAmount || this.approvalDialog.approvedAmount <= 0)) {
      this.showToast('Approved invoice amount must be greater than 0.', 'error');
      return;
    }

    this.saving = true;
    const request = level === 'reject'
      ? this.newInvoiceService.reject(invoice.id, this.approvalDialog.remark)
      : this.newInvoiceService.approve(invoice.id, level, this.approvalDialog.remark, Number(this.approvalDialog.approvedAmount));

    request.pipe(finalize(() => {
      this.saving = false;
      this.refreshView();
    })).subscribe({
      next: message => {
        this.approvalDialog = this.emptyApprovalDialog();
        this.showToast(message, 'success');
        if (invoice.id === this.selectedInvoice?.id) this.loadInvoice(invoice.id);
        else this.loadInvoices();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  approvalTitle(): string {
    const level = this.approvalDialog.level;
    if (level === 'reject') return 'Reject Invoice';
    if (level === 'ss') return 'Approve By SS';
    if (level === 'sales') return 'Approve By Sales';
    if (level === 'ho') return 'Approve By HO';
    return 'Invoice Approval';
  }

  resetFilters(): void {
    this.filter = {};
    this.currentPage = 1;
    this.loadInvoices();
  }

  resetPage(): void {
    this.currentPage = 1;
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadInvoices(false);
  }

  exportInvoices(): void {
    this.exporting = true;
    this.newInvoiceService.export(this.filter).pipe(finalize(() => {
      this.exporting = false;
      this.refreshView();
    })).subscribe({
      next: blob => this.downloadBlob(blob, `new-invoices-${this.dateStamp()}.xlsx`),
      error: error => this.showToast(error.message, 'error')
    });
  }

  onStatusFilterChange(value: number | string | null): void {
    this.filter.approval_status = value === '' || value === null ? null : Number(value);
    this.loadInvoices();
  }

  filterByApprovalStatus(status: number | 'in_process' | null): void {
    this.filter.approval_status = status;
    this.currentPage = 1;
    this.loadInvoices();
  }

  scheduleFilterSearch(): void {
    if (this.filterSearchTimeoutId) window.clearTimeout(this.filterSearchTimeoutId);
    this.filterSearchTimeoutId = window.setTimeout(() => {
      this.currentPage = 1;
      this.loadInvoices();
      this.refreshView();
    }, 400);
  }

  retailerLabel(retailer: RetailerOption): string {
    return [retailer.shopName, retailer.ownerName, retailer.mobileNumber].filter(Boolean).join(' - ');
  }

  statusClass(status: number): string {
    return `status-${status}`;
  }

  listingStatusClass(status: number): string {
    // Customers read SS and Sales as one In Process state, so both rows must also
    // carry one colour instead of the two the internal view uses.
    const effective = this.isCustomerView && status === 2 ? 1 : status;
    return `listing-status-${effective}`;
  }

  statusIcon(status: number): string {
    switch (status) {
      case 0: return 'schedule';
      case 1: return 'how_to_reg';
      case 2: return 'business_center';
      case 3: return 'apartment';
      case 4: return 'cancel';
      default: return 'help';
    }
  }

  formatDate(value?: string | null): string {
    return formatKolkataDate(value, '-');
  }

  formatDateTime(value?: string | null): string {
    return formatKolkataLongDateTime(value, '-');
  }

  canMoveToStatus(invoice: NewInvoiceItem, status: number): boolean {
    if (invoice.approvalStatus === 4 || invoice.approvalStatus === 3) return false;
    if (status === 1) return invoice.approvalStatus === 0;
    if (status === 2) return invoice.approvalStatus === 1;
    if (status === 3) return invoice.approvalStatus === 2;
    if (status === 4) return true;
    return false;
  }

  titleCase(value?: string | null): string {
    return (value || '-').replace(/\b\w/g, char => char.toUpperCase());
  }

  formatMoney(value: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value || 0);
  }

  schemeDisplay(invoice: NewInvoiceItem): string {
    return invoice.schemeName ? `${invoice.schemeName}${invoice.schemeCode ? ' (' + invoice.schemeCode + ')' : ''}` : '-';
  }

  approvalStageText(amount?: number | null, remark?: string | null): string {
    const amountText = amount ? this.formatMoney(amount) : '-';
    return remark ? `${amountText} - ${remark}` : amountText;
  }

  approvalAmountClass(invoice: NewInvoiceItem | null, approvedAmount?: number | null): string {
    if (!invoice || approvedAmount === null || approvedAmount === undefined) return '';
    return Math.abs(Number(approvedAmount) - Number(invoice.amount)) < 0.01
      ? 'approval-amount-match'
      : 'approval-amount-different';
  }

  private lastApprovedAmount(invoice: NewInvoiceItem, level: 'ss' | 'sales' | 'ho'): number {
    if (level === 'ho') {
      return invoice.salesApprovedAmount ?? invoice.ssApprovedAmount ?? invoice.amount;
    }
    if (level === 'sales') {
      return invoice.ssApprovedAmount ?? invoice.amount;
    }
    return invoice.amount;
  }

  onAttachmentChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file && !isPdfOrImageFile(file)) {
      this.selectedAttachmentFile = null;
      input.value = '';
      this.showToast('Only PDF and image files are allowed.', 'error');
      this.refreshView();
      return;
    }
    this.selectedAttachmentFile = file;
    this.refreshView();
  }

  attachmentLabel(): string {
    return this.selectedAttachmentFile?.name || this.form.attachment || 'No file selected';
  }

  mediaUrl(value?: string | null): string {
    if (!value) return '';
    const path = value.trim();
    if (!path) return '';
    if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.backendOrigin}${cleanPath}`;
  }

  zoomAttachment(change: number): void {
    this.attachmentZoom = Math.min(3, Math.max(0.5, this.attachmentZoom + change));
    this.refreshView();
  }

  resetAttachmentZoom(): void {
    this.attachmentZoom = 1;
    this.refreshView();
  }

  toggleAttachmentFullscreen(): void {
    this.attachmentFullscreen = !this.attachmentFullscreen;
    this.refreshView();
  }

  isPdfAttachment(value?: string | null): boolean {
    if (!value) return false;
    return /\.pdf(?:$|[?#])/i.test(value.trim());
  }

  private buildPayload(): NewInvoicePayload | null {
    if (!this.form.secondaryCustomerId) {
      this.showToast('Retailer is required.', 'error');
      return null;
    }
    if (!this.form.invoiceNumber.trim()) {
      this.showToast('Invoice number is required.', 'error');
      return null;
    }
    if (!this.form.schemeId) {
      this.showToast('Scheme selection is required.', 'error');
      return null;
    }
    if (!this.form.invoiceDate) {
      this.showToast('Invoice date is required.', 'error');
      return null;
    }
    if (!this.form.amount || this.form.amount <= 0) {
      this.showToast('Amount must be greater than 0.', 'error');
      return null;
    }
    if (!this.form.attachment && !this.selectedAttachmentFile) {
      this.showToast('Invoice attachment is required.', 'error');
      return null;
    }
    return {
      secondary_customer_id: this.form.secondaryCustomerId,
      scheme_id: this.form.schemeId,
      invoice_number: this.form.invoiceNumber.trim(),
      invoice_date: this.form.invoiceDate,
      amount: Number(this.form.amount),
      points: 0,
      attachment: this.form.attachment
    };
  }

  private toDateInput(value: string): string {
    return kolkataDateInput(value);
  }

  private emptyForm(): InvoiceFormModel {
    return {
      id: null,
      secondaryCustomerId: null,
      schemeId: null,
      invoiceNumber: '',
      invoiceDate: kolkataTodayInput(),
      amount: null,
      points: 0,
      attachment: null
    };
  }

  private emptySummary(): NewInvoiceSummary {
    return {
      totalInvoices: 0,
      totalRetailers: 0,
      approvedSs: 0,
      approvedSales: 0,
      approvedHo: 0,
      pending: 0,
      rejected: 0,
      totalPoints: 0,
      totalAmount: 0,
      ssApprovalAmount: 0,
      salesApprovalAmount: 0,
      hoApprovalAmount: 0,
      totalDealerNos: 0,
      totalRewardEarned: 0,
      totalExpectedReward: 0
    };
  }

  private emptyApprovalDialog(): ApprovalDialogModel {
    return {
      visible: false,
      invoice: null,
      level: null,
      approvedAmount: null,
      remark: ''
    };
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

  private get safeShowEntries(): number {
    const value = Number(this.showEntries);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  private dateStamp(): string {
    return kolkataTodayInput();
  }

  private resolveBackendOrigin(): string {
    return API_ORIGIN;
  }
}
