import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription, timeout } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { AddressConfig, AddressItem, AddressMasterService, AddressPayload } from '../../services/address-master.service';
import { formatKolkataDateTime } from '../../shared/utils/date-time';
import { SearchableSelectOption } from '../../shared/components/searchable-select/searchable-select.component';

interface AddressRouteConfig extends AddressConfig {
  title: string;
  singular: string;
  icon: string;
  permissionPrefix: string;
  nameField: 'countryName' | 'stateName' | 'districtName' | 'cityName' | 'pincode';
  nameLabel: string;
  fileName: string;
  parent?: {
    field: 'countryId' | 'stateId' | 'districtId' | 'cityId';
    label: string;
    path: string;
    key: string;
    display: 'countryName' | 'stateName' | 'districtName' | 'cityName';
  };
  hasGstCode?: boolean;
  hasGrade?: boolean;
}

interface AddressFormModel {
  id: number | null;
  active: string;
  countryName: string;
  stateName: string;
  districtName: string;
  cityName: string;
  pincode: string;
  countryId: number | null;
  stateId: number | null;
  districtId: number | null;
  cityId: number | null;
  gstCode: string;
  grade: string;
}

interface ToastModel {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

@Component({
  standalone: false,
  selector: 'app-address-master',
  templateUrl: './address-master.component.html',
  styleUrls: ['./address-master.component.scss']
})
export class AddressMasterComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  items: AddressItem[] = [];
  parentOptions: AddressItem[] = [];
  showEntries = 10;
  currentPage = 1;
  totalItems = 0;
  searchQuery = '';
  appliedSearchQuery = '';
  loading = false;
  optionsLoading = false;
  saving = false;
  uploading = false;
  exporting = false;
  templating = false;
  showModal = false;
  errorMessage = '';
  toast: ToastModel = { visible: false, message: '', type: 'success' };
  form: AddressFormModel = this.emptyForm();
  config!: AddressRouteConfig;

  private routeSub?: Subscription;
  private toastTimeoutId?: number;
  private searchTimeoutId?: number;

