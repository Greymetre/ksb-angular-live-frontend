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

export interface OverviewCount { orders: number; quantity: number; value: number; }
export interface OverviewTarget {
  target: number; achievement: number; achievementPercent: number;
  quantityTarget: number; quantityAchievement: number; quantityAchievementPercent: number; users: number;
}
export interface OverviewAttendance {
  total: number; present: number; onLeave: number; misPunch: number; notPunched: number;
}
export interface OverviewActivity {
  retailerVisit: number; retailerMeet: number; nukkadMeet: number; fieldDemo: number; other: number;
}
export interface OverviewTrendPoint {
  month: number; label: string; orders: number; quantity: number; value: number; isCurrent: boolean;
}
export interface OverviewProduct { name: string; quantity: number; value: number; }
export interface OverviewPerformer {
  userId: number; name: string; designation: string; orders: number; quantity: number; value: number;
}

export interface DashboardActor {
  id: number; name: string; designation: string; roles: string[]; branches: string[]; scope: string; scopeLabel: string;
}
export interface DashboardTeam { total: number; asr: number; dsr: number; }

export interface TeamDashboard {
  isTeam: boolean;
  user: DashboardActor;
  team: DashboardTeam;
  attendance: { all: OverviewAttendance; asr: OverviewAttendance; dsr: OverviewAttendance };
  target: { monthLabel: string; month: OverviewTarget; ytd: OverviewTarget; asr: OverviewTarget; dsr: OverviewTarget };
  orders: {
    today: OverviewCount; month: OverviewCount; year: OverviewCount;
    asrMonth: OverviewCount; dsrMonth: OverviewCount; trend: OverviewTrendPoint[];
  };
  customers: {
    retailers: number; dealers: number; retailersThisMonth: number; approvedToday: number;
    approvedYear: number; withOrderYear: number; uniqueBuyersMonth: number; uniqueBuyersYear: number;
    pendingKyc: number;
  };
  activities: {
    today: OverviewActivity; month: OverviewActivity; year: OverviewActivity;
    promotional: { year: number; month: number; gifts: number; expense: number; types: { name: string; count: number }[] };
  };
  topProducts: { quantity: OverviewProduct[]; value: OverviewProduct[] };
  performers: OverviewPerformer[];
}

// ---------------------------------------------------------------- loyalty tab

export interface LoyaltyTrendPoint {
  month: number; label: string; invoices: number; amount: number; points: number; isCurrent: boolean;
}
export interface LoyaltySchemeRow {
  id: number; name: string; code: string; tag: string; status: DealerSchemeStatus; statusLabel: string;
  startDate: string; endDate: string; invoices: number; retailers: number; amount: number; points: number;
}
export interface LoyaltyRetailerRow {
  retailerId: number; name: string; shopName: string; dealer: string;
  invoices: number; amount: number; points: number;
}
export interface LoyaltyDealerRow {
  name: string; retailers: number; invoices: number; amount: number; points: number;
}
export interface LoyaltyDashboard {
  isTeam: boolean;
  user: DashboardActor;
  team: DashboardTeam;
  invoices: {
    total: number; pending: number; approvedSs: number; approvedSales: number; approvedHo: number;
    rejected: number; thisMonth: number; retailers: number; dealers: number;
    totalAmount: number; ssAmount: number; salesAmount: number; hoAmount: number; expectedAmount: number;
    pointsEarned: number; pointsExpected: number;
  };
  trend: LoyaltyTrendPoint[];
  schemes: { live: number; upcoming: number; expired: number; total: number; rows: LoyaltySchemeRow[] };
  topRetailers: LoyaltyRetailerRow[];
  topDealers: LoyaltyDealerRow[];
}

// --------------------------------------------------------------- activity tab

