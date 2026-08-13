import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize, timeout } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { UserOption } from '../../services/user.service';
import { Expense, ExpenseOptions, ExpensePayload, ExpenseService } from '../../services/expense.service';
import { ExpenseType } from '../../services/expense-type.service';
import { API_ORIGIN } from '../../config/api.config';
import { hasOnlyPdfOrImageFiles } from '../../shared/utils/file-validation';
import { formatKolkataDateTime, kolkataTodayInput } from '../../shared/utils/date-time';

interface ToastModel {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

interface StatusDialogModel {
  visible: boolean;
  expense: Expense | null;
  status: number | null;
  approveAmount: number | null;
  reason: string;
}

@Component({
  standalone: false,
  selector: 'app-expenses',
  templateUrl: './expenses.component.html',
  styleUrls: ['./expenses.component.scss']
})
export class ExpensesComponent implements OnInit {
  rows: Expense[] = [];
  users: UserOption[] = [];
  expenseTypes: ExpenseType[] = [];
  branches: UserOption[] = [];
  divisions: UserOption[] = [];
  payrolls: UserOption[] = [];
  statuses: UserOption[] = [];

  showEntries = 10;
  currentPage = 1;
  searchQuery = '';
  appliedSearchQuery = '';
  showFilters = false;
  loading = false;
  saving = false;
  statusSaving = false;
  showModal = false;
  showDetailsModal = false;
  errorMessage = '';
  toast: ToastModel = { visible: false, message: '', type: 'success' };
  private toastTimeoutId?: number;
  private searchTimeoutId?: number;

  selectedUserId: number | null = null;
  selectedExpenseTypeId: number | null = null;
  selectedBranchId: number | null = null;
  selectedDivisionId: number | null = null;
  selectedPayroll = '';
  selectedStatus: number | null = null;
  startDate = '';
  endDate = '';
  expenseId: number | null = null;

  form: ExpensePayload & { id: number | null } = this.emptyForm();
  selectedFiles: File[] = [];
  selectedExpense: Expense | null = null;
  statusDialog: StatusDialogModel = this.emptyStatusDialog();

  constructor(
    private expenseService: ExpenseService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadOptions();
    this.loadRows();
  }

  get filteredRows(): Expense[] {
    const query = this.appliedSearchQuery.trim().toLowerCase();
    if (!query) return this.rows;
    return this.rows.filter(row =>
      String(row.id).includes(query)
      || row.date.toLowerCase().includes(query)
      || (row.userName ?? '').toLowerCase().includes(query)
      || (row.designationName ?? '').toLowerCase().includes(query)
      || (row.expenseTypeName ?? '').toLowerCase().includes(query)
      || row.checkerStatusName.toLowerCase().includes(query)
      || (row.note ?? '').toLowerCase().includes(query)
    );
  }

  get pagedRows(): Expense[] {
    return this.filteredRows.slice(this.pageStart, this.pageStart + this.safeShowEntries);
  }

  get pageStart(): number {
    return (this.currentPage - 1) * this.safeShowEntries;
  }

  get pendingCount(): number {
    return this.rows.filter(row => row.checkerStatus === 0).length;
  }

  get approvedCount(): number {
    return this.rows.filter(row => row.checkerStatus === 1).length;
  }

  get rejectedCount(): number {
    return this.rows.filter(row => row.checkerStatus === 2).length;
  }

  get checkedCount(): number {
    return this.rows.filter(row => row.checkerStatus === 3 || row.checkerStatus === 4).length;
  }

  get selectedFormType(): ExpenseType | undefined {
    return this.expenseTypes.find(type => type.id === this.form.expensesType);
  }

  get isTravelling(): boolean {
    return this.selectedFormType?.allowanceTypeId === 1;
  }

  get canCreate(): boolean {
    return this.authService.hasPermission('expenses_create');
  }

  get canEdit(): boolean {
    return this.authService.hasPermission('expenses_edit');
  }

  get canDelete(): boolean {
    return this.authService.hasPermission('expenses_delete');
  }

  get canApprove(): boolean {
    return this.authService.hasPermission('expenses_authority');
  }

