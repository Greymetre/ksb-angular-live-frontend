import { ChangeDetectorRef, Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, timeout } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { AddressOption, CustomerFilter, CustomerItem, CustomerService, LocationDetails } from '../../services/customer.service';
import { UserService } from '../../services/user.service';
import { BeatRow, BeatService } from '../../services/beat.service';
import { hasOnlyPdfOrImageFiles } from '../../shared/utils/file-validation';
import { formatKolkataDateTime } from '../../shared/utils/date-time';

interface CustomerTypeOption {
  id: number;
  label: string;
}

interface SelectOption {
  id: number | string;
  label: string;
}

interface ToastModel {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

type RetailerApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface CustomerFormModel {
  id: number | null;
  active: string;
  customerType: number | null;
  name: string;
  mobile: string;
  mobileNumbers: string[];
  email: string;
  contactNumber: string;
  customerCode: string;
  parentId: number | null;
  customFields: Record<string, string | null>;
  files: Record<string, File | File[] | null>;
}

@Component({
  standalone: false,
  selector: 'app-customers',
  templateUrl: './customers.component.html',
  styleUrls: ['./customers.component.scss']
})
export class CustomersComponent implements OnInit {
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
  private readonly documentFileKeys = new Set(['documents', 'mou_file', 'gst_attachment', 'pan_attachment', 'aadhar_attachment', 'bank_proof']);

  readonly customerTypes: CustomerTypeOption[] = [
    { id: 1, label: 'Dealer' },
    { id: 2, label: 'Retailer' },
    { id: 3, label: 'Influencer' }
  ];

  readonly distributorStatuses = ['Active', 'Inactive', 'On Hold'];
  readonly distributorStatusOptions: SelectOption[] = this.distributorStatuses.map(status => ({ id: status, label: status }));
  readonly activeStatusOptions: SelectOption[] = [
    { id: 'Y', label: 'Active' },
    { id: 'N', label: 'Inactive' }
  ];
  readonly activeFilterOptions: SelectOption[] = [
    { id: '', label: 'All Status' },
    { id: 'Y', label: 'Active' },
    { id: 'N', label: 'Inactive' }
  ];
  readonly approvalFilterOptions: SelectOption[] = [
    { id: '', label: 'All Approval Statuses' },
    { id: 'APPROVED', label: 'Approved' },
    { id: 'REJECTED', label: 'Rejected' },
    { id: 'PENDING', label: 'Pending' }
  ];
  readonly allCustomerTypeOptions: SelectOption[] = [
    { id: '', label: 'All Customer Types' },
    { id: 1, label: 'Dealer' },
    { id: 2, label: 'Retailer' },
    { id: 3, label: 'Influencer' }
  ];
  readonly registrationTypes = ['Proprietorship', 'Partnership', 'Pvt Ltd', 'LLP'];
  readonly customerSegments = ['AGRI', 'DOMESTIC'];
  readonly bankAccountTypes = ['Savings', 'Current'];
  readonly registrationTypeOptions: SelectOption[] = this.registrationTypes.map(type => ({ id: type, label: type }));
  readonly customerSegmentOptions: SelectOption[] = this.customerSegments.map(segment => ({ id: segment, label: segment }));
  readonly bankAccountTypeOptions: SelectOption[] = this.bankAccountTypes.map(type => ({ id: type, label: type }));

  customers: CustomerItem[] = [];
  totalCustomers = 0;
  showEntries = 10;
  currentPage = 1;
  loading = false;
  saving = false;
  approvalSavingId: number | null = null;

  // Row action menu. Positioned with fixed coordinates because the table scrolls
  // horizontally, and an absolutely positioned menu would be clipped by it.
  actionMenu: { customerId: number; top: number; left: number; flipUp: boolean } | null = null;

  // In-app confirmation, so a destructive action is never one stray click away.
  confirmDialog: {
    customer: CustomerItem;
    action: 'delete' | RetailerApprovalStatus;
    title: string;
    message: string;
    confirmLabel: string;
    danger: boolean;
    needsRemark: boolean;
    remark: string;
    error: string;
  } | null = null;
  uploading = false;
  exporting = false;
  templating = false;
  showFilters = false;
  showModal = false;
  errorMessage = '';
  toast: ToastModel = { visible: false, message: '', type: 'success' };
  form: CustomerFormModel = this.emptyForm();
  filter: CustomerFilter = {};
  addressSearch = {
    country: '',
    state: '',
    district: '',
    city: '',
    pincode: '',
    directPincode: ''
  };

  countries: SelectOption[] = [];
  distributorOptions: SelectOption[] = [];
  employeeOptions: SelectOption[] = [];
  beatOptions: SelectOption[] = [];
  designationOptions: SelectOption[] = [];
  states: SelectOption[] = [];
  districts: SelectOption[] = [];
  cities: SelectOption[] = [];
  pincodes: SelectOption[] = [];