export interface AttendanceDayPoint {
  date: string; label: string; weekday: string; present: number; isToday: boolean;
}
export interface ActivityUserRow {
  userId: number; name: string; designation: string;
  presentDays: number; leaveDays: number; punchOutPending: number; lastSeen: string | null;
}
export interface ActivityDashboard {
  isTeam: boolean;
  user: DashboardActor;
  team: DashboardTeam;
  attendance: {
    all: OverviewAttendance; asr: OverviewAttendance; dsr: OverviewAttendance;
    month: { workingDays: number; punchIns: number; uniqueUsers: number; averagePresent: number; punchOutPending: number };
    trend: AttendanceDayPoint[];
  };
  working: { today: OverviewActivity; month: OverviewActivity; year: OverviewActivity };
  promotional: {
    year: number; month: number; gifts: number; expense: number; completed: number; draft: number;
    types: { name: string; count: number; expense: number }[];
  };
  tours: { month: number; users: number; approved: number; pending: number };
  leaves: { month: number; pending: number; approved: number; rejected: number };
  expenses: { monthClaims: number; claimed: number; approved: number; pending: number };
  users: ActivityUserRow[];
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

const list = (value: unknown): any[] => (Array.isArray(value) ? value : []);
const count = (row: any) => ({ orders: num(row?.orders), quantity: num(row?.quantity), value: num(row?.value) });
const attendance = (row: any) => ({
  total: num(row?.total), present: num(row?.present), onLeave: num(row?.on_leave),
  misPunch: num(row?.mis_punch), notPunched: num(row?.not_punched)
});
const target = (row: any) => ({
  target: num(row?.target), achievement: num(row?.achievement), achievementPercent: num(row?.achievement_percent),
  quantityTarget: num(row?.quantity_target), quantityAchievement: num(row?.quantity_achievement),
  quantityAchievementPercent: num(row?.quantity_achievement_percent), users: num(row?.users)
});
const activity = (row: any) => ({
  retailerVisit: num(row?.retailer_visit), retailerMeet: num(row?.retailer_meet),
  nukkadMeet: num(row?.nukkad_meet), fieldDemo: num(row?.field_demo), other: num(row?.other)
});
const actor = (row: any): DashboardActor => ({
  id: num(row?.id), name: String(row?.name ?? ''), designation: String(row?.designation ?? ''),
  roles: list(row?.roles).map((x: any) => String(x)), branches: list(row?.branches).map((x: any) => String(x)),
  scope: String(row?.scope ?? 'self'), scopeLabel: String(row?.scope_label ?? '')
});
const teamBlock = (row: any): DashboardTeam => ({
  total: num(row?.total), asr: num(row?.asr), dsr: num(row?.dsr)
});
const activityBlock = activity;
const product = (row: any) => ({ name: String(row?.name ?? ''), quantity: num(row?.quantity), value: num(row?.value) });

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

