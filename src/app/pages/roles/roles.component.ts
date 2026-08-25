import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, timeout } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { Role, RoleService } from '../../services/role.service';

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
  showEntries = 10;
  currentPage = 1;
  totalRows = 0;
  searchQuery = '';
  appliedSearchQuery = '';
  loading = false;
  errorMessage = '';
  toast: ToastModel = { visible: false, message: '', type: 'success' };

  private toastTimeoutId?: number;
  private searchTimeoutId?: number;

  constructor(
    private roleService: RoleService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // The editor navigates back here with the message from the save it just made.
    const message = (history.state as { message?: string } | null)?.message;
    if (message) this.showToast(message, 'success');
    this.loadRoles();
  }

  get canCreate(): boolean {
    return this.authService.hasPermission('role.create');
  }

  get canEdit(): boolean {
    return this.authService.hasPermission('role.edit');
  }

  get canDelete(): boolean {
    return this.authService.hasPermission('role.delete');
  }

  get pageStart(): number {
    return (this.currentPage - 1) * this.safeShowEntries;
  }

  loadRoles(): void {
    this.loading = true;
    this.errorMessage = '';

    this.roleService.getRoles(this.appliedSearchQuery, true, this.currentPage, this.safeShowEntries).pipe(
      timeout(15000),
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: roles => {
        this.roles = roles;
        this.totalRows = roles.total;
      },
      error: error => {
        this.errorMessage = error.name === 'TimeoutError'
          ? 'Roles API request timed out. Please check the frontend proxy/backend URL.'
          : error.message;
      }
    });
  }

  resetPage(): void {
    this.currentPage = 1;
    this.loadRoles();
  }

  onPageChange(page: number): void {
    if (page === this.currentPage) return;
    this.currentPage = page;
    this.loadRoles();
  }

  scheduleSearch(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.searchTimeoutId = window.setTimeout(() => {
      this.appliedSearchQuery = this.searchQuery;
      this.currentPage = 1;
      this.loadRoles();
    }, 400);
  }

  createRole(): void {
    this.router.navigate(['/roles/new']);
  }

  editRole(role: Role): void {
    this.router.navigate(['/roles', role.id, 'edit']);
  }

  /** superadmin passes every permission check by design, so the listing marks it and
   *  offers a look rather than an edit. */
  isFixedRole(role: Role): boolean {
    return role.name.trim().toLowerCase() === 'superadmin';
  }

  /** The first few permissions, as a hint of what the role carries. */
  permissionSummary(role: Role): string {
    if (this.isFixedRole(role)) return 'Every permission, including any added later';
    const labels = (role.permissions ?? []).map(permission => permission.label || permission.name);
    if (labels.length === 0) return 'No permission assigned';
    return labels.slice(0, 3).join(', ') + (labels.length > 3 ? ` +${labels.length - 3} more` : '');
  }

  deleteRole(role: Role): void {
    if (!confirm(`Delete role "${role.name}"?`)) return;

    this.loading = true;
    this.roleService.deleteRole(role.id).pipe(
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      // A role that still has users is refused by the API, and the reason - how many
      // users are on it - is what the toast shows.
      next: result => {
        this.showToast(result.message, 'success');
        this.loadRoles();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  private get safeShowEntries(): number {
    return this.showEntries > 0 ? this.showEntries : 10;
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    this.toast = { visible: true, message, type };
    if (this.toastTimeoutId) window.clearTimeout(this.toastTimeoutId);
    this.toastTimeoutId = window.setTimeout(() => {
      this.toast = { ...this.toast, visible: false };
      this.cdr.detectChanges();
    }, 4000);
  }
}
