import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { Permission, Role, RoleService } from '../../services/role.service';

/** One tickable cell: a module's action, or a blank where the module has no such action. */
interface MatrixCell {
  permission?: Permission;
}

/** One row of the matrix: everything a single module can be allowed to do. The standard
 *  actions line up in columns; anything particular to the module - Approve by SS, Publish,
 *  Force Logout - sits in the last column so the table stays readable. */
interface MatrixModule {
  key: string;
  label: string;
  cells: MatrixCell[];
  extras: Permission[];
  permissionIds: number[];
}

/** Modules are grouped the way the menu groups them. */
interface MatrixGroup {
  key: string;
  label: string;
  modules: MatrixModule[];
  permissionIds: number[];
}

interface ActionColumn {
  key: string;
  label: string;
  permissionIds: number[];
}

interface ToastModel {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

@Component({
  standalone: false,
  selector: 'app-role-editor',
  templateUrl: './role-editor.component.html',
  styleUrls: ['./role-editor.component.scss']
})
export class RoleEditorComponent implements OnInit {
  roleId: number | null = null;
  roleName = '';
  loading = true;
  saving = false;
  errorMessage = '';
  search = '';
  toast: ToastModel = { visible: false, message: '', type: 'success' };

  columns: ActionColumn[] = [];
  hasExtras = false;
  groups: MatrixGroup[] = [];
  selected = new Set<number>();

  private permissions: Permission[] = [];
  private allPermissionIds: number[] = [];
  private toastTimeoutId?: number;

  /** The actions every module shares. These are the matrix columns, left to right, and the
   *  ones the quick-select chips tick down the whole table. */
  private static readonly standardActions = [
    'view', 'detail', 'create', 'edit', 'active', 'delete',
    'export', 'import', 'template'
  ];

  /** Column headings. An action the catalog spells one way reads better another way here. */
  private static readonly actionLabels: Record<string, string> = {
    view: 'View',
    detail: 'Detail',
    create: 'Create',
    edit: 'Edit',
    active: 'Active',
    delete: 'Delete',
    export: 'Export',
    import: 'Import',
    template: 'Template'
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private roleService: RoleService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.roleId = id ? Number(id) : null;
    this.load();
  }

  get isEdit(): boolean {
    return this.roleId !== null;
  }

  /** superadmin is the role every permission check falls back on - the API and the CRM
   *  both let it through without reading its permissions - so it is shown, not edited. */
  get isFixedRole(): boolean {
    return this.roleName.trim().toLowerCase() === 'superadmin';
  }

  get title(): string {
    return this.isEdit ? 'Edit Role' : 'Add Role';
  }

  get selectedCount(): number {
    return this.selected.size;
  }

  get totalCount(): number {
    return this.allPermissionIds.length;
  }

  /** Every permission in the catalog, for the "Select everything" box. */
  get everyPermissionId(): number[] {
    return this.allPermissionIds;
  }

  get visibleGroups(): MatrixGroup[] {
    const query = this.search.trim().toLowerCase();
    if (!query) return this.groups;

    return this.groups
      .map(group => ({
        ...group,
        modules: group.modules.filter(module =>
          module.label.toLowerCase().includes(query)
          || group.label.toLowerCase().includes(query)
          || module.cells.some(cell => cell.permission?.label.toLowerCase().includes(query)))
      }))
      .filter(group => group.modules.length > 0);
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';

    this.roleService.getPermissions().subscribe({
      next: permissions => {
        this.permissions = permissions;
        this.buildMatrix(permissions);
        if (!this.isEdit) {
          this.loading = false;
          this.cdr.detectChanges();
          return;
        }

        this.roleService.getRole(this.roleId!).pipe(
          finalize(() => {
            this.loading = false;
            this.cdr.detectChanges();
          })
        ).subscribe({
          next: role => this.applyRole(role),
          error: error => (this.errorMessage = error.message)
        });
      },
      error: error => {
        this.errorMessage = error.message;
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  isChecked(permissionId?: number): boolean {
    return permissionId !== undefined && this.selected.has(permissionId);
  }

  toggle(permissionId: number, checked: boolean): void {
    if (this.isFixedRole) return;
    if (checked) this.selected.add(permissionId);
    else this.selected.delete(permissionId);
  }

  /** True when every permission in the set is ticked; used by the select-all boxes. */
  allSelected(permissionIds: number[]): boolean {
    return permissionIds.length > 0 && permissionIds.every(id => this.selected.has(id));
  }

  /** True when some but not all are ticked, so the box can show as indeterminate. */
  someSelected(permissionIds: number[]): boolean {
    return permissionIds.some(id => this.selected.has(id)) && !this.allSelected(permissionIds);
  }

  setMany(permissionIds: number[], checked: boolean): void {
    if (this.isFixedRole) return;
    for (const id of permissionIds) {
      if (checked) this.selected.add(id);
      else this.selected.delete(id);
    }
  }

  clearAll(): void {
    if (this.isFixedRole) return;
    this.selected.clear();
  }

  save(): void {
    if (this.isFixedRole) return;

    const name = this.roleName.trim();
    if (!name) {
      this.showToast('Role name is required.', 'error');
      return;
    }

    this.saving = true;
    this.errorMessage = '';
    const payload = { name, guard_name: 'users', permissions: [...this.selected] };
    const request = this.isEdit
      ? this.roleService.updateRole(this.roleId!, payload)
      : this.roleService.createRole(payload);

    request.pipe(finalize(() => {
      this.saving = false;
      this.cdr.detectChanges();
    })).subscribe({
      next: result => {
        // The signed-in user may have just changed their own role, so the cached
        // permissions are dropped and re-read on the next navigation.
        this.authService.invalidatePermissions();
        this.router.navigate(['/roles'], { state: { message: result.message } });
      },
      error: error => {
        this.errorMessage = error.message;
        this.showToast(error.message, 'error');
      }
    });
  }

  cancel(): void {
    this.router.navigate(['/roles']);
  }

  private applyRole(role: Role): void {
    this.roleName = role.name;
    this.selected = new Set(role.permissions.map(permission => permission.id));
  }

  private buildMatrix(permissions: Permission[]): void {
    this.allPermissionIds = permissions.map(permission => permission.id);

    const standard = RoleEditorComponent.standardActions
      .filter(action => permissions.some(permission => permission.action_key === action));

    this.columns = standard.map(key => ({
      key,
      label: RoleEditorComponent.actionLabels[key] ?? this.readableAction(key),
      permissionIds: permissions.filter(permission => permission.action_key === key).map(permission => permission.id)
    }));

    this.hasExtras = permissions.some(permission => !standard.includes(permission.action_key));

    const groups = new Map<string, MatrixGroup>();
    for (const permission of permissions) {
      const groupKey = permission.group_key || 'other';
      let group = groups.get(groupKey);
      if (!group) {
        group = { key: groupKey, label: permission.group_label || 'Other', modules: [], permissionIds: [] };
        groups.set(groupKey, group);
      }

      let module = group.modules.find(candidate => candidate.key === permission.module_key);
      if (!module) {
        module = {
          key: permission.module_key,
          label: permission.module_label || permission.module_key,
          cells: standard.map(() => ({})),
          extras: [],
          permissionIds: []
        };
        group.modules.push(module);
      }

      const columnIndex = standard.indexOf(permission.action_key);
      if (columnIndex >= 0) module.cells[columnIndex] = { permission };
      else module.extras.push(permission);

      module.permissionIds.push(permission.id);
      group.permissionIds.push(permission.id);
    }

    this.groups = [...groups.values()];
  }

  private readableAction(key: string): string {
    return key
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
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
