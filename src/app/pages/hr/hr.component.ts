import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { finalize, timeout } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { AttendancePlan, HrOption, HrOptions, HrRecord, HrService } from '../../services/hr.service';
import { SearchableSelectOption } from '../../shared/components/searchable-select/searchable-select.component';
import { formatKolkataDate, formatKolkataLongDateTime, kolkataTodayInput } from '../../shared/utils/date-time';

type HrMode = 'holidays' | 'leaves' | 'tours' | 'attendance-details' | 'attendance-summary';

interface HrPageConfig {
  mode: HrMode;
  title: string;
  icon: string;
  path: string;
  key: string;
  exportPath: string;
  fileName: string;
}

@Component({
  standalone: false,
  selector: 'app-hr',
  templateUrl: './hr.component.html',
  styleUrls: ['./hr.component.scss']
})
export class HrComponent implements OnInit {
  config!: HrPageConfig;
  options: HrOptions = { users: [], branches: [], divisions: [], designations: [], leave_types: [], balance_types: [], working_types: [] };
  rows: HrRecord[] = [];
  filter: HrRecord = {};
  form: HrRecord = {};
  tourDistrictOptions: HrOption[] = [];
  tourCityOptions: HrOption[] = [];
  attendancePlan: AttendancePlan | null = null;
  attendancePlanLoading = false;
  attendancePlanError = '';
  selectedIds = new Set<number>();
  showEntries = 10;
  currentPage = 1;
  totalRows = 0;
  showFilters = false;
  showModal = false;
  saving = false;
  loading = false;
  exporting = false;
  deleting = false;
  deleteAttendanceRow: HrRecord | null = null;
  errorMessage = '';
  toast = { visible: false, message: '', type: 'success' as 'success' | 'error' };
  importFile: File | null = null;
  private toastTimeoutId?: number;
  private filterSearchTimeoutId?: number;

  constructor(
    private route: ActivatedRoute,
    private hrService: HrService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.hrService.options().subscribe({
      next: options => {
        this.options = options;
        this.refreshView();
      }
    });

    this.route.data.subscribe(data => {
      this.config = data['hrConfig'] as HrPageConfig;
      this.rows = [];
      this.selectedIds.clear();
      this.filter = {};
      this.form = {};
      this.currentPage = 1;
      this.clearAttendancePlan();
      this.showModal = false;
      this.loadRows();
    });
  }

  get visibleRows(): HrRecord[] {
    return this.isSummary ? this.rows.slice(this.pageStart, this.pageStart + this.safeShowEntries) : this.rows;
  }

  get pageStart(): number {
    return (this.currentPage - 1) * this.safeShowEntries;
  }

  get isHoliday(): boolean { return this.config.mode === 'holidays'; }
  get isLeave(): boolean { return this.config.mode === 'leaves'; }
  get isTour(): boolean { return this.config.mode === 'tours'; }
  get isAttendance(): boolean { return this.config.mode === 'attendance-details'; }
  get isSummary(): boolean { return this.config.mode === 'attendance-summary'; }
  get userSelectOptions(): SearchableSelectOption[] { return this.toSelectOptions(this.options.users); }
  get tourDistrictSelectOptions(): SearchableSelectOption[] { return this.toSelectOptions(this.tourDistrictOptions); }
  get tourCitySelectOptions(): SearchableSelectOption[] { return this.toSelectOptions(this.tourCityOptions); }
  get holidayTargetLabel(): string { return this.form['holiday_for'] === 'division' ? 'Zone' : 'Branch'; }
  get holidayFilterLabel(): string { return this.filter['holiday_for'] === 'division' ? 'Zone' : 'Branch'; }
  get leaveTypes(): string[] { return ['First Half Leave', 'Second Half Leave', 'Full Day Leave']; }
  get balanceTypes(): string[] { return ['Casual Leave']; }

