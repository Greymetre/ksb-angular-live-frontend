import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { timeout } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { User, UserFilters, UserOption, UserPayload, UserService } from '../../services/user.service';
import { SearchableSelectOption } from '../../shared/components/searchable-select/searchable-select.component';
import { firstCaps } from '../../shared/pipes/first-caps.pipe';
import { formatKolkataDateTime, kolkataDateInput, kolkataTodayInput } from '../../shared/utils/date-time';

interface UserFormModel {
  id: number | null;
  active: string;
  firstName: string;
  lastName: string;
  name: string;
  employeeCodes: string;
  mobile: string;
  email: string;
  password: string;
  branches: number[];
  roles: number[];
  cityIds: number[];
  designationId: number | null;
  divisionId: number | null;
  departmentId: number | null;
  reportingId: number | null;
  location: string;
  latitude: string;
  longitude: string;
  payroll: string;
  salesType: string;
  showAttandanceReport: string;
  dateOfJoining: string | null;
}

interface ToastModel {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

type MultiSelectName = 'branches' | 'roles';

@Component({
  standalone: false,
  selector: 'app-users',
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss']
})
export class UsersComponent implements OnInit {
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  users: User[] = [];
  roles: UserOption[] = [];
  branches: UserOption[] = [];
  designations: UserOption[] = [];
  divisions: UserOption[] = [];
  departments: UserOption[] = [];
  reportings: UserOption[] = [];
  cities: UserOption[] = [];

  showEntries = 10;
  currentPage = 1;
  totalUsers = 0;
  searchQuery = '';
  appliedSearchQuery = '';
  selectedUserType = 'employee';
  selectedActive = '';
  selectedDivisionId: number | null = null;
  selectedBranchId = '';
  selectedDepartmentId: number | null = null;

  loading = false;
  optionsLoading = false;
  saving = false;
  uploading = false;
  exporting = false;
  templating = false;
  showFilters = false;
  showUserModal = false;
  errorMessage = '';
  toast: ToastModel = { visible: false, message: '', type: 'success' };
  userForm: UserFormModel = this.emptyForm();

  branchDropdownOpen = false;
  branchDropdownSearch = '';
  roleDropdownOpen = false;
  roleDropdownSearch = '';
  private toastTimeoutId?: number;
  private searchTimeoutId?: number;

  constructor(
    private userService: UserService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadOptions();
    this.loadUsers();
  }

  get filteredUsers(): User[] {
    return this.users;
  }

  get pagedUsers(): User[] {
    return this.users;
  }

  get pageStart(): number {
    return (this.currentPage - 1) * this.safeShowEntries;
  }

  get filteredModalBranches(): UserOption[] {
    return this.filterOptions(this.branches, this.branchDropdownSearch);
  }

  get filteredModalRoles(): UserOption[] {
    return this.filterOptions(this.roles, this.roleDropdownSearch);
  }

  get selectedBranches(): UserOption[] {
    return this.selectedOptions(this.branches, this.userForm.branches);
  }

  get selectedRoles(): UserOption[] {
    return this.selectedOptions(this.roles, this.userForm.roles);
  }

  get branchLabel(): string {
    return this.selectionLabel(this.selectedBranches, 'Select branches', 'branches selected');
  }

  get roleLabel(): string {
    return this.selectionLabel(this.selectedRoles, 'Select roles', 'roles selected');
  }

  get canCreate(): boolean {
    return this.authService.hasPermission('user_create');
  }

  get canEdit(): boolean {
    return this.authService.hasPermission('user_edit');
  }

  get canDelete(): boolean {
    return this.authService.hasPermission('user_delete');
  }

  get canChangeStatus(): boolean {
    return this.authService.hasPermission('user_active');
  }

  get canExport(): boolean {
    return this.authService.hasPermission('user_download');
  }

  get canTemplate(): boolean {
    return this.authService.hasPermission('user_template');
  }

