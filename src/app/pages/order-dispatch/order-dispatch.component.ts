import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, finalize } from 'rxjs/operators';
import { Order, OrderDetail, OrderDispatch, OrderDispatchDetail, OrderService } from '../../services/order.service';
import { AuthService } from '../../services/auth.service';
import { API_ORIGIN } from '../../config/api.config';
import { InvoiceSchemeOption, NewInvoiceService } from '../../services/new-invoice.service';
import { UserOption } from '../../services/user.service';

interface NewDispatchLine {
  key: number; familyId: number | null; productId: number | null; categoryId: number | null;
  quantity: number; products: { id: number; name: string; productCode?: string | null; price?: number | null }[];
}

@Component({ selector: 'app-order-dispatch', standalone: false, templateUrl: './order-dispatch.component.html', styleUrl: './order-dispatch.component.scss' })
export class OrderDispatchComponent implements OnInit {
  mode: 'full' | 'partial' | 'cancelled' = 'full'; orderId = 0; order?: Order; details: OrderDetail[] = []; rows: OrderDispatch[] = [];
  loading = true; saving = false; error = ''; success = '';
  detailLoading = false; selectedDispatch: OrderDispatchDetail | null = null;
  form = { invoiceNo: '', invoiceDate: this.today(), lrNo: '', dispatchDate: this.today(), transportDetails: '', remark: '' };
  quantities: Record<number, number> = {};
  newLines: NewDispatchLine[] = []; families: UserOption[] = [];
  // Scheme-linked dispatch is deferred to a future release, so the picker is hidden
  // and no scheme is sent. Setting this back to true restores the dropdown, the
  // attachment requirement and the loyalty invoice entry; nothing was removed.
  readonly schemeSelectionEnabled = false;
  schemes: InvoiceSchemeOption[] = []; selectedSchemeId: number | null = null; schemeLoading = false; private nextLineKey = 1;
  invoiceAttachment: File | null = null;
  private routeLoadVersion = 0;
  constructor(private route: ActivatedRoute, private router: Router, private service: OrderService, private invoiceService: NewInvoiceService, private auth: AuthService, private cdr: ChangeDetectorRef) {}
  get canShow(): boolean { return this.auth.hasPermission('sale_show'); }
  ngOnInit(): void {
    this.syncRouteAndLoad();
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)).subscribe(() => this.syncRouteAndLoad());
  }
  private syncRouteAndLoad(): void {
    const segments = this.router.url.split('?')[0].split('/').filter(Boolean);
    const nextMode: 'full' | 'partial' | 'cancelled' = segments.includes('cancelled') ? 'cancelled' : segments.includes('partial') ? 'partial' : 'full';
    const ordersIndex = segments.indexOf('orders');
    const nextOrderId = ordersIndex >= 0 ? Number(segments[ordersIndex + 1] || 0) : 0;
    if (this.mode === nextMode && this.orderId === nextOrderId && (!this.loading || this.rows.length || this.order)) return;
    this.mode = nextMode; this.orderId = nextOrderId; this.routeLoadVersion++;
    this.error = ''; this.success = ''; this.selectedDispatch = null;
    this.order = undefined; this.details = []; this.rows = []; this.loading = true;
    this.cdr.detectChanges();
    this.orderId ? this.loadOrder() : this.loadList();
  }
  loadOrder(): void { const version = this.routeLoadVersion; this.loading = true; this.newLines = []; this.selectedSchemeId = null;
    this.service.getOptions().subscribe({ next: options => this.families = options.families, error: () => this.families = [] });
    this.service.getOrder(this.orderId).pipe(finalize(() => { if (version === this.routeLoadVersion) { this.loading = false; this.cdr.detectChanges(); } })).subscribe({ next: r => { if (version !== this.routeLoadVersion) return; this.order = r.order; this.details = r.orderDetails.filter(x => this.remaining(x) > 0); for (const row of this.details) this.quantities[row.id] = this.mode === 'full' ? this.remaining(row) : 0; this.loadSchemes(); }, error: e => { if (version === this.routeLoadVersion) this.error = e.message; } }); }
  loadList(): void { const version = this.routeLoadVersion; const mode = this.mode; this.loading = true; this.service.getDispatches(mode).pipe(finalize(() => { if (version === this.routeLoadVersion) { this.loading = false; this.cdr.detectChanges(); } })).subscribe({ next: r => { if (version === this.routeLoadVersion) this.rows = r; }, error: e => { if (version === this.routeLoadVersion) this.error = e.message; } }); }
  remaining(row: OrderDetail): number { return Math.max(0, Number(row.quantity) - Number(row.shippedQty)); }
  onAttachment(event: Event): void { this.invoiceAttachment = (event.target as HTMLInputElement).files?.[0] ?? null; }
  get visibleDetails(): OrderDetail[] { return this.details; }
  addLine(): void { this.newLines.push({ key: this.nextLineKey++, familyId: null, productId: null, categoryId: null, quantity: 1, products: [] }); }
  removeLine(index: number): void { this.newLines.splice(index, 1); }
  onFamilyChange(line: NewDispatchLine): void { line.productId = null; line.products = []; if (!line.familyId) return; this.service.getProductsByFamily(line.familyId).subscribe({ next: products => line.products = products, error: e => this.error = e.message }); }
  onInvoiceDateChange(): void { this.selectedSchemeId = null; this.loadSchemes(); }
  private loadSchemes(): void { if (!this.schemeSelectionEnabled) { this.schemes = []; this.selectedSchemeId = null; return; }
    if (!this.order?.buyerId || !this.form.invoiceDate) { this.schemes = []; return; } this.schemeLoading = true; this.invoiceService.schemes(this.order.buyerId, this.form.invoiceDate).pipe(finalize(() => { this.schemeLoading = false; this.cdr.detectChanges(); })).subscribe({ next: rows => this.schemes = rows, error: e => { this.schemes = []; this.error = e.message; } }); }
  submit(): void { if (!this.order) return; this.error = ''; if (!this.form.invoiceNo.trim() || !this.form.invoiceDate || !this.form.dispatchDate) { this.error = 'Invoice Date, Invoice Number and Dispatch Date are required.'; return; }
    if (this.schemeSelectionEnabled && this.selectedSchemeId && !this.invoiceAttachment) { this.error = 'Invoice Attachment is required when a scheme is selected.'; return; }
    if (this.newLines.some(x => !x.familyId || !x.productId || Number(x.quantity) <= 0)) { this.error = 'Select family, product and a quantity greater than zero for every new line.'; return; }
    const ids = this.newLines.map(x => x.productId).filter(x => !!x); if (new Set(ids).size !== ids.length) { this.error = 'The same new product cannot be added more than once.'; return; }
    const items = [...this.visibleDetails.map(x => ({ orderDetailId: x.id, quantity: this.mode === 'full' ? this.remaining(x) : Number(this.quantities[x.id] || 0) })).filter(x => x.quantity > 0), ...this.newLines.map(x => ({ orderDetailId: null, productId: x.productId, subcategoryId: x.familyId, categoryId: x.categoryId, quantity: Number(x.quantity) }))];
    if (!items.length) { this.error = 'Enter dispatch quantity for at least one product.'; return; }
    const dispatchMode: 'full' | 'partial' = this.mode === 'full' ? 'full' : 'partial';
    this.saving = true; this.service.dispatchOrder(this.orderId, { mode: dispatchMode, invoiceNo: this.form.invoiceNo, invoiceDate: this.form.invoiceDate, lrNo: this.form.lrNo, dispatchDate: this.form.dispatchDate, transportDetails: this.form.transportDetails, remark: this.form.remark, loyaltySchemeId: this.schemeSelectionEnabled ? this.selectedSchemeId : null, removedOrderDetailIds: [], items, invoiceAttachment: this.invoiceAttachment }).pipe(finalize(() => { this.saving = false; this.cdr.detectChanges(); })).subscribe({ next: r => { this.success = r.message; setTimeout(() => this.router.navigate(['/order-dispatch', dispatchMode]), 700); }, error: e => this.error = e.message }); }
  back(): void { this.router.navigate(this.orderId ? ['/orders'] : ['/orders']); }
  showDispatch(row: OrderDispatch): void {
    if (!this.canShow || this.detailLoading) return;
    this.detailLoading = true; this.error = '';
    this.service.getDispatchDetail(row.id).pipe(finalize(() => { this.detailLoading = false; this.cdr.detectChanges(); })).subscribe({
      next: detail => this.selectedDispatch = detail,
      error: error => this.error = error.message
    });
  }
  closeDispatch(): void { this.selectedDispatch = null; }
  attachmentUrl(path?: string | null): string {
    if (!path) return '';
    if (/^(https?:)?\/\//i.test(path)) return path;
    return `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
  }
  formatDate(v?: string | null): string { return v ? new Date(v).toLocaleDateString('en-IN') : '-'; }
  private today(): string { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
}
