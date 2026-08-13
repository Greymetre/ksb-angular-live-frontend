import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { API_BASE_URL } from '../config/api.config';
import { AuthService } from './auth.service';
import { UserOption } from './user.service';
import { asPagedArray, PagedArray } from '../shared/utils/paged-array';

export interface Order {
  id: number;
  active: string;
  orderDate?: string | null;
  completedDate?: string | null;
  orderNo: string;
  buyerId?: number | null;
  buyerName?: string | null;
  sellerId?: number | null;
  sellerName?: string | null;
  executiveId?: number | null;
  executiveName?: string | null;
  branchName?: string | null;
  totalQty: number;
  shippedQty: number;
  subTotal: number;
  grandTotal: number;
  statusId?: number | null;
  statusName: string;
  createdByName?: string | null;
  createdAt?: string | null;
  orderType?: string | null;
  orderRemark?: string | null;
}

export interface OrderDetail {
  id: number;
  productId?: number | null;
  productName?: string | null;
  categoryId?: number | null;
  categoryName?: string | null;
  subcategoryId?: number | null;
  subcategoryName?: string | null;
  quantity: number;
  shippedQty: number;
  price: number;
  gst: number;
  taxAmount: number;
  lineTotal: number;
  statusId?: number | null;
  statusName: string;
}

export interface OrderDetailsResponse {
  order: Order;
  orderDetails: OrderDetail[];
}

export interface OrderFilters {
  page?: number;
  pageSize?: number;
  retailersId?: number | null;
  distributorId?: number | null;
  userId?: number | null;
  divisionId?: number | null;
  designationIds?: number[];
  pendingStatus?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  search?: string | null;
}

export interface OrderProductOption extends UserOption {
  productCode?: string | null;
  hsnSac: number;
  price?: number | null;
}

export interface OrderOptions {
  users: UserOption[];
  divisions: UserOption[];
  designations: UserOption[];
  retailers: UserOption[];
  distributors: UserOption[];
  families: UserOption[];
}

export interface OrderDetailPayload {
  subcategoryId: number | null;
  productId: number | null;
  quantity: number | null;
  mrp: number | null;
  gst: number | null;
  taxAmount: number | null;
  lineTotal: number | null;
}

export interface OrderPayload {
  orderDate: string;
  executiveId: number | null;
  type: string;
  buyerId: number | null;
  sellerId: number | null;
  grandTotal: number;
  subTotal: number;
  totalQty: number;
  totalGst: number;
  orderRemark?: string | null;
  orderDetail: OrderDetailPayload[];
}

export interface OrderDispatch {
  id: number; orderId?: number | null; orderNo: string; invoiceNo: string; invoiceDate?: string | null;
  dispatchDate?: string | null; lrNo?: string | null; transportDetails?: string | null; shippedQty: number;
  grandTotal: number; statusId?: number | null; statusName: string; createdAt?: string | null;
  invoiceAttachment?: string | null;
  productCode?: string | null; productName?: string | null; orderQty?: number; cancelledQty?: number;
}

export interface OrderDispatchProduct {
  id: number; productId?: number | null; productCode?: string | null; productName?: string | null;
  segmentName?: string | null; familyName?: string | null; quantity: number; price: number;
  taxAmount: number; lineTotal: number;
}

export interface OrderDispatchDetail {
  dispatch: OrderDispatch; dealerName?: string | null; retailerName?: string | null;
  createdByName?: string | null; remark?: string | null; loyaltySchemeId?: number | null;
  loyaltySchemeName?: string | null; loyaltySchemeCode?: string | null; products: OrderDispatchProduct[];
}

export interface OrderDispatchPayload {
  mode: 'full' | 'partial'; invoiceNo: string; invoiceDate: string; lrNo: string; dispatchDate: string;
  transportDetails?: string | null; remark?: string | null;
  loyaltySchemeId?: number | null; removedOrderDetailIds: number[];
  items: { orderDetailId?: number | null; productId?: number | null; subcategoryId?: number | null; categoryId?: number | null; quantity: number }[];
  invoiceAttachment?: File | null;
}

