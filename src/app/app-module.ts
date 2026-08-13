import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';

// Shared Components
import { HeaderComponent } from './shared/components/header/header.component';
import { SidebarComponent } from './shared/components/sidebar/sidebar.component';
import { SearchableSelectComponent } from './shared/components/searchable-select/searchable-select.component';
import { PaginationComponent } from './shared/components/pagination/pagination.component';
import { FirstCapsPipe } from './shared/pipes/first-caps.pipe';

// Layout
import { MainLayoutComponent } from './layout/main-layout/main-layout.component';

// Pages
import { LoginComponent } from './pages/login/login.component';
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

@NgModule({
  declarations: [
    App,
    HeaderComponent,
    SidebarComponent,
    SearchableSelectComponent,
    PaginationComponent,
    FirstCapsPipe,
    MainLayoutComponent,
    LoginComponent,
    DashboardComponent,
    CategoriesComponent,
    ProductMasterComponent,
    RolesComponent,
    UsersComponent,
    CustomersComponent,
    CustomerShowComponent,
    LoyaltySchemesComponent,
    NewInvoicesComponent,
    RedemptionsComponent,
    MasterCrudComponent,
    AddressMasterComponent,
    ForbiddenComponent,
    HrComponent,
    CityAssignmentsComponent,
    UserTargetsComponent,
    ExpensesTypeComponent,
    ExpensesComponent,
    OrdersComponent,
    BeatsComponent,
    CheckinReportsComponent,
    ReportManagementComponent,
    FieldKonnectAppSettingComponent,
    OrderDispatchComponent,
    UserMonitoringComponent,
  ],
  imports: [BrowserModule, CommonModule, FormsModule, ReactiveFormsModule, AppRoutingModule],
  providers: [provideHttpClient()],
  bootstrap: [App],
})
export class AppModule {}