  get canUpload(): boolean {
    return this.authService.hasPermission('user_upload');
  }

  get citySelectOptions(): SearchableSelectOption[] {
    return this.cities.map(city => ({ id: city.id, label: city.name }));
  }

  whatsappUrl(mobile?: string | null): string | null {
    let digits = (mobile || '').replace(/\D/g, '');
    if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
    if (digits.length === 10) digits = `91${digits}`;
    if (digits.length < 11 || digits.length > 15) return null;
    return `https://wa.me/${digits}`;
  }

  loadUsers(): void {
    this.loading = true;
    this.errorMessage = '';
    this.userService.getUsers({ ...this.currentFilters(), page: this.currentPage, pageSize: this.safeShowEntries }).pipe(
      timeout(20000),
      finalize(() => {
        this.loading = false;
        this.refreshView();
      })
    ).subscribe({
      next: users => {
        this.users = users;
        this.totalUsers = users.total;
        this.refreshView();
      },
      error: error => {
        this.errorMessage = error.name === 'TimeoutError'
          ? 'Users API request timed out. Please check the backend URL.'
          : error.message;
        this.refreshView();
      }
    });
  }

  loadOptions(): void {
    this.optionsLoading = true;
    this.userService.getOptions().pipe(
      timeout(20000),
      finalize(() => {
        this.optionsLoading = false;
        this.refreshView();
      })
    ).subscribe({
      next: options => {
        this.roles = options.roles;
        this.branches = options.branches;
        this.designations = options.designations;
        this.divisions = options.divisions;
        this.departments = options.departments;
        this.reportings = options.reportings;
        this.cities = options.cities;
        this.refreshView();
      },
      error: error => {
        this.showToast(error.message, 'error');
        this.refreshView();
      }
    });
  }

  applyFilters(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.currentPage = 1;
    this.loadUsers();
  }

  scheduleSearch(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.searchTimeoutId = window.setTimeout(() => {
      this.appliedSearchQuery = this.searchQuery;
      this.currentPage = 1;
      this.loadUsers();
      this.refreshView();
    }, 400);
  }

  clearFilters(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.selectedUserType = 'employee';
    this.selectedActive = '';
    this.selectedDivisionId = null;
    this.selectedBranchId = '';
    this.selectedDepartmentId = null;
    this.searchQuery = '';
    this.appliedSearchQuery = '';
    this.currentPage = 1;
    this.loadUsers();
  }

  resetPage(): void {
    this.currentPage = 1;
    this.loadUsers();
  }

  onPageChange(page: number): void { this.currentPage = page; this.loadUsers(); }

  openCreateModal(): void {
    this.userForm = this.emptyForm();
    this.closeDropdowns();
    this.showUserModal = true;
    this.errorMessage = '';
    this.refreshView();
  }

  openEditModal(user: User): void {
    this.userForm = {
      id: user.id,
      active: user.active || 'Y',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      name: user.name || '',
      employeeCodes: user.employeeCodes || '',
      mobile: user.mobile || '',
      email: user.email || '',
      password: '',
      branches: this.parseBranchIds(user.branchId),
      roles: (user.roles ?? []).map(role => role.id),
      cityIds: user.cityIds ?? [],
      designationId: user.designationId ?? null,
      divisionId: user.divisionId ?? null,
      departmentId: user.departmentId ?? null,
      reportingId: user.reportingId ?? null,
      location: user.location || '',
      latitude: user.latitude || '',
      longitude: user.longitude || '',
      payroll: user.payroll || '',
      salesType: user.salesType || '',
      showAttandanceReport: user.showAttandanceReport || 'N',
      dateOfJoining: this.toDateInput(user.dateOfJoining)
    };
    this.closeDropdowns();
    this.showUserModal = true;
    this.errorMessage = '';
    this.refreshView();
  }

  closeUserModal(): void {
    if (this.saving) return;
    this.showUserModal = false;
    this.closeDropdowns();
    this.refreshView();
  }

