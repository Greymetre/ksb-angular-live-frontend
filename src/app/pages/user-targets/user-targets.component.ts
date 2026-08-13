import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { finalize, timeout } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { UserOption } from '../../services/user.service';
import { UserTarget, UserTargetFilters, UserTargetPayload, UserTargetService } from '../../services/user-target.service';
import { kolkataTodayInput } from '../../shared/utils/date-time';

interface ToastModel {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

@Component({
  standalone: false,
  selector: 'app-user-targets',
  templateUrl: './user-targets.component.html',
  styleUrls: ['./user-targets.component.scss']
})
export class UserTargetsComponent implements OnInit {
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  readonly months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  targets: UserTarget[] = [];
  users: UserOption[] = [];
  branches: UserOption[] = [];
  divisions: UserOption[] = [];
  years: number[] = [];

  showEntries = 10;
  currentPage = 1;
  searchQuery = '';
  appliedSearchQuery = '';
  selectedBranchId: number | null = null;
  selectedUserId: number | null = null;
  selectedDivisionId: number | null = null;
  selectedType = '';
  selectedMonth = '';
  selectedFinancialYear = '';

  loading = false;
  saving = false;
  uploading = false;
  exporting = false;
  templating = false;
  showFilters = false;
  showModal = false;
  errorMessage = '';
  toast: ToastModel = { visible: false, message: '', type: 'success' };
  private toastTimeoutId?: number;
  private searchTimeoutId?: number;

  form: UserTargetPayload & { id: number | null } = this.emptyForm();

  constructor(
    private userTargetService: UserTargetService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadOptions();
    this.loadTargets();
  }

  get filteredTargets(): UserTarget[] {
    const query = this.appliedSearchQuery.trim().toLowerCase();
    if (!query) return this.targets;
    return this.targets.filter(row =>
      (row.employeeCode ?? '').toLowerCase().includes(query)
      || (row.userName ?? '').toLowerCase().includes(query)
      || (row.designationName ?? '').toLowerCase().includes(query)
      || (row.branchName ?? '').toLowerCase().includes(query)
      || row.type.toLowerCase().includes(query)
    );
  }

  get pagedTargets(): UserTarget[] {
    return this.filteredTargets.slice(this.pageStart, this.pageStart + this.safeShowEntries);
  }

  get pageStart(): number {
    return (this.currentPage - 1) * this.safeShowEntries;
  }

  get financialYears(): string[] {
    return this.years.map(year => `${year - 1}-${year}`);
  }

  get canCreate(): boolean {
    return this.authService.hasPermission('target_users_access_create');
  }

  get canEdit(): boolean {
    return this.authService.hasPermission('target_users_access_edit');
  }

  get canDelete(): boolean {
    return this.authService.hasPermission('target_users_access_delete');
  }

  get canUpload(): boolean {
    return this.authService.hasPermission('sales_target_users_upload');
  }

  get canExport(): boolean {
    return this.authService.hasPermission('sales_target_users_download');
  }

  get canTemplate(): boolean {
    return this.authService.hasPermission('sales_target_users_template');
  }

  loadTargets(): void {
    this.loading = true;
    this.errorMessage = '';
    this.currentPage = 1;
    this.userTargetService.getTargets(this.currentFilters()).pipe(
      timeout(20000),
      finalize(() => {
        this.loading = false;
        this.refreshView();
      })
    ).subscribe({
      next: rows => {
        this.targets = rows;
        this.refreshView();
      },
      error: error => {
        this.errorMessage = error.name === 'TimeoutError' ? 'User Target API request timed out.' : error.message;
        this.refreshView();
      }
    });
  }

