import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize, timeout } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { UserOption } from '../../services/user.service';
import { Order, OrderDetail, OrderDetailPayload, OrderFilters, OrderProductOption, OrderService } from '../../services/order.service';
import { kolkataTodayInput } from '../../shared/utils/date-time';
import { Router } from '@angular/router';

interface ToastModel {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

interface SwalModel {
  visible: boolean;
  title: string;
  text: string;
  icon: 'warning' | 'success' | 'error' | 'info';
  confirmText: string;
  cancelText: string;
  showCancel: boolean;
  input: boolean;
  inputValue: string;
  inputPlaceholder: string;
  inputError: string;
  resolver?: (result: { isConfirmed: boolean; value?: string }) => void;
}

interface OrderRow extends OrderDetailPayload {
  products: OrderProductOption[];
  loadingProducts: boolean;
}

@Component({
  standalone: false,
  selector: 'app-orders',
  templateUrl: './orders.component.html',
  styleUrls: ['./orders.component.scss']
})
export class OrdersComponent implements OnInit {
  orders: Order[] = [];
  users: UserOption[] = [];
  divisions: UserOption[] = [];
  designations: UserOption[] = [];
  designationOptions: Array<{ id: number; label: string }> = [];
  retailers: UserOption[] = [];
  distributors: UserOption[] = [];
  families: UserOption[] = [];

  showEntries = 10;
  currentPage = 1;
  totalOrders = 0;
  searchQuery = '';
  appliedSearchQuery = '';
  selectedRetailerId: number | null = null;
  selectedDistributorId: number | null = null;
  selectedUserId: number | null = null;
  selectedDivisionId: number | null = null;
  selectedDesignationIds: number[] = [];
  selectedStatus: number | null = null;
  startDate = '';
  endDate = '';

  loading = false;
  saving = false;
  exporting = false;
  showFilters = false;
  showCreateModal = false;
  showDetailModal = false;
  errorMessage = '';
  detailLoading = false;
  statusSaving = false;
  selectedOrder: Order | null = null;
  selectedOrderDetails: OrderDetail[] = [];
  editingOrderId: number | null = null;
  toast: ToastModel = { visible: false, message: '', type: 'success' };
  swal: SwalModel = this.emptySwal();
  private toastTimeoutId?: number;
  private searchTimeoutId?: number;

  form = this.emptyForm();

  constructor(
    private orderService: OrderService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadOptions();
    this.loadOrders();
  }

  get pagedOrders(): Order[] {
    return this.orders;
  }

  get pageStart(): number {
    return (this.currentPage - 1) * this.safeShowEntries;
  }

  get canCreate(): boolean {
    return this.authService.hasPermission('order_create');
  }

  get canEdit(): boolean {
    return this.authService.hasPermission('order_edit');
  }

  get canShow(): boolean {
    return this.authService.hasPermission('order_show');
  }

  get canDelete(): boolean {
    return this.authService.hasPermission('order_delete');
  }

  get canPending(): boolean {
    return this.authService.hasPermission('pendding_orders') || this.authService.hasPermission('order_edit');
  }

  get canExport(): boolean {
    return this.authService.hasPermission('order_download');
  }

  cancelledQty(detail: OrderDetail): number {
    return this.selectedOrder?.statusId === 4
      ? Math.max(0, Number(detail.quantity || 0) - Number(detail.shippedQty || 0))
      : 0;
  }

  get totalCancelledQty(): number {
    return this.selectedOrder?.statusId === 4
      ? this.selectedOrderDetails.reduce((total, detail) => total + this.cancelledQty(detail), 0)
      : 0;
  }

  get detailShippedQty(): number {
    return this.selectedOrderDetails.reduce((total, detail) => total + Number(detail.shippedQty || 0), 0);
  }

  get totalAmount(): number {
    return this.form.rows.reduce((sum, row) => sum + (Number(row.lineTotal) || 0), 0);
  }

  get totalQty(): number {
    return this.form.rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
  }

  get totalGst(): number {
    return 0;
  }

  get showBuyer(): boolean {
    return this.form.type !== 'DEALER';
  }

