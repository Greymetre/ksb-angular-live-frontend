import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { MainLayoutComponent } from './layout/main-layout/main-layout.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { CategoriesComponent } from './pages/categories/categories.component';
import { ProductMasterComponent } from './pages/product-master/product-master.component';
import { RolesComponent } from './pages/roles/roles.component';
import { UsersComponent } from './pages/users/users.component';
import { CustomersComponent } from './pages/customers/customers.component';
import { CustomerShowComponent } from './pages/customers/customer-show/customer-show.component';
import { LoyaltySchemesComponent } from './pages/loyalty-schemes/loyalty-schemes.component';
import { NewInvoicesComponent } from './pages/new-invoices/new-invoices.component';
import { RedemptionsComponent } from './pages/redemptions/redemptions.component';
import { MasterCrudComponent } from './pages/master-crud/master-crud.component';
import { AddressMasterComponent } from './pages/address-master/address-master.component';
import { authGuard } from './guards/auth-guard';
import { ForbiddenComponent } from './pages/forbidden/forbidden';
import { HrComponent } from './pages/hr/hr.component';
import { CityAssignmentsComponent } from './pages/city-assignments/city-assignments.component';
import { UserTargetsComponent } from './pages/user-targets/user-targets.component';
import { ExpensesTypeComponent } from './pages/expenses-type/expenses-type.component';
import { ExpensesComponent } from './pages/expenses/expenses.component';
import { OrdersComponent } from './pages/orders/orders.component';
import { BeatsComponent } from './pages/beats/beats.component';
import { CheckinReportsComponent } from './pages/checkin-reports/checkin-reports.component';
import { ReportManagementComponent } from './pages/report-management/report-management.component';
import { FieldKonnectAppSettingComponent } from './pages/field-konnect-app-setting/field-konnect-app-setting.component';
import { OrderDispatchComponent } from './pages/order-dispatch/order-dispatch.component';
import { UserMonitoringComponent } from './pages/user-monitoring/user-monitoring.component';
import { DealerSchemeComponent } from './pages/dealer-scheme/dealer-scheme.component';