  /// Role-scoped team dashboard for internal CRM users. The API applies the same
  /// reporting visibility the SFA app uses, so nothing is filtered again here.
  overview(): Observable<TeamDashboard> {
    return this.http.get<any>(`${API_BASE_URL}/dashboard/overview`, { headers: this.headers() }).pipe(
      map(response => ({
        isTeam: Boolean(response?.is_team),
        user: {
          id: num(response?.user?.id),
          name: String(response?.user?.name ?? ''),
          designation: String(response?.user?.designation ?? ''),
          roles: list(response?.user?.roles).map((x: any) => String(x)),
          branches: list(response?.user?.branches).map((x: any) => String(x)),
          scope: String(response?.user?.scope ?? 'self'),
          scopeLabel: String(response?.user?.scope_label ?? '')
        },
        team: {
          total: num(response?.team?.total),
          asr: num(response?.team?.asr),
          dsr: num(response?.team?.dsr)
        },
        attendance: {
          all: attendance(response?.attendance?.all),
          asr: attendance(response?.attendance?.asr),
          dsr: attendance(response?.attendance?.dsr)
        },
        target: {
          monthLabel: String(response?.target?.month_label ?? ''),
          month: target(response?.target?.month),
          ytd: target(response?.target?.ytd),
          asr: target(response?.target?.asr),
          dsr: target(response?.target?.dsr)
        },
        orders: {
          today: count(response?.orders?.today),
          month: count(response?.orders?.month),
          year: count(response?.orders?.year),
          asrMonth: count(response?.orders?.asr_month),
          dsrMonth: count(response?.orders?.dsr_month),
          trend: list(response?.orders?.trend).map((x: any): OverviewTrendPoint => ({
            month: num(x?.month),
            label: String(x?.label ?? ''),
            orders: num(x?.orders),
            quantity: num(x?.quantity),
            value: num(x?.value),
            isCurrent: Boolean(x?.is_current)
          }))
        },
        customers: {
          retailers: num(response?.customers?.retailers),
          dealers: num(response?.customers?.dealers),
          retailersThisMonth: num(response?.customers?.retailers_this_month),
          approvedToday: num(response?.customers?.approved_today),
          approvedYear: num(response?.customers?.approved_year),
          withOrderYear: num(response?.customers?.with_order_year),
          uniqueBuyersMonth: num(response?.customers?.unique_buyers_month),
          uniqueBuyersYear: num(response?.customers?.unique_buyers_year),
          pendingKyc: num(response?.customers?.pending_kyc)
        },
        activities: {
          today: activity(response?.activities?.today),
          month: activity(response?.activities?.month),
          year: activity(response?.activities?.year),
          promotional: {
            year: num(response?.activities?.promotional?.year),
            month: num(response?.activities?.promotional?.month),
            gifts: num(response?.activities?.promotional?.gifts),
            expense: num(response?.activities?.promotional?.expense),
            types: list(response?.activities?.promotional?.types)
              .map((x: any) => ({ name: String(x?.name ?? ''), count: num(x?.count) }))
          }
        },
        topProducts: {
          quantity: list(response?.top_products?.quantity).map(product),
          value: list(response?.top_products?.value).map(product)
        },
        performers: list(response?.performers).map((x: any): OverviewPerformer => ({
          userId: num(x?.user_id),
          name: String(x?.name ?? ''),
          designation: String(x?.designation ?? ''),
          orders: num(x?.orders),
          quantity: num(x?.quantity),
          value: num(x?.value)
        }))
      })),
      catchError(error => throwError(() => new Error(this.message(error))))
    );
  }

  loyalty(): Observable<LoyaltyDashboard> {
    return this.http.get<any>(`${API_BASE_URL}/dashboard/loyalty`, { headers: this.headers() }).pipe(
      map(response => ({
        isTeam: Boolean(response?.is_team),
        user: actor(response?.user),
        team: teamBlock(response?.team),
        invoices: {
          total: num(response?.invoices?.total),
          pending: num(response?.invoices?.pending),
          approvedSs: num(response?.invoices?.approved_ss),
          approvedSales: num(response?.invoices?.approved_sales),
          approvedHo: num(response?.invoices?.approved_ho),
          rejected: num(response?.invoices?.rejected),
          thisMonth: num(response?.invoices?.this_month),
          retailers: num(response?.invoices?.retailers),
          dealers: num(response?.invoices?.dealers),
          totalAmount: num(response?.invoices?.total_amount),
          ssAmount: num(response?.invoices?.ss_amount),
          salesAmount: num(response?.invoices?.sales_amount),
          hoAmount: num(response?.invoices?.ho_amount),
          expectedAmount: num(response?.invoices?.expected_amount),
          pointsEarned: num(response?.invoices?.points_earned),
          pointsExpected: num(response?.invoices?.points_expected)
        },
        trend: list(response?.trend).map((x: any): LoyaltyTrendPoint => ({
          month: num(x?.month), label: String(x?.label ?? ''), invoices: num(x?.invoices),
          amount: num(x?.amount), points: num(x?.points), isCurrent: Boolean(x?.is_current)
        })),
        schemes: {
          live: num(response?.schemes?.live),
          upcoming: num(response?.schemes?.upcoming),
          expired: num(response?.schemes?.expired),
          total: num(response?.schemes?.total),
          rows: list(response?.schemes?.rows).map((x: any): LoyaltySchemeRow => {
            const status = String(x?.status ?? 'live').toLowerCase();
            return {
              id: num(x?.id), name: String(x?.name ?? ''), code: String(x?.code ?? ''),
              tag: String(x?.tag ?? 'Regular'),
              status: (status === 'expired' || status === 'upcoming' ? status : 'live') as DealerSchemeStatus,
              statusLabel: String(x?.status_label ?? 'Live'),
              startDate: String(x?.start_date ?? ''), endDate: String(x?.end_date ?? ''),
              invoices: num(x?.invoices), retailers: num(x?.retailers), amount: num(x?.amount), points: num(x?.points)
            };
          })
        },
        topRetailers: list(response?.top_retailers).map((x: any): LoyaltyRetailerRow => ({
          retailerId: num(x?.retailer_id), name: String(x?.name ?? ''), shopName: String(x?.shop_name ?? ''),
          dealer: String(x?.dealer ?? ''), invoices: num(x?.invoices), amount: num(x?.amount), points: num(x?.points)
        })),
        topDealers: list(response?.top_dealers).map((x: any): LoyaltyDealerRow => ({
          name: String(x?.name ?? ''), retailers: num(x?.retailers), invoices: num(x?.invoices),
          amount: num(x?.amount), points: num(x?.points)
        }))
      })),
      catchError(error => throwError(() => new Error(this.message(error))))
    );
  }

