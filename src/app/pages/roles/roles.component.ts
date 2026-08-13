import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { timeout } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { Permission, Role, RolePayload, RoleService } from '../../services/role.service';
import { formatKolkataDateTime } from '../../shared/utils/date-time';

interface RoleFormModel {
  id: number | null;
  name: string;
  guard_name: string;
  permissions: number[];
}

interface ToastModel {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

@Component({
  standalone: false,
  selector: 'app-roles',
  templateUrl: './roles.component.html',
  styleUrls: ['./roles.component.scss']
})
export class RolesComponent implements OnInit {
  roles: Role[] = [];
  permissions: Permission[] = [];
  showEntries = 10;
  currentPage = 1;
  searchQuery = '';
  appliedSearchQuery = '';
  permissionSearch = '';
  showRoleModal = false;
  permissionDropdownOpen = false;
  permissionDropdownSearch = '';
  loading = false;
  saving = false;
  errorMessage = '';
  successMessage = '';
  toast: ToastModel = { visible: false, message: '', type: 'success' };
  roleForm: RoleFormModel = this.emptyForm();
  private toastTimeoutId?: number;
  private searchTimeoutId?: number;

  private readonly permissionDescriptions: Record<string, string> = {
    dashboard_access: 'Dashboard Menu / Page',
    customer_access: 'Customers Management > Customer Listing',
    country_access: 'Address Management > Country Listing',
    state_access: 'Address Management > State Listing',
    district_access: 'Address Management > District Listing',
    city_access: 'Address Management > City Listing',
    pincode_access: 'Address Management > Pincode Listing',
    city_assigned: 'Address Management > City Assigned',
    product_access: 'Product Management > Products Listing',
    category_access: 'Product Management > Segment Listing',
    subcategory_access: 'Product Management > Family Listing',
    hr_access: 'HR Management Main Menu',
    attendance_report: 'HR Management > Attendance Details',
    attendance_delete: 'Attendance Details Delete',
    attendance_summary_report: 'HR Management > Attendance Summary',
    holiday_access: 'HR Management > Holidays Listing',
    leave_access: 'HR Management > Leaves Listing',
    branch: 'HR Management > Branch Listing',
    division: 'HR Management > Zone Listing',
    designation: 'HR Management > Designation Listing',
    departments: 'HR Management > Departments Listing',
    user_access: 'User Management > User Details Listing',
    user_app_details_access: 'User Management > User App Details Listing',
    user_app_force_logout: 'User App Details Force Logout',
    user_app_uuid_reset: 'User App Details Remove Device UUID',
    target_access: 'User Management > User Target Listing',
    user_location: 'User Management > User Live Activity',
    tours: 'User Management > Tours Listing',
    account_access: 'Account Management Main Menu',
    expenses_type: 'Account Management > Expenses Type Listing',
    expense_access: 'Account Management > Expense Listing',
    order_access: 'Order Management > Orders Listing',
    sale_access: 'Order Management > Order Dispatch Listing',
    order_dispatch: 'Order Dispatch Action',
    scheme_access: 'Loyalty Management Main Menu',
    scheme_draft: 'Scheme Creation Send to Draft',
    scheme_submit: 'Scheme Creation Submit to Next Level',
    scheme_approve: 'Scheme Creation Approve',
    scheme_reject: 'Scheme Creation Reject',
    scheme_publish: 'Scheme Creation Publish',
    new_invoice_access: 'Loyalty Management > Invoice Transaction Listing',
    new_invoice_export: 'Invoice Transaction Download (Export)',
    new_invoice_create: 'Invoice Transaction Add',
    new_invoice_edit: 'Invoice Transaction Edit',
    new_invoice_delete: 'Invoice Transaction Delete',
    new_invoice_approve_ss: 'Invoice Transaction Approve by SS',
    new_invoice_approve_sales: 'Invoice Transaction Approve by Sales',
    new_invoice_approve_ho: 'Invoice Transaction Approve by HO',
    new_invoice_reject: 'Invoice Transaction Reject',
    scheme_access_list: 'Loyalty Management > Scheme Creation Listing',
    redemption_access: 'Loyalty Management > Redemption Listing',
    status_access: 'Setting Management Main Menu',
    loyalty_app_setting_access: 'Setting Management > FieldKonnect App Setting',
    dealer_portal_setting_access: 'Setting Management > Dealer Portal Setting',
    role_access: 'Setting Management > Roles Listing',
    role_create: 'Roles Add',
    role_edit: 'Roles Edit',
    role_delete: 'Roles Delete',
    beat_access: 'Beats Management > Beats Listing',
    beatdetail_access: 'Beats Management > Beat Detail Listing',
    checkin_access: 'Beats Management > Checkin-Checkout Listing',
    retailer_productivity_report: 'Reports Management > Retailer / Dealer Performance Download (Export)',
    ASR_report_Download: 'Reports Management > ASR Performance Download (Export)',
    asm_rating_report: 'Reports Management > Rating Report',
    asm_rating_download: 'Rating Report Download (Export)',
    asm_rating_detailed_download: 'Rating Report Detailed Download (Export)',
    market_intelligence_access: 'Reports Management > Market Intelligence',
    market_intelligence_report_download: 'Market Intelligence Download (Export)',
    customers_report: 'Reports Management > Customer Master Download (Export)',
    retailer_approve: 'Customer Listing > Retailer Approve',
    retailer_reject: 'Customer Listing > Retailer Reject',
    retailer_pending: 'Customer Listing > Retailer Mark as Pending',
    country_active: 'Country Activate / Deactivate',
    state_active: 'State Activate / Deactivate',
    district_active: 'District Activate / Deactivate',
    city_active: 'City Activate / Deactivate',
    pincode_active: 'Pincode Activate / Deactivate',
    customer_kyc_access: 'Customer KYC Approve / Reject'
  };