const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      {
        path: 'forbidden',
        component: ForbiddenComponent
      },
      { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard], data: { permission: 'dashboard_access' } },
      { path: 'retailers', redirectTo: '/customers' },
      { path: 'retailers/create', redirectTo: '/customers' },
      { path: 'distributors', redirectTo: '/customers' },
      { path: 'categories', redirectTo: '/segments' },
      { path: 'segments', component: ProductMasterComponent, canActivate: [authGuard], data: { permission: 'category_access', productMode: 'segment' } },
      { path: 'families', component: ProductMasterComponent, canActivate: [authGuard], data: { permission: 'subcategory_access', productMode: 'family' } },
      { path: 'subcategories', redirectTo: '/families' },
      { path: 'products', component: ProductMasterComponent, canActivate: [authGuard], data: { permission: 'product_access', productMode: 'product' } },
      { path: 'roles', component: RolesComponent, canActivate: [authGuard], data: { permission: 'role_access' } },
      { path: 'users', component: UsersComponent, canActivate: [authGuard], data: { permission: 'user_access' } },
      { path: 'customers', component: CustomersComponent, canActivate: [authGuard], data: { permission: 'customer_access' } },
      { path: 'reports/customer-master', component: CustomersComponent, canActivate: [authGuard], data: { permission: 'customers_report' } },
      { path: 'customers/:id', component: CustomerShowComponent, canActivate: [authGuard], data: { permission: 'customer_access' } },
      { path: 'new-invoices', component: NewInvoicesComponent, canActivate: [authGuard], data: { permission: 'new_invoice_access' } },
      { path: 'new-invoices/:id', component: NewInvoicesComponent, canActivate: [authGuard], data: { permission: 'new_invoice_access' } },
      // Scheme management stays behind scheme_access_list. Dealers read their own
      // schemes through /dealer/schemes/:id instead of this admin screen.
      { path: 'loyalty-schemes', component: LoyaltySchemesComponent, canActivate: [authGuard], data: { permission: 'scheme_access_list' } },
      // Dealer-only read view of a scheme, reached from the dashboard slider.
      { path: 'dealer/schemes/:id', component: DealerSchemeComponent, canActivate: [authGuard], data: { permission: 'dashboard_access' } },
      { path: 'redemptions', component: RedemptionsComponent, canActivate: [authGuard], data: { permission: 'redemption_access' } },
      { path: 'orders', component: OrdersComponent, canActivate: [authGuard], data: { permission: 'order_access' } },
      { path: 'orders/:id/dispatch/:mode', component: OrderDispatchComponent, canActivate: [authGuard], data: { permission: 'order_dispatch' } },
      { path: 'order-dispatch/:mode', component: OrderDispatchComponent, canActivate: [authGuard], data: { permission: 'sale_access' } },
      { path: 'beats', component: BeatsComponent, canActivate: [authGuard], data: { permission: 'beat_access' } },
      { path: 'beat-details', component: BeatsComponent, canActivate: [authGuard], data: { permission: 'beatdetail_access' } },
      { path: 'checkin-checkout', component: CheckinReportsComponent, canActivate: [authGuard], data: { permission: 'checkin_access' } },
      { path: 'checkin-checkout-report', component: CheckinReportsComponent, canActivate: [authGuard], data: { permission: 'visit_report' } },
      { path: 'reports/asr-performance', component: ReportManagementComponent, canActivate: [authGuard], data: { permission: 'ASR_report_Download', reportMode: 'asr' } },
      { path: 'reports/rating-report', component: ReportManagementComponent, canActivate: [authGuard], data: { permission: 'asm_rating_report', reportMode: 'rating' } },
      { path: 'reports/activity-reports', component: ReportManagementComponent, canActivate: [authGuard], data: { permission: 'activity_report_access', reportMode: 'activity' } },
      { path: 'reports/retailer-performance', component: ReportManagementComponent, canActivate: [authGuard], data: { permission: 'retailer_productivity_report', reportMode: 'retailer' } },
      { path: 'reports/dealer-performance', component: ReportManagementComponent, canActivate: [authGuard], data: { permission: 'retailer_productivity_report', reportMode: 'dealer' } },
      { path: 'reports/market-intelligence', component: ReportManagementComponent, canActivate: [authGuard], data: { permission: 'market_intelligence_access', reportMode: 'market' } },
      { path: 'field-konnect-app-setting', component: FieldKonnectAppSettingComponent, canActivate: [authGuard], data: { permission: 'loyalty_app_setting_access' } },
      { path: 'user-app-details', component: UserMonitoringComponent, canActivate: [authGuard], data: { permission: 'user_app_details_access', mode: 'apps' } },
      { path: 'user-live-activity', component: UserMonitoringComponent, canActivate: [authGuard], data: { permission: 'user_location', mode: 'live' } },
      {
        path: 'holidays',
        component: HrComponent,
        canActivate: [authGuard],
        data: {
          permission: 'holiday_access',
          hrConfig: { mode: 'holidays', title: 'Holidays', icon: 'holiday_village', path: 'holidays', key: 'holidays', exportPath: 'holidays/export', fileName: 'holidays.xlsx' }
        }
      },
      {
        path: 'leaves',
        component: HrComponent,
        canActivate: [authGuard],
        data: {
          permission: 'leave_access',
          hrConfig: { mode: 'leaves', title: 'Leaves', icon: 'energy_savings_leaf', path: 'leaves', key: 'leaves', exportPath: 'leaves/export', fileName: 'leaves.xlsx' }
        }
      },
      {
        path: 'tours',
        component: HrComponent,
        canActivate: [authGuard],
        data: {
          permission: 'tours',
          hrConfig: { mode: 'tours', title: 'Tours', icon: 'tour', path: 'tours', key: 'tours', exportPath: 'tours/export', fileName: 'tours.xlsx' }
        }
      },
      {
        path: 'attendance-details',
        component: HrComponent,
        canActivate: [authGuard],
        data: {
          permission: 'attendance_report',
          hrConfig: { mode: 'attendance-details', title: 'Attendance Details', icon: 'report', path: 'attendances', key: 'attendances', exportPath: 'attendances/export', fileName: 'attendancereports.xlsx' }
        }
      },
      {
        path: 'attendance-summary',
        component: HrComponent,
        canActivate: [authGuard],
        data: {
          permission: 'attendance_summary_report',
          hrConfig: { mode: 'attendance-summary', title: 'Attendance Summary', icon: 'summarize', path: 'attendance-summary', key: 'summary', exportPath: 'attendance-summary/export', fileName: 'attendance-summary.xlsx' }
        }
      },
      {
        path: 'countries',
        component: AddressMasterComponent,
        canActivate: [authGuard],
        data: {
          permission: 'country_access',
          addressConfig: {
            title: 'CountryList',
            singular: 'Country',
            icon: 'flag_circle',
            permissionPrefix: 'country',
            path: 'countries',
            listKey: 'countries',
            itemKey: 'country',
            nameField: 'countryName',
            nameLabel: 'Country Name',
            fileName: 'countrys.xlsx'
          }
        }
      },
      {
        path: 'states',
        component: AddressMasterComponent,
        canActivate: [authGuard],
        data: {
          permission: 'state_access',
          addressConfig: {
            title: 'StateList',
            singular: 'State',
            icon: 'location_city',
            permissionPrefix: 'state',
            path: 'states',
            listKey: 'states',
            itemKey: 'state',
            nameField: 'stateName',
            nameLabel: 'State Name',
            fileName: 'states.xlsx',
            hasGstCode: true,
            parent: {
              field: 'countryId',
              label: 'Country',
              path: 'getcountry',
              key: 'countries',
              display: 'countryName'
            }
          }
        }
      },
      {
        path: 'districts',
        component: AddressMasterComponent,
        canActivate: [authGuard],
        data: {
          permission: 'district_access',
          addressConfig: {
            title: 'DistrictList',
            singular: 'District',
            icon: 'balcony',
            permissionPrefix: 'district',
            path: 'districts',
            listKey: 'districts',
            itemKey: 'district',
            nameField: 'districtName',
            nameLabel: 'District Name',
            fileName: 'districts.xlsx',
            parent: {
              field: 'stateId',
              label: 'State',
              path: 'getstate',
              key: 'states',
              display: 'stateName'
            }
          }
        }
      },
      {
        path: 'cities',
        component: AddressMasterComponent,
        canActivate: [authGuard],
        data: {
          permission: 'city_access',
          addressConfig: {
            title: 'CityList',
            singular: 'City',
            icon: 'apartment',
            permissionPrefix: 'city',
            path: 'cities',
            listKey: 'cities',
            itemKey: 'city',
            nameField: 'cityName',
            nameLabel: 'City Name',
            fileName: 'cities.xlsx',
            parent: {
              field: 'districtId',
              label: 'District',
              path: 'getdistrict',
              key: 'districts',
              display: 'districtName'
            }
          }
        }
      },
      {
        path: 'pincodes',
        component: AddressMasterComponent,
        canActivate: [authGuard],
        data: {
          permission: 'pincode_access',
          addressConfig: {
            title: 'PincodeList',
            singular: 'Pincode',
            icon: 'cabin',
            permissionPrefix: 'pincode',
            path: 'pincodes',
            listKey: 'pincodes',
            itemKey: 'pincode',
            nameField: 'pincode',
            nameLabel: 'Pincode',
            fileName: 'pincodes.xlsx',
            parent: {
              field: 'cityId',
              label: 'City',
              path: 'getcity',
              key: 'cities',
              display: 'cityName'
            }
          }
        }
      },
      { path: 'city-assignments', component: CityAssignmentsComponent, canActivate: [authGuard], data: { permission: 'city_assigned' } },
      { path: 'user-targets', component: UserTargetsComponent, canActivate: [authGuard], data: { permission: 'target_access' } },
      { path: 'expenses-types', component: ExpensesTypeComponent, canActivate: [authGuard], data: { permission: 'expenses_type' } },
      { path: 'expenses', component: ExpensesComponent, canActivate: [authGuard], data: { permission: 'expense_access' } },
      {
        path: 'branches',
        component: MasterCrudComponent,
        canActivate: [authGuard],
        data: {
          masterConfig: {
            title: 'BranchList',
            singular: 'Branch',
            icon: 'holiday_village',
            permission: 'branch',
            exportPermission: 'branch_report_download',
            path: 'branches',
            listKey: 'branches',
            itemKey: 'branch',
            nameField: 'branchName',
            nameLabel: 'Branch Name',
            fileName: 'branch.xlsx',
            hasBranchCode: true
          }
        }
      },
      {
        path: 'divisions',
        component: MasterCrudComponent,
        canActivate: [authGuard],
        data: {
          masterConfig: {
            title: 'Zone List',
            singular: 'Zone',
            icon: 'safety_divider',
            permission: 'division',
            exportPermission: 'division_report_download',
            path: 'divisions',
            listKey: 'divisions',
            itemKey: 'division',
            nameField: 'divisionName',
            nameLabel: 'Zone Name',
            fileName: 'zones.xlsx'
          }
        }
      },
      {
        path: 'designations',
        component: MasterCrudComponent,
        canActivate: [authGuard],
        data: {
          masterConfig: {
            title: 'DesignationList',
            singular: 'Designation',
            icon: 'shopping_bag',
            permission: 'designation',
            path: 'designations',
            listKey: 'designations',
            itemKey: 'designation',
            nameField: 'designationName',
            nameLabel: 'Designation Name',
            fileName: 'designations.xlsx'
          }
        }
      },
      {
        path: 'departments',
        component: MasterCrudComponent,
        canActivate: [authGuard],
        data: {
          masterConfig: {
            title: 'DepartmentList',
            singular: 'Department',
            icon: 'local_fire_department',
            permission: 'departments',
            exportPermission: 'department_report_download',
            path: 'departments',
            listKey: 'departments',
            itemKey: 'department',
            nameField: 'name',
            nameLabel: 'Department Name',
            fileName: 'departments.xlsx'
          }
        }
      },
      { path: '**', redirectTo: '/dashboard' }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
