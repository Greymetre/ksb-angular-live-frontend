import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { ProductFamily, ProductItem, ProductSegment, ProductService } from '../../services/product.service';
import { API_ORIGIN } from '../../config/api.config';
import { isPdfOrImageFile } from '../../shared/utils/file-validation';
import { formatKolkataDateTime } from '../../shared/utils/date-time';

type Mode = 'segment' | 'family' | 'product';

@Component({
  standalone: false,
  selector: 'app-product-master',
  templateUrl: './product-master.component.html',
  styleUrls: ['./product-master.component.scss']
})
export class ProductMasterComponent implements OnInit {
  @ViewChild('uploadInput') uploadInput?: ElementRef<HTMLInputElement>;
  @ViewChild('attachmentInput') attachmentInput?: ElementRef<HTMLInputElement>;

  mode: Mode = 'segment';
  rows: Array<ProductSegment | ProductFamily | ProductItem> = [];
  segments: ProductSegment[] = [];
  families: ProductFamily[] = [];
  showEntries = 10;
  currentPage = 1;
  searchQuery = '';
  loading = false;
  saving = false;
  uploading = false;
  exporting = false;
  templating = false;
  showFilters = false;
  showModal = false;
  selectedSegmentId: number | null = null;
  selectedFamilyId: number | null = null;
  selectedFile: File | null = null;
  toast = { visible: false, message: '', type: 'success' as 'success' | 'error' };
  form = this.emptyForm();
  private toastTimeoutId?: number;
  private searchTimeoutId?: number;
  private readonly backendOrigin = this.resolveBackendOrigin();

  constructor(
    private route: ActivatedRoute,
    private productService: ProductService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.data.subscribe(data => {
      this.mode = data['productMode'] as Mode || 'segment';
      this.form = this.emptyForm();
      this.currentPage = 1;
      this.showModal = false;
      this.showFilters = false;
      this.loadOptions();
      this.loadRows();
      this.refreshView();
    });
  }

  get title(): string {
    return `${this.label}List`;
  }

  get label(): string {
    return this.mode === 'segment' ? 'Segment' : this.mode === 'family' ? 'Family' : 'Product';
  }

  get path(): string {
    return this.mode === 'segment' ? 'segments' : this.mode === 'family' ? 'families' : 'products';
  }

  get permissionPrefix(): string {
    return this.mode === 'segment' ? 'category' : this.mode === 'family' ? 'subcategory' : 'product';
  }

  get pagedRows(): Array<ProductSegment | ProductFamily | ProductItem> {
    return this.rows.slice(this.pageStart, this.pageStart + this.safeShowEntries);
  }

  get pageStart(): number {
    return (this.currentPage - 1) * this.safeShowEntries;
  }

  get filteredFamilies(): ProductFamily[] {
    return this.form.segmentId ? this.families.filter(family => family.segmentId === this.form.segmentId) : [];
  }

  get canCreate(): boolean { return this.authService.hasPermission(`${this.permissionPrefix}_create`); }
  get canEdit(): boolean { return this.authService.hasPermission(`${this.permissionPrefix}_edit`); }
  get canActive(): boolean { return this.authService.hasPermission(`${this.permissionPrefix}_active`); }
  get canDelete(): boolean { return this.authService.hasPermission(`${this.permissionPrefix}_delete`); }
  get canUpload(): boolean { return this.authService.hasPermission(`${this.permissionPrefix}_upload`); }
  get canDownload(): boolean { return this.authService.hasPermission(`${this.permissionPrefix}_download`); }
  get canTemplate(): boolean { return this.authService.hasPermission(`${this.permissionPrefix}_template`); }

  loadRows(): void {
    this.loading = true;
    this.currentPage = 1;
    const request: Observable<Array<ProductSegment | ProductFamily | ProductItem>> = this.mode === 'segment'
      ? this.productService.listSegments(this.searchQuery)
      : this.mode === 'family'
        ? this.productService.listFamilies(this.selectedSegmentId, this.searchQuery)
        : this.productService.listProducts(this.selectedSegmentId, this.selectedFamilyId, this.searchQuery);
    request.pipe(finalize(() => {
      this.loading = false;
      this.refreshView();
    })).subscribe({
      next: rows => {
        this.rows = rows;
        this.refreshView();
      },
      error: error => {
        this.showToast(error.message, 'error');
        this.refreshView();
      }
    });
  }

  loadOptions(): void {
    if (this.mode === 'segment') return;
    this.productService.listSegmentOptions().subscribe({ next: rows => { this.segments = rows; this.refreshView(); } });
    this.productService.listFamilyOptions().subscribe({ next: rows => { this.families = rows; this.refreshView(); } });
  }

  applyFilters(): void {
    this.currentPage = 1;
    this.loadRows();
  }

  scheduleSearch(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.searchTimeoutId = window.setTimeout(() => {
      this.applyFilters();
      this.refreshView();
    }, 400);
  }