  loadRows(): void {
    this.loading = true;
    this.errorMessage = '';
    this.currentPage = 1;
    this.expenseService.list({
      executiveId: this.selectedUserId,
      expensesType: this.selectedExpenseTypeId,
      branchId: this.selectedBranchId,
      divisionId: this.selectedDivisionId,
      payroll: this.selectedPayroll || null,
      status: this.selectedStatus,
      startDate: this.startDate || null,
      endDate: this.endDate || null,
      expenseId: this.expenseId,
      search: null
    }).pipe(
      timeout(20000),
      finalize(() => {
        this.loading = false;
        this.refreshView();
      })
    ).subscribe({
      next: rows => {
        this.rows = rows;
        this.refreshView();
      },
      error: error => {
        this.errorMessage = error.name === 'TimeoutError' ? 'Expense API request timed out.' : error.message;
        this.refreshView();
      }
    });
  }

  loadOptions(): void {
    this.expenseService.options().pipe(timeout(20000)).subscribe({
      next: (options: ExpenseOptions) => {
        this.users = options.users;
        this.expenseTypes = options.expenseTypes;
        this.branches = options.branches;
        this.divisions = options.divisions;
        this.payrolls = options.payrolls;
        this.statuses = options.statuses;
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  applyFilters(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.loadRows();
  }

  scheduleSearch(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.searchTimeoutId = window.setTimeout(() => {
      this.appliedSearchQuery = this.searchQuery;
      this.currentPage = 1;
      this.refreshView();
    }, 400);
  }

  clearFilters(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.selectedUserId = null;
    this.selectedExpenseTypeId = null;
    this.selectedBranchId = null;
    this.selectedDivisionId = null;
    this.selectedPayroll = '';
    this.selectedStatus = null;
    this.startDate = '';
    this.endDate = '';
    this.expenseId = null;
    this.searchQuery = '';
    this.appliedSearchQuery = '';
    this.loadRows();
  }

  resetPage(): void {
    this.currentPage = 1;
  }

  openCreateModal(): void {
    this.form = this.emptyForm();
    this.selectedFiles = [];
    this.showModal = true;
    this.refreshView();
  }

  openEditModal(row: Expense): void {
    this.form = {
      id: row.id,
      expensesType: row.expensesType,
      userId: row.userId,
      date: row.date,
      claimAmount: row.claimAmount,
      approveAmount: row.approveAmount,
      startKm: row.startKm,
      stopKm: row.stopKm,
      totalKm: row.totalKm,
      note: row.note,
      reason: row.reason,
      attachments: []
    };
    this.selectedFiles = [];
    this.calculateClaim();
    this.showModal = true;
    this.refreshView();
  }

  closeModal(): void {
    if (this.saving) return;
    this.showModal = false;
    this.refreshView();
  }

  submit(): void {
    this.calculateClaim();
    if (!this.form.userId || !this.form.expensesType || !this.form.date) {
      this.showToast('Employee, Date and Expense Type are required.', 'error');
      return;
    }
    if (this.isTravelling && (!this.form.startKm || !this.form.stopKm)) {
      this.showToast('Start Km and End Km are required for Travelling.', 'error');
      return;
    }
    if (this.form.claimAmount === null) {
      this.showToast('Claim Amount is required.', 'error');
      return;
    }
    this.form.attachments = this.selectedFiles;
    this.saving = true;
    const request = this.form.id
      ? this.expenseService.update(this.form.id, this.form)
      : this.expenseService.create(this.form);

    request.pipe(finalize(() => {
      this.saving = false;
      this.refreshView();
    })).subscribe({
      next: result => {
        this.showModal = false;
        this.showToast(result.message, 'success');
        this.loadRows();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  deleteRow(row: Expense): void {
    if (!confirm(`Delete Expense #${row.id}?`)) return;
    this.expenseService.delete(row.id).subscribe({
      next: result => {
        this.showToast(result.message, 'success');
        this.loadRows();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  openStatusDialog(row: Expense, status: number): void {
    this.statusDialog = {
      visible: true,
      expense: row,
      status,
      approveAmount: status === 1 ? row.approveAmount ?? row.claimAmount : null,
      reason: row.reason || ''
    };
    this.refreshView();
  }

  closeStatusDialog(): void {
    if (this.statusSaving) return;
    this.statusDialog = this.emptyStatusDialog();
    this.refreshView();
  }

  submitStatusDialog(): void {
    const row = this.statusDialog.expense;
    const status = this.statusDialog.status;
    if (!row || status === null) return;

    let approveAmount: number | null | undefined = undefined;
    let reason: string | null | undefined = this.statusDialog.reason.trim();
    if (status === 1) {
      approveAmount = Number(this.statusDialog.approveAmount);
      if (!Number.isFinite(approveAmount) || approveAmount < 0) {
        this.showToast('Approve amount is invalid.', 'error');
        return;
      }
      if (approveAmount > row.claimAmount) {
        this.showToast('Approve amount cannot be greater than claim amount.', 'error');
        return;
      }
    } else if (status === 2 && !reason) {
      this.showToast('Reason is required for rejection.', 'error');
      return;
    }

    this.statusSaving = true;
    this.expenseService.status(row.id, status, approveAmount, reason).pipe(
      finalize(() => {
        this.statusSaving = false;
        this.refreshView();
      })
    ).subscribe({
      next: result => {
        this.showToast(result.message, 'success');
        if (result.expense && this.selectedExpense?.id === row.id) this.selectedExpense = result.expense;
        this.statusDialog = this.emptyStatusDialog();
        this.loadRows();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  onExpenseTypeChange(): void {
    this.calculateClaim();
  }

  onKmChange(): void {
    this.calculateClaim();
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!hasOnlyPdfOrImageFiles(files)) {
      this.selectedFiles = [];
      input.value = '';
      this.showToast('Only PDF and image files are allowed.', 'error');
      return;
    }
    this.selectedFiles = files;
  }

  openDetails(row: Expense): void {
    this.selectedExpense = row;
    this.showDetailsModal = true;
    this.refreshView();
  }

  closeDetailsModal(): void {
    this.showDetailsModal = false;
    this.selectedExpense = null;
    this.refreshView();
  }

  attachmentUrl(url: string): string {
    if (!url) return '#';
    if (url.startsWith('http')) return url;
    const baseUrl = this.apiOrigin();
    return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  isImageAttachment(file: { mimeType?: string | null; fileName?: string | null }): boolean {
    const mimeType = file.mimeType?.toLowerCase() ?? '';
    const fileName = file.fileName?.toLowerCase() ?? '';
    return mimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(fileName);
  }

  get statusDialogTitle(): string {
    const status = this.statusDialog.status;
    if (status === 1) return 'Approve Expense';
    if (status === 2) return 'Reject Expense';
    return `Set ${this.statusName(status ?? 0)}`;
  }

  get statusDialogIcon(): string {
    const status = this.statusDialog.status;
    if (status === 1) return 'verified';
    if (status === 2) return 'block';
    if (status === 5) return 'pause';
    if (status === 0) return 'undo';
    return 'done';
  }

  private calculateClaim(): void {
    const type = this.selectedFormType;
    if (!type) return;

    if (type.allowanceTypeId !== 1) {
      this.form.startKm = null;
      this.form.stopKm = null;
      this.form.totalKm = null;
      this.form.claimAmount = this.roundMoney(type.rate);
      return;
    }

    const start = this.parseNumber(this.form.startKm);
    const stop = this.parseNumber(this.form.stopKm);
    if (start === null || stop === null || stop < start) {
      this.form.totalKm = null;
      this.form.claimAmount = 0;
      return;
    }

    const totalKm = stop - start;
    this.form.totalKm = this.formatNumber(totalKm);
    this.form.claimAmount = this.roundMoney(totalKm * type.rate);
  }

  private parseNumber(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private formatNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private apiOrigin(): string {
    return API_ORIGIN;
  }

  statusName(status: number): string {
    return this.statuses.find(item => item.id === status)?.name || 'Pending';
  }

  formatDateTime(value?: string | null): string {
    return formatKolkataDateTime(value, '-');
  }

  private get safeShowEntries(): number {
    const value = Number(this.showEntries);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
  }

  private emptyForm(): ExpensePayload & { id: number | null } {
    return { id: null, expensesType: null, userId: null, date: kolkataTodayInput(), claimAmount: null, note: '', attachments: [] };
  }

  private emptyStatusDialog(): StatusDialogModel {
    return { visible: false, expense: null, status: null, approveAmount: null, reason: '' };
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
}
