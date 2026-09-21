import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize, timeout } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import {
  ActivityCounts,
  ActivityExpense,
  ActivityOptions,
  ActivityParticipant,
  ActivityPhoto,
  Option,
  PromotionalActivity,
  PromotionalActivityDetail,
  PromotionalActivityService
} from '../../services/promotional-activity.service';
import { formatKolkataDate, formatKolkataDateTime } from '../../shared/utils/date-time';

interface ToastModel {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

const EXPENSE_LABELS: Record<string, string> = {
  food: 'Food',
  gift: 'Gift',
  hotel: 'Hotel',
  av: 'AV',
  other: 'Other',
  other1: 'Other 1',
  other2: 'Other 2'
};

const PARTICIPANT_TYPES = ['Retailer', 'Plumber', 'Mechanic', 'Other'];
const PROFESSIONS = ['Mechanic', 'Plumber', 'Electrician', 'Borer', 'Farmer', 'Other'];
const SOCIAL_TYPES = ['Instagram', 'Facebook', 'LinkedIn', 'YouTube'];

/**
 * User Management > Promotional Activities: every Retailer, Nukkad, Farmer and Influencer
 * meet recorded from the field app, drafts and submitted. The server limits the rows to the
 * user's data scope (admin all, BM branch, others their reporting downline). Show, full edit,
 * delete and export each have their own permission.
 */
@Component({
  standalone: false,
  selector: 'app-promotional-activities',
  templateUrl: './promotional-activities.component.html',
  styleUrls: ['./promotional-activities.component.scss']
})
export class PromotionalActivitiesComponent implements OnInit {
  rows: PromotionalActivity[] = [];
  counts: ActivityCounts = { all: 0, retailer: 0, nukkad: 0, farmer: 0, influencer: 0 };
  options: ActivityOptions = { users: [], branches: [], zones: [], types: [], statuses: [] };
  showEntries = 10;
  currentPage = 1;
  totalRows = 0;
  loading = false;
  exporting = false;
  errorMessage = '';
  toast: ToastModel = { visible: false, message: '', type: 'success' };

  showFilters = false;
  searchQuery = '';
  appliedSearchQuery = '';
  activityType: string | null = null;
  status: string | null = null;
  userId: number | null = null;
  branchId: number | null = null;
  zoneId: number | null = null;
  startDate = '';
  endDate = '';

  readonly participantTypes = PARTICIPANT_TYPES;
  readonly professions = PROFESSIONS;
  readonly socialTypes = SOCIAL_TYPES;

  detailLoading = false;
  viewing: PromotionalActivityDetail | null = null;
  photoPreview: string | null = null;

  editing: PromotionalActivityDetail | null = null;
  saving = false;
  form = this.emptyForm();
  distributors: Option[] = [];
  distributorsLoading = false;

  private toastTimeoutId?: number;
  private searchTimeoutId?: number;

  constructor(
    private activityService: PromotionalActivityService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.activityService.options().subscribe({
      next: options => {
        this.options = options;
        this.refreshView();
      },
      error: () => undefined
    });
    this.loadRows();
  }

  get canView(): boolean { return this.authService.hasPermission('promotional_activity.detail'); }
  get canEdit(): boolean { return this.authService.hasPermission('promotional_activity.edit'); }
  get canDelete(): boolean { return this.authService.hasPermission('promotional_activity.delete'); }
  get canExport(): boolean { return this.authService.hasPermission('promotional_activity.export'); }
  get hasActions(): boolean { return this.canView || this.canEdit || this.canDelete; }
  get pageStart(): number { return (this.currentPage - 1) * this.safeShowEntries; }

  get typeTiles(): { key: string | null; label: string; count: number; tone: string }[] {
    return [
      { key: null, label: 'All Activities', count: this.counts.all, tone: 'all' },
      { key: 'retailer', label: 'Retailer Meet', count: this.counts.retailer, tone: 'retailer' },
      { key: 'nukkad', label: 'Nukkad Meet', count: this.counts.nukkad, tone: 'nukkad' },
      { key: 'farmer', label: 'Farmer Meet / Demo', count: this.counts.farmer, tone: 'farmer' },
      { key: 'influencer', label: 'Influencer Meet', count: this.counts.influencer, tone: 'influencer' }
    ];
  }

  get hasActiveFilters(): boolean {
    return !!(this.status || this.userId || this.branchId || this.zoneId || this.startDate || this.endDate);
  }

