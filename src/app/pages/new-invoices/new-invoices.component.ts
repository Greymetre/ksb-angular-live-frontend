import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, timeout } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { InvoiceSchemeOption, NewInvoiceAttachment, NewInvoiceFilter, NewInvoiceItem, NewInvoicePayload, NewInvoiceService, NewInvoiceStageCounts, NewInvoiceSummary, RetailerDealerOption, RetailerOption } from '../../services/new-invoice.service';
import { SearchableSelectOption } from '../../shared/components/searchable-select/searchable-select.component';
import { API_ORIGIN } from '../../config/api.config';
import { isPdfOrImageFile } from '../../shared/utils/file-validation';
import {
  MAX_INVOICE_ATTACHMENTS,
  compressInvoiceAttachment
} from '../../shared/utils/invoice-attachments';
import { formatKolkataDate, formatKolkataLongDateTime, kolkataDateInput, kolkataTodayInput } from '../../shared/utils/date-time';
import { MasterCrudService } from '../../services/master-crud.service';
import { ProductItem, ProductService } from '../../services/product.service';

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
  dealerCustomerId: number | null;
  schemeId: number | null;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number | null;
  points: number;
  attachment: string | null;
  /** Files already on the invoice when the edit dialog opened. */
  savedAttachments: NewInvoiceAttachment[];
}

interface ApprovalDialogModel {
  visible: boolean;
  invoice: NewInvoiceItem | null;
  level: 'ss' | 'sales' | 'ho' | 'hold' | 'reject' | null;
  approvedAmount: number | null;
  remark: string;
}

@Component({
  standalone: false,
  selector: 'app-new-invoices',
  templateUrl: './new-invoices.component.html',
  styleUrls: ['./new-invoices.component.scss']
})
export class NewInvoicesComponent implements OnInit, OnDestroy {
  invoices: NewInvoiceItem[] = [];
  retailers: RetailerOption[] = [];
  retailerOptions: SelectOption[] = [];
  schemeOptions: InvoiceSchemeOption[] = [];
  schemeSelectOptions: SelectOption[] = [];
  schemeFilterOptions: SelectOption[] = [];
  zoneFilterOptions: SelectOption[] = [];
  branchFilterOptions: SelectOption[] = [];
  dealerFilterOptions: SelectOption[] = [];
  filter: NewInvoiceFilter = {};
  summary: NewInvoiceSummary = this.emptySummary();
  stageCounts: NewInvoiceStageCounts = this.emptyStageCounts();
  form: InvoiceFormModel = this.emptyForm();
  retailerDealers: RetailerDealerOption[] = [];
  dealersLoading = false;
  selectedAttachmentFiles: File[] = [];
  removedAttachmentIds: number[] = [];
  compressingAttachments = false;
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
  attachmentIndex = 0;
  /** Quarter turns applied to the image, in degrees. Phone photos of a bill often
   *  arrive on their side, so the viewer has to be able to stand them up. */
  attachmentRotation = 0;
  attachmentFullscreen = false;
  attachmentViewerResourceUrl: SafeResourceUrl | null = null;
  productSearchOpen = false;
  productSearchTerm = '';
  productSearchResults: ProductItem[] = [];
  productSearchLoading = false;
  selectedProduct: ProductItem | null = null;
  errorMessage = '';
  toast: ToastModel = { visible: false, message: '', type: 'success' };
  private readonly backendOrigin = this.resolveBackendOrigin();
  private retailerSearchSub?: Subscription;
  private filterSearchTimeoutId?: number;
  private productSearchTimeoutId?: number;

  // Internal users see every approval stage. Customers (dealer/distributor) see
  // Pending, Hold, In Process, Approved, Rejected — only SS and Sales stay collapsed,
  // being two internal steps of one review.
  private readonly internalStatusOptions: SelectOption[] = [
    { id: '', label: 'All Status' },
    { id: 0, label: 'Pending' },
    { id: 5, label: 'Hold' },
    { id: 1, label: 'Approved By SS' },
    { id: 2, label: 'Approved By Sales' },
    { id: 3, label: 'Approved By HO' },
    { id: 4, label: 'Rejected' }
  ];

  private readonly customerStatusOptions: SelectOption[] = [
    { id: '', label: 'All Status' },
    { id: 0, label: 'Pending' },
    { id: 5, label: 'Hold' },
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
      case 5: return 'Hold';
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
    private masterCrudService: MasterCrudService,
    private productService: ProductService
  ) {}


