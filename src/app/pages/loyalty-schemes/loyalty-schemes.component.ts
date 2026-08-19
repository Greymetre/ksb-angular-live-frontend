import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize, timeout } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import {
  LoyaltyScheme,
  LoyaltySchemeOption,
  LoyaltySchemeOptions,
  LoyaltySchemePayload,
  LoyaltySchemeService
} from '../../services/loyalty-scheme.service';
import { formatKolkataDate } from '../../shared/utils/date-time';
import { API_ORIGIN } from '../../config/api.config';

interface SchemeFormModel {
  id: number | null;
  active: string;
  schemeName: string;
  schemeCode: string;
  schemeDescription: string;
  schemeTag: string;
  customerType: string;
  areaScope: string;
  areaValues: string[];
  startDate: string;
  endDate: string;
  schemeType: string;
  basedOn: string;
  redemptionEnabled: boolean;
  brochure: File | null;
  brochurePath: string;
  slabs: Array<{
    tierName: string;
    valueFrom: number | null;
    valueTo: number | null;
    rewardValue: number | string | null;
  }>;
}

interface ToastModel {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

interface WorkflowDialog {
  visible: boolean;
  scheme: LoyaltyScheme | null;
  remark: string;
}

@Component({
  standalone: false,
  selector: 'app-loyalty-schemes',
  templateUrl: './loyalty-schemes.component.html',
  styleUrls: ['./loyalty-schemes.component.scss']
})
export class LoyaltySchemesComponent implements OnInit {
  schemes: LoyaltyScheme[] = [];
  options: LoyaltySchemeOptions = { branches: [], zones: [], states: [], customers: [] };
  customerTypes = ['Dealer', 'Retailer', 'Influencer'];
  schemeTags = ['Regular', 'Booster'];
  areaScopes = ['All', 'Branch', 'Zone', 'State', 'Customer'];
  basedOnOptions = ['Value', 'Percentage'];
  statuses = ['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Live', 'Expired'];

  showEntries = 10;
  currentPage = 1;
  totalRows = 0;
  searchQuery = '';
  appliedSearchQuery = '';
  selectedStatus = '';
  loading = false;
  saving = false;
  generatingCode = false;
  showFilters = false;
  showModal = false;
  viewOnly = false;
  viewedScheme: LoyaltyScheme | null = null;
  errorMessage = '';
  toast: ToastModel = { visible: false, message: '', type: 'success' };
  workflowDialog: WorkflowDialog = { visible: false, scheme: null, remark: '' };
  areaSearch = '';
  form: SchemeFormModel = this.emptyForm();
  private toastTimeoutId?: number;
  private codeGenerateTimeoutId?: number;
  private searchTimeoutId?: number;

  constructor(
    private schemeService: LoyaltySchemeService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadOptions();
    this.loadSchemes();
  }

  get pagedSchemes(): LoyaltyScheme[] {
    return this.schemes;
  }

  get pageStart(): number {
    return (this.currentPage - 1) * this.safeShowEntries;
  }

  get areaOptions(): LoyaltySchemeOption[] {
    let options: LoyaltySchemeOption[];
    switch (this.form.areaScope) {
      case 'Branch': options = this.options.branches; break;
      case 'Zone': options = this.options.zones; break;
      case 'State': options = this.options.states; break;
      case 'Customer': options = this.options.customers; break;
      default: return [];
    }
    const query = this.areaSearch.trim().toLowerCase();
    return query ? options.filter(option => option.name.toLowerCase().includes(query)) : options;
  }

  get canCreate(): boolean {
    return this.authService.hasPermission('scheme_create');
  }

  get canEdit(): boolean {
    return this.authService.hasPermission('scheme_edit');
  }

  get canDelete(): boolean {
    return this.authService.hasPermission('scheme_delete');
  }

  get isSuperAdmin(): boolean {
    return this.authService.isSuperAdminUser();
  }