  constructor(
    private route: ActivatedRoute,
    private addressService: AddressMasterService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.data.subscribe(data => {
      this.config = data['addressConfig'] as AddressRouteConfig;
      this.items = [];
      this.parentOptions = [];
      this.searchQuery = '';
      this.appliedSearchQuery = '';
      this.currentPage = 1;
      this.showModal = false;
      this.loadItems();
      if (!this.isPincode) this.loadOptions();
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    if (this.toastTimeoutId) window.clearTimeout(this.toastTimeoutId);
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
  }

  get pagedItems(): AddressItem[] {
    return this.items;
  }

  get pageStart(): number {
    return (this.currentPage - 1) * this.safeShowEntries;
  }

  get canCreate(): boolean {
    return this.authService.hasPermission(`${this.config.permissionPrefix}_create`);
  }

  get canEdit(): boolean {
    return this.authService.hasPermission(`${this.config.permissionPrefix}_edit`);
  }

  get canActive(): boolean {
    return this.authService.hasPermission(`${this.config.permissionPrefix}_active`);
  }

  get canDelete(): boolean {
    return this.authService.hasPermission(`${this.config.permissionPrefix}_delete`);
  }

  get canUpload(): boolean {
    return this.authService.hasPermission(`${this.config.permissionPrefix}_upload`);
  }

  get canDownload(): boolean {
    return this.authService.hasPermission(`${this.config.permissionPrefix}_download`);
  }

  get canTemplate(): boolean {
    return this.authService.hasPermission(`${this.config.permissionPrefix}_template`);
  }

  loadItems(): void {
    this.loading = true;
    this.errorMessage = '';
    this.addressService.listPaged(this.config, this.currentPage, this.safeShowEntries, this.appliedSearchQuery).pipe(
      timeout(20000),
      finalize(() => {
        this.loading = false;
        this.refreshView();
      })
    ).subscribe({
      next: result => {
        this.items = result.items;
        this.totalItems = result.total;
        this.currentPage = result.page;
        this.refreshView();
      },
      error: error => {
        this.errorMessage = error.name === 'TimeoutError' ? `${this.config.singular} API request timed out.` : error.message;
        this.refreshView();
      }
    });
  }

  resetPage(): void {
    this.currentPage = 1;
    this.loadItems();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadItems();
  }

  scheduleSearch(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.searchTimeoutId = window.setTimeout(() => {
      this.appliedSearchQuery = this.searchQuery;
      this.currentPage = 1;
      this.loadItems();
    }, 400);
  }

  loadOptions(): void {
    if (!this.config.parent) return;

    this.optionsLoading = true;
    this.addressService.options(this.config.parent.path, this.config.parent.key).pipe(
      finalize(() => {
        this.optionsLoading = false;
        this.refreshView();
      })
    ).subscribe({
      next: options => {
        this.parentOptions = options;
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  openCreateModal(): void {
    this.form = this.emptyForm();
    this.showModal = true;
    this.errorMessage = '';
    if (this.isPincode && this.parentOptions.length === 0) this.loadOptions();
    this.refreshView();
  }

  openEditModal(item: AddressItem): void {
    this.form = {
      id: item.id,
      active: item.active || 'Y',
      countryName: item.countryName || '',
      stateName: item.stateName || '',
      districtName: item.districtName || '',
      cityName: item.cityName || '',
      pincode: item.pincode || '',
      countryId: item.countryId ?? null,
      stateId: item.stateId ?? null,
      districtId: item.districtId ?? null,
      cityId: item.cityId ?? null,
      gstCode: item.gstCode || '',
      grade: item.grade || ''
    };
    this.showModal = true;
    this.errorMessage = '';
    if (this.isPincode && this.parentOptions.length === 0) this.loadOptions();
    this.refreshView();
  }

  closeModal(): void {
    if (this.saving) return;
    this.showModal = false;
    this.refreshView();
  }

  submit(): void {
    if (!this.displayFormName().trim()) {
      this.showToast(`${this.config.nameLabel} is required.`, 'error');
      return;
    }
    if (this.config.parent && !this.form[this.config.parent.field]) {
      this.showToast(`${this.config.parent.label} is required.`, 'error');
      return;
    }
    if (this.config.hasGstCode && !this.form.gstCode.trim()) {
      this.showToast('GST Code is required.', 'error');
      return;
    }

    this.saving = true;
    const payload = this.buildPayload();
    const request = this.form.id
      ? this.addressService.update(this.config, this.form.id, payload)
      : this.addressService.create(this.config, payload);

    request.subscribe({
      next: result => {
        this.saving = false;
        this.showModal = false;
        this.showToast(result.message, 'success');
        this.loadItems();
        this.refreshView();
      },
      error: error => {
        this.saving = false;
        this.showToast(error.message, 'error');
        this.refreshView();
      }
    });
  }

  toggleActive(item: AddressItem, event: Event): void {
    const checked = event.target instanceof HTMLInputElement ? event.target.checked : false;
    const nextActive = checked ? 'Y' : 'N';
    item.active = nextActive;
    this.refreshView();

    this.addressService.setActive(this.config, item.id, nextActive).subscribe({
      next: result => {
        this.showToast(result.message, 'success');
        this.loadItems();
      },
      error: error => {
        this.showToast(error.message, 'error');
        this.loadItems();
      }
    });
  }

  deleteItem(item: AddressItem): void {
    if (!confirm(`Delete ${this.config.singular.toLowerCase()} "${this.displayName(item)}"?`)) return;

    this.loading = true;
    this.addressService.delete(this.config, item.id).subscribe({
      next: result => {
        this.showToast(result.message, 'success');
        this.loadItems();
      },
      error: error => {
        this.loading = false;
        this.showToast(error.message, 'error');
        this.refreshView();
      }
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
    this.addressService.upload(this.config, file).pipe(
      finalize(() => {
        this.uploading = false;
        input.value = '';
        this.refreshView();
      })
    ).subscribe({
      next: result => {
        this.showToast(result.message, 'success');
        this.loadItems();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  exportItems(): void {
    this.exporting = true;
    this.showToast('Exporting...', 'success');
    this.addressService.export(this.config).pipe(finalize(() => {
      this.exporting = false;
      this.refreshView();
    })).subscribe({
      next: blob => this.downloadBlob(blob, this.config.fileName),
      error: error => this.showToast(error.message, 'error')
    });
  }

  downloadTemplate(): void {
    this.templating = true;
    this.showToast('Preparing template...', 'success');
    this.addressService.template(this.config).pipe(finalize(() => {
      this.templating = false;
      this.refreshView();
    })).subscribe({
      next: blob => this.downloadBlob(blob, `${this.config.path}-template.xlsx`),
      error: error => this.showToast(error.message, 'error')
    });
  }

  displayName(item: AddressItem): string {
    return item[this.config.nameField] || '';
  }

  parentName(item: AddressItem): string {
    if (!this.config.parent) return '';
    return item[this.config.parent.display] || '';
  }

  parentDisplay(option: AddressItem): string {
    return this.config.parent ? option[this.config.parent.display] || '' : '';
  }

  get parentSelectOptions(): SearchableSelectOption[] {
    return this.parentOptions.map(option => ({ id: option.id, label: this.parentDisplay(option) }));
  }

  formatDate(value?: string | null): string {
    return formatKolkataDateTime(value, '');
  }

  private buildPayload(): AddressPayload {
    const active = this.form.active;
    if (this.config.nameField === 'countryName') return { active, country_name: this.form.countryName.trim() };
    if (this.config.nameField === 'stateName') return { active, state_name: this.form.stateName.trim(), country_id: this.form.countryId, gst_code: this.form.gstCode.trim() };
    if (this.config.nameField === 'districtName') return { active, district_name: this.form.districtName.trim(), state_id: this.form.stateId };
    if (this.config.nameField === 'cityName') return { active, city_name: this.form.cityName.trim(), district_id: this.form.districtId };
    return { active, pincode: this.form.pincode.trim(), city_id: this.form.cityId };
  }

  private displayFormName(): string {
    return this.form[this.config.nameField] || '';
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

  private refreshView(): void {
    this.cdr.detectChanges();
  }

  private get safeShowEntries(): number {
    const value = Number(this.showEntries);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
  }

  get isPincode(): boolean {
    return this.config?.nameField === 'pincode';
  }

  private emptyForm(): AddressFormModel {
    return {
      id: null,
      active: 'Y',
      countryName: '',
      stateName: '',
      districtName: '',
      cityName: '',
      pincode: '',
      countryId: null,
      stateId: null,
      districtId: null,
      cityId: null,
      gstCode: '',
      grade: ''
    };
  }
}