  filterStates: SelectOption[] = [];
  filterCities: SelectOption[] = [];
  filterPincodes: SelectOption[] = [];
  filterCitiesLoading = false;

  private toastTimeoutId?: number;
  private filterSearchTimeoutId?: number;
  private pincodeSearchTimeoutId?: number;
  private formOptionsLoaded = false;
  private employeesLoaded = false;

  constructor(
    private customerService: CustomerService,
    private userService: UserService,
    private beatService: BeatService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadCustomers();
    this.loadEmployees();
    this.loadBeats();
    this.loadDesignationOptions();
    this.loadStates(null, 'filter');
    this.loadCitiesByState(null);
  }

  loadDesignationOptions(): void {
    this.userService.getOptions().subscribe({
      next: options => {
        this.designationOptions = options.designations.map(item => ({ id: item.id, label: item.name }));
        this.refreshView();
      },
      error: () => this.designationOptions = []
    });
  }

  clearFilters(): void {
    this.filter = {};
    this.filterPincodes = [];
    this.loadCitiesByState(null);
    this.resetPage();
  }

  get filteredCustomers(): CustomerItem[] {
    return this.customers;
  }

  get pageStart(): number {
    return (this.currentPage - 1) * this.safeShowEntries;
  }

  get isDistributor(): boolean {
    return this.form.customerType === 1;
  }

  get isRetailer(): boolean {
    return this.form.customerType === 2 || this.form.customerType === 3;
  }

  get canCreate(): boolean {
    return this.authService.hasPermission('customer_create');
  }

  get canEdit(): boolean {
    return this.authService.hasPermission('customer_edit');
  }

  get canActive(): boolean {
    return this.authService.hasPermission('customer_active');
  }

  get canApproveRetailer(): boolean {
    return this.authService.hasPermission('retailer_approve');
  }

  get canRejectRetailer(): boolean {
    return this.authService.hasPermission('retailer_reject');
  }

  get canMarkRetailerPending(): boolean {
    return this.authService.hasPermission('retailer_pending');
  }

  get canDelete(): boolean {
    return this.authService.hasPermission('customer_delete');
  }

  get canShow(): boolean {
    return this.authService.hasPermission('customer_show');
  }

  get canUpload(): boolean {
    return this.authService.hasPermission('customer_upload');
  }

  get canDownload(): boolean {
    return this.authService.hasAnyPermission(['customer_download', 'customers_report']);
  }

  get canTemplate(): boolean {
    return this.authService.hasPermission('customer_template');
  }

  loadCustomers(): void {
    this.loading = true;
    this.errorMessage = '';
    this.customerService.list({ ...this.filter, page: this.currentPage, page_size: this.safeShowEntries }).pipe(
      timeout(20000),
      finalize(() => {
        this.loading = false;
        this.refreshView();
      })
    ).subscribe({
      next: result => {
        this.customers = result.items;
        this.totalCustomers = result.total;
        this.refreshView();
      },
      error: error => {
        this.errorMessage = error.name === 'TimeoutError' ? 'Customer API request timed out.' : error.message;
        this.refreshView();
      }
    });
  }

  scheduleFilterSearch(): void {
    if (this.filterSearchTimeoutId) window.clearTimeout(this.filterSearchTimeoutId);
    this.filterSearchTimeoutId = window.setTimeout(() => {
      this.currentPage = 1;
      this.loadCustomers();
      this.refreshView();
    }, 400);
  }

  resetPage(): void {
    this.currentPage = 1;
    this.loadCustomers();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadCustomers();
  }

