import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { UserIssueRow, UserIssueService, SolverOption } from '../../services/user-issue.service';

@Component({
  selector: 'app-user-issues',
  standalone: false,
  templateUrl: './user-issues.component.html',
  styleUrls: ['./user-issues.component.scss']
})
export class UserIssuesComponent implements OnInit {
  rows: UserIssueRow[] = [];
  total = 0;
  page = 1;
  pageSize = 25;

  search = '';
  statusFilter = '';
  startDate = '';
  endDate = '';

  loading = false;
  exporting = false;
  error = '';
  success = '';
  showFilters = false;

  statusOptions = ['Pending', 'In Progress', 'Resolved'];

  // Create popup
  showCreate = false;
  createUserId: number | '' = '';
  createIssue = '';
  createSaving = false;
  createError = '';

  // Resolve popup
  showResolve = false;
  resolveRow: UserIssueRow | null = null;
  resolveStatus = 'Resolved';
  resolveSolvedBy: number | '' = '';
  resolveRemark = '';
  resolveSaving = false;
  resolveError = '';
  solvers: SolverOption[] = [];
  private searchTimer: any;

  constructor(private service: UserIssueService, private auth: AuthService, private cdr: ChangeDetectorRef) {}

  get canExport(): boolean { return this.auth.hasPermission('user_issue.export'); }
  get canCreate(): boolean { return this.auth.hasPermission('user_issue.create'); }
  get canResolve(): boolean { return this.auth.hasPermission('user_issue.resolve'); }
  get isSuperAdmin(): boolean { return this.auth.isSuperAdmin(); }

  get solverSelectOptions(): { id: number; name: string }[] {
    return this.solvers.map(s => ({ id: s.id, name: s.employee_code ? `${s.name} (${s.employee_code})` : s.name }));
  }

  get lastPage(): number { return Math.max(1, Math.ceil(this.total / this.pageSize)); }
  get visiblePages(): number[] {
    const last = this.lastPage;
    const start = Math.max(1, Math.min(this.page - 2, last - 4));
    const end = Math.min(last, start + 4);
    const pages: number[] = [];
    for (let p = start; p <= end; p++) pages.push(p);
    return pages;
  }

  ngOnInit(): void {
    const today = new Date();
    const prior = new Date();
    prior.setMonth(prior.getMonth() - 1);
    this.endDate = this.toInput(today);
    this.startDate = this.toInput(prior);
    this.loadSolvers();
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.service.list({
      page: this.page, pageSize: this.pageSize, search: this.search,
      status: this.statusFilter, startDate: this.startDate, endDate: this.endDate
    }).subscribe({
      next: res => {
        this.rows = res.data || [];
        this.total = res.total || 0;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: err => { this.error = err.message || 'Failed to load issues.'; this.loading = false; this.cdr.detectChanges(); }
    });
  }

  private loadSolvers(): void {
    this.service.solverOptions().subscribe({
      next: res => { this.solvers = res.data || []; this.cdr.detectChanges(); },
      error: () => { this.solvers = []; this.cdr.detectChanges(); }
    });
  }

  applyFilters(): void {
    this.page = 1;
    this.load();
  }

  scheduleSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applyFilters(), 400);
  }

  changePage(p: number): void {
    if (p < 1 || p > this.lastPage || p === this.page) return;
    this.page = p;
    this.load();
  }

  changePageSize(): void {
    this.page = 1;
    this.load();
  }

  export(): void {
    if (!this.canExport || this.exporting) return;
    this.exporting = true;
    this.error = '';
    this.service.download({
      search: this.search, status: this.statusFilter, startDate: this.startDate, endDate: this.endDate
    }).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'User_Issues.xlsx';
        a.click();
        URL.revokeObjectURL(url);
        this.exporting = false;
        this.cdr.detectChanges();
      },
      error: err => { this.error = err.message || 'Export failed.'; this.exporting = false; this.cdr.detectChanges(); }
    });
  }

  // ---- Resolve popup --------------------------------------------------------
  canResolveRow(row: UserIssueRow): boolean {
    if (!this.canResolve) return false;
    // Once resolved, the issue is final - no action button for anyone.
    if ((row.status || '').toLowerCase() === 'resolved') return false;
    return true;
  }

  openResolve(row: UserIssueRow): void {
    this.resolveRow = row;
    this.resolveStatus = (row.status || '').toLowerCase() === 'resolved' ? 'Resolved'
      : ((row.status || '').toLowerCase() === 'in progress' ? 'In Progress' : 'Resolved');
    this.resolveSolvedBy = row.solved_by || '';
    this.resolveRemark = row.solve_remark || '';
    this.resolveError = '';
    this.showResolve = true;
  }

  closeResolve(): void {
    this.showResolve = false;
    this.resolveRow = null;
  }

  submitResolve(): void {
    if (!this.resolveRow) return;
    this.resolveError = '';
    const resolved = this.resolveStatus === 'Resolved';
    if (resolved) {
      if (!this.resolveSolvedBy) { this.resolveError = 'Please select who solved the issue.'; return; }
      if (!this.resolveRemark.trim()) { this.resolveError = 'Solve remark is required.'; return; }
    }

    this.resolveSaving = true;
    this.service.resolve(this.resolveRow.id, {
      status: this.resolveStatus,
      solved_by: resolved ? Number(this.resolveSolvedBy) : null,
      solve_remark: resolved ? this.resolveRemark.trim() : null
    }).subscribe({
      next: () => {
        this.resolveSaving = false;
        this.showResolve = false;
        this.resolveRow = null;
        this.success = 'Issue updated successfully.';
        this.cdr.detectChanges();
        setTimeout(() => { this.success = ''; this.cdr.detectChanges(); }, 3000);
        this.load();
      },
      error: err => { this.resolveError = err.message || 'Could not update the issue.'; this.resolveSaving = false; this.cdr.detectChanges(); }
    });
  }

  // ---- Create popup ---------------------------------------------------------
  openCreate(): void {
    this.createUserId = '';
    this.createIssue = '';
    this.createError = '';
    this.showCreate = true;
  }

  closeCreate(): void {
    this.showCreate = false;
  }

  submitCreate(): void {
    this.createError = '';
    if (!this.createUserId) { this.createError = 'Please select a user.'; return; }
    if (!this.createIssue.trim()) { this.createError = 'Issue is required.'; return; }

    this.createSaving = true;
    this.service.create({ user_id: Number(this.createUserId), issue: this.createIssue.trim() }).subscribe({
      next: () => {
        this.createSaving = false;
        this.showCreate = false;
        this.success = 'Issue created successfully.';
        this.cdr.detectChanges();
        setTimeout(() => { this.success = ''; this.cdr.detectChanges(); }, 3000);
        this.page = 1;
        this.load();
      },
      error: err => { this.createError = err.message || 'Could not create the issue.'; this.createSaving = false; this.cdr.detectChanges(); }
    });
  }

  statusClass(status: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'resolved') return 'status-resolved';
    if (s === 'in progress') return 'status-progress';
    return 'status-pending';
  }

  private toInput(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