  ngOnDestroy(): void {
    this.retailerSearchSub?.unsubscribe();
  }
  ngOnInit(): void {
    this.loadRetailers();
    this.loadSchemeFilters();
    this.loadLocationFilters();
    this.loadDealerFilters();
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

  // Filters read the ungated dropdown routes, so a user without the zone/branch
  // master permission still gets the filter values. Page size 0 asks for the whole
  // list - anything else and the API returns only the first page of it.
  loadLocationFilters(): void {
    this.masterCrudService.list({ path: 'getdivisions', listKey: 'divisions', itemKey: 'division' }, '', 1, 0).subscribe({
      next: rows => {
        this.zoneFilterOptions = rows.filter(row => row.active !== '0').map(row => ({ id: row.id, label: row.divisionName || row.name || `Zone ${row.id}` }));
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
    this.masterCrudService.list({ path: 'getbranches', listKey: 'branches', itemKey: 'branch' }, '', 1, 0).subscribe({
      next: rows => {
        this.branchFilterOptions = rows.filter(row => row.active !== '0').map(row => ({ id: row.id, label: row.branchName || row.name || `Branch ${row.id}` }));
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  loadDealerFilters(): void {
    this.newInvoiceService.filterDealers().subscribe({
      next: dealers => {
        this.dealerFilterOptions = dealers.map(dealer => ({ id: dealer.id, label: dealer.name }));
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  onDealerFilterChange(value: number | string | null): void {
    const id = Number(value || 0);
    this.filter.dealer_id = id > 0 ? id : null;
    this.resetPage();
    this.loadInvoices();
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

  /**
   * The stage tiles read server counts that cover every invoice the filters match
   * and deliberately ignore the selected stage, so the tiles keep working as
   * navigation. Counting the loaded rows would only describe the current page.
   */
  get pendingFromSs(): number {
    return this.stageCounts.pending;
  }

  get holdCount(): number {
    return this.stageCounts.hold;
  }

  get pendingFromSales(): number {
    return this.stageCounts.approvedSs;
  }

  get pendingFromHo(): number {
    return this.stageCounts.approvedSales;
  }

  get rejectedCount(): number {
    return this.stageCounts.rejected;
  }

  get approvedHoCount(): number {
    return this.stageCounts.approvedHo;
  }

  get canCreate(): boolean {
    return this.authService.hasPermission('invoice_transaction.create');
  }


  get canAccess(): boolean {
    return this.authService.hasPermission('invoice_transaction.view');
  }

  get canEdit(): boolean {
    return this.authService.hasPermission('invoice_transaction.edit');
  }

  get canDelete(): boolean {
    return this.authService.hasPermission('invoice_transaction.delete');
  }

  /**
   * Everyone else may only delete a pending invoice; a superadmin can remove one at
   * any stage, so the button stays available to them.
   */
  get canDeleteAnyStatus(): boolean {
    return this.authService.isSuperAdmin();
  }

  get canApproveSs(): boolean {
    return this.authService.hasPermission('invoice_transaction.approve_ss');
  }

  get canApproveSales(): boolean {
    return this.authService.hasPermission('invoice_transaction.approve_sales');
  }

  get canApproveHo(): boolean {
    return this.authService.hasPermission('invoice_transaction.approve_ho');
  }

  get canHold(): boolean {
    return this.authService.hasPermission('invoice_transaction.hold');
  }

  /** A pending or held invoice can still be corrected; anything approved cannot. */
  canEditInvoice(invoice: { approvalStatus: number }): boolean {
    return this.canEdit && (invoice.approvalStatus === 0 || invoice.approvalStatus === 5);
  }

  get canReject(): boolean {
    return this.authService.hasPermission('invoice_transaction.reject');
  }

  get canExport(): boolean {
    return this.authService.hasPermission('invoice_transaction.export');
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
        this.stageCounts = result.stageCounts;
        this.totalInvoices = result.total;
        this.refreshView();
      },
      error: error => {
        this.errorMessage = error.name === 'TimeoutError' ? 'New invoices API request timed out.' : error.message;
        this.refreshView();
      }
    });
  }

  /** The retailer picker asks the server as the user types. Loading every retailer the
   *  actor can reach is two megabytes and thousands of rows - the browser survives it, but
   *  the list is unusable and the same call brings a phone to a halt. */
  onRetailerSearch(term: string): void {
    this.loadRetailers(term);
  }

  loadRetailers(search = ''): void {
    // A search still in flight is abandoned when a newer one starts. Without this a slow
    // earlier reply could land last and put its results under a term nobody is looking at.
    this.retailerSearchSub?.unsubscribe();
    this.retailersLoading = true;
    this.refreshView();
    this.retailerSearchSub = this.newInvoiceService.retailers(search).pipe(
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
        this.attachmentIndex = 0;
        this.attachmentRotation = 0;
        this.attachmentFullscreen = false;
        this.syncAttachmentViewer();
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
    this.resetProductSearch();
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
    this.resetAttachmentPicker();
    this.showModal = true;
    this.refreshView();
  }

  openEditModal(invoice: NewInvoiceItem): void {
    if (!this.canEditInvoice(invoice)) {
      this.showToast('Only a pending or held invoice can be edited.', 'error');
      return;
    }
    this.form = {
      id: invoice.id,
      secondaryCustomerId: invoice.secondaryCustomerId,
      dealerCustomerId: invoice.assignedDistributorId || null,
      schemeId: invoice.schemeId || null,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: this.toDateInput(invoice.invoiceDate),
      amount: invoice.amount,
      points: 0,
      attachment: invoice.attachment || null,
      savedAttachments: [...invoice.attachments]
    };
    this.resetAttachmentPicker();
    this.selectedRetailer = this.retailers.find(retailer => retailer.id === invoice.secondaryCustomerId) || {
      id: invoice.secondaryCustomerId,
      ownerName: invoice.customerName,
      shopName: invoice.shopName,
      mobileNumber: invoice.mobileNumber,
      cityName: invoice.cityName,
      address: null
    };
    // The picker only holds a page of retailers now, and the one on this invoice may not be
    // in it. Without this the dropdown would open on an edit showing nothing selected.
    if (!this.retailerOptions.some(option => option.id === invoice.secondaryCustomerId)) {
      this.retailerOptions = [
        { id: this.selectedRetailer.id, label: this.retailerLabel(this.selectedRetailer) },
        ...this.retailerOptions
      ];
    }
    this.showModal = true;
    this.loadRetailerDealers(invoice.secondaryCustomerId, invoice.assignedDistributorId || null);
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
    this.loadRetailerDealers(retailerId);
    this.loadSchemeOptions(true);
    this.refreshView();
  }

  /** Which dealer the invoice is for. Most retailers have one, and then the form just says
   *  who it is; the couple of hundred with a domestic and an agri dealer have to be asked. */
  private loadRetailerDealers(retailerId: number, keepSelected: number | null = null): void {
    this.retailerDealers = [];
    this.form.dealerCustomerId = null;
    if (!(retailerId > 0)) return this.refreshView();

    this.dealersLoading = true;
    this.newInvoiceService.retailerDealers(retailerId).subscribe({
      next: dealers => {
        this.retailerDealers = dealers;
        const keep = dealers.find(dealer => dealer.id === keepSelected);
        this.form.dealerCustomerId = keep ? keep.id : dealers.length === 1 ? dealers[0].id : null;
        this.dealersLoading = false;
        this.refreshView();
      },
      error: () => {
        this.retailerDealers = [];
        this.dealersLoading = false;
        this.refreshView();
      }
    });
  }

  onDealerChange(id: number | string | null): void {
    const dealerId = Number(id || 0);
    this.form.dealerCustomerId = dealerId > 0 ? dealerId : null;
    this.refreshView();
  }

  get dealerSelectOptions(): SearchableSelectOption[] {
    return this.retailerDealers.map(dealer => ({ id: dealer.id, label: dealer.firmName || dealer.name }));
  }

  get singleDealer(): RetailerDealerOption | null {
    return this.retailerDealers.length === 1 ? this.retailerDealers[0] : null;
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
      ? this.newInvoiceService.update(this.form.id, payload, this.selectedAttachmentFiles)
      : this.newInvoiceService.create(payload, this.selectedAttachmentFiles);

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

  openApprovalDialog(invoice: NewInvoiceItem, level: 'ss' | 'sales' | 'ho' | 'hold' | 'reject'): void {
    this.approvalDialog = {
      visible: true,
      invoice,
      level,
      approvedAmount: level === 'reject' || level === 'hold' ? null : this.lastApprovedAmount(invoice, level),
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
    if (level === 'hold' && !this.approvalDialog.remark.trim()) {
      this.showToast('Remark is required to put an invoice on hold.', 'error');
      return;
    }
    if (level !== 'reject' && level !== 'hold' && (!this.approvalDialog.approvedAmount || this.approvalDialog.approvedAmount <= 0)) {
      this.showToast('Approved invoice amount must be greater than 0.', 'error');
      return;
    }

    this.saving = true;
    const request = level === 'reject'
      ? this.newInvoiceService.reject(invoice.id, this.approvalDialog.remark)
      : level === 'hold'
        ? this.newInvoiceService.hold(invoice.id, this.approvalDialog.remark)
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

  /** The dialog is shared by all four actions, so the button says which one it is. */
  approvalActionLabel(): string {
    const level = this.approvalDialog.level;
    if (level === 'reject') return 'Reject';
    if (level === 'hold') return 'Hold This Invoice';
    return 'Approve';
  }

  approvalTitle(): string {
    const level = this.approvalDialog.level;
    if (level === 'reject') return 'Reject Invoice';
    if (level === 'hold') return 'Hold Invoice';
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
      next: blob => this.downloadBlob(blob, `invoice-transactions-${this.dateStamp()}.xlsx`),
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
      case 5: return 'pause_circle';
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

    // Hold stays offered until the invoice is approved; one already on hold has
    // nothing to hold.
    if (status === 5) return invoice.approvalStatus !== 5;

    // Holding does not undo the approvals already given, so a held invoice resumes
    // at the stage its approvals say it reached rather than starting again.
    if (invoice.approvalStatus === 5) return status === 4 || status === this.resumeStatus(invoice);

    if (status === 1) return invoice.approvalStatus === 0;
    if (status === 2) return invoice.approvalStatus === 1;
    if (status === 3) return invoice.approvalStatus === 2;
    if (status === 4) return true;
    return false;
  }

  private resumeStatus(invoice: NewInvoiceItem): number {
    if (invoice.salesApprovedAmount) return 3;
    if (invoice.ssApprovedAmount) return 2;
    return 1;
  }

  titleCase(value?: string | null): string {
    return (value || '-').replace(/\b\w/g, char => char.toUpperCase());
  }


  /// The employee's name with their mobile beside it, so whoever is reviewing the
  /// invoice can call them without going looking for the number.
  assignedEmployeeLabel(invoice: { assignedEmployeeName?: string | null; assignedEmployeeMobile?: string | null }): string {
    const name = (invoice.assignedEmployeeName || '').trim();
    if (!name) return '-';
    const mobile = (invoice.assignedEmployeeMobile || '').trim();
    return mobile ? `${name} (${mobile})` : name;
  }

  formatMoney(value: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value || 0);
  }

  /** Summary tiles only. The listing and the detail panel keep the full figure - it is the
   *  tiles that have to hold a running total across every invoice on screen, and those
   *  already reach crores. Under a lakh the plain amount is clearer than "0.42L". */
  summaryAmount(value: number | null | undefined): string {
    const amount = Number(value) || 0;
    if (Math.abs(amount) < 100000) return this.formatMoney(amount);
    const lakhs = amount / 100000;
    const decimals = Math.abs(lakhs) >= 100 ? 0 : Math.abs(lakhs) >= 10 ? 1 : 2;
    return `₹${Number(lakhs.toFixed(decimals))}L`;
  }

  /** Reward points on the summary tiles, in thousands for the same reason. */
  summaryPoints(value: number | null | undefined): string {
    const points = Number(value) || 0;
    if (Math.abs(points) < 1000) return points.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    const thousands = points / 1000;
    const decimals = Math.abs(thousands) >= 100 ? 0 : Math.abs(thousands) >= 10 ? 1 : 2;
    return `${Number(thousands.toFixed(decimals))}K`;
  }

  exactAmount(value: number | null | undefined): string {
    return this.formatMoney(Number(value) || 0);
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

  // Files come in a few at a time; each pick is added to what is already staged so
  // the user can mix a camera photo, a scan and a PDF into one invoice.
  async onAttachmentChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    if (picked.length === 0) return;

    if (picked.some(file => !isPdfOrImageFile(file))) {
      this.showToast('Only PDF and image files are allowed.', 'error');
      this.refreshView();
      return;
    }

    const room = MAX_INVOICE_ATTACHMENTS - this.attachmentCount();
    if (room <= 0) {
      this.showToast(`An invoice can carry at most ${MAX_INVOICE_ATTACHMENTS} attachments.`, 'error');
      this.refreshView();
      return;
    }
    const accepted = picked.slice(0, room);
    if (accepted.length < picked.length) {
      this.showToast(`Only ${MAX_INVOICE_ATTACHMENTS} attachments are allowed, so ${picked.length - accepted.length} file(s) were skipped.`, 'error');
    }

    this.compressingAttachments = true;
    this.refreshView();
    try {
      for (const file of accepted) {
        try {
          this.selectedAttachmentFiles = [...this.selectedAttachmentFiles, await compressInvoiceAttachment(file)];
        } catch (error) {
          this.showToast(error instanceof Error ? error.message : 'Attachment could not be processed.', 'error');
        }
        this.refreshView();
      }
    } finally {
      this.compressingAttachments = false;
      this.refreshView();
    }
  }

  removeStagedAttachment(index: number): void {
    this.selectedAttachmentFiles = this.selectedAttachmentFiles.filter((_, position) => position !== index);
    this.refreshView();
  }

  removeSavedAttachment(attachment: NewInvoiceAttachment): void {
    this.form.savedAttachments = this.form.savedAttachments.filter(item => item !== attachment);
    // Id 0 means the row came from the legacy single-attachment column, so there is
    // nothing for the API to delete by id - dropping it from the list is enough.
    if (attachment.id > 0) this.removedAttachmentIds = [...this.removedAttachmentIds, attachment.id];
    if (this.form.attachment === attachment.filePath) this.form.attachment = null;
    this.refreshView();
  }

  attachmentCount(): number {
    return this.form.savedAttachments.length + this.selectedAttachmentFiles.length;
  }

  attachmentLabel(): string {
    const count = this.attachmentCount();
    if (count === 0) return 'No file selected';
    return `${count} of ${MAX_INVOICE_ATTACHMENTS} file${count === 1 ? '' : 's'} attached`;
  }

  attachmentFileName(path: string): string {
    const clean = path.split('?')[0].split('#')[0];
    return clean.substring(clean.lastIndexOf('/') + 1) || clean;
  }

  private resetAttachmentPicker(): void {
    this.selectedAttachmentFiles = [];
    this.removedAttachmentIds = [];
    this.compressingAttachments = false;
  }

  mediaUrl(value?: string | null): string {
    if (!value) return '';
    const path = value.trim();
    if (!path) return '';
    if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.backendOrigin}${cleanPath}`;
  }

  // The detail page shows one attachment at a time with a pager over the rest.
  viewerAttachments(): NewInvoiceAttachment[] {
    return this.selectedInvoice?.attachments ?? [];
  }

  currentAttachmentPath(): string | null {
    return this.viewerAttachments()[this.attachmentIndex]?.filePath ?? null;
  }

  stepAttachment(step: number): void {
    const total = this.viewerAttachments().length;
    if (total < 2) return;
    this.attachmentIndex = (this.attachmentIndex + step + total) % total;
    this.attachmentZoom = 1;
    this.attachmentRotation = 0;
    this.syncAttachmentViewer();
    this.refreshView();
  }

  private syncAttachmentViewer(): void {
    const path = this.currentAttachmentPath();
    this.attachmentViewerResourceUrl = path && this.isPdfAttachment(path)
      ? this.sanitizer.bypassSecurityTrustResourceUrl(this.mediaUrl(path))
      : null;
  }

  zoomAttachment(change: number): void {
    this.attachmentZoom = Math.min(3, Math.max(0.5, this.attachmentZoom + change));
    this.refreshView();
  }

  resetAttachmentZoom(): void {
    this.attachmentZoom = 1;
    this.attachmentRotation = 0;
    this.refreshView();
  }

  rotateAttachment(step: number): void {
    this.attachmentRotation = (this.attachmentRotation + step + 360) % 360;
    this.refreshView();
  }

  /** A quarter turn makes the image's footprint as wide as the frame is tall, which on
   *  this portrait panel is wider than the frame. The body scrolls, and zoom out brings
   *  the whole bill back into view - the same way any document viewer behaves. */
  attachmentRotationStyle(): string {
    return `rotate(${this.attachmentRotation}deg)`;
  }

  toggleAttachmentFullscreen(): void {
    this.attachmentFullscreen = !this.attachmentFullscreen;
    this.refreshView();
  }

  // Product lookup on the invoice detail: the icon expands into a search box and
  // typing matches the catalogue by product name, part no or description.
  toggleProductSearch(): void {
    this.productSearchOpen = !this.productSearchOpen;
    if (!this.productSearchOpen) this.resetProductSearch();
    else this.focusProductSearchInput();
    this.refreshView();
  }

  closeProductSearch(): void {
    if (!this.productSearchOpen) return;
    this.productSearchOpen = false;
    this.resetProductSearch();
    this.refreshView();
  }

  onProductSearchChange(): void {
    if (this.productSearchTimeoutId) window.clearTimeout(this.productSearchTimeoutId);
    const term = this.productSearchTerm.trim();
    this.selectedProduct = null;
    if (!term) {
      this.productSearchResults = [];
      this.productSearchLoading = false;
      this.refreshView();
      return;
    }
    this.productSearchLoading = true;
    this.refreshView();
    this.productSearchTimeoutId = window.setTimeout(() => this.searchProducts(term), 350);
  }

  selectProduct(product: ProductItem): void {
    this.selectedProduct = product;
    this.productSearchTerm = product.productName;
    this.productSearchResults = [];
    this.refreshView();
  }

  clearProductSearch(): void {
    this.productSearchTerm = '';
    this.productSearchResults = [];
    this.selectedProduct = null;
    this.productSearchLoading = false;
    this.focusProductSearchInput();
    this.refreshView();
  }

  // Legacy catalogue rows carry a placeholder part_no ("."), with the real material
  // code in product_code / sap_code - show the first value that is actually a code.
  productCodeLabel(product: ProductItem): string {
    return [product.partNo, product.productCode, product.sapCode].find(value => this.isRealCode(value)) ?? '';
  }

  productSubtitle(product: ProductItem): string {
    return [product.modelNo, product.familyName, product.segmentName]
      .filter(value => this.isRealCode(value))
      .join(' • ');
  }

  private isRealCode(value?: string | null): boolean {
    return !!value && /[a-z0-9]/i.test(value);
  }

  // Clicking anywhere outside the lookup closes it, matching the other dropdowns.
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.productSearchOpen) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('.product-search')) return;
    this.closeProductSearch();
  }

  private searchProducts(term: string): void {
    this.productService.lookupProducts(term).subscribe({
      next: products => {
        // A stale response must not overwrite results for a newer term.
        if (this.productSearchTerm.trim() !== term) return;
        this.productSearchResults = products;
        this.productSearchLoading = false;
        this.refreshView();
      },
      error: error => {
        this.productSearchResults = [];
        this.productSearchLoading = false;
        this.refreshView();
        this.showToast(error.message, 'error');
      }
    });
  }

  private resetProductSearch(): void {
    if (this.productSearchTimeoutId) window.clearTimeout(this.productSearchTimeoutId);
    this.productSearchTimeoutId = undefined;
    this.productSearchTerm = '';
    this.productSearchResults = [];
    this.productSearchLoading = false;
    this.selectedProduct = null;
  }

  private focusProductSearchInput(): void {
    window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('.product-search-input');
      input?.focus();
    });
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
    if (this.compressingAttachments) {
      this.showToast('Attachments are still being processed.', 'error');
      return null;
    }
    if (this.attachmentCount() === 0) {
      this.showToast('Invoice attachment is required.', 'error');
      return null;
    }
    return {
      secondary_customer_id: this.form.secondaryCustomerId,
      dealer_id: this.form.dealerCustomerId,
      scheme_id: this.form.schemeId,
      invoice_number: this.form.invoiceNumber.trim(),
      invoice_date: this.form.invoiceDate,
      amount: Number(this.form.amount),
      points: 0,
      attachment: this.form.attachment,
      removed_attachment_ids: this.removedAttachmentIds
    };
  }

  private toDateInput(value: string): string {
    return kolkataDateInput(value);
  }

  private emptyForm(): InvoiceFormModel {
    return {
      id: null,
      secondaryCustomerId: null,
      dealerCustomerId: null,
      schemeId: null,
      invoiceNumber: '',
      invoiceDate: kolkataTodayInput(),
      amount: null,
      points: 0,
      attachment: null,
      savedAttachments: []
    };
  }

  private emptyStageCounts(): NewInvoiceStageCounts {
    return { pending: 0, hold: 0, approvedSs: 0, approvedSales: 0, approvedHo: 0, rejected: 0 };
  }

  private emptySummary(): NewInvoiceSummary {
    return {
      totalInvoices: 0,
      totalRetailers: 0,
      approvedSs: 0,
      approvedSales: 0,
      approvedHo: 0,
      pending: 0,
      hold: 0,
      rejected: 0,
      totalPoints: 0,
      totalAmount: 0,
      ssApprovalAmount: 0,
      salesApprovalAmount: 0,
      hoApprovalAmount: 0,
      totalDealerNos: 0,
      totalDealerCount: 0,
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