  private readonly moduleLabels: Record<string, string> = {
    customer: 'Customer', customers: 'Customer', retailer: 'Retailer', distributor: 'Distributor',
    user: 'User', role: 'Role', permission: 'Permission', country: 'Country', state: 'State',
    district: 'District', city: 'City', pincode: 'Pincode', category: 'Segment', subcategory: 'Family',
    product: 'Product', order: 'Order', beat: 'Beat', beatdetail: 'Beat Detail', checkin: 'Checkin-Checkout',
    holiday: 'Holiday', leave: 'Leave', attendance: 'Attendance', expense: 'Expense', expenses: 'Expense',
    scheme: 'Loyalty Scheme', redemption: 'Redemption', new_invoice: 'Invoice Transaction',
    branch: 'Branch', division: 'Zone', designation: 'Designation', department: 'Department',
    target: 'User Target', tour: 'Tour', status: 'Status', sale: 'Order Dispatch',
    customertype: 'Customer Type', firmtype: 'Firm Type', survey: 'Survey', field: 'Custom Field',
    brand: 'Brand', gift: 'Gift', unit: 'Unit', purchase: 'Purchase', wallet: 'Wallet',
    redeemedpoint: 'Redeemed Points', setting: 'Setting', coupon: 'Coupon',
    couponprofile: 'Coupon Profile', visitreport: 'Visit Report', visittype: 'Visit Type',
    stock: 'Stock', stockdetails: 'Stock Details', leads: 'Leads', tasks: 'Tasks', payments: 'Payments',
    master_distributor: 'Dealer', loyalty_app_setting: 'Loyalty App Setting', dealer_portal_setting: 'Dealer Portal Setting',
    user_app_details: 'User App Details', market_intelligence: 'Market Intelligence',
    asm_rating: 'Rating Report', asr: 'ASR Performance', invoice: 'Invoice', estimate: 'Estimate',
    process: 'Process', active_process: 'Active Process', call_log: 'Call Log', geo_locator: 'Geo Locator'
  };