  get canWrite(): boolean {
    if (this.isHoliday) return this.authService.hasPermission('holiday_access');
    if (this.isLeave) return this.authService.hasPermission('leave_access');
    if (this.isTour) return this.authService.hasPermission('tours');
    return this.authService.hasAnyPermission(['attendance_report', 'attendance_summary_report']);
  }

  get canDeleteAttendance(): boolean { return this.authService.hasPermission('attendance_delete'); }

  loadRows(resetPage = true): void {
    this.loading = true;
    this.errorMessage = '';
    if (resetPage) this.currentPage = 1;
    // Attendance summary is an aggregate, not a list, so it stays unpaged.
    // Everything else pages on the server with the filters applied there too.
    const request = this.isSummary
      ? this.hrService.list('attendance-summary', this.filter, 'summary')
      : this.hrService.listPaged(this.config.path, { ...this.filter, page: this.currentPage, page_size: this.safeShowEntries }, this.config.key);

    request.pipe(timeout(20000), finalize(() => {
      this.loading = false;
      this.refreshView();
    })).subscribe({
      next: rows => {
        this.rows = rows;
        this.totalRows = this.isSummary ? rows.length : Number((rows as { total?: number }).total ?? rows.length);
        this.selectedIds.clear();
        this.refreshView();
      },
      error: error => {
        this.errorMessage = error.name === 'TimeoutError' ? `${this.config.title} API request timed out.` : error.message;
        this.refreshView();
      }
    });
  }

  resetFilters(): void {
    if (this.filterSearchTimeoutId) window.clearTimeout(this.filterSearchTimeoutId);
    this.filter = {};
    this.currentPage = 1;
    this.loadRows();
  }

  scheduleFilterSearch(): void {
    if (this.filterSearchTimeoutId) window.clearTimeout(this.filterSearchTimeoutId);
    this.filterSearchTimeoutId = window.setTimeout(() => {
      this.currentPage = 1;
      this.loadRows();
      this.refreshView();
    }, 400);
  }

  resetPage(): void {
    this.currentPage = 1;
    if (!this.isSummary) this.loadRows(false);
  }

  onPageChange(page: number): void {
    if (page === this.currentPage) return;
    this.currentPage = page;
    if (!this.isSummary) this.loadRows(false);
  }

  openCreate(): void {
    this.form = this.defaultForm();
    this.resetTourLocationOptions();
    this.clearAttendancePlan();
    this.showModal = true;
    this.refreshView();
  }

  openEdit(row: HrRecord): void {
    this.form = { ...row };
    if (this.isHoliday) {
      this.form['namesText'] = this.arrayValue(row['names']).join('\n');
      this.form['holidayDatesText'] = this.arrayValue(row['holiday_dates'] ?? row['holidayDates']).join('\n');
      this.form['holiday_for'] = row['holiday_for'] ?? row['holidayFor'] ?? (row['division_id'] || row['divisionId'] ? 'division' : 'branch');
      this.form['division_id'] = row['division_id'] ?? row['divisionId'] ?? '';
      this.form['branch'] = row['branch'] ?? '';
    }
    if (this.isTour) {
      this.form['user_id'] = row['user_id'] ?? row['userId'] ?? '';
      this.form['district'] = row['district'] ?? row['districtId'] ?? '';
      this.form['town'] = row['town'] ?? row['townId'] ?? '';
      this.loadTourDistricts(false);
    }
    this.showModal = true;
    this.refreshView();
  }

  closeModal(): void {
    if (this.saving) return;
    this.showModal = false;
    this.refreshView();
  }