  loadOrders(): void {
    this.loading = true;
    this.errorMessage = '';
    this.orderService.getOrders({ ...this.currentFilters(), page: this.currentPage, pageSize: this.safeShowEntries }).pipe(
      timeout(20000),
      finalize(() => {
        this.loading = false;
        this.refreshView();
      })
    ).subscribe({
      next: rows => {
        this.orders = rows;
        this.totalOrders = rows.total;
        this.refreshView();
      },
      error: error => {
        this.errorMessage = error.name === 'TimeoutError' ? 'Order API request timed out.' : error.message;
        this.refreshView();
      }
    });
  }

  loadOptions(): void {
    this.orderService.getOptions().pipe(timeout(20000)).subscribe({
      next: options => {
        this.users = options.users;
        this.divisions = options.divisions;
        this.designations = options.designations;
        this.designationOptions = options.designations.map(designation => ({
          id: designation.id,
          label: designation.name
        }));
        this.retailers = options.retailers;
        this.distributors = options.distributors;
        this.families = options.families;
        this.refreshView();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  applyFilters(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.loadOrders();
  }

  onDesignationChange(values: Array<number | string>): void {
    this.selectedDesignationIds = (values || [])
      .map(value => Number(value))
      .filter(value => Number.isFinite(value) && value > 0);
    this.applyFilters();
  }

  scheduleSearch(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.searchTimeoutId = window.setTimeout(() => {
      this.appliedSearchQuery = this.searchQuery;
      this.loadOrders();
    }, 400);
  }

  clearFilters(): void {
    this.selectedRetailerId = null;
    this.selectedDistributorId = null;
    this.selectedUserId = null;
    this.selectedDivisionId = null;
    this.selectedDesignationIds = [];
    this.selectedStatus = null;
    this.startDate = '';
    this.endDate = '';
    this.searchQuery = '';
    this.appliedSearchQuery = '';
    this.loadOrders();
  }

  resetPage(): void {
    this.currentPage = 1;
    this.loadOrders();
  }

  onPageChange(page: number): void { this.currentPage = page; this.loadOrders(); }

  openCreateModal(): void {
    this.form = this.emptyForm();
    this.editingOrderId = null;
    this.showCreateModal = true;
    this.errorMessage = '';
    this.refreshView();
  }

  closeCreateModal(): void {
    if (this.saving) return;
    this.showCreateModal = false;
    this.editingOrderId = null;
    this.refreshView();
  }

  openDetail(row: Order): void {
    this.showDetailModal = true;
    this.detailLoading = true;
    this.selectedOrder = row;
    this.selectedOrderDetails = [];
    this.orderService.getOrder(row.id).pipe(finalize(() => {
      this.detailLoading = false;
      this.refreshView();
    })).subscribe({
      next: result => {
        this.selectedOrder = result.order;
        this.selectedOrderDetails = result.orderDetails;
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  closeDetailModal(): void {
    if (this.statusSaving) return;
    this.showDetailModal = false;
    this.selectedOrder = null;
    this.selectedOrderDetails = [];
    this.refreshView();
  }

  editOrder(row: Order): void {
    this.detailLoading = true;
    this.orderService.getOrder(row.id).pipe(finalize(() => {
      this.detailLoading = false;
      this.refreshView();
    })).subscribe({
      next: result => {
        this.editingOrderId = row.id;
        this.form = {
          orderDate: this.toInputDate(result.order.orderDate) || kolkataTodayInput(),
          executiveId: result.order.executiveId ?? null,
          type: result.order.orderType === 'MASTER_DISTRIBUTER' ? 'DEALER' : 'RETAILER',
          buyerId: result.order.buyerId ?? null,
          sellerId: result.order.sellerId ?? null,
          orderRemark: result.order.orderRemark ?? '',
          rows: result.orderDetails.length ? result.orderDetails.map(detail => ({
            subcategoryId: detail.subcategoryId ?? null,
            productId: detail.productId ?? null,
            quantity: detail.quantity,
            mrp: detail.price,
            gst: detail.gst,
            taxAmount: detail.taxAmount,
            lineTotal: detail.lineTotal,
            products: detail.productId ? [{ id: detail.productId, name: detail.productName || 'Selected Product', productCode: null, hsnSac: detail.price, price: detail.price }] : [],
            loadingProducts: false
          })) : [this.emptyRow()]
        };
        this.showCreateModal = true;
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  onTypeChange(): void {
    if (!this.showBuyer) this.form.buyerId = null;
  }

  onFamilyChange(row: OrderRow): void {
    row.productId = null;
    row.mrp = null;
    row.lineTotal = null;
    row.taxAmount = null;
    row.products = [];
    if (!row.subcategoryId) return;

    row.loadingProducts = true;
    this.orderService.getProductsByFamily(row.subcategoryId).pipe(finalize(() => {
      row.loadingProducts = false;
      this.refreshView();
    })).subscribe({
      next: products => row.products = products,
      error: error => this.showToast(error.message, 'error')
    });
  }

  onProductChange(row: OrderRow): void {
    const product = row.products.find(item => item.id === row.productId);
    row.mrp = product?.price ?? product?.hsnSac ?? 0;
    this.recalculateRow(row);
  }

  recalculateRow(row: OrderRow): void {
    const quantity = Number(row.quantity) || 0;
    const price = Number(row.mrp) || 0;
    const amount = quantity * price;
    row.gst = 0;
    row.taxAmount = 0;
    row.lineTotal = amount;
  }

  addRow(): void {
    this.form.rows.push(this.emptyRow());
  }

  removeRow(index: number): void {
    if (this.form.rows.length === 1) {
      this.showToast('At least one row required.', 'error');
      return;
    }
    this.form.rows.splice(index, 1);
  }

  submitOrder(): void {
    if (!this.form.orderDate || !this.form.executiveId || !this.form.type || !this.form.sellerId) {
      this.showToast('Order Date, Employee, Customer Type and Dealer are required.', 'error');
      return;
    }
    if (this.showBuyer && !this.form.buyerId) {
      this.showToast('Customer is required.', 'error');
      return;
    }
    const validRows = this.form.rows.filter(row => row.productId && (Number(row.quantity) || 0) > 0);
    if (!validRows.length) {
      this.showToast('Please add at least one product row.', 'error');
      return;
    }

    this.saving = true;
    const payload = {
      orderDate: this.form.orderDate,
      executiveId: this.form.executiveId,
      type: this.form.type,
      buyerId: this.showBuyer ? this.form.buyerId : null,
      sellerId: this.form.sellerId,
      subTotal: this.totalAmount,
      grandTotal: this.totalAmount,
      totalQty: this.totalQty,
      totalGst: this.totalGst,
      orderRemark: this.form.orderRemark,
      orderDetail: validRows.map(row => ({
        subcategoryId: row.subcategoryId,
        productId: row.productId,
        quantity: Number(row.quantity) || 0,
        mrp: Number(row.mrp) || 0,
        gst: 0,
        taxAmount: 0,
        lineTotal: Number(row.lineTotal) || 0
      }))
    };

    const request = this.editingOrderId
      ? this.orderService.updateOrder(this.editingOrderId, payload)
      : this.orderService.createOrder(payload);

    request.pipe(finalize(() => {
      this.saving = false;
      this.refreshView();
    })).subscribe({
      next: result => {
        this.showCreateModal = false;
        this.editingOrderId = null;
        this.showToast(result.message, 'success');
        this.loadOrders();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  exportOrders(): void {
    this.exporting = true;
    this.showToast('Exporting...', 'success');
    this.orderService.exportOrders(this.currentFilters()).pipe(finalize(() => {
      this.exporting = false;
      this.refreshView();
    })).subscribe({
      next: blob => this.downloadBlob(blob, `orders-${kolkataTodayInput()}.xlsx`),
      error: error => this.showToast(error.message, 'error')
    });
  }

  formatDate(value?: string | null): string {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-IN');
  }

  formatDateTime(value?: string | null): string {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-IN');
  }

  async deleteOrder(row: Order): Promise<void> {
    const result = await this.fireSwal({
      title: 'Are you sure?',
      text: `Delete order ${row.orderNo || '#' + row.id}?`,
      icon: 'warning',
      confirmText: 'Yes, Delete'
    });
    if (!result.isConfirmed) return;

    this.orderService.deleteOrder(row.id).subscribe({
      next: result => {
        this.showToast(result.message, 'success');
        this.loadOrders();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  canDispatch(order: Order | null): boolean {
    return this.authService.hasPermission('order_dispatch') && !!order && order.statusId !== 1 && order.statusId !== 4;
  }

  canCancel(order: Order | null): boolean {
    return this.authService.hasPermission('order_edit') && !!order && order.statusId !== 1 && order.statusId !== 4;
  }

  openDispatch(mode: 'full' | 'partial'): void {
    if (!this.selectedOrder) return;
    const id = this.selectedOrder.id;
    this.closeDetailModal();
    this.router.navigate(['/orders', id, 'dispatch', mode]);
  }

  canMovePending(order: Order | null): boolean {
    return !!order && order.statusId !== 4 && order.statusId !== null && order.statusId !== undefined && this.canPending;
  }

  async changeOrderStatus(statusId: number | null): Promise<void> {
    if (!this.selectedOrder) return;
    let remark: string | null = null;
    if (statusId === 4) {
      const result = await this.fireSwal({
        title: 'Are you sure?',
        text: 'Enter remark:',
        icon: 'warning',
        confirmText: 'Yes, Cancel Order',
        input: true,
        inputPlaceholder: 'Remark'
      });
      if (!result.isConfirmed) return;
      remark = result.value ?? '';
      if (!remark) {
        this.showToast('Remark is required for cancel.', 'error');
        return;
      }
    } else {
      const result = await this.fireSwal({
        title: 'Are you sure?',
        text: this.statusConfirmText(statusId),
        icon: 'warning',
        confirmText: 'Yes'
      });
      if (!result.isConfirmed) return;
    }

    this.statusSaving = true;
    this.orderService.setStatus(this.selectedOrder.id, statusId, remark).pipe(finalize(() => {
      this.statusSaving = false;
      this.refreshView();
    })).subscribe({
      next: result => {
        this.showToast(result.message, 'success');
        this.closeDetailModal();
        this.loadOrders();
      },
      error: error => this.showToast(error.message, 'error')
    });
  }

  confirmSwal(): void {
    if (this.swal.input && !this.swal.inputValue.trim()) {
      this.swal = { ...this.swal, inputError: 'You need to write something!' };
      this.refreshView();
      return;
    }

    this.swal.resolver?.({ isConfirmed: true, value: this.swal.inputValue.trim() });
    this.swal = this.emptySwal();
    this.refreshView();
  }

  cancelSwal(): void {
    this.swal.resolver?.({ isConfirmed: false });
    this.swal = this.emptySwal();
    this.refreshView();
  }

  private currentFilters(): OrderFilters {
    return {
      retailersId: this.selectedRetailerId,
      distributorId: this.selectedDistributorId,
      userId: this.selectedUserId,
      divisionId: this.selectedDivisionId,
      designationIds: this.selectedDesignationIds,
      pendingStatus: this.selectedStatus,
      startDate: this.startDate || null,
      endDate: this.endDate || null,
      search: this.appliedSearchQuery || null
    };
  }

  private emptyForm() {
    return {
      orderDate: kolkataTodayInput(),
      executiveId: null as number | null,
      type: 'RETAILER',
      buyerId: null as number | null,
      sellerId: null as number | null,
      orderRemark: '',
      rows: [this.emptyRow()]
    };
  }

  private emptyRow(): OrderRow {
    return {
      subcategoryId: null,
      productId: null,
      quantity: null,
      mrp: null,
      gst: null,
      taxAmount: null,
      lineTotal: null,
      products: [],
      loadingProducts: false
    };
  }

  private toInputDate(value?: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value.slice(0, 10);
    return date.toISOString().slice(0, 10);
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

  private fireSwal(options: Partial<Omit<SwalModel, 'visible' | 'resolver' | 'inputValue' | 'inputError'>>): Promise<{ isConfirmed: boolean; value?: string }> {
    return new Promise(resolve => {
      this.swal = {
        ...this.emptySwal(),
        ...options,
        visible: true,
        resolver: resolve
      };
      this.refreshView();
    });
  }

  private emptySwal(): SwalModel {
    return {
      visible: false,
      title: '',
      text: '',
      icon: 'warning',
      confirmText: 'Yes',
      cancelText: 'No',
      showCancel: true,
      input: false,
      inputValue: '',
      inputPlaceholder: '',
      inputError: ''
    };
  }

  private statusConfirmText(statusId: number | null): string {
    if (statusId === 1) return 'Mark this order as fully dispatched?';
    if (statusId === 2) return 'Mark this order as partially dispatched?';
    return 'Move this order back to pending?';
  }

  private refreshView(): void {
    this.cdr.detectChanges();
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
  }
}