  loadOptions(): void {
    this.userTargetService.getOptions().pipe(timeout(20000)).subscribe({
      next: options => {
        this.users = options.users;
        this.branches = options.branches;
        this.divisions = options.divisions;
        this.years = options.years;
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  applyFilters(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.loadTargets();
  }

  scheduleSearch(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.searchTimeoutId = window.setTimeout(() => {
      this.appliedSearchQuery = this.searchQuery;
      this.currentPage = 1;
      this.loadTargets();
      this.refreshView();
    }, 400);
  }

  clearFilters(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.selectedBranchId = null;
    this.selectedUserId = null;
    this.selectedDivisionId = null;
    this.selectedType = '';
    this.selectedMonth = '';
    this.selectedFinancialYear = '';
    this.searchQuery = '';
    this.appliedSearchQuery = '';
    this.loadTargets();
  }

  resetPage(): void {
    this.currentPage = 1;
  }

  openCreateModal(): void {
    this.form = this.emptyForm();
    this.showModal = true;
    this.errorMessage = '';
    this.refreshView();
  }

  openEditModal(row: UserTarget): void {
    this.form = {
      id: row.id,
      userId: row.userId,
      type: row.type,
      month: row.month,
      year: row.year,
      target: row.target
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

  submitTarget(): void {
    if (!this.form.userId) {
      this.showToast('User is required.', 'error');
      return;
    }
    if (!this.form.type || !this.form.month || !this.form.year || this.form.target === null) {
      this.showToast('Type, Month, Year and Target are required.', 'error');
      return;
    }

    this.saving = true;
    const request = this.form.id
      ? this.userTargetService.updateTarget(this.form.id, this.form)
      : this.userTargetService.createTarget(this.form);

    request.pipe(finalize(() => {
      this.saving = false;
      this.refreshView();
    })).subscribe({
      next: result => {
        this.showModal = false;
        this.showToast(result.message, 'success');
        this.loadTargets();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  deleteTarget(row: UserTarget): void {
    if (!confirm(`Delete User Target for "${row.userName || row.userId}"?`)) return;
    this.userTargetService.deleteTarget(row.id).subscribe({
      next: result => {
        this.showToast(result.message, 'success');
        this.loadTargets();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  triggerUpload(): void {
    this.fileInput?.nativeElement.click();
  }

  uploadTargets(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploading = true;
    this.showToast('Importing...', 'success');
    this.userTargetService.uploadTargets(file).pipe(finalize(() => {
      this.uploading = false;
      input.value = '';
      this.refreshView();
    })).subscribe({
      next: result => {
        this.showToast(result.message, 'success');
        this.loadTargets();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  exportTargets(): void {
    this.exporting = true;
    this.showToast('Exporting...', 'success');
    this.userTargetService.exportTargets(this.currentFilters()).pipe(finalize(() => {
      this.exporting = false;
      this.refreshView();
    })).subscribe({
      next: blob => this.downloadBlob(blob, `sales-target-users-${this.dateStamp()}.xlsx`),
      error: error => this.showToast(error.message, 'error')
    });
  }

  downloadTemplate(): void {
    this.templating = true;
    this.showToast('Preparing template...', 'success');
    this.userTargetService.downloadTemplate().pipe(finalize(() => {
      this.templating = false;
      this.refreshView();
    })).subscribe({
      next: blob => this.downloadBlob(blob, 'sales-target-users-template.xlsx'),
      error: error => this.showToast(error.message, 'error')
    });
  }

  private currentFilters(): UserTargetFilters {
    return {
      branchId: this.selectedBranchId,
      userId: this.selectedUserId,
      divisionId: this.selectedDivisionId,
      type: this.selectedType || null,
      month: this.selectedMonth || null,
      financialYear: this.selectedFinancialYear || null,
      search: this.appliedSearchQuery || null
    };
  }

  private get safeShowEntries(): number {
    const value = Number(this.showEntries);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
  }

  private emptyForm(): UserTargetPayload & { id: number | null } {
    return { id: null, userId: null, type: 'primary', month: '', year: '', target: null };
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

  private dateStamp(): string {
    return kolkataTodayInput();
  }

  private refreshView(): void {
    this.cdr.detectChanges();
  }
}