  clearFilters(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.searchQuery = '';
    this.selectedSegmentId = null;
    this.selectedFamilyId = null;
    this.currentPage = 1;
    this.loadRows();
  }

  resetPage(): void {
    this.currentPage = 1;
  }

  openCreate(): void {
    this.form = this.emptyForm();
    if (this.mode === 'product') this.form.mrp = 0;
    this.selectedFile = null;
    this.showModal = true;
    this.refreshView();
  }

  openEdit(row: ProductSegment | ProductFamily | ProductItem): void {
    this.form = { ...this.emptyForm(), ...row };
    if (this.mode === 'product' && (this.form.mrp === null || this.form.mrp === undefined)) this.form.mrp = 0;
    this.selectedFile = null;
    this.showModal = true;
    this.refreshView();
  }

  closeModal(): void {
    if (this.saving) return;
    this.showModal = false;
    this.refreshView();
  }

  submit(): void {
    this.saving = true;
    const request = this.mode === 'segment'
      ? this.productService.saveSegment(this.form, this.form.id || undefined)
      : this.mode === 'family'
        ? this.productService.saveFamily(this.form, this.form.id || undefined)
        : this.productService.saveProduct(this.form, this.selectedFile, this.form.id || undefined);
    this.refreshView();
    request.subscribe({
      next: message => {
        this.saving = false;
        this.showModal = false;
        this.showToast(message, 'success');
        this.loadOptions();
        this.loadRows();
        this.refreshView();
      },
      error: error => {
        this.saving = false;
        this.showToast(error.message, 'error');
        this.refreshView();
      }
    });
  }

  toggleActive(row: ProductSegment | ProductFamily | ProductItem, event: Event): void {
    const checked = event.target instanceof HTMLInputElement ? event.target.checked : false;
    const active = checked ? 'Y' : 'N';
    this.productService.setActive(this.path, row.id, active).subscribe({
      next: message => {
        row.active = active;
        this.showToast(message, 'success');
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  deleteRow(row: ProductSegment | ProductFamily | ProductItem): void {
    const name = this.nameOf(row);
    if (!confirm(`Delete ${this.label.toLowerCase()} "${name}"?`)) return;
    this.productService.delete(this.path, row.id).subscribe({
      next: message => {
        this.showToast(message, 'success');
        this.loadRows();
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  triggerUpload(): void {
    this.uploadInput?.nativeElement.click();
  }

  upload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploading = true;
    this.showToast('Importing...', 'success');
    this.productService.upload(this.path, file).pipe(finalize(() => {
      this.uploading = false;
      input.value = '';
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
    this.showToast('Exporting...', 'success');
    this.productService.export(this.path, this.currentFilters()).pipe(finalize(() => {
      this.exporting = false;
      this.refreshView();
    })).subscribe({
      next: blob => this.download(blob, `${this.path}.xlsx`),
      error: error => this.showToast(error.message, 'error')
    });
  }

  private currentFilters(): Record<string, unknown> {
    return {
      search: this.searchQuery.trim(),
      segment_id: this.selectedSegmentId,
      family_id: this.mode === 'product' ? this.selectedFamilyId : null
    };
  }

  downloadTemplate(): void {
    this.templating = true;
    this.showToast('Preparing template...', 'success');
    this.productService.template(this.path).pipe(finalize(() => {
      this.templating = false;
      this.refreshView();
    })).subscribe({
      next: blob => this.download(blob, `${this.path}-template.xlsx`),
      error: error => this.showToast(error.message, 'error')
    });
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file && !isPdfOrImageFile(file)) {
      this.selectedFile = null;
      input.value = '';
      this.showToast('Only PDF and image files are allowed.', 'error');
      this.refreshView();
      return;
    }
    this.selectedFile = file;
    this.refreshView();
  }

  mediaUrl(value?: string | null): string {
    if (!value) return '';
    const path = value.trim();
    if (!path) return '';
    if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.backendOrigin}${cleanPath}`;
  }

  nameOf(row: ProductSegment | ProductFamily | ProductItem): string {
    return 'productName' in row ? row.productName : row.name;
  }

  segmentName(row: ProductFamily | ProductItem): string {
    return row.segmentName || '';
  }

  familyName(row: ProductItem): string {
    return row.familyName || '';
  }

  asProduct(row: ProductSegment | ProductFamily | ProductItem): ProductItem {
    return row as ProductItem;
  }

  formatDate(value?: string | null): string {
    return formatKolkataDateTime(value, '');
  }

  private emptyForm(): ProductItem & ProductFamily & ProductSegment {
    return { id: 0, active: 'Y', name: '', productName: '', partNo: '', segmentId: null, familyId: null, mrp: 0, attachment: null };
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    this.toast = { visible: true, message, type };
    if (this.toastTimeoutId) window.clearTimeout(this.toastTimeoutId);
    this.toastTimeoutId = window.setTimeout(() => {
      this.toast = { ...this.toast, visible: false };
      this.refreshView();
    }, 3000);
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

  private resolveBackendOrigin(): string {
    return API_ORIGIN;
  }
}