type ApiResponse = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly baseUrl = API_BASE_URL;

  constructor(private http: HttpClient, private authService: AuthService) {}

  getOrders(filters: OrderFilters = {}): Observable<PagedArray<Order>> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/orders`, {
      headers: this.authHeaders(),
      params: this.filterParams(filters)
    }).pipe(
      map(response => asPagedArray(this.pickArray(response, ['orders', 'data.orders', 'data']).map(row => this.normalizeOrder(row)).filter(row => row.id > 0), response, filters.page, filters.pageSize)),
      catchError(error => this.handleError(error))
    );
  }

  getOptions(): Observable<OrderOptions> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/orders/options`, {
      headers: this.authHeaders()
    }).pipe(
      map(response => {
        const source = this.asRecord(this.pickFirstValue(response, ['options', 'data.options']) ?? response);
        return {
          users: this.optionArray(source, 'users'),
          divisions: this.optionArray(source, 'divisions'),
          designations: this.optionArray(source, 'designations'),
          retailers: this.optionArray(source, 'retailers'),
          distributors: this.optionArray(source, 'distributors'),
          families: this.optionArray(source, 'families')
        };
      }),
      catchError(error => this.handleError(error))
    );
  }

  getProductsByFamily(familyId: number): Observable<OrderProductOption[]> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/orders/products`, {
      headers: this.authHeaders(),
      params: new HttpParams().set('subcategory_id', String(familyId))
    }).pipe(
      map(response => this.pickArray(response, ['products', 'data.products', 'data']).map(row => this.normalizeProduct(row)).filter(row => row.id > 0)),
      catchError(error => this.handleError(error))
    );
  }

  createOrder(payload: OrderPayload): Observable<{ order?: Order; message: string }> {
    return this.http.post<ApiResponse>(`${this.baseUrl}/orders`, this.toApiPayload(payload), {
      headers: this.authHeaders()
    }).pipe(
      map(response => {
        const order = this.pickFirstValue(response, ['order', 'data.order']);
        return { order: order ? this.normalizeOrder(order) : undefined, message: this.responseMessage(response) || 'Order Created Successfully' };
      }),
      catchError(error => this.handleError(error))
    );
  }

  getOrder(id: number): Observable<OrderDetailsResponse> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/orders/${id}`, {
      headers: this.authHeaders()
    }).pipe(
      map(response => ({
        order: this.normalizeOrder(this.pickFirstValue(response, ['order', 'data.order', 'data']) ?? response),
        orderDetails: this.pickArray(response, ['order_details', 'orderDetails', 'data.order_details', 'data.orderDetails'])
          .map(row => this.normalizeOrderDetail(row))
          .filter(row => row.id > 0)
      })),
      catchError(error => this.handleError(error))
    );
  }

  updateOrder(id: number, payload: OrderPayload): Observable<{ order?: Order; message: string }> {
    return this.http.put<ApiResponse>(`${this.baseUrl}/orders/${id}`, this.toApiPayload(payload), {
      headers: this.authHeaders()
    }).pipe(
      map(response => {
        const order = this.pickFirstValue(response, ['order', 'data.order']);
        return { order: order ? this.normalizeOrder(order) : undefined, message: this.responseMessage(response) || 'Order Updated Successfully' };
      }),
      catchError(error => this.handleError(error))
    );
  }

  deleteOrder(id: number): Observable<{ message: string }> {
    return this.http.delete<ApiResponse>(`${this.baseUrl}/orders/${id}`, {
      headers: this.authHeaders()
    }).pipe(
      map(response => ({ message: this.responseMessage(response) || 'Order deleted successfully!' })),
      catchError(error => this.handleError(error))
    );
  }

  setActive(id: number, active: string): Observable<{ order?: Order; message: string }> {
    return this.http.post<ApiResponse>(`${this.baseUrl}/orders/${id}/active`, { active }, {
      headers: this.authHeaders()
    }).pipe(
      map(response => {
        const order = this.pickFirstValue(response, ['order', 'data.order']);
        return { order: order ? this.normalizeOrder(order) : undefined, message: this.responseMessage(response) || 'Status changed successfully' };
      }),
      catchError(error => this.handleError(error))
    );
  }

  setStatus(id: number, statusId: number | null, remark?: string | null): Observable<{ order?: Order; message: string }> {
    return this.http.post<ApiResponse>(`${this.baseUrl}/orders/${id}/status`, {
      status_id: statusId,
      remark
    }, {
      headers: this.authHeaders()
    }).pipe(
      map(response => {
        const order = this.pickFirstValue(response, ['order', 'data.order']);
        return { order: order ? this.normalizeOrder(order) : undefined, message: this.responseMessage(response) || 'Order status updated successfully !!' };
      }),
      catchError(error => this.handleError(error))
    );
  }

  dispatchOrder(id: number, payload: OrderDispatchPayload): Observable<{ order?: Order; message: string }> {
    const form = new FormData();
    form.append('mode', payload.mode); form.append('invoice_no', payload.invoiceNo); form.append('invoice_date', payload.invoiceDate);
    form.append('dispatch_date', payload.dispatchDate); form.append('items', JSON.stringify(payload.items));
    form.append('removed_order_detail_ids', JSON.stringify(payload.removedOrderDetailIds));
    if (payload.loyaltySchemeId) form.append('loyalty_scheme_id', String(payload.loyaltySchemeId));
    if (payload.lrNo) form.append('lr_no', payload.lrNo); if (payload.transportDetails) form.append('transport_details', payload.transportDetails);
    if (payload.remark) form.append('remark', payload.remark); if (payload.invoiceAttachment) form.append('invoice_attachment', payload.invoiceAttachment);
    return this.http.post<ApiResponse>(`${this.baseUrl}/orders/${id}/dispatch`, form, { headers: this.authHeaders() }).pipe(
      map(response => ({ message: this.responseMessage(response) || 'Order dispatched successfully.' })),
      catchError(error => this.handleError(error))
    );
  }

  getDispatches(mode: 'full' | 'partial' | 'cancelled'): Observable<OrderDispatch[]> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/order-dispatches`, {
      headers: this.authHeaders(), params: new HttpParams().set('mode', mode)
    }).pipe(map(response => this.pickArray(response, ['dispatches', 'data.dispatches', 'data']).map(row => {
      const x = this.asRecord(row);
      return { id: Number(x['id']), orderId: Number(x['orderId'] ?? x['order_id']), orderNo: String(x['orderNo'] ?? x['order_no'] ?? ''),
        invoiceNo: String(x['invoiceNo'] ?? x['invoice_no'] ?? ''), invoiceDate: String(x['invoiceDate'] ?? x['invoice_date'] ?? ''),
        dispatchDate: String(x['dispatchDate'] ?? x['dispatch_date'] ?? ''), lrNo: String(x['lrNo'] ?? x['lr_no'] ?? ''),
        transportDetails: String(x['transportDetails'] ?? x['transport_details'] ?? ''), shippedQty: Number(x['shippedQty'] ?? x['shipped_qty'] ?? 0),
        grandTotal: Number(x['grandTotal'] ?? x['grand_total'] ?? 0), statusId: Number(x['statusId'] ?? x['status_id']),
        statusName: String(x['statusName'] ?? x['status_name'] ?? ''), createdAt: String(x['createdAt'] ?? x['created_at'] ?? ''),
        invoiceAttachment: String(x['invoiceAttachment'] ?? x['invoice_attachment'] ?? ''),
        productCode: this.readString(x['productCode'] ?? x['product_code']), productName: this.readString(x['productName'] ?? x['product_name']),
        orderQty: Number(x['orderQty'] ?? x['order_qty'] ?? 0), cancelledQty: Number(x['cancelledQty'] ?? x['cancelled_qty'] ?? 0) } as OrderDispatch;
    })), catchError(error => this.handleError(error)));
  }

  getDispatchDetail(id: number): Observable<OrderDispatchDetail> {
    return this.http.get<ApiResponse>(`${this.baseUrl}/order-dispatches/${id}`, { headers: this.authHeaders() }).pipe(
      map(response => {
        const raw = this.asRecord(this.pickFirstValue(response, ['dispatch', 'data.dispatch']));
        const dispatchRaw = this.asRecord(raw['dispatch']);
        const dispatch = this.normalizeDispatch(dispatchRaw);
        const products = (Array.isArray(raw['products']) ? raw['products'] : []).map(value => {
          const row = this.asRecord(value);
          return {
            id: Number(row['id']), productId: this.readNullableNumber(row['productId'] ?? row['product_id']),
            productCode: this.readString(row['productCode'] ?? row['product_code']), productName: this.readString(row['productName'] ?? row['product_name']),
            segmentName: this.readString(row['segmentName'] ?? row['segment_name']), familyName: this.readString(row['familyName'] ?? row['family_name']),
            quantity: Number(row['quantity'] ?? 0), price: Number(row['price'] ?? 0), taxAmount: Number(row['taxAmount'] ?? row['tax_amount'] ?? 0),
            lineTotal: Number(row['lineTotal'] ?? row['line_total'] ?? 0)
          } as OrderDispatchProduct;
        });
        return { dispatch, dealerName: this.readString(raw['dealerName'] ?? raw['dealer_name']), retailerName: this.readString(raw['retailerName'] ?? raw['retailer_name']),
          createdByName: this.readString(raw['createdByName'] ?? raw['created_by_name']), remark: this.readString(raw['remark']),
          loyaltySchemeId: this.readNullableNumber(raw['loyaltySchemeId'] ?? raw['loyalty_scheme_id']), loyaltySchemeName: this.readString(raw['loyaltySchemeName'] ?? raw['loyalty_scheme_name']), loyaltySchemeCode: this.readString(raw['loyaltySchemeCode'] ?? raw['loyalty_scheme_code']), products };
      }),
      catchError(error => this.handleError(error))
    );
  }

  exportOrders(filters: OrderFilters = {}): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/orders/export`, {
      headers: this.authHeaders(),
      params: this.filterParams(filters),
      responseType: 'blob'
    }).pipe(catchError(error => this.handleError(error)));
  }

  private filterParams(filters: OrderFilters): HttpParams {
    let params = new HttpParams();
    if (filters.page) params = params.set('page', String(filters.page));
    if (filters.pageSize) params = params.set('page_size', String(filters.pageSize));
    if (filters.retailersId) params = params.set('retailers_id', String(filters.retailersId));
    if (filters.distributorId) params = params.set('distributor_id', String(filters.distributorId));
    if (filters.userId) params = params.set('user_id', String(filters.userId));
    if (filters.divisionId) params = params.set('division_id', String(filters.divisionId));
    if (filters.pendingStatus !== null && filters.pendingStatus !== undefined) params = params.set('pending_status', String(filters.pendingStatus));
    if (filters.startDate) params = params.set('startdate', filters.startDate);
    if (filters.endDate) params = params.set('enddate', filters.endDate);
    if (filters.search?.trim()) params = params.set('search', filters.search.trim());
    for (const id of filters.designationIds ?? []) params = params.append('designation_id', String(id));
    return params;
  }

  private toApiPayload(payload: OrderPayload): Record<string, unknown> {
    return {
      order_date: payload.orderDate,
      executive_id: payload.executiveId,
      type: payload.type,
      buyer_id: payload.buyerId,
      seller_id: payload.sellerId,
      grand_total: payload.grandTotal,
      sub_total: payload.subTotal,
      total_qty: payload.totalQty,
      total_gst: payload.totalGst,
      order_remark: payload.orderRemark,
      order_detail: payload.orderDetail.map(row => ({
        subcategory_id: row.subcategoryId,
        product_id: row.productId,
        quantity: row.quantity,
        mrp: row.mrp,
        gst: row.gst,
        tax_amount: row.taxAmount,
        line_total: row.lineTotal
      }))
    };
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private normalizeOrder(value: unknown): Order {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id'] ?? row['Id']),
      active: this.readString(row['active'] ?? row['Active']) || 'Y',
      orderDate: this.readNullableString(row['orderDate'] ?? row['order_date'] ?? row['OrderDate']),
      completedDate: this.readNullableString(row['completedDate'] ?? row['completed_date'] ?? row['CompletedDate']),
      orderNo: this.readString(row['orderNo'] ?? row['order_no'] ?? row['OrderNo']),
      buyerId: this.readNullableNumber(row['buyerId'] ?? row['buyer_id'] ?? row['BuyerId']),
      buyerName: this.readNullableString(row['buyerName'] ?? row['buyer_name'] ?? row['BuyerName']),
      sellerId: this.readNullableNumber(row['sellerId'] ?? row['seller_id'] ?? row['SellerId']),
      sellerName: this.readNullableString(row['sellerName'] ?? row['seller_name'] ?? row['SellerName']),
      executiveId: this.readNullableNumber(row['executiveId'] ?? row['executive_id'] ?? row['ExecutiveId']),
      executiveName: this.readNullableString(row['executiveName'] ?? row['executive_name'] ?? row['ExecutiveName']),
      branchName: this.readNullableString(row['branchName'] ?? row['branch_name'] ?? row['BranchName']),
      totalQty: this.readNumber(row['totalQty'] ?? row['total_qty'] ?? row['TotalQty']),
      shippedQty: this.readNumber(row['shippedQty'] ?? row['shipped_qty'] ?? row['ShippedQty']),
      subTotal: this.readNumber(row['subTotal'] ?? row['sub_total'] ?? row['SubTotal']),
      grandTotal: this.readNumber(row['grandTotal'] ?? row['grand_total'] ?? row['GrandTotal']),
      statusId: this.readNullableNumber(row['statusId'] ?? row['status_id'] ?? row['StatusId']),
      statusName: this.readString(row['statusName'] ?? row['status_name'] ?? row['StatusName']) || 'Pending',
      createdByName: this.readNullableString(row['createdByName'] ?? row['created_by_name'] ?? row['CreatedByName']),
      createdAt: this.readNullableString(row['createdAt'] ?? row['created_at'] ?? row['CreatedAt']),
      orderType: this.readNullableString(row['orderType'] ?? row['order_type'] ?? row['OrderType']),
      orderRemark: this.readNullableString(row['orderRemark'] ?? row['order_remark'] ?? row['OrderRemark'])
    };
  }

  private normalizeDispatch(value: unknown): OrderDispatch {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id'] ?? row['Id']),
      orderId: this.readNullableNumber(row['orderId'] ?? row['order_id'] ?? row['OrderId']),
      orderNo: this.readString(row['orderNo'] ?? row['order_no'] ?? row['OrderNo']),
      invoiceNo: this.readString(row['invoiceNo'] ?? row['invoice_no'] ?? row['InvoiceNo']),
      invoiceDate: this.readNullableString(row['invoiceDate'] ?? row['invoice_date'] ?? row['InvoiceDate']),
      dispatchDate: this.readNullableString(row['dispatchDate'] ?? row['dispatch_date'] ?? row['DispatchDate']),
      lrNo: this.readNullableString(row['lrNo'] ?? row['lr_no'] ?? row['LrNo']),
      transportDetails: this.readNullableString(row['transportDetails'] ?? row['transport_details'] ?? row['TransportDetails']),
      shippedQty: this.readNumber(row['shippedQty'] ?? row['shipped_qty'] ?? row['ShippedQty']),
      grandTotal: this.readNumber(row['grandTotal'] ?? row['grand_total'] ?? row['GrandTotal']),
      statusId: this.readNullableNumber(row['statusId'] ?? row['status_id'] ?? row['StatusId']),
      statusName: this.readString(row['statusName'] ?? row['status_name'] ?? row['StatusName']),
      createdAt: this.readNullableString(row['createdAt'] ?? row['created_at'] ?? row['CreatedAt']),
      invoiceAttachment: this.readNullableString(row['invoiceAttachment'] ?? row['invoice_attachment'] ?? row['InvoiceAttachment'])
    };
  }

  private normalizeOrderDetail(value: unknown): OrderDetail {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id'] ?? row['Id']),
      productId: this.readNullableNumber(row['productId'] ?? row['product_id'] ?? row['ProductId']),
      productName: this.readNullableString(row['productName'] ?? row['product_name'] ?? row['ProductName']),
      categoryId: this.readNullableNumber(row['categoryId'] ?? row['category_id'] ?? row['CategoryId']),
      categoryName: this.readNullableString(row['categoryName'] ?? row['category_name'] ?? row['segment'] ?? row['CategoryName']),
      subcategoryId: this.readNullableNumber(row['subcategoryId'] ?? row['subcategory_id'] ?? row['SubcategoryId']),
      subcategoryName: this.readNullableString(row['subcategoryName'] ?? row['subcategory_name'] ?? row['SubcategoryName']),
      quantity: this.readNumber(row['quantity'] ?? row['Quantity']),
      shippedQty: this.readNumber(row['shippedQty'] ?? row['shipped_qty'] ?? row['ShippedQty']),
      price: this.readNumber(row['price'] ?? row['Price']),
      gst: this.readNumber(row['gst'] ?? row['Gst']),
      taxAmount: this.readNumber(row['taxAmount'] ?? row['tax_amount'] ?? row['TaxAmount']),
      lineTotal: this.readNumber(row['lineTotal'] ?? row['line_total'] ?? row['LineTotal']),
      statusId: this.readNullableNumber(row['statusId'] ?? row['status_id'] ?? row['StatusId']),
      statusName: this.readString(row['statusName'] ?? row['status_name'] ?? row['StatusName']) || 'Pending'
    };
  }

  private normalizeProduct(value: unknown): OrderProductOption {
    const row = this.asRecord(value);
    return {
      id: this.readNumber(row['id'] ?? row['Id']),
      name: this.readString(row['name'] ?? row['Name']),
      productCode: this.readNullableString(row['productCode'] ?? row['product_code'] ?? row['ProductCode']),
      hsnSac: this.readNumber(row['hsnSac'] ?? row['hsn_sac'] ?? row['HsnSac']),
      price: this.readNullableNumber(row['price'] ?? row['Price'])
    };
  }

  private optionArray(source: Record<string, unknown>, key: string): UserOption[] {
    return this.asArray(source[key]).map(value => {
      const row = this.asRecord(value);
      return { id: this.readNumber(row['id'] ?? row['Id']), name: this.readString(row['name'] ?? row['Name']) };
    }).filter(option => option.id > 0);
  }

  private pickArray(source: unknown, paths: string[]): unknown[] {
    for (const path of paths) {
      const value = this.pickValue(source, path.split('.'));
      const rows = this.asArray(value);
      if (rows.length > 0) return rows;
    }
    return Array.isArray(source) ? source : [];
  }

  private pickFirstValue(source: unknown, paths: string[]): unknown {
    for (const path of paths) {
      const value = this.pickValue(source, path.split('.'));
      if (value !== undefined && value !== null) return value;
    }
    return undefined;
  }

  private pickValue(source: unknown, path: string[]): unknown {
    let current: unknown = source;
    for (const part of path) {
      current = this.asRecord(current)[part];
      if (current === undefined || current === null) return undefined;
    }
    return current;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  }

  private asArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    const row = this.asRecord(value);
    const values = row['$values'] ?? row['values'] ?? row['items'] ?? row['data'];
    return Array.isArray(values) ? values : [];
  }

  private readNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private readNullableNumber(value: unknown): number | null {
    const number = this.readNumber(value);
    return number > 0 ? number : null;
  }

  private readString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return '';
  }

  private readNullableString(value: unknown): string | null {
    const text = this.readString(value);
    return text || null;
  }

  private responseMessage(response: ApiResponse): string {
    return this.readMessage(response['message'] ?? response['Message']);
  }

  private handleError(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse) {
      return throwError(() => new Error(this.readMessage(error.error?.message) || error.message || 'Order API request failed.'));
    }
    return throwError(() => error instanceof Error ? error : new Error('Order API request failed.'));
  }

  private readMessage(message: unknown): string {
    if (typeof message === 'string') return message;
    if (message && typeof message === 'object') {
      return Object.values(message)
        .flatMap(value => Array.isArray(value) ? value : [value])
        .filter((value): value is string => typeof value === 'string')
        .join(' ');
    }
    return '';
  }
}