  constructor(
    private roleService: RoleService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  get filteredRoles(): Role[] {
    const q = this.appliedSearchQuery.trim().toLowerCase();
    if (!q) return this.roles;

    return this.roles.filter(role =>
      (role.name ?? '').toLowerCase().includes(q)
      || (role.guard_name ?? '').toLowerCase().includes(q)
    );
  }

  get pagedRoles(): Role[] {
    return this.filteredRoles.slice(this.pageStart, this.pageStart + this.safeShowEntries);
  }

  get pageStart(): number {
    return (this.currentPage - 1) * this.safeShowEntries;
  }

  get filteredPermissions(): Permission[] {
    const q = this.permissionSearch.trim().toLowerCase();
    if (!q) return this.permissions;

    return this.permissions.filter(permission =>
      (permission.name ?? '').toLowerCase().includes(q)
      || (permission.guard_name ?? '').toLowerCase().includes(q)
    );
  }

  get filteredModalPermissions(): Permission[] {
    const q = this.permissionDropdownSearch.trim().toLowerCase();
    if (!q) return this.permissions;

    return this.permissions.filter(permission =>
      (permission.name ?? '').toLowerCase().includes(q)
      || (permission.guard_name ?? '').toLowerCase().includes(q)
      || this.permissionDescription(permission.name).toLowerCase().includes(q)
    );
  }

  get selectedModalPermissions(): Permission[] {
    const selected = new Set(this.roleForm.permissions);
    return this.permissions.filter(permission => selected.has(permission.id));
  }

  get selectedPermissionLabel(): string {
    const count = this.roleForm.permissions.length;
    if (count === 0) return 'Select permissions';
    if (count === 1) return this.selectedModalPermissions[0]?.name ?? '1 permission selected';
    return `${count} permissions selected`;
  }

  get canCreate(): boolean {
    return this.authService.hasPermission('role_create');
  }

  get canEdit(): boolean {
    return this.authService.hasPermission('role_edit');
  }

  get canDelete(): boolean {
    return this.authService.hasPermission('role_delete');
  }

  loadData(): void {
    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.roles = [];
    this.permissions = [];
    this.currentPage = 1;

    this.loadPermissions();
    this.loadRoles();
    this.refreshView();
  }

  loadRoles(): void {
    this.loading = true;
    this.roleService.getRoles('', true).pipe(
      timeout(15000),
      finalize(() => {
        this.loading = false;
        this.refreshView();
      })
    ).subscribe({
      next: roles => {
        this.roles = roles;
        this.currentPage = 1;
        if (roles.length === 0) {
          this.errorMessage = 'Roles API returned 200, but no roles were found in the response.';
        }
        this.refreshView();
      },
      error: error => {
        this.errorMessage = error.name === 'TimeoutError'
          ? 'Roles API request timed out. Please check the frontend proxy/backend URL.'
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

  loadPermissions(): void {
    this.roleService.getPermissions().pipe(
      timeout(15000)
    ).subscribe({
      next: permissions => {
        this.permissions = permissions;
        if (permissions.length === 0) {
          this.errorMessage = 'Permissions API returned 200, but no permissions were found in the response.';
        }
        this.refreshView();
      },
      error: error => {
        this.errorMessage = error.name === 'TimeoutError'
          ? 'Permissions API request timed out. Please check the frontend proxy/backend URL.'
          : error.message;
        this.refreshView();
      }
    });
  }

  openCreateModal(): void {
    this.roleForm = this.emptyForm();
    this.permissionDropdownOpen = false;
    this.permissionDropdownSearch = '';
    this.showRoleModal = true;
    this.errorMessage = '';
    this.successMessage = '';
  }

  openEditModal(role: Role): void {
    this.roleForm = {
      id: role.id,
      name: role.name,
      guard_name: role.guard_name || 'users',
      permissions: (role.permissions ?? []).map(permission => permission.id)
    };
    this.permissionDropdownOpen = false;
    this.permissionDropdownSearch = '';
    this.showRoleModal = true;
    this.errorMessage = '';
    this.successMessage = '';
  }

  closeRoleModal(): void {
    if (this.saving) return;
    this.showRoleModal = false;
    this.permissionDropdownOpen = false;
  }

  submitRole(): void {
    const name = this.roleForm.name.trim();
    if (!name) {
      this.errorMessage = 'Role name is required.';
      return;
    }

    const payload: RolePayload = {
      name,
      guard_name: this.roleForm.guard_name.trim() || 'users',
      permissions: this.roleForm.permissions
    };

    this.saving = true;
    this.errorMessage = '';
    this.successMessage = '';

    const request = this.roleForm.id
      ? this.roleService.updateRole(this.roleForm.id, payload)
      : this.roleService.createRole(payload);

    request.subscribe({
      next: result => this.handleRoleSaved(result.message),
      error: error => {
        this.saving = false;
        this.showToast(error.message, 'error');
        this.refreshView();
      }
    });
  }

  private handleRoleSaved(resultMessage: string): void {
    this.saving = false;
    this.showRoleModal = false;
    this.permissionDropdownOpen = false;
    this.roleForm = this.emptyForm();
    this.showToast(resultMessage || 'Role saved successfully', 'success');
    this.loadData();
    this.refreshView();
  }

  deleteRole(role: Role): void {
    if (!confirm(`Delete role "${role.name}"?`)) return;

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.roleService.deleteRole(role.id).subscribe({
      next: result => {
        this.showToast(result.message, 'success');
        this.loadData();
        this.refreshView();
      },
      error: error => {
        this.loading = false;
        this.showToast(error.message, 'error');
        this.refreshView();
      }
    });
  }

  toggleFormPermission(permissionId: number, event: Event): void {
    const checked = event.target instanceof HTMLInputElement ? event.target.checked : false;
    const current = new Set(this.roleForm.permissions);

    if (checked) {
      current.add(permissionId);
    } else {
      current.delete(permissionId);
    }

    this.roleForm.permissions = Array.from(current);
  }

  toggleDropdownPermission(permissionId: number): void {
    const current = new Set(this.roleForm.permissions);
    if (current.has(permissionId)) {
      current.delete(permissionId);
    } else {
      current.add(permissionId);
    }

    this.roleForm.permissions = Array.from(current);
  }

  removeFormPermission(permissionId: number): void {
    this.roleForm.permissions = this.roleForm.permissions.filter(id => id !== permissionId);
  }

  clearFormPermissions(): void {
    this.roleForm.permissions = [];
  }

  selectAllFormPermissions(): void {
    this.roleForm.permissions = this.permissions.map(permission => permission.id);
  }

  formHasPermission(permissionId: number): boolean {
    return this.roleForm.permissions.includes(permissionId);
  }

  formatDate(value?: string | null): string {
    return formatKolkataDateTime(value, '');
  }

  readableName(value: string): string {
    return (value || '')
      .replace(/[_-]/g, ' ')
      .replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  }

  permissionDescription(permissionName: string): string {
    const exact = this.permissionDescriptions[permissionName];
    if (exact) return exact;

    const normalized = (permissionName || '').toLowerCase();
    const actions: Array<[string, string]> = [
      ['_report_download', '{module} Report Download (Export)'],
      ['_detailed_download', '{module} Detailed Download (Export)'],
      ['_download', '{module} Download (Export)'],
      ['_export', '{module} Download (Export)'],
      ['_report', '{module} Report View / Download (Export)'],
      ['_template', '{module} Upload Template Download'],
      ['_upload', '{module} Upload (Import)'],
      ['_import', '{module} Upload (Import)'],
      ['_approve', '{module} Approve'],
      ['_reject', '{module} Reject'],
      ['_publish', '{module} Publish'],
      ['_submit', '{module} Submit for Approval'],
      ['_active', '{module} Activate / Deactivate'],
      ['_create', '{module} Add'],
      ['_edit', '{module} Edit'],
      ['_update', '{module} Update'],
      ['_delete', '{module} Delete'],
      ['_show', '{module} View Details'],
      ['_view', '{module} View'],
      ['_access', '{module} Menu / Listing']
    ];

    for (const [suffix, template] of actions) {
      if (!normalized.endsWith(suffix)) continue;
      const moduleKey = normalized.slice(0, -suffix.length);
      const module = this.moduleName(moduleKey);
      return template.replace('{module}', module);
    }

    return `${this.readableName(permissionName)} Access / Action`;
  }

  private moduleName(moduleKey: string): string {
    const exact = this.moduleLabels[moduleKey];
    if (exact) return exact;

    const matchingPrefix = Object.keys(this.moduleLabels)
      .sort((left, right) => right.length - left.length)
      .find(prefix => moduleKey === prefix || moduleKey.startsWith(`${prefix}_`));
    if (matchingPrefix) {
      const remainder = moduleKey.slice(matchingPrefix.length).replace(/^_/, '');
      return remainder
        ? `${this.moduleLabels[matchingPrefix]} ${this.readableName(remainder)}`
        : this.moduleLabels[matchingPrefix];
    }

    return this.readableName(moduleKey || 'this feature');
  }

  permissionSummary(role: Role): string {
    const permissions = role.permissions ?? [];
    if (!permissions.length) return 'No permissions';
    if (permissions.length <= 2) return permissions.map(permission => permission.name).join(', ');
    return `${permissions[0].name}, ${permissions[1].name} +${permissions.length - 2}`;
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

  private refreshView(): void {
    this.cdr.detectChanges();
  }

  private get safeShowEntries(): number {
    const value = Number(this.showEntries);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
  }

  private emptyForm(): RoleFormModel {
    return {
      id: null,
      name: '',
      guard_name: 'users',
      permissions: []
    };
  }
}
