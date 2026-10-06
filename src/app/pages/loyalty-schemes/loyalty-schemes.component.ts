import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize, forkJoin, timeout } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import {
  LoyaltyScheme,
  LoyaltySchemeOption,
  LoyaltySchemeOptions,
  LoyaltySchemePayload,
  LoyaltySchemeService,
  SchemeDealerOption
} from '../../services/loyalty-scheme.service';
import { SearchableSelectOption as SelectOption } from '../../shared/components/searchable-select/searchable-select.component';
import { ProductService } from '../../services/product.service';

/**
 * One line of a Product or Quantity scheme on the form.
 *
 * The option lists belong to the line rather than to the screen: each line narrows its
 * families by the segments it picked, and its products by those families, so two lines of
 * the same scheme offer different choices.
 */
interface SchemeProductLine {
  segmentIds: number[];
  familyIds: number[];
  productIds: number[];
  rewardValue: number | string | null;
  rewardType: string;
  familyOptions: SelectOption[];
  productOptions: SelectOption[];
  loadingFamilies: boolean;
  loadingProducts: boolean;
}
import { formatKolkataDate } from '../../shared/utils/date-time';
import { API_ORIGIN } from '../../config/api.config';

interface SchemeFormModel {
  id: number | null;
  active: string;
  schemeName: string;
  schemeCode: string;
  schemeDescription: string;
  schemeNote: string;
  schemeTag: string;
  customerType: string;
  areaScope: string;
  areaValues: string[];
  excludedDealerIds: number[];
  startDate: string;
  endDate: string;
  schemeType: string;
  basedOn: string;
  redemptionEnabled: boolean;
  brochure: File | null;
  brochurePath: string;
  productLines: SchemeProductLine[];
  slabs: Array<{
    tierName: string;
    valueFrom: number | null;
    valueTo: number | null;
    rewardValue: number | string | null;
    rewardType: string;
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
  basedOnOptions = ['Value', 'Percentage', 'Value + Percentage'];
  slabRewardTypes = ['Value', 'Percentage'];
  schemeTypes: Array<{ value: string; label: string; available: boolean }> = [
    { value: 'Invoice', label: 'Invoice', available: true },
    { value: 'Product', label: 'Product', available: true },
    { value: 'Quantity', label: 'Quantity', available: true }
  ];
  statuses = ['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Live', 'Expired'];

  showEntries = 10;
  currentPage = 1;
  totalRows = 0;
  searchQuery = '';
  appliedSearchQuery = '';
  selectedStatus = '';
  loading = false;
  exporting = false;
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
  /** Every dealer, fetched once when the form first opens and then kept. A few hundred
   *  rows, so narrowing and searching happen here rather than over the wire. */
  allDealers: SchemeDealerOption[] = [];
  dealersLoading = false;
  form: SchemeFormModel = this.emptyForm();
  segmentOptions: SelectOption[] = [];
  productLineBusy = '';
  importProblems: string[] = [];
  private toastTimeoutId?: number;
  private codeGenerateTimeoutId?: number;
  private searchTimeoutId?: number;

  constructor(
    private schemeService: LoyaltySchemeService,
    private productService: ProductService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadOptions();
    this.loadSchemes();
    this.productService.listSegmentOptions().subscribe({
      next: segments => {
        this.segmentOptions = segments.map(segment => ({ id: segment.id, label: segment.name }));
        this.refreshView();
      },
      error: () => { /* the scheme form still works; only the picker is empty */ }
    });
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
    return this.authService.hasPermission('scheme.create');
  }

  get canEdit(): boolean {
    return this.authService.hasPermission('scheme.edit');
  }

  get canDelete(): boolean {
    return this.authService.hasPermission('scheme.delete');
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
    return this.authService.hasPermission('scheme.detail');
  }

  get canApprove(): boolean {
    return this.authService.hasPermission('scheme.approve');
  }
  get canDraft(): boolean { return this.authService.hasPermission('scheme.draft'); }
  get canSubmit(): boolean { return this.authService.hasPermission('scheme.submit'); }
  get canReject(): boolean { return this.authService.hasPermission('scheme.reject'); }
  get canPublish(): boolean { return this.authService.hasPermission('scheme.publish'); }
  get canExport(): boolean { return this.authService.hasPermission('scheme.export'); }

  private isPublishedScheme(scheme: LoyaltyScheme): boolean {
    return ['Published', 'Live'].includes(scheme.workflowStatus)
      || scheme.status === 'Live';
  }

  /** The same listing the screen is showing, as a workbook. */
  exportSchemes(): void {
    this.exporting = true;
    this.schemeService.export({
      status: this.selectedStatus || undefined,
      search: this.appliedSearchQuery || undefined
    }).pipe(
      timeout(60000),
      finalize(() => {
        this.exporting = false;
        this.refreshView();
      })
    ).subscribe({
      next: blob => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `loyalty-schemes-${new Date().toISOString().slice(0, 10)}.xlsx`;
        link.click();
        window.URL.revokeObjectURL(url);
      },
      error: error => this.showToast(error.message, 'error')
    });
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
    this.loadDealerOptions();
    this.viewOnly = false;
    this.viewedScheme = null;
    this.form = this.emptyForm();
    this.errorMessage = '';
    this.showModal = true;
    this.generateSchemeCode();
    this.refreshView();
  }