  loadDistributors(): void {
    this.customerService.list({ customer_type: 1, active: 'Y', page: 1, page_size: 200 }).subscribe({
      next: result => {
        const remainingPages = Array.from(
          { length: Math.max(0, Math.ceil(result.total / result.pageSize) - 1) },
          (_, index) => this.customerService.list({ customer_type: 1, active: 'Y', page: index + 2, page_size: 200 })
        );
        const setOptions = (items: CustomerItem[]) => {
          this.distributorOptions = items
            .map(distributor => ({ id: distributor.id, label: this.distributorLabel(distributor) }))
            .sort((first, second) => first.label.localeCompare(second.label));
          this.refreshView();
        };
        if (remainingPages.length === 0) return setOptions(result.items);
        forkJoin(remainingPages).subscribe({
          next: pages => setOptions([...result.items, ...pages.flatMap(page => page.items)]),
          error: error => this.showToast(error.message, 'error')
        });
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  loadEmployees(): void {
    if (this.employeesLoaded) return;
    this.employeesLoaded = true;
    this.userService.getOptions().subscribe({
      next: options => {
        this.employeeOptions = options.reportings
          .map(user => ({ id: user.id, label: user.name }))
          .sort((first, second) => first.label.localeCompare(second.label));
        this.refreshView();
      },
      error: error => {
        this.employeesLoaded = false;
        this.showToast(error.message, 'error');
      }
    });
  }

  loadBeats(): void {
    this.beatService.list('', 1, 200).subscribe({
      next: result => {
        const remainingPages = Array.from(
          { length: Math.max(0, Math.ceil(result.total / result.pageSize) - 1) },
          (_, index) => this.beatService.list('', index + 2, 200)
        );
        const setOptions = (beats: BeatRow[]) => {
          this.beatOptions = beats
            .map(beat => ({ id: beat.id, label: beat.beatName }))
            .sort((first, second) => first.label.localeCompare(second.label));
          this.refreshView();
        };
        if (remainingPages.length === 0) return setOptions(result);
        forkJoin(remainingPages).subscribe({
          next: pages => setOptions([...result, ...pages.flatMap(page => [...page])]),
          error: error => this.showToast(error.message, 'error')
        });
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  openCreateModal(): void {
    this.loadFormOptions();
    this.form = this.emptyForm();
    this.resetAddressSearch();
    this.states = [];
    this.districts = [];
    this.cities = [];
    this.pincodes = [];
    this.showModal = true;
    this.refreshView();
  }

  openEditModal(customer: CustomerItem): void {
    this.loadFormOptions();
    this.resetAddressSearch();
    const customFields = { ...customer.customFields };
    customFields['shop_name'] = customFields['shop_name'] || customer.name;
    customFields['mobile_numbers'] = customFields['mobile_numbers'] || customer.mobile || '';
    customFields['country_id'] = customFields['country_id'] || this.idText(customer.countryId);
    customFields['state_id'] = customFields['state_id'] || this.idText(customer.stateId);
    customFields['district_id'] = customFields['district_id'] || this.idText(customer.districtId);
    customFields['city_id'] = customFields['city_id'] || this.idText(customer.cityId);
    customFields['pincode_id'] = customFields['pincode_id'] || this.idText(customer.pincodeId);
    if (customer.customerType === 1) {
      delete customFields['distributor_name'];
      delete customFields['agri_distributor'];
      delete customFields['distributor_name_name'];
      delete customFields['agri_distributor_name'];
    }
    this.form = {
      id: customer.id,
      active: customer.active || 'Y',
      customerType: customer.customerType ?? null,
      name: customer.name || '',
      mobile: customer.mobile || '',
      mobileNumbers: this.readListField(customer.customFields['mobile_numbers'], customer.mobile),
      email: customer.email || '',
      contactNumber: customer.contactNumber || '',
      customerCode: customer.customerCode || '',
      parentId: customer.parentId ?? null,
      customFields,
      files: {}
    };
    this.showModal = true;
    this.loadAddressChain();
    this.refreshView();
  }

  private loadFormOptions(): void {
    if (this.formOptionsLoaded) return;
    this.formOptionsLoaded = true;
    this.loadDistributors();
    this.loadEmployees();
    this.loadBeats();
    this.loadCountries();
  }

  openShowPage(customer: CustomerItem): void {
    this.router.navigate(['/customers', customer.id]);
  }

  closeModal(): void {
    if (this.saving) return;
    this.showModal = false;
    this.refreshView();
  }

  onTypeChange(): void {
    const fields = this.form.customFields;
    if (this.isDistributor) {
      fields['legal_name'] = fields['legal_name'] || this.form.name;
      fields['business_status'] = fields['business_status'] || 'Active';
      delete fields['distributor_name'];
      delete fields['agri_distributor'];
      delete fields['distributor_name_name'];
      delete fields['agri_distributor_name'];
    }
    if (this.isRetailer) {
      fields['shop_name'] = fields['shop_name'] || this.form.name;
      if (this.form.mobileNumbers.length === 0) this.form.mobileNumbers = [this.form.mobile || ''];
    }
    this.refreshView();
  }

  submit(): void {
    const payload = this.buildPayload();
    const name = this.isDistributor ? this.field('legal_name') : this.isRetailer ? this.field('shop_name') : this.form.name;
    const mobile = this.isRetailer ? this.cleanMobileNumbers()[0] : this.form.mobile;
    if (!this.form.customerType) {
      this.showToast('Customer Type is required.', 'error');
      return;
    }
    if (!name?.trim()) {
      this.showToast('Customer Name is required.', 'error');
      return;
    }
    if (!mobile?.trim()) {
      this.showToast('Mobile is required.', 'error');
      return;
    }
    // The dealer code doubles as the dealer login password, so it cannot be blank.
    if (this.isDistributor && !(this.form.customerCode || this.field('distributor_code') || '').trim()) {
      this.showToast('Dealer Code is required.', 'error');
      return;
    }

    this.saving = true;
    const request = this.form.id ? this.customerService.update(this.form.id, payload) : this.customerService.create(payload);
    request.subscribe({
      next: result => {
        this.saving = false;
        this.showModal = false;
        this.showToast(result.message, 'success');
        this.loadCustomers();
        if (this.isDistributor) this.loadDistributors();
        this.refreshView();
      },
      error: error => {
        this.saving = false;
        this.showToast(error.message, 'error');
        this.refreshView();
      }
    });
  }

  toggleActive(customer: CustomerItem, event: Event): void {
    const checked = event.target instanceof HTMLInputElement ? event.target.checked : false;
    const active = checked ? 'Y' : 'N';
    customer.active = active;
    this.customerService.setActive(customer.id, active).subscribe({
      next: result => {
        const summary = result.importResult;
        const message = summary
          ? `Import completed: ${summary.updatedRows} updated, ${summary.importedRows} created, ${summary.failedRows} failed.${summary.errors.length ? ` ${summary.errors.slice(0, 3).join(' ')}` : ''}`
          : result.message;
        this.showToast(message, summary?.failedRows ? 'error' : 'success');
        this.loadCustomers();
        if (customer.customerType === 1) this.loadDistributors();
      },
      error: error => {
        this.showToast(error.message, 'error');
        this.loadCustomers();
      }
    });
  }

  // ---- row action menu -------------------------------------------------------

  isActionMenuOpen(customer: CustomerItem): boolean {
    return this.actionMenu?.customerId === customer.id;
  }

  toggleActionMenu(customer: CustomerItem, event: MouseEvent): void {
    event.stopPropagation();
    if (this.isActionMenuOpen(customer)) {
      this.actionMenu = null;
      this.refreshView();
      return;
    }

    const trigger = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const estimatedHeight = 44 * this.menuActionCount(customer) + 12;
    const flipUp = trigger.bottom + estimatedHeight > window.innerHeight - 8;
    this.actionMenu = {
      customerId: customer.id,
      top: flipUp ? trigger.top - estimatedHeight - 6 : trigger.bottom + 6,
      left: Math.max(8, trigger.right - 200),
      flipUp
    };
    this.refreshView();
  }

  closeActionMenu(): void {
    if (!this.actionMenu) return;
    this.actionMenu = null;
    this.refreshView();
  }

  @HostListener('document:click')
  onDocumentClick(): void { this.closeActionMenu(); }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  onViewportChange(): void { this.closeActionMenu(); }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.confirmDialog) { this.closeConfirm(); return; }
    this.closeActionMenu();
  }

  // ---- contextual actions ------------------------------------------------------
  // The action that would set the status a customer already has is pointless, so
  // it is left out rather than shown and ignored.

  canApproveRow(customer: CustomerItem): boolean {
    return this.canApproveRetailer && this.isRetailerCustomer(customer) && this.approvalStatus(customer) !== 'APPROVED';
  }

  canRejectRow(customer: CustomerItem): boolean {
    return this.canRejectRetailer && this.isRetailerCustomer(customer) && this.approvalStatus(customer) !== 'REJECTED';
  }

  canPendingRow(customer: CustomerItem): boolean {
    return this.canMarkRetailerPending && this.isRetailerCustomer(customer) && this.approvalStatus(customer) !== 'PENDING';
  }

  menuActionCount(customer: CustomerItem): number {
    return [this.canEdit, this.canApproveRow(customer), this.canRejectRow(customer),
            this.canPendingRow(customer), this.canDelete].filter(Boolean).length;
  }

  hasRowActions(customer: CustomerItem): boolean {
    return this.menuActionCount(customer) > 0;
  }

  // ---- confirmation ------------------------------------------------------------

  askDelete(customer: CustomerItem): void {
    this.closeActionMenu();
    this.confirmDialog = {
      customer, action: 'delete',
      title: 'Delete this customer?',
      message: `"${customer.name}" will be removed from the list. This cannot be undone.`,
      confirmLabel: 'Delete', danger: true, needsRemark: false, remark: '', error: ''
    };
    this.refreshView();
  }

  askApproval(customer: CustomerItem, status: RetailerApprovalStatus): void {
    this.closeActionMenu();
    const copy = {
      APPROVED: { title: 'Approve this retailer?', message: `"${customer.name}" will be marked as approved.`, label: 'Approve' },
      REJECTED: { title: 'Reject this retailer?', message: `"${customer.name}" will be marked as rejected. A reason is required.`, label: 'Reject' },
      PENDING: { title: 'Move back to pending?', message: `"${customer.name}" will go back to pending for review.`, label: 'Mark Pending' }
    }[status];

    this.confirmDialog = {
      customer, action: status,
      title: copy.title, message: copy.message, confirmLabel: copy.label,
      danger: status === 'REJECTED', needsRemark: status === 'REJECTED', remark: '', error: ''
    };
    this.refreshView();
  }

  closeConfirm(): void {
    this.confirmDialog = null;
    this.refreshView();
  }

  runConfirmedAction(): void {
    const dialog = this.confirmDialog;
    if (!dialog) return;

    if (dialog.needsRemark && !dialog.remark.trim()) {
      dialog.error = 'Please enter a reason.';
      this.refreshView();
      return;
    }

    const customer = dialog.customer;
    const action = dialog.action;
    const remark = dialog.remark.trim() || null;
    this.confirmDialog = null;

    if (action === 'delete') this.deleteCustomer(customer);
    else this.changeApprovalStatus(customer, action, remark);
  }

  deleteCustomer(customer: CustomerItem): void {
    this.customerService.delete(customer.id).subscribe({
      next: result => {
        this.showToast(result.message, 'success');
        this.loadCustomers();
        if (customer.customerType === 1) this.loadDistributors();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  changeApprovalStatus(customer: CustomerItem, status: RetailerApprovalStatus, remark: string | null = null): void {
    if (!this.isRetailerCustomer(customer)) return;
    if (status === 'REJECTED' && !remark) return;

    this.approvalSavingId = customer.id;
    this.customerService.setApprovalStatus(customer.id, status, remark).pipe(finalize(() => {
      this.approvalSavingId = null;
      this.refreshView();
    })).subscribe({
      next: result => {
        const updatedCustomer = result.item;
        if (updatedCustomer) {
          this.customers = this.customers.map(item => item.id === customer.id ? updatedCustomer : item);
        } else {
          customer.customFields = { ...customer.customFields, status, remark };
        }
        this.showToast(result.message, 'success');
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  triggerUpload(): void {
    this.fileInput?.nativeElement.click();
  }

  upload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploading = true;
    this.showToast('Importing...', 'success');
    this.customerService.upload(file).pipe(finalize(() => {
      this.uploading = false;
      input.value = '';
      this.refreshView();
    })).subscribe({
      next: result => {
        this.showToast(result.message, 'success');
        this.loadCustomers();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  exportCustomers(): void {
    if (!this.filter.customer_type) {
      this.showToast('Please select Customer Type before export.', 'error');
      return;
    }

    this.exporting = true;
    this.showToast('Exporting...', 'success');
    this.customerService.export(this.filter).pipe(finalize(() => {
      this.exporting = false;
      this.refreshView();
    })).subscribe({
      next: blob => this.downloadBlob(blob, this.exportFileName()),
      error: error => this.showToast(error.message, 'error')
    });
  }

  downloadTemplate(): void {
    this.templating = true;
    this.showToast('Preparing template...', 'success');
    this.customerService.template().pipe(finalize(() => {
      this.templating = false;
      this.refreshView();
    })).subscribe({
      next: blob => this.downloadBlob(blob, 'customers-template.xlsx'),
      error: error => this.showToast(error.message, 'error')
    });
  }

  loadCountries(): void {
    this.customerService.options('getcountry', 'countries').subscribe({
      next: options => {
        this.countries = options.map(option => ({ id: option.id, label: option.countryName || option.name }));
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  searchPincodeAndFill(): void {
    const pincode = this.addressSearch.directPincode.trim();
    if (!pincode) {
      this.showToast('Enter pincode to search.', 'error');
      return;
    }

    this.customerService.locationDetails({ pincode }).subscribe({
      next: locations => {
        const location = locations[0];
        if (!location) {
          this.showToast('Pincode not found.', 'error');
          return;
        }
        this.applyLocation(location);
        this.showToast('Address details filled from pincode.', 'success');
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  onDirectPincodeChange(value: string): void {
    if (this.pincodeSearchTimeoutId) window.clearTimeout(this.pincodeSearchTimeoutId);
    const pincode = value.trim();
    if (pincode.length < 6) return;
    this.pincodeSearchTimeoutId = window.setTimeout(() => this.searchPincodeAndFill(), 450);
  }

  onCountryChange(scope: 'form' | 'filter'): void {
    const countryId = scope === 'form' ? this.numField('country_id') : null;
    if (scope === 'form') {
      this.setField('state_id', null);
      this.setField('district_id', null);
      this.setField('city_id', null);
      this.setField('pincode_id', null);
      this.states = [];
      this.districts = [];
      this.cities = [];
      this.pincodes = [];
      if (countryId) this.loadStates(countryId, 'form');
    }
  }

  onStateChange(scope: 'form' | 'filter'): void {
    const stateId = scope === 'form' ? this.numField('state_id') : this.filter.state_id;
    if (scope === 'form') {
      this.setField('district_id', null);
      this.setField('city_id', null);
      this.setField('pincode_id', null);
      this.districts = [];
      this.cities = [];
      this.pincodes = [];
      if (stateId) this.loadDistricts(stateId, 'form');
      return;
    }
    this.filter.city_id = null;
    this.filter.pincode_id = null;
    this.filterPincodes = [];
    this.loadCitiesByState(stateId || null);
    this.loadCustomers();
  }

  onDistrictChange(): void {
    const districtId = this.numField('district_id');
    this.setField('city_id', null);
    this.setField('pincode_id', null);
    this.cities = [];
    this.pincodes = [];
    if (districtId) this.loadCities(districtId, 'form');
  }

  onCityChange(scope: 'form' | 'filter'): void {
    const cityId = scope === 'form' ? this.numField('city_id') : this.filter.city_id;
    if (scope === 'form') {
      this.setField('pincode_id', null);
      this.pincodes = [];
      if (cityId) this.loadPincodes(cityId, 'form');
      return;
    }
    this.filter.pincode_id = null;
    this.filterPincodes = [];
    if (cityId) this.loadPincodes(cityId, 'filter');
    this.loadCustomers();
  }

  onFilterCountryChange(countryId: number | null): void {
    this.filter.state_id = null;
    this.filter.city_id = null;
    this.filter.pincode_id = null;
    this.filterStates = [];
    this.filterCities = [];
    this.filterPincodes = [];
    if (countryId) this.loadStates(countryId, 'filter');
    else this.loadStates(null, 'filter');
    this.loadCustomers();
  }

  setField(key: string, value: string | number | null): void {
    this.form.customFields[key] = value === null || value === '' ? null : String(value);
  }

  setListField(key: string, values: number[] | string[]): void {
    const cleanValues = values.map(value => String(value)).filter(Boolean);
    this.form.customFields[key] = cleanValues.length > 0 ? cleanValues.join(',') : null;
  }

  addMobileNumber(): void {
    if (this.form.mobileNumbers.length >= 5) {
      this.showToast('You can add up to 5 mobile numbers.', 'error');
      return;
    }
    this.form.mobileNumbers = [...this.form.mobileNumbers, ''];
    this.refreshView();
  }

  removeMobileNumber(index: number): void {
    if (this.form.mobileNumbers.length <= 1) return;
    this.form.mobileNumbers = this.form.mobileNumbers.filter((_, itemIndex) => itemIndex !== index);
    this.refreshView();
  }

  updateMobileNumber(index: number, value: string): void {
    this.form.mobileNumbers[index] = value;
    if (index === 0) this.form.mobile = value;
  }

  trackByIndex(index: number): number {
    return index;
  }

  onFileChange(key: string, event: Event, multiple = false): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    if (this.documentFileKeys.has(key) && !hasOnlyPdfOrImageFiles(files)) {
      this.form.files[key] = multiple ? [] : null;
      input.value = '';
      this.showToast('Only PDF and image files are allowed.', 'error');
      return;
    }
    if (!this.documentFileKeys.has(key) && files.some(file => !this.isImageFile(file))) {
      this.form.files[key] = multiple ? [] : null;
      input.value = '';
      this.showToast('Only image files are allowed.', 'error');
      return;
    }
    this.form.files[key] = multiple ? files : files[0] || null;
    this.refreshView();
  }

  fileLabel(key: string): string {
    const value = this.form.files[key];
    if (Array.isArray(value) && value.length > 0) return `${value.length} file selected`;
    if (value instanceof File) return value.name;
    return this.field(key) ? 'Current file saved' : 'No file selected';
  }

  field(key: string): string {
    return this.form.customFields[key] || '';
  }

  filteredOptions(options: SelectOption[], search: string): SelectOption[] {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(option => option.label.toLowerCase().includes(q) || String(option.id).includes(q));
  }

  numField(key: string): number | null {
    return this.parseIdList(this.field(key))[0] ?? null;
  }

  numListField(key: string): number[] {
    return this.parseIdList(this.field(key));
  }

  private parseIdList(value: string | null | undefined): number[] {
    const ids = new Set<number>();
    const collect = (candidate: unknown, depth = 0): void => {
      if (depth > 6 || candidate === null || candidate === undefined || candidate === '') return;
      if (Array.isArray(candidate)) {
        candidate.forEach(item => collect(item, depth + 1));
        return;
      }
      if (typeof candidate === 'number') {
        if (Number.isSafeInteger(candidate) && candidate > 0) ids.add(candidate);
        return;
      }
      const text = String(candidate).trim();
      const number = Number(text);
      if (Number.isSafeInteger(number) && number > 0) {
        ids.add(number);
        return;
      }
      try {
        collect(JSON.parse(text), depth + 1);
        return;
      } catch {
        text.split(',').forEach(item => {
          const parsed = Number(item.replace(/[\[\]"\\]/g, '').trim());
          if (Number.isSafeInteger(parsed) && parsed > 0) ids.add(parsed);
        });
      }
    };
    collect(value);
    return [...ids];
  }

  typeName(customer: CustomerItem): string {
    return customer.customerTypeName || this.customerTypes.find(type => type.id === customer.customerType)?.label || `Type ${customer.customerType}`;
  }

  isRetailerCustomer(customer: CustomerItem): boolean {
    const typeName = this.typeName(customer).toLowerCase();
    const fieldType = customer.customFields['customer_type'];
    return customer.customerType === 2 || fieldType === '2' || typeName.includes('retailer');
  }

  approvalStatus(customer: CustomerItem): RetailerApprovalStatus {
    const status = (customer.customFields['status'] || customer.customFields['visit_status'] || 'PENDING').toUpperCase();
    return status === 'APPROVED' || status === 'REJECTED' ? status : 'PENDING';
  }

  approvalBadgeClass(customer: CustomerItem): string {
    return `approval-badge ${this.approvalStatus(customer).toLowerCase()}`;
  }

  distributorLabel(customer: CustomerItem): string {
    const code = customer.customerCode || customer.customFields['distributor_code'];
    const legalName = customer.customFields['legal_name'] || customer.name;
    return [code, legalName].filter(Boolean).join(' - ') || customer.name;
  }

  formatDate(value?: string | null): string {
    return formatKolkataDateTime(value, '');
  }

  private buildPayload(): FormData {
    const fields = { ...this.form.customFields };
    const name = this.isDistributor ? this.field('legal_name') : this.isRetailer ? this.field('shop_name') : this.form.name;
    const retailerMobiles = this.cleanMobileNumbers();
    const mobile = this.isRetailer ? retailerMobiles[0] || '' : this.form.mobile || this.field('mobile_number');
    const contactNumber = this.form.contactNumber || this.field('whatsapp_number') || this.field('alternate_mobile');

    fields['customer_type'] = this.form.customerType ? String(this.form.customerType) : null;
    fields['name'] = name;
    fields['mobile'] = mobile;
    fields['mobile_number'] = mobile;
    fields['email'] = this.form.email || null;
    fields['customer_code'] = this.form.customerCode || this.field('distributor_code') || null;
    fields['contact_number'] = contactNumber || null;

    if (this.isDistributor) {
      fields['alternate_mobile'] = this.form.contactNumber || null;
      fields['distributor_code'] = this.form.customerCode || this.field('distributor_code') || null;
    }

    if (this.isRetailer) {
      fields['mobile_numbers'] = retailerMobiles.join(',');
      fields['whatsapp_number'] = this.form.contactNumber || null;
    }

    const formData = new FormData();
    this.appendValue(formData, 'active', this.form.active);
    this.appendValue(formData, 'customer_type', this.form.customerType);
    this.appendValue(formData, 'name', name);
    this.appendValue(formData, 'mobile', mobile);
    this.appendValue(formData, 'email', this.form.email);
    this.appendValue(formData, 'contact_number', contactNumber);
    this.appendValue(formData, 'customer_code', this.form.customerCode || this.field('distributor_code'));
    this.appendValue(formData, 'parent_id', this.form.parentId);
    formData.append('custom_fields', JSON.stringify(fields));
    Object.entries(this.form.files).forEach(([key, value]) => this.appendFile(formData, key, value));
    return formData;
  }

  private appendValue(formData: FormData, key: string, value: string | number | null | undefined): void {
    if (value !== null && value !== undefined && String(value).trim() !== '') formData.append(key, String(value));
  }

  private appendFile(formData: FormData, key: string, value: File | File[] | null): void {
    if (Array.isArray(value)) {
      value.forEach(file => formData.append(key, file));
      return;
    }
    if (value instanceof File) formData.append(key, value);
  }

  private cleanMobileNumbers(): string[] {
    return this.form.mobileNumbers.map(value => value.trim()).filter(Boolean);
  }

  private isImageFile(file: File): boolean {
    return file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp)$/i.test(file.name);
  }

  private readListField(value: string | null | undefined, fallback?: string | null): string[] {
    if (!value) return fallback ? [fallback] : [''];
    const rows = value.split(',').map(item => item.trim()).filter(Boolean);
    return rows.length > 0 ? rows.slice(0, 5) : fallback ? [fallback] : [''];
  }

  private idText(value?: number | null): string | null {
    return value && value > 0 ? String(value) : null;
  }

  private loadAddressChain(): void {
    const countryId = this.numField('country_id');
    const stateId = this.numField('state_id');
    const districtId = this.numField('district_id');
    const cityId = this.numField('city_id');
    if (countryId) this.loadStates(countryId, 'form');
    if (stateId) this.loadDistricts(stateId, 'form');
    if (districtId) this.loadCities(districtId, 'form');
    if (cityId) this.loadPincodes(cityId, 'form');
  }

  private loadStates(countryId: number | null, scope: 'form' | 'filter'): void {
    this.customerService.options('getstate', 'states', { country_id: countryId }).subscribe({
      next: options => {
        const mapped = options.map(option => ({ id: option.id, label: option.stateName || option.name }));
        if (scope === 'form') this.states = mapped;
        else this.filterStates = mapped;
        this.refreshView();
      }
    });
  }

  private loadDistricts(stateId: number, scope: 'form'): void {
    this.customerService.options('getdistrict', 'districts', { state_id: stateId }).subscribe({
      next: options => {
        this.districts = options.map(option => ({ id: option.id, label: option.districtName || option.name }));
        this.refreshView();
      }
    });
  }

  private loadCities(districtId: number, scope: 'form'): void {
    this.customerService.options('getcity', 'cities', { district_id: districtId }).subscribe({
      next: options => {
        this.cities = options.map(option => ({ id: option.id, label: option.cityName || option.name }));
        this.refreshView();
      }
    });
  }

  private loadCitiesByState(stateId: number | null): void {
    this.filterCitiesLoading = true;
    this.customerService.options('getcity', 'cities', stateId ? { state_id: stateId } : {}).subscribe({
      next: options => {
        this.filterCities = options.map(option => ({ id: option.id, label: option.cityName || option.name }));
        this.filterCitiesLoading = false;
        this.refreshView();
      },
      error: () => {
        this.filterCities = [];
        this.filterCitiesLoading = false;
        this.refreshView();
      }
    });
  }

  private loadPincodes(cityId: number, scope: 'form' | 'filter'): void {
    this.customerService.options('getpincode', 'pincodes', { city_id: cityId }).subscribe({
      next: options => {
        const mapped = options.map(option => ({ id: option.id, label: option.pincode || option.name }));
        if (scope === 'form') this.pincodes = mapped;
        else this.filterPincodes = mapped;
        this.refreshView();
      }
    });
  }

  private applyLocation(location: LocationDetails): void {
    const country = this.toSelectOption(location.country);
    const state = this.toSelectOption(location.state);
    const district = this.toSelectOption(location.district);
    const city = this.toSelectOption(location.city);
    const pincode = location.pincodes[0] ? this.toSelectOption(location.pincodes[0]) : null;

    if (country) {
      this.countries = this.mergeOption(this.countries, country);
      this.setField('country_id', country.id);
    }
    if (state) {
      this.states = this.mergeOption(this.states, state);
      this.setField('state_id', state.id);
    }
    if (district) {
      this.districts = this.mergeOption(this.districts, district);
      this.setField('district_id', district.id);
    }
    if (city) {
      this.cities = this.mergeOption(this.cities, city);
      this.setField('city_id', city.id);
    }
    if (pincode) {
      this.pincodes = this.mergeOption(this.pincodes, pincode);
      this.setField('pincode_id', pincode.id);
    }

    if (country) this.loadStates(Number(country.id), 'form');
    if (state) this.loadDistricts(Number(state.id), 'form');
    if (district) this.loadCities(Number(district.id), 'form');
    if (city) this.loadPincodes(Number(city.id), 'form');
    this.refreshView();
  }

  private toSelectOption(option?: AddressOption | null): SelectOption | null {
    if (!option) return null;
    const label = option.countryName || option.stateName || option.districtName || option.cityName || option.pincode || option.name || String(option.id);
    return { id: option.id, label };
  }

  private mergeOption(options: SelectOption[], option: SelectOption): SelectOption[] {
    return options.some(item => item.id === option.id) ? options : [option, ...options];
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

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  private exportFileName(): string {
    const type = this.customerTypes.find(item => item.id === this.filter.customer_type)?.label || 'customers';
    return `${type.toLowerCase()}-customers.xlsx`;
  }

  private refreshView(): void {
    this.cdr.detectChanges();
  }

  private get safeShowEntries(): number {
    const value = Number(this.showEntries);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
  }

  private resetAddressSearch(): void {
    this.addressSearch = {
      country: '',
      state: '',
      district: '',
      city: '',
      pincode: '',
      directPincode: ''
    };
  }

  private emptyForm(): CustomerFormModel {
    return {
      id: null,
      active: 'Y',
      customerType: 1,
      name: '',
      mobile: '',
      mobileNumbers: [''],
      email: '',
      contactNumber: '',
      customerCode: '',
      parentId: null,
      files: {},
      customFields: {
        business_status: 'Active'
      }
    };
  }
}
