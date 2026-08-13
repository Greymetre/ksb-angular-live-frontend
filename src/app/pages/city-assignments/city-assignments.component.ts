import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { finalize, timeout } from 'rxjs/operators';
import { CityAssignment, CityAssignmentOption, CityAssignmentOptions, CityAssignmentService } from '../../services/city-assignment.service';
import { SearchableSelectOption } from '../../shared/components/searchable-select/searchable-select.component';
import { formatKolkataDateTime } from '../../shared/utils/date-time';

@Component({
  standalone: false,
  selector: 'app-city-assignments',
  templateUrl: './city-assignments.component.html',
  styleUrls: ['./city-assignments.component.scss']
})
export class CityAssignmentsComponent implements OnInit {
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  rows: CityAssignment[] = [];
  options: CityAssignmentOptions = { users: [], cities: [] };
  form = { user_id: null as number | null, city_ids: [] as number[] };
  search = '';
  appliedSearch = '';
  showEntries = 10;
  currentPage = 1;
  totalItems = 0;
  showModal = false;
  loading = false;
  saving = false;
  uploading = false;
  exporting = false;
  templating = false;
  errorMessage = '';
  toast = { visible: false, message: '', type: 'success' as 'success' | 'error' };
  private toastTimeoutId?: number;
  private searchTimeoutId?: number;

  constructor(private service: CityAssignmentService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadOptions();
    this.loadRows();
  }

  get visibleRows(): CityAssignment[] {
    return this.rows;
  }

  get pageStart(): number {
    return (this.currentPage - 1) * this.safeShowEntries;
  }

  get userOptions(): SearchableSelectOption[] { return this.toSelect(this.options.users); }
  get cityOptions(): SearchableSelectOption[] { return this.toSelect(this.options.cities); }

  loadRows(): void {
    this.loading = true;
    this.errorMessage = '';
    this.service.list({ page: this.currentPage, page_size: this.safeShowEntries, search: this.appliedSearch.trim() }).pipe(
      timeout(20000),
      finalize(() => {
        this.loading = false;
        this.refreshView();
      })
    ).subscribe({
      next: result => {
        this.rows = result.rows;
        this.totalItems = result.total;
        this.currentPage = result.page;
        this.refreshView();
      },
      error: error => {
        this.errorMessage = error.name === 'TimeoutError' ? 'City assignment API request timed out.' : error.message;
        this.refreshView();
      }
    });
  }

  resetPage(): void {
    this.currentPage = 1;
    this.loadRows();
  }

  scheduleSearch(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.searchTimeoutId = window.setTimeout(() => {
      this.appliedSearch = this.search;
      this.currentPage = 1;
      this.loadRows();
    }, 400);
  }

  loadOptions(): void {
    this.service.options().subscribe({
      next: options => {
        this.options = options;
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  openCreate(): void {
    this.form = { user_id: null, city_ids: [] };
    this.showModal = true;
    this.refreshView();
  }

  closeModal(): void {
    if (this.saving) return;
    this.showModal = false;
    this.refreshView();
  }

  submit(): void {
    if (!this.form.user_id || this.form.city_ids.length === 0) {
      this.showToast('User and at least one city are required.', 'error');
      return;
    }

    this.saving = true;
    this.service.create({ user_id: this.form.user_id, city_ids: this.form.city_ids }).pipe(finalize(() => {
      this.saving = false;
      this.refreshView();
    })).subscribe({
      next: message => {
        this.showModal = false;
        this.showToast(message, 'success');
        this.loadRows();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  deleteRow(row: CityAssignment): void {
    if (!confirm(`Delete city assignment for ${row.userName || row.userId}?`)) return;
    this.service.delete(row.id).subscribe({
      next: message => {
        this.showToast(message, 'success');
        this.loadRows();
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
    this.service.upload(file).pipe(finalize(() => {
      this.uploading = false;
      input.value = '';
      this.refreshView();
    })).subscribe({
      next: message => {
        this.showToast(message, 'success');
        this.loadRows();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  exportRows(): void {
    this.exporting = true;
    this.service.export({ page_length: 50000, search: this.appliedSearch.trim() }).pipe(finalize(() => {
      this.exporting = false;
      this.refreshView();
    })).subscribe({
      next: blob => this.download(blob, 'users.xlsx'),
      error: error => this.showToast(error.message, 'error')
    });
  }

  downloadTemplate(): void {
    this.templating = true;
    this.service.template().pipe(finalize(() => {
      this.templating = false;
      this.refreshView();
    })).subscribe({
      next: blob => this.download(blob, 'user-city-template.xlsx'),
      error: error => this.showToast(error.message, 'error')
    });
  }

  formatDate(value?: string | null): string {
    return formatKolkataDateTime(value, '');
  }

  private toSelect(options: CityAssignmentOption[]): SearchableSelectOption[] {
    return options.map(option => ({ id: option.id, label: option.name }));
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

  private download(blob: Blob, fileName: string): void {
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
}