  submitUser(): void {
    const payload = this.buildPayload();
    if (!payload.name?.trim()) {
      this.showToast('Name is required.', 'error');
      return;
    }
    if (!payload.mobile?.trim()) {
      this.showToast('Mobile number is required.', 'error');
      return;
    }
    if (!this.userForm.id && !payload.password?.trim()) {
      this.showToast('Password is required.', 'error');
      return;
    }

    this.saving = true;
    const request = this.userForm.id
      ? this.userService.updateUser(this.userForm.id, payload)
      : this.userService.createUser(payload);

    request.subscribe({
      next: result => {
        this.saving = false;
        this.showUserModal = false;
        this.closeDropdowns();
        this.showToast(result.message, 'success');
        this.loadUsers();
        this.refreshView();
      },
      error: error => {
        this.saving = false;
        this.showToast(error.message, 'error');
        this.refreshView();
      }
    });
  }

  toggleActive(user: User, event: Event): void {
    if (!this.canChangeStatus) {
      event.preventDefault();
      return;
    }

    const checked = event.target instanceof HTMLInputElement ? event.target.checked : false;
    const nextActive = checked ? 'Y' : 'N';
    user.active = nextActive;
    this.refreshView();

    this.userService.setUserActive(user.id, nextActive).subscribe({
      next: result => {
        this.showToast(result.message, 'success');
        this.loadUsers();
      },
      error: error => {
        this.showToast(error.message, 'error');
        this.loadUsers();
      }
    });
  }