  submit(): void {
    const payload = this.buildPayload();
    if (!payload) return;
    this.saving = true;
    const id = Number(this.form['id'] || 0);
    const request = this.isAttendance
      ? this.hrService.post('attendances/punch-in', payload)
      : id > 0
        ? this.hrService.update(this.config.path, id, payload)
        : this.hrService.create(this.config.path, payload);
    request.pipe(finalize(() => {
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

  deleteRow(row: HrRecord): void {
    const id = Number(row['id'] || 0);
    if (!id || !confirm(`Delete this ${this.config.title.toLowerCase()} record?`)) return;
    this.hrService.delete(this.config.path, id).subscribe({
      next: message => {
        this.showToast(message, 'success');
        this.loadRows();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  openAttendanceDelete(row: HrRecord): void {
    this.deleteAttendanceRow = row;
    this.refreshView();
  }

  closeAttendanceDelete(): void {
    if (this.deleting) return;
    this.deleteAttendanceRow = null;
    this.refreshView();
  }

  confirmAttendanceDelete(): void {
    const id = Number(this.deleteAttendanceRow?.['id'] || 0);
    if (!id || this.deleting) return;
    this.deleting = true;
    this.hrService.delete('attendances', id).pipe(finalize(() => {
      this.deleting = false;
      this.refreshView();
    })).subscribe({
      next: message => {
        this.deleteAttendanceRow = null;
        if (this.rows.length === 1 && this.currentPage > 1) this.currentPage--;
        this.showToast(message, 'success');
        this.loadRows(false);
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  punchOut(row: HrRecord): void {
    this.hrService.post('attendances/punch-out', { id: row['id'] }).subscribe({
      next: message => {
        this.showToast(message, 'success');
        this.loadRows();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  removePunchOut(row: HrRecord): void {
    this.hrService.post('removePunchout', { id: row['id'] }).subscribe({
      next: message => {
        this.showToast(message, 'success');
        this.loadRows();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  approveSelected(): void {
    if (!this.selectedIds.size) {
      this.showToast('Select at least one record.', 'error');
      return;
    }
    if (this.isLeave) {
      forkJoin([...this.selectedIds].map(id => this.hrService.post(`leaves/${id}/approve`, {}))).subscribe({
        next: () => {
          this.showToast(`${this.selectedIds.size} leave record(s) approved successfully.`, 'success');
          this.loadRows();
        },
        error: error => this.showToast(error.message, 'error')
      });
      return;
    }
    const path = this.isTour ? 'tours/change-status' : 'attendances/approve';
    const payload = this.isTour ? { id: [...this.selectedIds], status: '1' } : { id: [...this.selectedIds] };
    this.hrService.post(path, payload).subscribe({
      next: message => {
        this.showToast(message, 'success');
        this.loadRows();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  rejectSelected(): void {
    if (!this.selectedIds.size) {
      this.showToast('Select at least one record.', 'error');
      return;
    }
    const remark = prompt('Remark') || '';
    if (this.isLeave) {
      forkJoin([...this.selectedIds].map(id => this.hrService.post(`leaves/${id}/reject`, { remark_status: remark }))).subscribe({
        next: () => {
          this.showToast(`${this.selectedIds.size} leave record(s) rejected successfully.`, 'success');
          this.loadRows();
        },
        error: error => this.showToast(error.message, 'error')
      });
      return;
    }
    const path = this.isTour ? 'tours/change-status' : 'attendances/reject';
    const payload = this.isTour ? { id: [...this.selectedIds], status: '2' } : { id: [...this.selectedIds], remark_status: remark };
    this.hrService.post(path, payload).subscribe({
      next: message => {
        this.showToast(message, 'success');
        this.loadRows();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  toggleSelection(row: HrRecord, event: Event): void {
    const id = Number(row['id'] || 0);
    const checked = event.target instanceof HTMLInputElement && event.target.checked;
    if (checked) this.selectedIds.add(id);
    else this.selectedIds.delete(id);
  }

  exportRows(): void {
    this.exporting = true;
    this.hrService.export(this.config.exportPath, this.filter).pipe(finalize(() => {
      this.exporting = false;
      this.refreshView();
    })).subscribe({
      next: blob => this.downloadBlob(blob, this.config.fileName),
      error: error => this.showToast(error.message, 'error')
    });
  }

  onImportChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.importFile = input.files?.[0] ?? null;
    if (!this.importFile) return;
    this.hrService.upload('tours/upload', this.importFile).subscribe({
      next: message => {
        this.showToast(message, 'success');
        this.loadRows();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  onTourUserChange(value: number | string | null): void {
    this.form['user_id'] = value ? Number(value) : '';
    this.form['district'] = '';
    this.form['town'] = '';
    this.resetTourLocationOptions();
    this.loadTourDistricts();
  }

  onTourDistrictChange(value: number | string | null): void {
    this.form['district'] = value ? Number(value) : '';
    this.form['town'] = '';
    this.tourCityOptions = [];
    this.loadTourCities();
  }

  onTourCityChange(value: number | string | null): void {
    this.form['town'] = value ? Number(value) : '';
    this.refreshView();
  }

  onAttendanceUserChange(): void {
    this.clearAttendancePlan();
    this.loadAttendancePlan();
  }

  onAttendanceDateChange(): void {
    this.clearAttendancePlan();
    this.loadAttendancePlan();
  }

  onHolidayForChange(): void {
    this.form['branch'] = '';
    this.form['division_id'] = '';
    this.refreshView();
  }

  onHolidayFilterForChange(): void {
    this.filter['branch_id'] = '';
    this.filter['division_id'] = '';
    this.refreshView();
  }

  label(options: HrOption[], id: unknown): string {
    const numberId = Number(id || 0);
    return options.find(option => option.id === numberId)?.name || '';
  }

  statusClass(row: HrRecord): string {
    const status = String(row['status'] ?? row['attendance_status'] ?? '');
    if (status === '1') return 'status-1';
    if (status === '2') return 'status-4';
    return 'status-0';
  }

  formatDate(value: unknown): string {
    return formatKolkataDate(value ? String(value) : null, '-');
  }

  formatDateTime(value: unknown): string {
    return formatKolkataLongDateTime(value ? String(value) : null, '-');
  }

  dayKeys(row: HrRecord): string[] {
    return Object.keys(row['days'] || {});
  }

  private loadTourDistricts(clearCity = true): void {
    const userId = Number(this.form['user_id'] || 0);
    if (!userId) {
      this.refreshView();
      return;
    }

    this.hrService.districtsByUser(userId).subscribe({
      next: districts => {
        this.tourDistrictOptions = districts;
        if (clearCity) this.tourCityOptions = [];
        this.loadTourCities();
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  private loadTourCities(): void {
    const userId = Number(this.form['user_id'] || 0);
    const districtId = Number(this.form['district'] || 0);
    if (!userId || !districtId) {
      this.refreshView();
      return;
    }

    this.hrService.citiesByUserDistrict(userId, districtId).subscribe({
      next: cities => {
        this.tourCityOptions = cities;
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  private loadAttendancePlan(): void {
    if (!this.isAttendance) return;
    const userId = Number(this.form['user_id'] || 0);
    const date = String(this.form['punchin_date'] || '');
    if (!userId || !date) {
      this.refreshView();
      return;
    }

    this.attendancePlanLoading = true;
    this.hrService.attendancePlan(userId, date).pipe(finalize(() => {
      this.attendancePlanLoading = false;
      this.refreshView();
    })).subscribe({
      next: plan => {
        this.attendancePlan = plan;
        const tour = plan.tour?.data || null;
        if (plan.tour?.exists && tour) {
          this.form['tour_id'] = tour['id'];
          this.form['tour_city'] = tour['city_name'] ?? tour['cityName'] ?? '';
          this.form['tour_city_id'] = tour['city_id'] ?? tour['cityId'] ?? '';
          const objectives = String(tour['objectives'] || '').trim();
          if (objectives && objectives !== '-') {
            this.form['working_type'] = objectives;
          }
          this.attendancePlanError = '';
        } else {
          this.form['tour_id'] = '';
          this.form['tour_city'] = '';
          this.form['tour_city_id'] = '';
          this.attendancePlanError = 'No tour added for selected date.';
        }
        this.refreshView();
      },
      error: error => {
        this.clearAttendancePlan();
        this.attendancePlanError = error.message;
        this.refreshView();
      }
    });
  }

  private clearAttendancePlan(): void {
    if (!this.isAttendance) return;
    this.attendancePlan = null;
    this.attendancePlanError = '';
    this.form['tour_id'] = '';
    this.form['tour_city'] = '';
    this.form['tour_city_id'] = '';
  }

  private buildPayload(): HrRecord | null {
    if (this.isHoliday) {
      const names = this.lines(this.form['namesText']);
      const dates = this.lines(this.form['holidayDatesText']);
      const holidayFor = this.form['holiday_for'] === 'division' ? 'division' : 'branch';
      const targetId = holidayFor === 'division' ? this.form['division_id'] : this.form['branch'];
      if (!targetId || !names.length || !dates.length) {
        this.showToast(`${this.holidayTargetLabel}, holiday name and date are required.`, 'error');
        return null;
      }
      return {
        holiday_for: holidayFor,
        branch: holidayFor === 'branch' ? Number(this.form['branch']) : null,
        division_id: holidayFor === 'division' ? Number(this.form['division_id']) : null,
        names,
        holiday_dates: dates,
        active: this.form['active'] || 'Y'
      };
    }
    if (this.isLeave) {
      if (!this.form['user_id'] || !this.form['from_date'] || !this.form['to_date'] || !this.form['type'] || !this.form['bal_type']) {
        this.showToast('User, dates, leave type and balance type are required.', 'error');
        return null;
      }
      return {
        user_id: Number(this.form['user_id']),
        from_date: this.form['from_date'],
        to_date: this.form['to_date'],
        type: this.form['type'],
        bal_type: this.form['bal_type'],
        reason: this.form['reason'] || ''
      };
    }
    if (this.isTour) {
      if (!this.form['user_id'] || !this.form['date'] || !this.form['town']) {
        this.showToast('User, date and city are required.', 'error');
        return null;
      }
      return {
        user_id: Number(this.form['user_id']),
        date: this.form['date'],
        district: this.form['district'] ? String(this.form['district']) : '',
        town: String(this.form['town']),
        objectives: this.form['objectives'] || ''
      };
    }
    if (this.isAttendance) {
      if (!this.form['user_id'] || !this.form['punchin_date'] || !this.form['working_type'] || !this.form['tour_id']) {
        this.showToast('User, punchin date, tour plan and working type are required.', 'error');
        return null;
      }
      return {
        user_id: Number(this.form['user_id']),
        punchin_date: this.form['punchin_date'],
        punchin_time: this.form['punchin_time'] || '',
        punchin_summary: this.form['punchin_summary'] || '',
        working_type: this.form['working_type'],
        tour_id: Number(this.form['tour_id']),
        city: this.form['tour_city_id'] ? String(this.form['tour_city_id']) : (this.form['tour_city'] || '')
      };
    }
    return null;
  }

  private defaultForm(): HrRecord {
    const today = kolkataTodayInput();
    if (this.isHoliday) return { active: 'Y', holiday_for: 'division', branch: '', division_id: '', namesText: '', holidayDatesText: today };
    if (this.isLeave) return { user_id: '', from_date: today, to_date: today, type: 'Full Day Leave', bal_type: 'Casual Leave', reason: '' };
    if (this.isTour) return { user_id: '', date: today, district: '', town: '', objectives: '' };
    if (this.isAttendance) return { user_id: '', punchin_date: today, punchin_time: '', working_type: '', punchin_summary: '', tour_id: '', tour_city: '', tour_city_id: '' };
    return {};
  }

  private lines(value: unknown): string[] {
    return String(value || '').split(/\r?\n|,/).map(item => item.trim()).filter(Boolean);
  }

  private arrayValue(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String) : this.lines(value);
  }

  private resetTourLocationOptions(): void {
    if (!this.isTour) return;
    this.tourDistrictOptions = [];
    this.tourCityOptions = [];
  }

  private toSelectOptions(options: HrOption[]): SearchableSelectOption[] {
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
}
