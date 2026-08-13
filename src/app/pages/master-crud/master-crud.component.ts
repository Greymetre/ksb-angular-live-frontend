import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription, timeout } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { MasterConfig, MasterCrudService, MasterItem, MasterPayload } from '../../services/master-crud.service';
import { formatKolkataDateTime } from '../../shared/utils/date-time';

interface MasterRouteConfig extends MasterConfig {
  title: string;
  singular: string;
  icon: string;
  permission: string;
  exportPermission?: string;
  nameField: 'branchName' | 'divisionName' | 'designationName' | 'name';
  nameLabel: string;
  fileName: string;
  hasBranchCode?: boolean;
}

interface MasterFormModel {
  id: number | null;
  active: string;
  branchName: string;
  branchCode: string;
  divisionName: string;
  designationName: string;
  name: string;
}

interface ToastModel {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

@Component({
  standalone: false,
  selector: 'app-master-crud',
  templateUrl: './master-crud.component.html',
  styleUrls: ['./master-crud.component.scss']
})
export class MasterCrudComponent implements OnInit, OnDestroy {
  items: MasterItem[] = [];
  showEntries = 10;
  currentPage = 1;
  searchQuery = '';
  appliedSearchQuery = '';
  loading = false;
  saving = false;
  exporting = false;
  showModal = false;
  errorMessage = '';
  toast: ToastModel = { visible: false, message: '', type: 'success' };
  form: MasterFormModel = this.emptyForm();
  config!: MasterRouteConfig;

  private routeSub?: Subscription;
  private toastTimeoutId?: number;
  private searchTimeoutId?: number;

  constructor(
    private route: ActivatedRoute,
    private masterService: MasterCrudService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.data.subscribe(data => {
      this.config = data['masterConfig'] as MasterRouteConfig;
      this.items = [];
      this.searchQuery = '';
      this.appliedSearchQuery = '';
      this.currentPage = 1;
      this.closeModal();
      this.loadItems();
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    if (this.toastTimeoutId) window.clearTimeout(this.toastTimeoutId);
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
  }

  get filteredItems(): MasterItem[] {
    const q = this.appliedSearchQuery.trim().toLowerCase();
    if (!q) return this.items;

    return this.items.filter(item =>
      this.displayName(item).toLowerCase().includes(q)
      || (item.branchCode ?? '').toLowerCase().includes(q)
      || (item.createdByName ?? '').toLowerCase().includes(q)
    );
  }

  get pagedItems(): MasterItem[] {
    return this.filteredItems.slice(this.pageStart, this.pageStart + this.safeShowEntries);
  }

  get pageStart(): number {
    return (this.currentPage - 1) * this.safeShowEntries;
  }

  get canCreate(): boolean {
    return this.authService.hasPermission(this.config.permission);
  }

  get canEdit(): boolean {
    return this.authService.hasPermission(this.config.permission);
  }

  get canDelete(): boolean {
    return this.authService.hasPermission(this.config.permission);
  }

  get canExport(): boolean {
    return this.authService.hasAnyPermission([this.config.exportPermission || '', this.config.permission]);
  }

  loadItems(): void {
    this.loading = true;
    this.errorMessage = '';
    this.currentPage = 1;

    this.masterService.list(this.config, '').pipe(
      timeout(20000),
      finalize(() => {
        this.loading = false;
        this.refreshView();
      })
    ).subscribe({
      next: items => {
        this.items = items;
        this.refreshView();
      },
      error: error => {
        this.errorMessage = error.name === 'TimeoutError'
          ? `${this.config.singular} API request timed out.`
          : error.message;
        this.refreshView();
      }
    });
  }

  resetPage(): void {
    this.currentPage = 1;
  }

  scheduleSearch(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.searchTimeoutId = window.setTimeout(() => {
      this.appliedSearchQuery = this.searchQuery;
      this.currentPage = 1;
      this.refreshView();
    }, 400);
  }

  openCreateModal(): void {
    this.form = this.emptyForm();
    this.showModal = true;
    this.errorMessage = '';
    this.refreshView();
  }

  openEditModal(item: MasterItem): void {
    this.form = {
      id: item.id,
      active: item.active || 'Y',
      branchName: item.branchName || '',
      branchCode: item.branchCode || '',
      divisionName: item.divisionName || '',
      designationName: item.designationName || '',
      name: item.name || ''
    };
    this.showModal = true;
    this.errorMessage = '';
    this.refreshView();
  }

  closeModal(): void {
    if (this.saving) return;
    this.showModal = false;
    this.refreshView();
  }

  submit(): void {
    const payload = this.buildPayload();
    if (!this.displayFormName().trim()) {
      this.showToast(`${this.config.nameLabel} is required.`, 'error');
      return;
    }

    if (this.config.hasBranchCode && !this.form.branchCode.trim()) {
      this.showToast('Branch code is required.', 'error');
      return;
    }

    this.saving = true;
    const request = this.form.id
      ? this.masterService.update(this.config, this.form.id, payload)
      : this.masterService.create(this.config, payload);

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

  toggleActive(item: MasterItem, event: Event): void {
    const checked = event.target instanceof HTMLInputElement ? event.target.checked : false;
    const nextActive = checked ? 'Y' : 'N';
    item.active = nextActive;
    this.refreshView();

    this.masterService.setActive(this.config, item.id, nextActive).subscribe({
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

  deleteItem(item: MasterItem): void {
    if (!confirm(`Delete ${this.config.singular.toLowerCase()} "${this.displayName(item)}"?`)) return;

    this.loading = true;
    this.masterService.delete(this.config, item.id).subscribe({
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

  exportItems(): void {
    this.exporting = true;
    this.showToast('Exporting...', 'success');
    this.masterService.export(this.config).pipe(finalize(() => {
      this.exporting = false;
      this.refreshView();
    })).subscribe({
      next: blob => this.downloadBlob(blob, this.config.fileName),
      error: error => this.showToast(error.message, 'error')
    });
  }

  displayName(item: MasterItem): string {
    return item.branchName || item.divisionName || item.designationName || item.name || '';
  }

  formatDate(value?: string | null): string {
    return formatKolkataDateTime(value, '');
  }

  private buildPayload(): MasterPayload {
    if (this.config.nameField === 'branchName') {
      return {
        active: this.form.active,
        branch_name: this.form.branchName.trim(),
        branch_code: this.form.branchCode.trim()
      };
    }

    if (this.config.nameField === 'divisionName') {
      return { active: this.form.active, division_name: this.form.divisionName.trim() };
    }

    if (this.config.nameField === 'designationName') {
      return { active: this.form.active, designation_name: this.form.designationName.trim() };
    }

    return { active: this.form.active, name: this.form.name.trim() };
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

  private emptyForm(): MasterFormModel {
    return {
      id: null,
      active: 'Y',
      branchName: '',
      branchCode: '',
      divisionName: '',
      designationName: '',
      name: ''
    };
  }
}