  canEditScheme(scheme: LoyaltyScheme): boolean {
    return this.isSuperAdmin || (this.canEdit && !this.isPublishedScheme(scheme));
  }

  canDeleteScheme(scheme: LoyaltyScheme): boolean {
    return this.isSuperAdmin || (this.canDelete && ['Draft', 'Rejected'].includes(scheme.workflowStatus));
  }

  canSendToDraft(scheme: LoyaltyScheme): boolean {
    return scheme.workflowStatus !== 'Draft'
      && (this.isSuperAdmin || (this.canDraft && !this.isPublishedScheme(scheme)));
  }
  get canShow(): boolean {
    return this.authService.hasPermission('scheme_show');
  }

  get canApprove(): boolean {
    return this.authService.hasPermission('scheme_approve');
  }
  get canDraft(): boolean { return this.authService.hasPermission('scheme_draft'); }
  get canSubmit(): boolean { return this.authService.hasPermission('scheme_submit'); }
  get canReject(): boolean { return this.authService.hasPermission('scheme_reject'); }
  get canPublish(): boolean { return this.authService.hasPermission('scheme_publish'); }

  private isPublishedScheme(scheme: LoyaltyScheme): boolean {
    return ['Published', 'Live'].includes(scheme.workflowStatus)
      || scheme.status === 'Live';
  }

  loadSchemes(): void {
    this.loading = true;
    this.errorMessage = '';
    this.schemeService.list({
      status: this.selectedStatus || undefined,
      search: this.appliedSearchQuery || undefined,
      page: this.currentPage,
      pageSize: this.safeShowEntries
    }).pipe(
      timeout(20000),
      finalize(() => {
        this.loading = false;
        this.refreshView();
      })
    ).subscribe({
      next: schemes => {
        this.schemes = schemes;
        this.totalRows = schemes.total;
        this.refreshView();
      },
      error: error => {
        this.errorMessage = error.name === 'TimeoutError' ? 'Schemes API request timed out.' : error.message;
        this.refreshView();
      }
    });
  }