  openEdit(scheme: LoyaltyScheme): void {
    this.loadDealerOptions();
    this.viewOnly = false;
    this.viewedScheme = null;
    this.form = {
      id: scheme.id,
      active: scheme.active || 'Y',
      schemeName: scheme.schemeName,
      schemeCode: scheme.schemeCode,
      schemeDescription: scheme.schemeDescription || '',
      schemeNote: scheme.schemeNote || '',
      schemeTag: scheme.schemeTag || 'Regular',
      customerType: scheme.customerType,
      areaScope: scheme.areaScope || 'All',
      areaValues: [...(scheme.areaValues || [])],
      excludedDealerIds: [...(scheme.excludedDealerIds || [])],
      startDate: this.toDateInput(scheme.startDate),
      endDate: this.toDateInput(scheme.endDate),
      schemeType: scheme.schemeType || 'Invoice',
      basedOn: scheme.basedOn || 'Value',
      redemptionEnabled: scheme.redemptionEnabled,
      brochure: null,
      brochurePath: scheme.brochurePath || '',
      productLines: scheme.products.length
        ? scheme.products.map(line => ({
            segmentIds: [...line.segmentIds],
            familyIds: [...line.familyIds],
            productIds: [...line.productIds],
            rewardValue: line.rewardValue,
            rewardType: line.rewardType || 'Value',
            // The saved names are enough to show the line; the full pickers are fetched
            // only if the person actually changes a segment.
            familyOptions: line.familyIds.map((id, index) => ({ id, label: line.familyNames[index] ?? String(id) })),
            productOptions: line.productIds.map((id, index) => ({ id, label: line.productNames[index] ?? String(id) })),
            loadingFamilies: false,
            loadingProducts: false
          }))
        : [this.emptyProductLine()],
      slabs: scheme.slabs.length ? scheme.slabs.map(slab => ({
        tierName: slab.tierName,
        valueFrom: slab.valueFrom,
        valueTo: slab.valueTo,
        rewardValue: slab.rewardValue,
        rewardType: slab.rewardType || 'Value'
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
    this.pruneExcludedDealers();
  }

  /** The dealers the picker offers: everyone when the scheme is All India, otherwise only
   *  the ones inside the chosen zones, branches or states. A Customer-scoped scheme names
   *  its customers directly, so the dealer list is not narrowed for it. */
  get dealerOptions(): SelectOption[] {
    const scope = this.form.areaScope;
    const values = this.form.areaValues.map(value => value.trim().toLowerCase()).filter(Boolean);
    const inArea = (dealer: SchemeDealerOption): boolean => {
      if (values.length === 0) return true;
      const area = scope === 'Zone' ? dealer.zone : scope === 'Branch' ? dealer.branch : scope === 'State' ? dealer.state : null;
      if (area === null) return true;
      return values.includes((area || '').trim().toLowerCase());
    };

    return this.allDealers.filter(inArea).map(dealer => ({
      id: dealer.id,
      // The label carries the code so the closed box still identifies the dealer; mobile
      // and email ride alongside because the search box reads those fields too.
      label: dealer.code ? `${dealer.name} (${dealer.code})` : dealer.name,
      mobile: dealer.mobile ?? '',
      email: dealer.email ?? '',
      code: dealer.code ?? ''
    }));
  }

  /** The chosen dealers, named, for the chips under the box. Reading from the whole list
   *  rather than the narrowed one, so a chip never goes blank when the area changes. */
  get excludedDealerChips(): Array<{ id: number; label: string }> {
    return this.form.excludedDealerIds.map(id => {
      const dealer = this.allDealers.find(x => x.id === id);
      if (!dealer) return { id, label: `#${id}` };
      return { id, label: dealer.code ? `${dealer.name} (${dealer.code})` : dealer.name };
    });
  }

  removeExcludedDealer(id: number): void {
    this.form.excludedDealerIds = this.form.excludedDealerIds.filter(value => value !== id);
    this.refreshView();
  }

  onExcludedDealersChange(value: number | string | Array<number | string> | null): void {
    const ids = Array.isArray(value) ? value : value === null || value === '' ? [] : [value];
    this.form.excludedDealerIds = ids.map(id => Number(id)).filter(id => Number.isFinite(id) && id > 0);
    this.refreshView();
  }

  /** Narrowing the area must not silently keep a dealer that is no longer on offer. */
  private pruneExcludedDealers(): void {
    if (this.form.excludedDealerIds.length === 0) return;
    const allowed = new Set(this.dealerOptions.map(option => Number(option.id)));
    this.form.excludedDealerIds = this.form.excludedDealerIds.filter(id => allowed.has(id));
  }

  private loadDealerOptions(): void {
    if (this.allDealers.length || this.dealersLoading) return;
    this.dealersLoading = true;
    this.schemeService.dealerOptions().pipe(
      finalize(() => { this.dealersLoading = false; this.refreshView(); })
    ).subscribe({
      next: dealers => { this.allDealers = dealers; this.refreshView(); },
      error: error => this.showToast(error.message, 'error')
    });
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
    this.schemeService.generateCode(this.form.schemeName, this.form.schemeTag, this.form.basedOn, this.form.schemeType).pipe(
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

  /// A mixed scheme decides per slab, so the column heading cannot name one or the
  /// other and the row carries its own picker instead.
  get isMixedScheme(): boolean {
    return this.form.basedOn === 'Value + Percentage';
  }

  /// What this row pays, whichever way the scheme is set up.
  slabIsPercentage(slab: SchemeFormModel['slabs'][number]): boolean {
    return this.isMixedScheme ? slab.rewardType === 'Percentage' : this.form.basedOn === 'Percentage';
  }

  rewardLabel(): string {
    if (this.isMixedScheme) return 'Reward';
    return this.form.basedOn === 'Percentage' ? 'Reward %' : 'Reward Amount';
  }

  /// Switching a row between the two clears the figure: 2.8 as a percentage and 2.8
  /// as rupees are not the same number, and keeping it invites the wrong one.
  onSlabRewardTypeChange(slab: SchemeFormModel['slabs'][number]): void {
    slab.rewardValue = null;
    this.refreshView();
  }

  onRewardValueChange(slab: SchemeFormModel['slabs'][number], value: number | string | null): void {
    if (value === null || value === '') {
      slab.rewardValue = null;
      return;
    }

    if (this.slabIsPercentage(slab)) {
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
      scheme_note: this.form.schemeNote.trim() || null,
      scheme_tag: this.form.schemeTag,
      customer_type: this.form.customerType,
      area_scope: this.form.areaScope,
      area_values: this.form.areaScope === 'All' ? [] : this.form.areaValues,
      excluded_dealer_ids: this.form.excludedDealerIds,
      start_date: this.form.startDate,
      end_date: this.form.endDate,
      scheme_type: this.form.schemeType,
      based_on: this.form.basedOn,
      redemption_enabled: this.form.redemptionEnabled,
      products: this.readsProducts
        ? this.form.productLines
            .filter(line => line.segmentIds.length || line.familyIds.length || line.productIds.length)
            .map(line => ({
              segment_ids: line.segmentIds,
              family_ids: line.familyIds,
              product_ids: line.productIds,
              reward_value: Number(line.rewardValue ?? 0),
              reward_type: this.isMixedScheme ? (line.rewardType || 'Value') : null
            }))
        : [],
      slabs: this.form.slabs.map(slab => ({
        tier_name: slab.tierName.trim(),
        value_from: Number(slab.valueFrom ?? 0),
        value_to: slab.valueTo === null || slab.valueTo === undefined ? null : Number(slab.valueTo),
        reward_value: Number(slab.rewardValue ?? 0),
        // Only a mixed scheme carries a per-slab type; the others follow the scheme,
        // and sending one would be noise the server has to ignore.
        reward_type: this.isMixedScheme ? (slab.rewardType || 'Value') : null
      }))
    };
  }

  private validatePayload(payload: LoyaltySchemePayload): string {
    if (!payload.scheme_name) return 'Scheme name is required.';
    if (!payload.customer_type) return 'Customer type is required.';
    if (!payload.start_date || !payload.end_date) return 'Start date and end date are required.';
    if (payload.area_scope !== 'All' && payload.area_values.length === 0) return 'Select at least one area value.';

    // A Product or Quantity scheme is written as lines, not slabs, so only one of the two
    // is ever checked.
    if (this.readsProducts) {
      if (payload.products.length === 0) return `A ${payload.scheme_type} scheme needs at least one product line.`;
      if (payload.products.some(line => line.reward_value <= 0)) return 'Enter a reward on every product line.';
      const limit = payload.based_on === 'Percentage' ? 99.9 : 10000000;
      if (payload.products.some(line => line.reward_value > limit)) {
        return payload.based_on === 'Percentage'
          ? 'Reward percentage cannot be more than 99.9.'
          : 'Reward amount cannot be greater than 1,00,00,000.';
      }
      return '';
    }

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
      schemeNote: '',
      schemeTag: 'Regular',
      customerType: 'Retailer',
      areaScope: 'All',
      areaValues: [],
      excludedDealerIds: [],
      startDate: '',
      endDate: '',
      schemeType: 'Invoice',
      basedOn: 'Value',
      redemptionEnabled: false,
      brochure: null,
      brochurePath: '',
      productLines: [this.emptyProductLine()],
      slabs: [this.emptySlab()]
    };
  }

  private emptyProductLine(): SchemeProductLine {
    return {
      segmentIds: [], familyIds: [], productIds: [],
      rewardValue: null, rewardType: 'Value',
      familyOptions: [], productOptions: [], loadingFamilies: false, loadingProducts: false
    };
  }

  private emptySlab() {
    return { tierName: '', valueFrom: 0, valueTo: null, rewardValue: 0, rewardType: 'Value' };
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

  // ---- Product and Quantity schemes: the lines, and the sheet that fills them ----

  get readsProducts(): boolean {
    return this.form.schemeType === 'Product' || this.form.schemeType === 'Quantity';
  }

  /** A quantity scheme pays a rate per unit, so a percentage of it means nothing. */
  get basedOnChoices(): string[] {
    return this.form.schemeType === 'Quantity' ? ['Value'] : this.basedOnOptions;
  }

  productRewardLabel(): string {
    if (this.isMixedScheme) return 'Reward';
    if (this.form.basedOn === 'Percentage') return 'Reward %';
    return this.form.schemeType === 'Quantity' ? 'Reward per Unit' : 'Reward';
  }

  lineIsPercentage(line: SchemeProductLine): boolean {
    return this.isMixedScheme ? line.rewardType === 'Percentage' : this.form.basedOn === 'Percentage';
  }

  onSchemeTypeChange(): void {
    // Quantity has only one basis, so a scheme switched to it cannot keep a percentage.
    if (this.form.schemeType === 'Quantity' && this.form.basedOn !== 'Value') this.form.basedOn = 'Value';
    if (this.readsProducts && this.form.productLines.length === 0) this.form.productLines = [this.emptyProductLine()];
    this.scheduleGenerateCode();
  }

  addProductLine(): void {
    this.form.productLines.push(this.emptyProductLine());
  }

  removeProductLine(index: number): void {
    this.form.productLines.splice(index, 1);
    if (this.form.productLines.length === 0) this.form.productLines.push(this.emptyProductLine());
  }

  /** Segments decide which families are on offer, so a family no longer under any chosen
   *  segment is dropped rather than left behind where nobody can see it. */
  onLineSegmentsChange(line: SchemeProductLine): void {
    line.familyOptions = [];
    line.productOptions = [];
    line.familyIds = [];
    line.productIds = [];
    if (line.segmentIds.length === 0) { this.refreshView(); return; }

    line.loadingFamilies = true;
    forkJoin(line.segmentIds.map(id => this.productService.listFamilyOptions(id)))
      .pipe(finalize(() => { line.loadingFamilies = false; this.refreshView(); }))
      .subscribe({
        next: results => line.familyOptions = this.dedupe(results.flat().map(f => ({ id: f.id, label: f.name }))),
        error: error => this.showToast(error.message, 'error')
      });
  }

  onLineFamiliesChange(line: SchemeProductLine): void {
    line.productOptions = [];
    line.productIds = [];
    if (line.familyIds.length === 0) { this.refreshView(); return; }

    line.loadingProducts = true;
    forkJoin(line.familyIds.map(id => this.productService.listProducts(null, id, undefined, 1, 500)))
      .pipe(finalize(() => { line.loadingProducts = false; this.refreshView(); }))
      .subscribe({
        next: results => line.productOptions = this.dedupe(results.flat().map(p => ({ id: p.id, label: p.productCode ? `${p.productName} (${p.productCode})` : p.productName }))),
        error: error => this.showToast(error.message, 'error')
      });
  }

  private dedupe(options: SelectOption[]): SelectOption[] {
    const seen = new Map<number | string, SelectOption>();
    options.forEach(option => seen.set(option.id, option));
    return [...seen.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }

  downloadProductTemplate(): void {
    this.productLineBusy = 'template';
    this.schemeService.productLineTemplate()
      .pipe(finalize(() => { this.productLineBusy = ''; this.refreshView(); }))
      .subscribe({
        next: blob => this.download(blob, 'scheme-product-lines-template.xlsx'),
        error: error => this.showToast(error.message, 'error')
      });
  }

  exportProductLines(): void {
    if (!this.form.id) return;
    this.productLineBusy = 'export';
    this.schemeService.exportProductLines(this.form.id)
      .pipe(finalize(() => { this.productLineBusy = ''; this.refreshView(); }))
      .subscribe({
        next: blob => this.download(blob, `${this.form.schemeCode || 'scheme'}-product-lines.xlsx`),
        error: error => this.showToast(error.message, 'error')
      });
  }

  chooseProductFile(input: HTMLInputElement): void {
    input.value = '';
    input.click();
  }

  /**
   * The sheet becomes the list.
   *
   * A line already on the form whose goods match a row in the sheet keeps its place and
   * takes the sheet's reward; a line the sheet does not mention is dropped. That is what
   * makes export, edit, import a round trip rather than a way to end up with two copies
   * of everything.
   */
  importProductLines(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.productLineBusy = 'import';
    this.importProblems = [];
    this.schemeService.importProductLines(file)
      .pipe(finalize(() => { this.productLineBusy = ''; input.value = ''; this.refreshView(); }))
      .subscribe({
        next: result => {
          this.importProblems = result.problems;
          if (result.lines.length === 0) {
            this.showToast(result.message, 'error');
            return;
          }
          const existing = this.form.productLines.filter(line => this.lineKey(line).length > 0);
          this.form.productLines = result.lines.map(imported => {
            const key = [imported.segmentIds, imported.familyIds, imported.productIds]
              .map(ids => [...ids].sort((a, b) => a - b).join(',')).join('|');
            const match = existing.find(line => this.lineKey(line) === key);
            const line = match ?? this.emptyProductLine();
            line.segmentIds = [...imported.segmentIds];
            line.familyIds = [...imported.familyIds];
            line.productIds = [...imported.productIds];
            line.rewardValue = imported.rewardValue;
            // Value or Percentage stays the form's choice: the sheet does not carry it, so
            // a line already on the form keeps the one it was given.
            if (!match) {
              line.rewardType = 'Value';
              // A line that came only from the sheet still needs its pickers filled, or it
              // would show ids with no names beside them.
              line.familyOptions = imported.familyIds.map((id, index) => ({ id, label: imported.familyNames[index] ?? String(id) }));
              line.productOptions = imported.productIds.map((id, index) => ({ id, label: imported.productNames[index] ?? String(id) }));
            }
            return line;
          });
          this.showToast(result.message, result.problems.length ? 'error' : 'success');
        },
        error: error => this.showToast(error.message, 'error')
      });
  }

  private lineKey(line: SchemeProductLine): string {
    return [line.segmentIds, line.familyIds, line.productIds]
      .map(ids => [...ids].sort((a, b) => a - b).join(',')).join('|');
  }

  private download(blob: Blob, name: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  private localFallbackCode(): string {
    const namePart = this.abbr(this.form.schemeName || 'Scheme');
    const tagPart = this.form.schemeTag === 'Booster' ? 'BST' : 'REG';
    const basisPart = this.isMixedScheme ? 'MIX' : this.form.basedOn === 'Percentage' ? 'PCT' : 'VAL';
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 99) + 1;
    const typePart = this.form.schemeType === 'Product' ? 'PRD' : this.form.schemeType === 'Quantity' ? 'QTY' : 'INV';
    return `${tagPart}-${namePart}-${typePart}-${basisPart}-${year}-${String(random).padStart(2, '0')}`.toUpperCase();
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
