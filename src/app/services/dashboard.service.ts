import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '../config/api.config';

export type DealerSchemeStatus = 'live' | 'upcoming' | 'expired';

export interface DealerScheme {
  id: number;
  name: string;
  code: string;
  tag: string;
  areaScope: string;
  startDate: string;
  endDate: string;
  status: DealerSchemeStatus;
  statusLabel: string;
  isLive: boolean;
  daysRemaining: number;
}

export interface DealerSchemeSlab {
  tierName: string; valueFrom: number; valueTo: number | null; rewardValue: number;
}

export interface DealerSchemeRetailer {
  retailerId: number; retailerName: string; shopName: string;
  invoiceCount: number; invoiceAmount: number; pointsEarned: number; pointsExpected: number;
}

export interface DealerSchemeDetail {
  id: number; name: string; code: string; description: string; tag: string;
  basedOn: string; areaScope: string; startDate: string; endDate: string;
  status: DealerSchemeStatus; statusLabel: string; isLive: boolean; daysRemaining: number;
  summary: {
    schemeRetailers: number; totalInvoices: number; approvedInvoices: number; pendingInvoices: number;
    rejectedInvoices: number; totalInvoiceAmount: number; approvedInvoiceAmount: number;
    expectedInvoiceAmount: number; pointsEarned: number; pointsExpected: number;
  };
  slabs: DealerSchemeSlab[];
  retailers: DealerSchemeRetailer[];
}

export interface DealerDashboard {
  isDealer: boolean;
  dealer: { id: number; name: string; code: string; mobile: string; city: string };
  retailers: { total: number; active: number; pendingKyc: number; addedThisMonth: number };
  invoices: {
    total: number; retailers: number; pending: number; inProcess: number; approved: number; rejected: number;
    totalAmount: number; approvedAmount: number; expectedAmount: number;
    pointsEarned: number; pointsExpected: number; thisMonth: number;
  };
  orders: { total: number; thisMonth: number; totalValue: number; thisMonthValue: number; totalQty: number };
  schemes: DealerScheme[];
}

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private http: HttpClient, private auth: AuthService) {}

  dealer(): Observable<DealerDashboard> {
    return this.http.get<any>(`${API_BASE_URL}/dashboard/dealer`, { headers: this.headers() }).pipe(
      map(response => ({
        isDealer: Boolean(response?.is_dealer),
        dealer: {
          id: num(response?.dealer?.id),
          name: String(response?.dealer?.name ?? ''),
          code: String(response?.dealer?.code ?? ''),
          mobile: String(response?.dealer?.mobile ?? ''),
          city: String(response?.dealer?.city ?? '')
        },
        retailers: {
          total: num(response?.retailers?.total),
          active: num(response?.retailers?.active),
          pendingKyc: num(response?.retailers?.pending_kyc),
          addedThisMonth: num(response?.retailers?.added_this_month)
        },
        invoices: {
          total: num(response?.invoices?.total),
          retailers: num(response?.invoices?.retailers),
          pending: num(response?.invoices?.pending),
          inProcess: num(response?.invoices?.in_process),
          approved: num(response?.invoices?.approved),
          rejected: num(response?.invoices?.rejected),
          totalAmount: num(response?.invoices?.total_amount),
          approvedAmount: num(response?.invoices?.approved_amount),
          expectedAmount: num(response?.invoices?.expected_amount),
          pointsEarned: num(response?.invoices?.points_earned),
          pointsExpected: num(response?.invoices?.points_expected),
          thisMonth: num(response?.invoices?.this_month)
        },
        orders: {
          total: num(response?.orders?.total),
          thisMonth: num(response?.orders?.this_month),
          totalValue: num(response?.orders?.total_value),
          thisMonthValue: num(response?.orders?.this_month_value),
          totalQty: num(response?.orders?.total_qty)
        },
        schemes: (Array.isArray(response?.schemes) ? response.schemes : []).map((row: any): DealerScheme => {
          const status = String(row?.status ?? 'live').toLowerCase();
          return {
            id: num(row?.id),
            name: String(row?.name ?? 'Scheme'),
            code: String(row?.code ?? ''),
            tag: String(row?.tag ?? 'Regular'),
            areaScope: String(row?.area_scope ?? 'All'),
            startDate: String(row?.start_date ?? ''),
            endDate: String(row?.end_date ?? ''),
            status: (status === 'expired' || status === 'upcoming' ? status : 'live') as DealerSchemeStatus,
            statusLabel: String(row?.status_label ?? 'Live'),
            isLive: Boolean(row?.is_live),
            daysRemaining: num(row?.days_remaining)
          };
        })
      })),
      catchError(error => throwError(() => new Error(this.message(error))))
    );
  }

  scheme(id: number): Observable<DealerSchemeDetail> {
    return this.http.get<any>(`${API_BASE_URL}/dashboard/dealer/schemes/${id}`, { headers: this.headers() }).pipe(
      map(response => {
        const d = response?.data ?? {};
        const status = String(d?.scheme_status ?? 'live').toLowerCase();
        return {
          id: num(d?.id),
          name: String(d?.name ?? 'Scheme'),
          code: String(d?.code ?? ''),
          description: String(d?.description ?? ''),
          tag: String(d?.tag ?? 'Regular'),
          basedOn: String(d?.based_on ?? 'Value'),
          areaScope: String(d?.area_scope ?? 'All'),
          startDate: String(d?.start_date ?? ''),
          endDate: String(d?.end_date ?? ''),
          status: (status === 'expired' || status === 'upcoming' ? status : 'live') as DealerSchemeStatus,
          statusLabel: String(d?.status_label ?? 'Live'),
          isLive: Boolean(d?.is_live),
          daysRemaining: num(d?.days_remaining),
          summary: {
            schemeRetailers: num(d?.summary?.scheme_retailers),
            totalInvoices: num(d?.summary?.total_invoices),
            approvedInvoices: num(d?.summary?.approved_invoices),
            pendingInvoices: num(d?.summary?.pending_invoices),
            rejectedInvoices: num(d?.summary?.rejected_invoices),
            totalInvoiceAmount: num(d?.summary?.total_invoice_amount),
            approvedInvoiceAmount: num(d?.summary?.approved_invoice_amount),
            expectedInvoiceAmount: num(d?.summary?.expected_invoice_amount),
            pointsEarned: num(d?.summary?.points_earned),
            pointsExpected: num(d?.summary?.points_expected)
          },
          slabs: (Array.isArray(d?.slabs) ? d.slabs : []).map((x: any): DealerSchemeSlab => ({
            tierName: String(x?.tier_name ?? ''),
            valueFrom: num(x?.value_from),
            valueTo: x?.value_to === null || x?.value_to === undefined ? null : num(x?.value_to),
            rewardValue: num(x?.reward_value)
          })),
          retailers: (Array.isArray(d?.retailers) ? d.retailers : []).map((x: any): DealerSchemeRetailer => ({
            retailerId: num(x?.retailer_id),
            retailerName: String(x?.retailer_name ?? ''),
            shopName: String(x?.shop_name ?? ''),
            invoiceCount: num(x?.invoice_count),
            invoiceAmount: num(x?.invoice_amount),
            pointsEarned: num(x?.points_earned),
            pointsExpected: num(x?.points_expected)
          }))
        };
      }),
      catchError(error => throwError(() => new Error(this.message(error))))
    );
  }

  private headers(): HttpHeaders {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private message(error: unknown): string {
    if (error instanceof HttpErrorResponse) return error.error?.message || error.message;
    return error instanceof Error ? error.message : 'Unable to load dashboard.';
  }
}