  deleteUser(user: User): void {
    if (!confirm(`Delete user "${user.name}"?`)) return;

    this.loading = true;
    this.userService.deleteUser(user.id).subscribe({
      next: result => {
        this.showToast(result.message, 'success');
        this.loadUsers();
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

  uploadUsers(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploading = true;
    this.showToast('Importing...', 'success');
    this.userService.uploadUsers(file).pipe(
      finalize(() => {
        this.uploading = false;
        input.value = '';
        this.refreshView();
      })
    ).subscribe({
      next: result => {
        this.showToast(result.message, 'success');
        this.loadUsers();
      },
      error: error => {
        this.showToast(error.message, 'error');
        this.refreshView();
      }
    });
  }

  exportUsers(): void {
    this.exporting = true;
    this.showToast('Exporting...', 'success');
    this.userService.downloadUsers(this.currentFilters()).pipe(finalize(() => {
      this.exporting = false;
      this.refreshView();
    })).subscribe({
      next: blob => this.downloadBlob(blob, `users-${this.dateStamp()}.xlsx`),
      error: error => this.showToast(error.message, 'error')
    });
  }

  downloadTemplate(): void {
    this.templating = true;
    this.showToast('Preparing template...', 'success');
    this.userService.downloadTemplate().pipe(finalize(() => {
      this.templating = false;
      this.refreshView();
    })).subscribe({
      next: blob => this.downloadBlob(blob, 'users-template.xlsx'),
      error: error => this.showToast(error.message, 'error')
    });
  }

  toggleDropdown(name: MultiSelectName): void {
    if (name === 'branches') {
      this.branchDropdownOpen = !this.branchDropdownOpen;
      this.roleDropdownOpen = false;
    } else {
      this.roleDropdownOpen = !this.roleDropdownOpen;
      this.branchDropdownOpen = false;
    }
  }

  toggleSelection(name: MultiSelectName, id: number): void {
    const current = new Set(this.userForm[name]);
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }

    this.userForm[name] = Array.from(current);
  }

  removeSelection(name: MultiSelectName, id: number): void {
    this.userForm[name] = this.userForm[name].filter(value => value !== id);
  }

  selectAll(name: MultiSelectName): void {
    this.userForm[name] = (name === 'branches' ? this.branches : this.roles).map(option => option.id);
  }

  clearSelection(name: MultiSelectName): void {
    this.userForm[name] = [];
  }

  hasSelection(name: MultiSelectName, id: number): boolean {
    return this.userForm[name].includes(id);
  }

  roleSummary(user: User): string {
    const roles = user.roles ?? [];
    if (!roles.length) return '';
    return roles.map(role => role.name).join(', ');
  }

  formatDate(value?: string | null): string {
    return formatKolkataDateTime(value, '');
  }

  private currentFilters(): UserFilters {
    return {
      userType: this.selectedUserType || undefined,
      search: this.appliedSearchQuery || undefined,
      active: this.selectedActive || undefined,
      divisionId: this.selectedDivisionId,
      branchId: this.selectedBranchId || undefined,
      departmentId: this.selectedDepartmentId
    };
  }

  private get safeShowEntries(): number {
    const value = Number(this.showEntries);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
  }

  private buildPayload(): UserPayload {
    const name = (this.userForm.name || `${this.userForm.firstName} ${this.userForm.lastName}`).trim();
    const branchId = this.userForm.branches.join(',');
    const coordinates = [this.userForm.latitude.trim(), this.userForm.longitude.trim()]
      .filter(Boolean)
      .join(',');

    return {
      active: this.userForm.active,
      name,
      firstName: this.userForm.firstName.trim(),
      lastName: this.userForm.lastName.trim(),
      employeeCodes: this.userForm.employeeCodes.trim(),
      mobile: this.userForm.mobile.trim(),
      email: this.userForm.email.trim(),
      password: this.userForm.password,
      branchId,
      branchIds: this.userForm.branches,
      designationId: this.userForm.designationId,
      divisionId: this.userForm.divisionId,
      departmentId: this.userForm.departmentId,
      reportingId: this.userForm.reportingId,
      location: this.userForm.location.trim(),
      baseLocationCoordinates: coordinates,
      payroll: this.userForm.payroll,
      salesType: this.userForm.salesType,
      showAttandanceReport: this.userForm.showAttandanceReport,
      dateOfJoining: this.userForm.dateOfJoining,
      roles: this.userForm.roles,
      cityIds: this.userForm.cityIds
    };
  }

  private filterOptions(options: UserOption[], search: string): UserOption[] {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(option => option.name.toLowerCase().includes(q));
  }

  private selectedOptions(options: UserOption[], ids: number[]): UserOption[] {
    const selected = new Set(ids);
    return options.filter(option => selected.has(option.id));
  }

  private selectionLabel(options: UserOption[], emptyLabel: string, countLabel: string): string {
    if (!options.length) return emptyLabel;
    if (options.length === 1) return firstCaps(options[0].name);
    return `${options.length} ${countLabel}`;
  }

  private parseBranchIds(value?: string | null): number[] {
    return (value || '')
      .split(',')
      .map(part => Number(part.trim()))
      .filter(value => Number.isFinite(value) && value > 0);
  }

  private toDateInput(value?: string | null): string | null {
    return value ? kolkataDateInput(value) : null;
  }

  private closeDropdowns(): void {
    this.branchDropdownOpen = false;
    this.roleDropdownOpen = false;
    this.branchDropdownSearch = '';
    this.roleDropdownSearch = '';
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    if (!message) return;

    this.toast = { visible: true, message, type };
    if (this.toastTimeoutId) {
      window.clearTimeout(this.toastTimeoutId);
    }

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

  private emptyForm(): UserFormModel {
    return {
      id: null,
      active: 'Y',
      firstName: '',
      lastName: '',
      name: '',
      employeeCodes: '',
      mobile: '',
      email: '',
      password: '',
      branches: [],
      roles: [],
      cityIds: [],
      designationId: null,
      divisionId: null,
      departmentId: null,
      reportingId: null,
      location: '',
      latitude: '',
      longitude: '',
      payroll: '',
      salesType: '',
      showAttandanceReport: 'N',
      dateOfJoining: null
    };
  }
}
