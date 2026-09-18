import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { finalize, timeout } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { AppDocument, AppDocumentApps, AppDocumentService } from '../../services/app-document.service';
import { formatKolkataDateTime } from '../../shared/utils/date-time';

interface ToastModel {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

const MAX_PDF_BYTES = 20 * 1024 * 1024;

/** Setting Management > App Document Settings: named PDF documents. Name and PDF are both
 *  required on create and on edit - on edit the PDF already attached counts until it is
 *  removed, and then a new one has to be chosen. */
@Component({
  standalone: false,
  selector: 'app-app-documents',
  templateUrl: './app-documents.component.html',
  styleUrls: ['./app-documents.component.scss']
})
export class AppDocumentsComponent implements OnInit {
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  rows: AppDocument[] = [];
  showEntries = 10;
  currentPage = 1;
  totalRows = 0;
  searchQuery = '';
  appliedSearchQuery = '';
  loading = false;
  saving = false;
  errorMessage = '';
  toast: ToastModel = { visible: false, message: '', type: 'success' };

  showModal = false;
  editing: AppDocument | null = null;
  formName = '';
  formApps: AppDocumentApps = { sfa: false, vriddhi: false };
  newFile: File | null = null;
  /** On edit: false once the attached PDF has been removed in the popup. */
  keepExistingFile = false;

  viewing: AppDocument | null = null;
  viewingUrl: SafeResourceUrl | null = null;

  private toastTimeoutId?: number;
  private searchTimeoutId?: number;

  constructor(
    private documentService: AppDocumentService,
    private authService: AuthService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadRows();
  }

  get pageStart(): number {
    return (this.currentPage - 1) * this.safeShowEntries;
  }

  get canCreate(): boolean { return this.authService.hasPermission('app_document.create'); }
  get canEdit(): boolean { return this.authService.hasPermission('app_document.edit'); }
  get canDelete(): boolean { return this.authService.hasPermission('app_document.delete'); }
  get canView(): boolean { return this.authService.hasPermission('app_document.detail'); }
  get hasActions(): boolean { return this.canView || this.canEdit || this.canDelete; }

  loadRows(): void {
    this.loading = true;
    this.errorMessage = '';
    this.refreshView();
    this.documentService.list(this.appliedSearchQuery, this.currentPage, this.safeShowEntries).pipe(
      timeout(20000),
      finalize(() => {
        this.loading = false;
        this.refreshView();
      })
    ).subscribe({
      next: rows => {
        this.rows = rows;
        this.totalRows = rows.total;
        // Deleting the last row of a page leaves it empty; step back to the page before.
        if (rows.length === 0 && this.currentPage > 1 && rows.total > 0) {
          this.currentPage--;
          this.loadRows();
        }
      },
      error: error => {
        this.errorMessage = error.name === 'TimeoutError' ? 'App Document API request timed out.' : error.message;
      }
    });
  }

  resetPage(): void {
    this.currentPage = 1;
    this.loadRows();
  }

  onPageChange(page: number): void {
    if (page === this.currentPage) return;
    this.currentPage = page;
    this.loadRows();
  }

  scheduleSearch(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.searchTimeoutId = window.setTimeout(() => {
      this.appliedSearchQuery = this.searchQuery;
      this.resetPage();
    }, 400);
  }

  openCreateModal(): void {
    this.editing = null;
    this.formName = '';
    this.formApps = { sfa: false, vriddhi: false };
    this.newFile = null;
    this.keepExistingFile = false;
    this.showModal = true;
    this.refreshView();
  }

  openEditModal(row: AppDocument): void {
    this.editing = row;
    this.formName = row.documentName;
    this.formApps = { sfa: row.showInSfa, vriddhi: row.showInVriddhi };
    this.newFile = null;
    this.keepExistingFile = !!row.filePath;
    this.showModal = true;
    this.refreshView();
  }

  closeModal(): void {
    if (this.saving) return;
    this.showModal = false;
    this.refreshView();
  }

  chooseFile(): void {
    this.fileInput?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') || (file.type && file.type !== 'application/pdf')) {
      this.showToast('Only PDF files are allowed.', 'error');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      this.showToast('The PDF must be 20 MB or smaller.', 'error');
      return;
    }
    this.newFile = file;
    this.refreshView();
  }

  removeNewFile(): void {
    this.newFile = null;
    this.refreshView();
  }

  removeExistingFile(): void {
    this.keepExistingFile = false;
    this.refreshView();
  }

  submit(): void {
    const name = this.formName.trim();
    const hasAttachment = !!this.newFile || (!!this.editing && this.keepExistingFile);
    if (!name && !hasAttachment) {
      this.showToast('Document name and attachment are required.', 'error');
      return;
    }
    if (!name) {
      this.showToast('Document name is required.', 'error');
      return;
    }
    if (!hasAttachment) {
      this.showToast('Attachment is required.', 'error');
      return;
    }

    this.saving = true;
    this.refreshView();
    const request = this.editing
      ? this.documentService.update(this.editing.id, name, this.newFile, this.formApps)
      : this.documentService.create(name, this.newFile as File, this.formApps);

    request.pipe(finalize(() => {
      this.saving = false;
      this.refreshView();
    })).subscribe({
      next: result => {
        this.showModal = false;
        this.showToast(result.message, 'success');
        if (!this.editing) this.currentPage = 1;
        this.loadRows();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  view(row: AppDocument): void {
    this.viewing = row;
    this.viewingUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.fileUrl(row));
    this.refreshView();
  }

  closeView(): void {
    this.viewing = null;
    this.viewingUrl = null;
    this.refreshView();
  }

  delete(row: AppDocument): void {
    if (!confirm(`Delete document "${row.documentName}"?`)) return;
    this.documentService.delete(row.id).subscribe({
      next: result => {
        this.showToast(result.message, 'success');
        this.loadRows();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  fileUrl(row: AppDocument): string {
    return this.documentService.fileUrl(row.filePath);
  }

  appsLabel(row: AppDocument): string {
    const apps = [row.showInSfa ? 'SFA' : '', row.showInVriddhi ? 'VRiDDHi' : ''].filter(Boolean);
    return apps.length ? apps.join(', ') : '-';
  }

  fileLabel(row: AppDocument): string {
    return row.fileName || 'Document.pdf';
  }

  fileSize(bytes: number | null | undefined): string {
    if (!bytes) return '';
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  dateTime(value: string | null): string {
    return formatKolkataDateTime(value, '-');
  }

  private get safeShowEntries(): number {
    const value = Number(this.showEntries);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
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