  loadRows(): void {
    this.loading = true;
    this.errorMessage = '';
    this.refreshView();
    this.activityService.list(this.filters(), this.currentPage, this.safeShowEntries).pipe(
      timeout(30000),
      finalize(() => {
        this.loading = false;
        this.refreshView();
      })
    ).subscribe({
      next: result => {
        this.rows = result.rows;
        this.totalRows = result.rows.total;
        this.counts = result.counts;
        // Deleting the last row of a page leaves it empty; step back to the page before.
        if (result.rows.length === 0 && this.currentPage > 1 && result.rows.total > 0) {
          this.currentPage--;
          this.loadRows();
        }
      },
      error: error => {
        this.errorMessage = error.name === 'TimeoutError' ? 'Promotional Activity API request timed out.' : error.message;
      }
    });
  }

  applyFilters(): void {
    this.currentPage = 1;
    this.loadRows();
  }

  resetPage(): void {
    this.applyFilters();
  }

  pickType(key: string | null): void {
    this.activityType = key;
    this.applyFilters();
  }

  clearFilters(): void {
    this.status = null;
    this.userId = null;
    this.branchId = null;
    this.zoneId = null;
    this.startDate = '';
    this.endDate = '';
    this.applyFilters();
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
      this.applyFilters();
    }, 400);
  }

  exportRows(): void {
    if (this.exporting) return;
    this.exporting = true;
    this.refreshView();
    this.activityService.export(this.filters()).pipe(finalize(() => {
      this.exporting = false;
      this.refreshView();
    })).subscribe({
      next: blob => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `promotional-activities-${new Date().toISOString().slice(0, 10)}.xlsx`;
        link.click();
        window.URL.revokeObjectURL(url);
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  view(row: PromotionalActivity): void {
    this.loadDetail(row, detail => this.viewing = detail);
  }

  closeView(): void {
    this.viewing = null;
    this.photoPreview = null;
    this.refreshView();
  }

  openEdit(row: PromotionalActivity): void {
    this.loadDetail(row, detail => {
      this.editing = detail;
      const activity = detail.activity;
      this.form = {
        activityName: activity.activityName,
        activityDate: activity.activityDate,
        userId: detail.userId || null,
        distributorId: detail.distributorId,
        distributorName: activity.distributorName,
        dealerName: activity.dealerName,
        hotelName: activity.hotelName,
        locationText: activity.locationText,
        giftCount: activity.giftCount,
        feedback: activity.feedback,
        participants: detail.participants.map(x => ({ ...x })),
        // Every expense line of this activity type, filled from what was recorded.
        expenses: detail.expenseTypes.map(type => {
          const found = detail.expenses.find(x => x.expenseType === type);
          return found ? { ...found } : { expenseType: type, totalAmount: 0, dealerShareAmount: 0, remarks: '', invoiceUrl: '' };
        }),
        keepPhotoIds: detail.photos.map(x => x.id)
      };
      this.distributors = detail.distributorId
        ? [{ id: detail.distributorId, name: activity.distributorName || `#${detail.distributorId}` }]
        : [];
      this.loadDistributors('');
    });
  }

  closeEdit(): void {
    if (this.saving) return;
    this.editing = null;
    this.refreshView();
  }

  onUserChange(userId: number | null): void {
    this.form.userId = userId;
    // A distributor belongs to the ASR / DSR it is assigned to, so a new person means a new pick.
    this.form.distributorId = null;
    this.form.distributorName = '';
    this.distributors = [];
    this.loadDistributors('');
  }

  loadDistributors(search: string): void {
    if (!this.form.userId) return;
    this.distributorsLoading = true;
    this.refreshView();
    this.activityService.distributors(this.form.userId, search).pipe(finalize(() => {
      this.distributorsLoading = false;
      this.refreshView();
    })).subscribe({
      next: list => {
        const current = this.distributors.find(x => x.id === this.form.distributorId);
        this.distributors = current && !list.some(x => x.id === current.id) ? [current, ...list] : list;
      },
      error: () => undefined
    });
  }

  onDistributorChange(id: number | null): void {
    this.form.distributorId = id;
    const picked = this.distributors.find(x => x.id === id);
    // Stored as "code · name", the way the field app saves it.
    this.form.distributorName = picked?.name || '';
  }

  addParticipant(): void {
    this.form.participants.push({
      name: '', shopName: '', proprietorName: '', participantType: '', profession: this.editing?.activity.activityType === 'farmer' ? 'Farmer' : '',
      mobile: '', giftName: '', remarks: '', isInfluencer: false, socialType: '', socialLink: ''
    });
    this.refreshView();
  }

  removeParticipant(index: number): void {
    this.form.participants.splice(index, 1);
    this.refreshView();
  }

  removePhoto(photo: ActivityPhoto): void {
    this.form.keepPhotoIds = this.form.keepPhotoIds.filter(id => id !== photo.id);
    this.refreshView();
  }

  restorePhoto(photo: ActivityPhoto): void {
    if (!this.form.keepPhotoIds.includes(photo.id)) this.form.keepPhotoIds.push(photo.id);
    this.refreshView();
  }

  keepsPhoto(photo: ActivityPhoto): boolean {
    return this.form.keepPhotoIds.includes(photo.id);
  }

  get formTotal(): number {
    return this.form.expenses.reduce((sum, x) => sum + (Number(x.totalAmount) || 0), 0);
  }

  save(): void {
    if (!this.editing || this.saving) return;
    const form = this.form;
    if (!form.activityDate) return this.showToast('Activity Date is required.', 'error');
    if (!form.activityName.trim()) return this.showToast('Activity Name is required.', 'error');
    if (!form.userId) return this.showToast('ASR / DSR Name is required.', 'error');
    if (!form.distributorId) return this.showToast('Distributor is required.', 'error');
    const retailer = this.editing.activity.activityType === 'retailer';
    for (const participant of form.participants) {
      if (retailer ? !participant.shopName.trim() : !participant.name.trim()) {
        return this.showToast(retailer ? 'Every participant needs a Retailer Shop Name.' : 'Every participant needs a Name.', 'error');
      }
      if (participant.mobile.trim() && !/^\d{10}$/.test(participant.mobile.trim())) {
        return this.showToast('Participant mobile must contain exactly 10 digits.', 'error');
      }
      if (participant.isInfluencer && !participant.socialType) {
        return this.showToast('Social Media Type is required for an influencer.', 'error');
      }
    }
    for (const expense of form.expenses) {
      if ((Number(expense.totalAmount) || 0) < 0 || (Number(expense.dealerShareAmount) || 0) < 0) {
        return this.showToast('Expense amounts cannot be negative.', 'error');
      }
      if ((Number(expense.dealerShareAmount) || 0) > (Number(expense.totalAmount) || 0)) {
        return this.showToast(`${this.expenseLabel(expense.expenseType)}: dealer share cannot be more than the amount.`, 'error');
      }
    }

    this.saving = true;
    this.refreshView();
    this.activityService.update(this.editing.activity.id, { ...form, giftCount: Number(form.giftCount) || 0 }).pipe(finalize(() => {
      this.saving = false;
      this.refreshView();
    })).subscribe({
      next: message => {
        this.editing = null;
        this.showToast(message, 'success');
        this.loadRows();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  delete(row: PromotionalActivity): void {
    if (!confirm(`Delete activity ${row.activityCode || row.activityName}?`)) return;
    this.activityService.delete(row.id).subscribe({
      next: message => {
        this.showToast(message, 'success');
        this.loadRows();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  expenseLabel(type: string): string {
    return EXPENSE_LABELS[type] ?? type;
  }

  participantTitle(type: string): string {
    return type === 'retailer' ? 'Retailer Shop Name' : 'Participant Name';
  }

  hasHotel(type: string): boolean {
    return type === 'retailer' || type === 'influencer';
  }

  photoUrl(path: string): string {
    return this.activityService.fileUrl(path);
  }

  money(value: number): string {
    return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }

  date(value: string | null): string {
    return formatKolkataDate(value, '-');
  }

  dateTime(value: string | null): string {
    return formatKolkataDateTime(value, '-');
  }

  trackByIndex(index: number): number {
    return index;
  }

  private loadDetail(row: PromotionalActivity, apply: (detail: PromotionalActivityDetail) => void): void {
    if (this.detailLoading) return;
    this.detailLoading = true;
    this.refreshView();
    this.activityService.show(row.id).pipe(finalize(() => {
      this.detailLoading = false;
      this.refreshView();
    })).subscribe({
      next: detail => apply(detail),
      error: error => this.showToast(error.message, 'error')
    });
  }

  private filters() {
    return {
      search: this.appliedSearchQuery,
      activityType: this.activityType,
      status: this.status,
      userId: this.userId,
      branchId: this.branchId,
      zoneId: this.zoneId,
      startDate: this.startDate,
      endDate: this.endDate
    };
  }

  private emptyForm() {
    return {
      activityName: '',
      activityDate: '',
      userId: null as number | null,
      distributorId: null as number | null,
      distributorName: '',
      dealerName: '',
      hotelName: '',
      locationText: '',
      giftCount: 0,
      feedback: '',
      participants: [] as ActivityParticipant[],
      expenses: [] as ActivityExpense[],
      keepPhotoIds: [] as number[]
    };
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
