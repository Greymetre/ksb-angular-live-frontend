import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { MainLayoutComponent } from './layout/main-layout/main-layout.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { CategoriesComponent } from './pages/categories/categories.component';
import { ProductMasterComponent } from './pages/product-master/product-master.component';
import { RolesComponent } from './pages/roles/roles.component';
import { RoleEditorComponent } from './pages/role-editor/role-editor.component';
import { UsersComponent } from './pages/users/users.component';
import { CustomersComponent } from './pages/customers/customers.component';
import { CustomerShowComponent } from './pages/customers/customer-show/customer-show.component';
import { CustomerKycComponent } from './pages/customer-kyc/customer-kyc.component';
import { LoyaltySchemesComponent } from './pages/loyalty-schemes/loyalty-schemes.component';
import { NewInvoicesComponent } from './pages/new-invoices/new-invoices.component';
import { RedemptionsComponent } from './pages/redemptions/redemptions.component';
import { MasterCrudComponent } from './pages/master-crud/master-crud.component';
import { AddressMasterComponent } from './pages/address-master/address-master.component';
import { authGuard } from './guards/auth-guard';
import { ForbiddenComponent } from './pages/forbidden/forbidden';
import { ProfileComponent } from './pages/profile/profile.component';
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
      { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard], data: { permission: 'dashboard.view' } },
      // Own profile - every signed-in role reaches it from the header menu, so no permission gate.
      { path: 'profile', component: ProfileComponent, canActivate: [authGuard] },
      { path: 'retailers', redirectTo: '/customers' },
      { path: 'retailers/create', redirectTo: '/customers' },
      { path: 'distributors', redirectTo: '/customers' },
      { path: 'categories', redirectTo: '/segments' },
      { path: 'segments', component: ProductMasterComponent, canActivate: [authGuard], data: { permission: 'segment.view', productMode: 'segment' } },
      { path: 'families', component: ProductMasterComponent, canActivate: [authGuard], data: { permission: 'family.view', productMode: 'family' } },
      { path: 'subcategories', redirectTo: '/families' },
      { path: 'products', component: ProductMasterComponent, canActivate: [authGuard], data: { permission: 'product.view', productMode: 'product' } },
      { path: 'roles', component: RolesComponent, canActivate: [authGuard], data: { permission: 'role.view' } },
      { path: 'roles/new', component: RoleEditorComponent, canActivate: [authGuard], data: { permission: 'role.create' } },
      { path: 'roles/:id/edit', component: RoleEditorComponent, canActivate: [authGuard], data: { permission: 'role.edit' } },
      { path: 'users', component: UsersComponent, canActivate: [authGuard], data: { permission: 'user.view' } },
      { path: 'customers', component: CustomersComponent, canActivate: [authGuard], data: { permission: 'customer.view' } },
      { path: 'reports/customer-master', component: CustomersComponent, canActivate: [authGuard], data: { permission: 'customer.export' } },
      // KYC is a sibling menu of the customer list, not a customer route: /customers/:id
      // would swallow it as an id.
      { path: 'customer-kyc', component: CustomerKycComponent, canActivate: [authGuard], data: { permission: 'customer_kyc.view' } },
      { path: 'customers/:id', component: CustomerShowComponent, canActivate: [authGuard], data: { permission: 'customer.view' } },
      { path: 'new-invoices', component: NewInvoicesComponent, canActivate: [authGuard], data: { permission: 'invoice_transaction.view' } },
      { path: 'new-invoices/:id', component: NewInvoicesComponent, canActivate: [authGuard], data: { permission: 'invoice_transaction.detail' } },
      // Scheme management stays behind scheme_access_list. Dealers read their own
      // schemes through /dealer/schemes/:id instead of this admin screen.
      { path: 'loyalty-schemes', component: LoyaltySchemesComponent, canActivate: [authGuard], data: { permission: 'scheme.view' } },
      // Dealer-only read view of a scheme, reached from the dashboard slider.
      { path: 'dealer/schemes/:id', component: DealerSchemeComponent, canActivate: [authGuard], data: { permission: 'dashboard.view' } },
      { path: 'redemptions', component: RedemptionsComponent, canActivate: [authGuard], data: { permission: 'redemption.view' } },
      { path: 'orders', component: OrdersComponent, canActivate: [authGuard], data: { permission: 'order.view' } },
      { path: 'orders/:id/dispatch/:mode', component: OrderDispatchComponent, canActivate: [authGuard], data: { permission: 'order.dispatch' } },
      { path: 'order-dispatch/:mode', component: OrderDispatchComponent, canActivate: [authGuard], data: { permission: 'order_dispatch.view' } },
      { path: 'beats', component: BeatsComponent, canActivate: [authGuard], data: { permission: 'beat.view' } },
      { path: 'beat-details', component: BeatsComponent, canActivate: [authGuard], data: { permission: 'beat_detail.view' } },
      { path: 'checkin-checkout', component: CheckinReportsComponent, canActivate: [authGuard], data: { permission: 'checkin.view' } },
      { path: 'checkin-checkout-report', component: CheckinReportsComponent, canActivate: [authGuard], data: { permission: 'visit_report.view' } },
      { path: 'reports/asr-performance', component: ReportManagementComponent, canActivate: [authGuard], data: { permission: 'asr_performance_report.export', reportMode: 'asr' } },
      { path: 'reports/rating-report', component: ReportManagementComponent, canActivate: [authGuard], data: { permission: 'rating_report.view', reportMode: 'rating' } },
      { path: 'reports/activity-reports', component: ReportManagementComponent, canActivate: [authGuard], data: { permission: 'activity_report.view', reportMode: 'activity' } },
      { path: 'reports/retailer-performance', component: ReportManagementComponent, canActivate: [authGuard], data: { permission: 'retailer_performance_report.export', reportMode: 'retailer' } },
      { path: 'reports/dealer-performance', component: ReportManagementComponent, canActivate: [authGuard], data: { permission: 'retailer_performance_report.export', reportMode: 'dealer' } },
      { path: 'reports/market-intelligence', component: ReportManagementComponent, canActivate: [authGuard], data: { permission: 'market_intelligence_report.view', reportMode: 'market' } },
      { path: 'field-konnect-app-setting', component: FieldKonnectAppSettingComponent, canActivate: [authGuard], data: { permission: 'app_setting.view' } },
      { path: 'user-app-details', component: UserMonitoringComponent, canActivate: [authGuard], data: { permission: 'user_app.view', mode: 'apps' } },
      { path: 'user-live-activity', component: UserMonitoringComponent, canActivate: [authGuard], data: { permission: 'user_activity.view', mode: 'live' } },
      {
        path: 'holidays',
        component: HrComponent,
        canActivate: [authGuard],
        data: {
          permission: 'holiday.view',
          hrConfig: { mode: 'holidays', title: 'Holidays', icon: 'holiday_village', path: 'holidays', key: 'holidays', exportPath: 'holidays/export', fileName: 'holidays.xlsx' }
        }
      },
      {
        path: 'leaves',
        component: HrComponent,
        canActivate: [authGuard],
        data: {
          permission: 'leave.view',
          hrConfig: { mode: 'leaves', title: 'Leaves', icon: 'energy_savings_leaf', path: 'leaves', key: 'leaves', exportPath: 'leaves/export', fileName: 'leaves.xlsx' }
        }
      },
      {
        path: 'tours',
        component: HrComponent,
        canActivate: [authGuard],
        data: {
          permission: 'tour.view',
          hrConfig: { mode: 'tours', title: 'Tours', icon: 'tour', path: 'tours', key: 'tours', exportPath: 'tours/export', fileName: 'tours.xlsx' }
        }
      },
      {
        path: 'attendance-details',
        component: HrComponent,
        canActivate: [authGuard],
        data: {
          permission: 'attendance.view',
          hrConfig: { mode: 'attendance-details', title: 'Attendance Details', icon: 'report', path: 'attendances', key: 'attendances', exportPath: 'attendances/export', fileName: 'attendancereports.xlsx' }
        }
      },
      {
        path: 'attendance-summary',
        component: HrComponent,
        canActivate: [authGuard],
        data: {
          permission: 'attendance_summary.view',
          hrConfig: { mode: 'attendance-summary', title: 'Attendance Summary', icon: 'summarize', path: 'attendance-summary', key: 'summary', exportPath: 'attendance-summary/export', fileName: 'attendance-summary.xlsx' }
        }
      },
      {
        path: 'countries',
        component: AddressMasterComponent,
        canActivate: [authGuard],
        data: {
          permission: 'country.view',
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
          permission: 'state.view',
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
          permission: 'district.view',
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
          permission: 'city.view',
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
          permission: 'pincode.view',
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
      { path: 'city-assignments', component: CityAssignmentsComponent, canActivate: [authGuard], data: { permission: 'city_assignment.view' } },
      { path: 'user-targets', component: UserTargetsComponent, canActivate: [authGuard], data: { permission: 'user_target.view' } },
      { path: 'expenses-types', component: ExpensesTypeComponent, canActivate: [authGuard], data: { permission: 'expense_type.view' } },
      { path: 'expenses', component: ExpensesComponent, canActivate: [authGuard], data: { permission: 'expense.view' } },
      {
        path: 'branches',
        component: MasterCrudComponent,
        canActivate: [authGuard],
        data: {
          masterConfig: {
            title: 'BranchList',
            singular: 'Branch',
            icon: 'holiday_village',
            permission: 'branch.view',
            exportPermission: 'branch.export',
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
            permission: 'zone.view',
            exportPermission: 'zone.export',
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
            permission: 'designation.view',
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
            permission: 'department.view',
            exportPermission: 'department.export',
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