  loadOptions(): void {
    this.schemeService.options().subscribe({
      next: options => {
        this.options = options;
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  applyFilters(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.currentPage = 1;
    this.loadSchemes();
  }

  scheduleSearch(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.searchTimeoutId = window.setTimeout(() => {
      this.appliedSearchQuery = this.searchQuery;
      this.currentPage = 1;
      this.loadSchemes();
    }, 400);
  }

  clearFilters(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.searchQuery = '';
    this.appliedSearchQuery = '';
    this.selectedStatus = '';
    this.currentPage = 1;
    this.loadSchemes();
  }

  resetPage(): void {
    this.currentPage = 1;
    this.loadSchemes();
  }

  onPageChange(page: number): void {
    if (page === this.currentPage) return;
    this.currentPage = page;
    this.loadSchemes();
  }

  openCreate(): void {
    this.viewOnly = false;
    this.viewedScheme = null;
    this.form = this.emptyForm();
    this.errorMessage = '';
    this.showModal = true;
    this.generateSchemeCode();
    this.refreshView();
  }

  openEdit(scheme: LoyaltyScheme): void {
    this.viewOnly = false;
    this.viewedScheme = null;
    this.form = {
      id: scheme.id,
      active: scheme.active || 'Y',
      schemeName: scheme.schemeName,
      schemeCode: scheme.schemeCode,
      schemeDescription: scheme.schemeDescription || '',
      schemeTag: scheme.schemeTag || 'Regular',
      customerType: scheme.customerType,
      areaScope: scheme.areaScope || 'All',
      areaValues: [...(scheme.areaValues || [])],
      startDate: this.toDateInput(scheme.startDate),
      endDate: this.toDateInput(scheme.endDate),
      schemeType: 'Invoice',
      basedOn: scheme.basedOn || 'Value',
      redemptionEnabled: scheme.redemptionEnabled,
      brochure: null,
      brochurePath: scheme.brochurePath || '',
      slabs: scheme.slabs.length ? scheme.slabs.map(slab => ({
        tierName: slab.tierName,
        valueFrom: slab.valueFrom,
        valueTo: slab.valueTo,
        rewardValue: slab.rewardValue
      })) : [this.emptySlab()]
    };
    this.errorMessage = '';
    this.showModal = true;
    this.refreshView();
  }

  openView(scheme: LoyaltyScheme): void {
    this.openEdit(scheme);
    this.viewOnly = true;
    this.viewedScheme = scheme;
    this.refreshView();
  }

  closeModal(): void {
    if (this.saving) return;
    this.showModal = false;
    this.refreshView();
  }

  changeAreaScope(): void {
    this.form.areaValues = [];
    this.areaSearch = '';
  }

  addSlab(): void {
    const previous = this.form.slabs[this.form.slabs.length - 1];
    const next = this.emptySlab();
    if (previous?.valueTo !== null && previous?.valueTo !== undefined) {
      next.valueFrom = Number(previous.valueTo) + 1;
    }
    this.form.slabs.push(next);
  }

  removeSlab(index: number): void {
    if (this.form.slabs.length === 1) return;
    this.form.slabs.splice(index, 1);
    this.syncFollowingSlab(index - 1);
  }

  onValueToChange(index: number): void {
    this.syncFollowingSlab(index);
  }

  isAreaSelected(value: string): boolean {
    return this.form.areaValues.includes(value);
  }

  toggleAreaValue(value: string, checked: boolean): void {
    this.form.areaValues = checked
      ? Array.from(new Set([...this.form.areaValues, value]))
      : this.form.areaValues.filter(item => item !== value);
  }

  scheduleGenerateCode(): void {
    if (this.form.id) return;
    if (this.codeGenerateTimeoutId) window.clearTimeout(this.codeGenerateTimeoutId);
    this.codeGenerateTimeoutId = window.setTimeout(() => this.generateSchemeCode(), 350);
  }

  private generateSchemeCode(): void {
    if (this.form.id) return;
    this.generatingCode = true;
    this.schemeService.generateCode(this.form.schemeName, this.form.schemeTag, this.form.basedOn).pipe(
      finalize(() => {
        this.generatingCode = false;
        this.refreshView();
      })
    ).subscribe({
      next: code => {
        this.form.schemeCode = code || this.localFallbackCode();
        this.refreshView();
      },
      error: error => {
        this.form.schemeCode = this.localFallbackCode();
        this.showToast(error.message || 'Unable to check last scheme code. A temporary code was generated.', 'error');
        this.refreshView();
      }
    });
  }

  submit(): void {
    const payload = this.buildPayload();
    const validation = this.validatePayload(payload);
    if (validation) {
      this.showToast(validation, 'error');
      return;
    }

    this.saving = true;
    const request = this.form.id
      ? this.schemeService.update(this.form.id, payload)
      : this.schemeService.create(payload);

    request.pipe(finalize(() => {
      this.saving = false;
      this.refreshView();
    })).subscribe({
      next: result => {
        this.showModal = false;
        const id = this.form.id ?? result.scheme.id;
        if (this.form.brochure && id) {
          this.schemeService.uploadBrochure(id, this.form.brochure).subscribe({
            next: uploadMessage => { this.showToast(`${result.message}. ${uploadMessage}`, 'success'); this.loadSchemes(); },
            error: error => { this.showToast(`${result.message}, but brochure upload failed: ${error.message}`, 'error'); this.loadSchemes(); }
          });
        } else {
          this.showToast(result.message, 'success');
          this.loadSchemes();
        }
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  deleteScheme(scheme: LoyaltyScheme): void {
    if (!confirm(`Soft delete scheme "${scheme.schemeName}" and its slab configuration? Invoice and redemption audit records will be retained.`)) return;

    this.loading = true;
    this.schemeService.delete(scheme.id).subscribe({
      next: message => {
        this.showToast(message, 'success');
        this.loadSchemes();
      },
      error: error => {
        this.loading = false;
        this.showToast(error.message, 'error');
        this.refreshView();
      }
    });
  }

  submitScheme(scheme: LoyaltyScheme): void {
    this.runWorkflow(this.schemeService.submit(scheme.id));
  }

  sendToDraft(scheme: LoyaltyScheme): void {
    if (!confirm(`Return scheme "${scheme.schemeName}" to Draft? Its approval dates and remarks will be reset.`)) return;
    this.runWorkflow(this.schemeService.sendToDraft(scheme.id));
  }

  openWorkflowDialog(scheme: LoyaltyScheme): void {
    this.workflowDialog = { visible: true, scheme, remark: '' };
  }

  closeWorkflowDialog(): void {
    if (!this.saving) this.workflowDialog = { visible: false, scheme: null, remark: '' };
  }

  decideScheme(action: 'approve' | 'reject'): void {
    const scheme = this.workflowDialog.scheme;
    if (!scheme) return;
    if (action === 'reject' && !this.workflowDialog.remark.trim()) {
      this.showToast('Rejection remark is required.', 'error'); return;
    }
    const request = action === 'approve'
      ? this.schemeService.approve(scheme.id, this.workflowDialog.remark)
      : this.schemeService.reject(scheme.id, this.workflowDialog.remark);
    this.runWorkflow(request, true);
  }

  publishScheme(scheme: LoyaltyScheme): void {
    this.runWorkflow(this.schemeService.publish(scheme.id));
  }

  onBrochureSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (file && (file.type !== 'application/pdf' || file.size > 10 * 1024 * 1024)) {
      this.showToast('Select a PDF brochure up to 10 MB.', 'error');
      (event.target as HTMLInputElement).value = '';
      this.form.brochure = null;
      return;
    }
    this.form.brochure = file;
  }

  formatDate(value?: string | null): string {
    return formatKolkataDate(value, '');
  }

  brochureUrl(path?: string | null): string {
    return path ? `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}` : '';
  }

  rewardLabel(): string {
    return this.form.basedOn === 'Percentage' ? 'Reward %' : 'Reward Amount';
  }

  onRewardValueChange(slab: SchemeFormModel['slabs'][number], value: number | string | null): void {
    if (value === null || value === '') {
      slab.rewardValue = null;
      return;
    }

    if (this.form.basedOn === 'Percentage') {
      const sanitized = String(value).replace(/[^\d.]/g, '');
      const [integer = '', ...decimalParts] = sanitized.split('.');
      const combined = `${integer}${decimalParts.length ? `.${decimalParts.join('')}` : ''}`.slice(0, 4);
      const normalized = Number(combined) > 99.9 ? '99.9' : combined;
      // Keep the string while editing so values such as `1.` can become `1.5`.
      // It is converted to a number only while building the API payload.
      slab.rewardValue = normalized && normalized !== '.' ? normalized : null;
      return;
    }

    const amount = Number(value);
    slab.rewardValue = Number.isFinite(amount) ? amount : null;
  }

  private buildPayload(): LoyaltySchemePayload {
    return {
      active: this.form.active,
      scheme_name: this.form.schemeName.trim(),
      scheme_code: this.form.schemeCode.trim(),
      scheme_description: this.form.schemeDescription.trim() || null,
      scheme_tag: this.form.schemeTag,
      customer_type: this.form.customerType,
      area_scope: this.form.areaScope,
      area_values: this.form.areaScope === 'All' ? [] : this.form.areaValues,
      start_date: this.form.startDate,
      end_date: this.form.endDate,
      scheme_type: 'Invoice',
      based_on: this.form.basedOn,
      redemption_enabled: this.form.redemptionEnabled,
      slabs: this.form.slabs.map(slab => ({
        tier_name: slab.tierName.trim(),
        value_from: Number(slab.valueFrom ?? 0),
        value_to: slab.valueTo === null || slab.valueTo === undefined ? null : Number(slab.valueTo),
        reward_value: Number(slab.rewardValue ?? 0)
      }))
    };
  }

  private validatePayload(payload: LoyaltySchemePayload): string {
    if (!payload.scheme_name) return 'Scheme name is required.';
    if (!payload.customer_type) return 'Customer type is required.';
    if (!payload.start_date || !payload.end_date) return 'Start date and end date are required.';
    if (payload.area_scope !== 'All' && payload.area_values.length === 0) return 'Select at least one area value.';
    if (payload.slabs.some(slab => !slab.tier_name || slab.value_from < 0 || slab.reward_value < 0)) return 'Complete all slab rows.';
    if (payload.slabs.some(slab => slab.value_to !== null && slab.value_to < slab.value_from)) return 'Slab value to must be greater than value from.';
    for (let index = 1; index < payload.slabs.length; index++) {
      const previousTo = payload.slabs[index - 1].value_to;
      if (previousTo === null) return 'A slab with no upper limit must be the final slab.';
      if (payload.slabs[index].value_from !== previousTo + 1) return `Slab ${index + 1} must start at ${previousTo + 1} to avoid overlaps or gaps.`;
    }
    if (payload.based_on === 'Percentage' && payload.slabs.some(slab => slab.reward_value > 99.9)) return 'Reward percentage can contain a maximum of four characters including the decimal (maximum 99.9).';
    if (payload.based_on === 'Value' && payload.slabs.some(slab => slab.reward_value > 10000000)) return 'Reward amount cannot be greater than 1,00,00,000.';
    return '';
  }

  private emptyForm(): SchemeFormModel {
    return {
      id: null,
      active: 'Y',
      schemeName: '',
      schemeCode: '',
      schemeDescription: '',
      schemeTag: 'Regular',
      customerType: 'Retailer',
      areaScope: 'All',
      areaValues: [],
      startDate: '',
      endDate: '',
      schemeType: 'Invoice',
      basedOn: 'Value',
      redemptionEnabled: false,
      brochure: null,
      brochurePath: '',
      slabs: [this.emptySlab()]
    };
  }

  private emptySlab() {
    return { tierName: '', valueFrom: 0, valueTo: null, rewardValue: 0 };
  }

  private syncFollowingSlab(index: number): void {
    if (index < 0 || index >= this.form.slabs.length - 1) return;
    const valueTo = this.form.slabs[index].valueTo;
    if (valueTo !== null && valueTo !== undefined) {
      this.form.slabs[index + 1].valueFrom = Number(valueTo) + 1;
    }
  }

  private runWorkflow(request: import('rxjs').Observable<string>, closeDialog = false): void {
    this.saving = true;
    request.pipe(finalize(() => { this.saving = false; this.refreshView(); })).subscribe({
      next: message => {
        if (closeDialog) this.workflowDialog = { visible: false, scheme: null, remark: '' };
        this.showToast(message, 'success');
        this.loadSchemes();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  private localFallbackCode(): string {
    const namePart = this.abbr(this.form.schemeName || 'Scheme');
    const tagPart = this.form.schemeTag === 'Booster' ? 'BST' : 'REG';
    const basisPart = this.form.basedOn === 'Percentage' ? 'PCT' : 'VAL';
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 99) + 1;
    return `${tagPart}-${namePart}-INV-${basisPart}-${year}-${String(random).padStart(2, '0')}`.toUpperCase();
  }

  private abbr(value: string): string {
    const clean = value.replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
    if (!clean) return 'SCH';
    const words = clean.split(/\s+/).slice(0, 3);
    return words.map(word => word[0]).join('').padEnd(3, clean[0]).slice(0, 5);
  }

  private toDateInput(value?: string | null): string {
    if (!value) return '';
    return value.slice(0, 10);
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

  private get safeShowEntries(): number {
    const value = Number(this.showEntries);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
  }
}