  activity(): Observable<ActivityDashboard> {
    return this.http.get<any>(`${API_BASE_URL}/dashboard/activity`, { headers: this.headers() }).pipe(
      map(response => ({
        isTeam: Boolean(response?.is_team),
        user: actor(response?.user),
        team: teamBlock(response?.team),
        attendance: {
          all: attendance(response?.attendance?.all),
          asr: attendance(response?.attendance?.asr),
          dsr: attendance(response?.attendance?.dsr),
          month: {
            workingDays: num(response?.attendance?.month?.working_days),
            punchIns: num(response?.attendance?.month?.punch_ins),
            uniqueUsers: num(response?.attendance?.month?.unique_users),
            averagePresent: num(response?.attendance?.month?.average_present),
            punchOutPending: num(response?.attendance?.month?.punch_out_pending)
          },
          trend: list(response?.attendance?.trend).map((x: any): AttendanceDayPoint => ({
            date: String(x?.date ?? ''), label: String(x?.label ?? ''), weekday: String(x?.weekday ?? ''),
            present: num(x?.present), isToday: Boolean(x?.is_today)
          }))
        },
        working: {
          today: activityBlock(response?.working?.today),
          month: activityBlock(response?.working?.month),
          year: activityBlock(response?.working?.year)
        },
        promotional: {
          year: num(response?.promotional?.year),
          month: num(response?.promotional?.month),
          gifts: num(response?.promotional?.gifts),
          expense: num(response?.promotional?.expense),
          completed: num(response?.promotional?.completed),
          draft: num(response?.promotional?.draft),
          types: list(response?.promotional?.types)
            .map((x: any) => ({ name: String(x?.name ?? ''), count: num(x?.count), expense: num(x?.expense) }))
        },
        tours: {
          month: num(response?.tours?.month), users: num(response?.tours?.users),
          approved: num(response?.tours?.approved), pending: num(response?.tours?.pending)
        },
        leaves: {
          month: num(response?.leaves?.month), pending: num(response?.leaves?.pending),
          approved: num(response?.leaves?.approved), rejected: num(response?.leaves?.rejected)
        },
        expenses: {
          monthClaims: num(response?.expenses?.month_claims), claimed: num(response?.expenses?.claimed),
          approved: num(response?.expenses?.approved), pending: num(response?.expenses?.pending)
        },
        users: list(response?.users).map((x: any): ActivityUserRow => ({
          userId: num(x?.user_id), name: String(x?.name ?? ''), designation: String(x?.designation ?? ''),
          presentDays: num(x?.present_days), leaveDays: num(x?.leave_days),
          punchOutPending: num(x?.punch_out_pending),
          lastSeen: x?.last_seen ? String(x.last_seen) : null
        }))
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
