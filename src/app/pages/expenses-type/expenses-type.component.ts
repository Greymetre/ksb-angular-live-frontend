import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize, timeout } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { UserOption } from '../../services/user.service';
import { ExpenseType, ExpenseTypePayload, ExpenseTypeService } from '../../services/expense-type.service';

interface ToastModel {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

@Component({
  standalone: false,
  selector: 'app-expenses-type',
  templateUrl: './expenses-type.component.html',
  styleUrls: ['./expenses-type.component.scss']
})
export class ExpensesTypeComponent implements OnInit {
  rows: ExpenseType[] = [];
  allowanceTypes: UserOption[] = [];
  payrolls: UserOption[] = [];

  showEntries = 10;
  currentPage = 1;
  searchQuery = '';
  appliedSearchQuery = '';
  loading = false;
  saving = false;
  showModal = false;
  errorMessage = '';
  toast: ToastModel = { visible: false, message: '', type: 'success' };
  private toastTimeoutId?: number;
  private searchTimeoutId?: number;

  form: ExpenseTypePayload & { id: number | null } = this.emptyForm();

  constructor(
    private expenseTypeService: ExpenseTypeService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadOptions();
    this.loadRows();
  }

  get filteredRows(): ExpenseType[] {
    const query = this.appliedSearchQuery.trim().toLowerCase();
    if (!query) return this.rows;
    return this.rows.filter(row =>
      row.allowanceTypeName.toLowerCase().includes(query)
      || row.name.toLowerCase().includes(query)
      || row.payrollName.toLowerCase().includes(query)
      || String(row.rate).includes(query)
    );
  }

  get pagedRows(): ExpenseType[] {
    return this.filteredRows.slice(this.pageStart, this.pageStart + this.safeShowEntries);
  }

  get pageStart(): number {
    return (this.currentPage - 1) * this.safeShowEntries;
  }

  get canCreate(): boolean {
    return this.authService.hasPermission('expenses_type_create');
  }

  get canEdit(): boolean {
    return this.authService.hasPermission('expenses_type_update');
  }

  loadRows(): void {
    this.loading = true;
    this.errorMessage = '';
    this.currentPage = 1;
    this.expenseTypeService.list().pipe(
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
        this.errorMessage = error.name === 'TimeoutError' ? 'Expense Type API request timed out.' : error.message;
        this.refreshView();
      }
    });
  }

  loadOptions(): void {
    this.expenseTypeService.options().pipe(timeout(20000)).subscribe({
      next: options => {
        this.allowanceTypes = options.allowanceTypes;
        this.payrolls = options.payrolls;
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
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

  openEditModal(row: ExpenseType): void {
    this.form = {
      id: row.id,
      name: row.name,
      rate: row.rate,
      allowanceTypeId: row.allowanceTypeId,
      payrollId: row.payrollId,
      active: row.active
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
    if (!this.form.payrollId || !this.form.allowanceTypeId || !this.form.name.trim()) {
      this.showToast('Grade, Allowance Type and Name are required.', 'error');
      return;
    }
    if (this.form.rate !== null && this.form.rate < 0) {
      this.showToast('Rate must be greater than or equal to 0.', 'error');
      return;
    }

    this.saving = true;
    const request = this.form.id
      ? this.expenseTypeService.update(this.form.id, this.form)
      : this.expenseTypeService.create(this.form);

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

  toggleActive(row: ExpenseType, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const previous = row.active;
    const active = checked ? 'Y' : 'N';
    row.active = active;
    row.isActive = checked ? 1 : 0;
    this.expenseTypeService.setActive(row.id, active).subscribe({
      next: result => this.showToast(result.message, 'success'),
      error: error => {
        row.active = previous;
        row.isActive = previous === 'Y' ? 1 : 0;
        this.showToast(error.message, 'error');
        this.refreshView();
      }
    });
  }

  private get safeShowEntries(): number {
    const value = Number(this.showEntries);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
  }

  private emptyForm(): ExpenseTypePayload & { id: number | null } {
    return { id: null, name: '', rate: 0, allowanceTypeId: null, payrollId: null, active: 'Y' };
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
