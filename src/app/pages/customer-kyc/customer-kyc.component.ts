import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { API_ORIGIN } from '../../config/api.config';
import { AuthService } from '../../services/auth.service';
import { CustomerService } from '../../services/customer.service';
import { SearchableSelectOption } from '../../shared/components/searchable-select/searchable-select.component';
import {
  CustomerKycService,
  KycCustomerItem,
  KycDocumentState,
  KycStatus,
  KycSummary
} from '../../services/customer-kyc.service';

@Component({
  standalone: false,
  selector: 'app-customer-kyc',
  templateUrl: './customer-kyc.component.html',
  styleUrls: ['./customer-kyc.component.scss']
})
export class CustomerKycComponent implements OnInit, OnDestroy {
  customers: KycCustomerItem[] = [];
  summary: KycSummary = { totalCustomers: 0, approved: 0, completePending: 0, partial: 0, notStarted: 0, rejected: 0 };
  dealerOptions: SearchableSelectOption[] = [];
  loading = false;
  errorMessage = '';
  showFilters = false;

  total = 0;
  currentPage = 1;
  showEntries = 10;

  filter: { search: string; customer_type: number | null; kyc_status: string | null; dealer_id: number | null } = {
    search: '',
    customer_type: null,
    kyc_status: null,
    dealer_id: null
  };

  readonly customerTypeOptions: SearchableSelectOption[] = [
    { id: 1, label: 'Dealer' },
    { id: 2, label: 'Retailer' },
    { id: 3, label: 'Influencer' }
  ];

  readonly kycStatusOptions: SearchableSelectOption[] = [
    { id: 'approved', label: 'Fully Approved' },
    { id: 'complete_pending', label: 'Awaiting Review' },
    { id: 'partial', label: 'Partly Submitted' },
    { id: 'none', label: 'Not Started' },
    { id: 'rejected', label: 'Has a Rejection' }
  ];

  /** The columns are fixed rather than read from the first row, so the table keeps its
   *  shape on an empty page and a customer missing a document still lines up. */
  readonly documentColumns = [
    { key: 'gst', label: 'GST', detailLabel: 'GST number' },
    { key: 'pan', label: 'PAN', detailLabel: 'PAN number' },
    { key: 'aadhar', label: 'Aadhaar', detailLabel: 'Aadhaar number' },
    { key: 'bank', label: 'Bank Proof', detailLabel: 'Account number' }
  ];

  /// The document popup: one customer, one document, opened from the grid.
  viewer: {
    visible: boolean;
    customer: KycCustomerItem | null;
    document: KycDocumentState | null;
    action: 'approve' | 'reject' | null;
    remark: string;
  } = { visible: false, customer: null, document: null, action: null, remark: '' };
  savingReview = false;
  editingDetails = false;
  savingDetails = false;
  detailEdit: Record<string, string> = {};
  /// A stored path is no guarantee the file is still there. When it will not load, the
  /// popup says so instead of showing a broken image.
  attachmentBroken = false;
  toast: { visible: boolean; message: string; type: 'success' | 'error' } = { visible: false, message: '', type: 'success' };

  private searchTimeoutId: number | null = null;
  private toastTimeoutId: number | null = null;

  constructor(
    private kycService: CustomerKycService,
    private customerService: CustomerService,
    private authService: AuthService,
    private router: Router,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {}

  /** The app runs without zone.js, so nothing repaints on its own when an HTTP callback
   *  or a timer changes what is on screen - every async update has to say so itself. */
  private refreshView(): void {
    this.cdr.detectChanges();
  }

  ngOnInit(): void {
    this.load();
    this.loadDealers();
  }

  /** The dealer list is small and never changes mid-session, so it is fetched once. */
  private loadDealers(): void {
    this.kycService.dealers().subscribe({
      next: dealers => {
        this.dealerOptions = dealers.map(dealer => ({ id: dealer.id, label: dealer.name }));
        this.refreshView();
      },
      error: () => {
        this.dealerOptions = [];
        this.refreshView();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    if (this.toastTimeoutId) window.clearTimeout(this.toastTimeoutId);
  }

  get canEditCustomer(): boolean {
    return this.authService.hasPermission('customer.edit');
  }

  startDetailEdit(): void {
    const document = this.viewer.document;
    if (!document) return;
    this.detailEdit = {};
    for (const detail of document.details) {
      if (detail.key) this.detailEdit[detail.key] = detail.value ?? '';
    }
    this.editingDetails = true;
    this.refreshView();
  }

  cancelDetailEdit(): void {
    this.editingDetails = false;
    this.detailEdit = {};
    this.refreshView();
  }

  saveDetails(): void {
    const customer = this.viewer.customer;
    const document = this.viewer.document;
    if (!customer || !document) return;

    this.savingDetails = true;
    // The stored set has to go back whole: the update replaces custom_fields outright, so
    // reading the customer first is what stops everything else being wiped.
    this.customerService.get(customer.id).subscribe({
      next: existing => {
        const fields: Record<string, string | null> = { ...existing.customFields };
        for (const [key, value] of Object.entries(this.detailEdit)) {
          fields[key] = value.trim() === '' ? null : value.trim();
        }
        const payload = new FormData();
        payload.append('customer_type', String(existing.customerType ?? ''));
        payload.append('name', existing.name ?? '');
        payload.append('custom_fields', JSON.stringify(fields));

        this.customerService.update(customer.id, payload).subscribe({
          next: result => {
            this.savingDetails = false;
            this.editingDetails = false;
            this.detailEdit = {};
            this.showToast(result.message || 'Details updated', 'success');
            // The row's detail counts and the popup both move with this, so the list is read
        // again and the open popup re-pointed at the fresh document rather than closed.
        this.load(() => {
          const customerId = this.viewer.customer?.id;
          const documentKey = this.viewer.document?.key;
          const fresh = this.customers.find(item => item.id === customerId);
          const document = fresh?.documents.find(item => item.key === documentKey);
          if (fresh && document) this.viewer = { ...this.viewer, customer: fresh, document };
        });
          },
          error: error => {
            this.savingDetails = false;
            this.showToast(error.message, 'error');
            this.refreshView();
          }
        });
      },
      error: error => {
        this.savingDetails = false;
        this.showToast(error.message, 'error');
        this.refreshView();
      }
    });
  }

  get canReviewKyc(): boolean {
    return this.authService.hasPermission('customer.kyc_review');
  }

  /// Opens the document itself - what was uploaded, what was typed in, and where the
  /// review stands - without leaving the list.
  openDocument(customer: KycCustomerItem, document: KycDocumentState | null): void {
    if (!document) return;
    this.viewer = { visible: true, customer, document, action: null, remark: '' };
    this.attachmentBroken = false;
    this.refreshView();
  }

  closeDocument(): void {
    if (this.savingReview) return;
    this.viewer = { visible: false, customer: null, document: null, action: null, remark: '' };
    this.refreshView();
  }

  startReview(action: 'approve' | 'reject'): void {
    this.viewer.action = action;
    this.viewer.remark = action === 'reject' ? this.viewer.document?.remark || '' : '';
    this.refreshView();
  }

  cancelReview(): void {
    this.viewer.action = null;
    this.viewer.remark = '';
    this.refreshView();
  }

  submitReview(): void {
    const { customer, document, action, remark } = this.viewer;
    if (!customer || !document || !action) return;
    // A rejection the dealer cannot read is a rejection they cannot answer.
    if (action === 'reject' && !remark.trim()) {
      this.showToast('Remark is required to reject a document.', 'error');
      return;
    }

    this.savingReview = true;
    this.refreshView();
    const request = action === 'approve'
      ? this.customerService.approveKyc(customer.id, document.key, remark)
      : this.customerService.rejectKyc(customer.id, document.key, remark);

    request.subscribe({
      next: result => {
        this.savingReview = false;
        this.closeDocument();
        this.showToast(result.message || 'KYC updated successfully.', 'success');
        // The tiles and the row both move with this, so the page is read again.
        this.load();
      },
      error: (error: Error) => {
        this.savingReview = false;
        this.showToast(error.message, 'error');
        this.refreshView();
      }
    });
  }

  /// The uploaded file, resolved the same way the customer page resolves it.
  attachmentUrl(document: KycDocumentState | null): string {
    const path = document?.attachmentPath?.trim();
    if (!path) return '';
    if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
    const normalized = /^(secondary-customers|secondary_customers|distributors)\//i.test(path) ? `storage/${path}` : path;
    return `${API_ORIGIN}${normalized.startsWith('/') ? normalized : '/' + normalized}`;
  }

  onAttachmentError(): void {
    this.attachmentBroken = true;
    this.refreshView();
  }

  isPdf(document: KycDocumentState | null): boolean {
    return (document?.attachmentPath || '').toLowerCase().endsWith('.pdf');
  }

  /** A PDF goes into a frame, which Angular will only accept from a trusted URL. */
  safeAttachmentUrl(document: KycDocumentState | null): SafeResourceUrl | null {
    const url = this.attachmentUrl(document);
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    if (!message) return;
    this.toast = { visible: true, message, type };
    this.refreshView();
    if (this.toastTimeoutId) window.clearTimeout(this.toastTimeoutId);
    this.toastTimeoutId = window.setTimeout(() => {
      this.toast = { ...this.toast, visible: false };
      this.refreshView();
    }, 3500);
  }

  load(onLoaded?: () => void): void {
    this.loading = true;
    this.errorMessage = '';
    this.refreshView();
    this.kycService.list({
      page: this.currentPage,
      page_size: this.showEntries,
      search: this.filter.search || null,
      customer_type: this.filter.customer_type,
      kyc_status: this.filter.kyc_status,
      dealer_id: this.filter.dealer_id
    }).subscribe({
      next: result => {
        this.customers = result.items;
        this.summary = result.summary;
        this.total = result.total;
        this.loading = false;
        onLoaded?.();
        this.refreshView();
      },
      error: (error: Error) => {
        this.customers = [];
        this.errorMessage = error.message;
        this.loading = false;
        this.refreshView();
      }
    });
  }

  /** Typing should not fire a request per keystroke on a list this size. */
  scheduleSearch(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.searchTimeoutId = window.setTimeout(() => this.resetPage(), 400);
    this.refreshView();
  }

  resetPage(): void {
    this.currentPage = 1;
    this.load();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.load();
  }

  clearFilters(): void {
    this.filter = { search: '', customer_type: null, kyc_status: null, dealer_id: null };
    this.resetPage();
  }

  /** The tiles double as filters: the count you are looking at is the list you get. */
  applyStatusTile(status: string | null): void {
    this.filter.kyc_status = this.filter.kyc_status === status ? null : status;
    this.resetPage();
  }

  get selectedDealerName(): string {
    const selected = this.dealerOptions.find(option => option.id === this.filter.dealer_id);
    return selected?.label || '';
  }

  /** The name opens the customer where the KYC work happens, not on the details tab. */
  openKyc(customer: KycCustomerItem): void {
    if (customer.id > 0) this.router.navigate(['/customers', customer.id], { queryParams: { tab: 'kyc' } });
  }

  documentFor(customer: KycCustomerItem, key: string): KycDocumentState | null {
    return customer.documents.find(document => document.key === key) || null;
  }

  /** The wording on the tiles, reused on the row so the two always agree. */
  stageLabel(stage: string): string {
    switch (stage) {
      case 'approved': return 'Fully Approved';
      case 'complete_pending': return 'Awaiting Review';
      case 'partial': return 'Partly Submitted';
      default: return 'Not Started';
    }
  }

  statusLabel(status: KycStatus): string {
    return status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Pending';
  }

  /** Pending covers two different situations - nothing has been submitted yet, or it has
   *  and a reviewer has not looked at it. They need different reading, so the untouched
   *  ones stay neutral and only the ones actually waiting on a reviewer carry amber. */
  documentState(document: KycDocumentState | null): string {
    if (!document) return 'empty';
    if (document.status !== 'pending') return document.status;
    return document.uploaded || document.detailsFilled ? 'pending' : 'empty';
  }

  documentStateLabel(document: KycDocumentState | null): string {
    const state = this.documentState(document);
    return state === 'empty' ? 'Not Started' : this.statusLabel(state as KycStatus);
  }

  /** What the reviewer needs to know before opening the record: whichever step is the
   *  one still outstanding. */
  documentHint(document: KycDocumentState | null, detailLabel: string): string {
    if (!document) return 'Not applicable';
    if (document.status === 'approved') return `Approved${document.actionByName ? ' by ' + document.actionByName : ''}`;
    if (document.status === 'rejected') return document.remark ? `Rejected: ${document.remark}` : 'Rejected';
    if (!document.uploaded && !document.detailsFilled) return 'Nothing submitted yet';
    if (!document.uploaded) return 'Document not uploaded';
    if (!document.detailsFilled) return `${detailLabel} not entered`;
    return 'Ready for review';
  }

  detailTitle(document: KycDocumentState | null, detailLabel: string): string {
    if (!document) return '';
    return document.detailsFilled && document.detailSummary
      ? `${detailLabel}: ${document.detailSummary}`
      : `${detailLabel} not entered`;
  }

  progressPercent(customer: KycCustomerItem): number {
    if (!customer.documentCount) return 0;
    return Math.round((customer.approvedCount / customer.documentCount) * 100);
  }

  get pageStart(): number {
    return (this.currentPage - 1) * this.showEntries;
  }

  formatDate(value: string | null): string {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '-'
      : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
