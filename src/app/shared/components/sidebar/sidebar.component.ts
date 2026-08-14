import { Component, EventEmitter, Output } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

interface MenuItem {
  label: string;
  icon: string;
  route?: string;
  permission?: string;
  permissions?: string[];
  children?: MenuItem[];
  expanded?: boolean;
}

@Component({
  standalone: false,
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {
  @Output() collapsedChange = new EventEmitter<boolean>();

  collapsed = true;
  hoverExpanded = false;
  tooltipLabel = '';
  tooltipTop = 0;

  private readonly allMenuItems: MenuItem[] = [

    { label: 'Dashboard', icon: 'transcribe', route: '/dashboard', permission: 'dashboard_access' },

    // {
    //   label: 'Lead Management',
    //   icon: 'leaderboard',
    //   permission: 'lead_management_access',
    //   children: [
    //     { label: 'Leads', icon: 'diamond', permission: 'lead_access' },
    //     { label: 'Contacts', icon: 'diamond', permission: 'lead_access' },
    //     { label: 'Opportunities', icon: 'diamond', permission: 'lead_access' },
    //     { label: 'Opportunities Status', icon: 'diamond', permission: 'opportunities_status_access' },
    //     { label: 'Tasks', icon: 'diamond', permission: 'lead_access' },
    //     { label: 'Visit Report', icon: 'diamond', permission: 'lead_visit_access' }
    //   ]
    // },
    // {
    //   label: 'Customer Management',
    //   icon: 'store',
    //   children: [
    //   ]
    // },
    { label: 'Customers Management', icon: 'transcribe', route: '/customers', permission: 'customer_access' },
    {
      label: 'Address Management',
      icon: 'contact_mail',
      permission: 'country_access',
      children: [
        { label: 'Country', icon: 'flag_circle', route: '/countries', permission: 'country_access' },
        { label: 'State', icon: 'location_city', route: '/states', permission: 'state_access' },
        { label: 'District', icon: 'balcony', route: '/districts', permission: 'district_access' },
        { label: 'City', icon: 'apartment', route: '/cities', permission: 'city_access' },
        { label: 'Pincode', icon: 'cabin', route: '/pincodes', permission: 'pincode_access' },
        { label: 'City Assigned', icon: 'location_city', route: '/city-assignments', permission: 'city_assigned' }
      ]
    },

    {
      label: 'Product Management',
      icon: 'conveyor_belt',
      permission: 'product_access',
      children: [
        { label: 'Segment', icon: 'category', route: '/segments', permission: 'category_access' },
        { label: 'Family', icon: 'account_tree', route: '/families', permission: 'subcategory_access' },
        // { label: 'Makers', icon: 'branding_watermark', permission: 'brand_access' },
        { label: 'Products', icon: 'widgets', route: '/products', permission: 'product_access' },
        // { label: 'Units', icon: 'apartment', permission: 'unit_access' },
        // { label: 'Stock', icon: 'donut_small', permission: 'stock_access' },
        // { label: 'SAP Stock', icon: 'donut_small', permission: 'sap_stock_access' },
        // { label: 'Opening Stock', icon: 'donut_small', permission: 'opening_stock_view' },
        // { label: 'Branch Opening Quantity', icon: 'donut_small', permission: 'branch_opening_qty_view' },
        // { label: 'Ware House', icon: 'warehouse', permission: 'ware_house_access' }
      ]
    },
    // {
    //   label: 'Forecast',
    //   icon: 'online_prediction',
    //   permission: 'forecast_access',
    //   children: [
    //     { label: 'Planned S&OP', icon: 'warehouse', permission: 'forecast_access' },
    //     { label: 'S&OP Forecast', icon: 'warehouse', permission: 'planned_forecast' }
    //   ]
    // },
    // { label: 'Dealer Product', icon: 'flaky', permission: 'dealer_product_access' },
    // {
    //   label: 'Sales Users',
    //   icon: 'real_estate_agent',
    //   permission: 'target_users_access',
    //   children: [
    //     { label: 'Sales Users', icon: 'emoji_events', permission: 'target_users_access_sales' },
    //     { label: 'Dealer distributor target vs achievement', icon: 'school', permission: 'sales_target_dealers_access' },
    //     { label: 'Branch Wise Sales Target', icon: 'holiday_village', permission: 'branch_wise_sales_target_access' },
    //     { label: 'Primary Scheme', icon: 'holiday_village', permission: 'primary_scheme' },
    //     { label: 'Primary Scheme Report', icon: 'holiday_village', permission: 'primary_scheme_report' }
    //   ]
    // },
    // { label: 'Tasks Managment', icon: 'check_circle', permission: 'tasks_access' },
    {
      label: 'HR Management',
      icon: 'family_restroom',
      permission: 'hr_access',
      children: [
        { label: 'Attendance Details', icon: 'report', route: '/attendance-details', permission: 'attendance_report' },
        { label: 'Attendance Summary', icon: 'summarize', route: '/attendance-summary', permission: 'attendance_summary_report' },
        { label: 'Holidays', icon: 'holiday_village', route: '/holidays', permission: 'holiday_access' },
        { label: 'Leaves', icon: 'energy_savings_leaf', route: '/leaves', permission: 'leave_access' },
        // { label: 'Resignation', icon: 'outgoing_mail', permission: 'resignation_access' },
        // { label: 'Appraisal(PMS)', icon: 'verified_user', permission: 'appraisal_pms' },
        // { label: 'Sales Weightage', icon: 'checkroom', permission: 'sales_weightage' },
        { label: 'Branch', icon: 'meeting_room', route: '/branches', permission: 'branch' },
        { label: 'Zone', icon: 'safety_divider', route: '/divisions', permission: 'division' },
        { label: 'Designation', icon: 'shopping_bag', route: '/designations', permission: 'designation' },
        { label: 'Departments', icon: 'local_fire_department', route: '/departments', permission: 'departments' }
      ]
    },
    {
      label: 'User Management',
      icon: 'badge',
      permission: 'user_access',
      children: [
        { label: 'User Details', icon: 'assignment_ind', route: '/users', permission: 'user_access' },
        { label: 'User App details', icon: 'details', route: '/user-app-details', permission: 'user_app_details_access' },
        { label: 'User Target', icon: 'loupe', route: '/user-targets', permission: 'target_access' },
        { label: 'User Live Activity', icon: 'share_location', route: '/user-live-activity', permission: 'user_location' },
        { label: 'Tours', icon: 'tour', route: '/tours', permission: 'tours' },
      ]
    },
    {
      label: 'Account Management',
      icon: 'attribution',
      permission: 'account_access',
      children: [
        { label: 'Expenses Type', icon: 'dashboard', route: '/expenses-types', permission: 'expenses_type' },
        { label: 'Expense', icon: 'outlet', route: '/expenses', permission: 'expense_access' },
        // { label: 'Dealer Outstanding', icon: 'nature_people', permission: 'customer_outstanting' },
        // { label: 'Dealer Account Statement', icon: 'request_page', permission: 'dealer_account_statement' },
        // { label: 'Estimate', icon: 'request_quote', permission: 'estimate_access' },
        // { label: 'Invoice', icon: 'receipt_long', permission: 'invoice_access' },
        // {
        //   label: 'Payments',
        //   icon: 'paid',
        //   permission: 'payments_access',
        //   children: [
        //     { label: 'Payment Recieved', icon: 'currency_exchange', permission: 'payments_create' },
        //     { label: 'Payments', icon: 'currency_rupee', permission: 'payments_access' }
        //   ]
        // }
      ]
    },
    // {
    //   label: 'Services',
    //   icon: 'design_services',
    //   permission: 'services_access',
    //   children: [
    //     { label: 'Serial Number Transaction', icon: 'receipt_long', permission: 'serial_number_transaction' },
    //     { label: 'Serial Number History', icon: 'history', permission: 'serial_number_history' },
    //     { label: 'Complaint Type', icon: 'mark_email_read', permission: 'complaint_type_access' },
    //     { label: 'Complaint', icon: 'checklist', permission: 'complaint_access' },
    //     { label: 'Service Bill', icon: 'account_balance_wallet', permission: 'service_bill_access' },
    //     { label: 'Service Bills Complaints Type', icon: 'account_balance_wallet', permission: 'service_bill_type_access' },
    //     { label: 'Claim Generation', icon: 'account_balance_wallet', permission: 'claim_generation_access' },
    //     {
    //       label: 'Service Charge Products',
    //       icon: 'home_repair_service',
    //       permission: 'services_product_access',
    //       children: [
    //         { label: 'Division', icon: 'receipt_long', permission: 'services_product_division' },
    //         { label: 'Categories', icon: 'category', permission: 'services_product_category' },
    //         { label: 'Products', icon: 'storefront', permission: 'services_product_products' },
    //         { label: 'Charge Type', icon: 'power', permission: 'services_product_chargetype' }
    //       ]
    //     },
    //     { label: 'Warranty Activation', icon: 'history', permission: 'warranty_activation_access' },
    //     { label: 'End Users', icon: 'group', permission: 'end_user_access' }
    //   ]
    // },
    {
      label: 'Order Management',
      icon: 'star',
      permission: 'order_access',
      children: [
        { label: 'Orders', icon: 'shopping_bag', route: '/orders', permission: 'order_access' },
        // { label: 'Order Schemes', icon: 'flaky', permission: 'orderscheme' },
        { label: 'Order Dispatch', icon: 'shopping_cart', permission: 'sale_access', children: [
          { label: 'Fully Dispatched', icon: 'local_shipping', route: '/order-dispatch/full', permission: 'sale_access' },
          { label: 'Partially Dispatched', icon: 'pending_actions', route: '/order-dispatch/partial', permission: 'sale_access' },
          { label: 'Cancelled Orders', icon: 'cancel', route: '/order-dispatch/cancelled', permission: 'sale_access' }
        ] }
      ]
    },
    // {
    //   label: 'Marketing',
    //   icon: 'local_convenience_store',
    //   permission: 'marketing_access',
    //   children: [
    //     { label: 'Marketing Master', icon: 'add_business', permission: 'marketing_master_access' },
    //     { label: 'New Dealer/Distributor', icon: 'flaky', permission: 'marketing_new_dealer_access' },
    //     { label: 'MSP Activity', icon: 'celebration', permission: 'msp_activity_access' }
    //   ]
    // },
    {
      label: 'Loyalty Management',
      icon: 'card_membership',
      permission: 'scheme_access',
      children: [
        { label: 'Invoices Transaction', icon: 'receipt_long', route: '/new-invoices', permission: 'new_invoice_access' },
        { label: 'Scheme Creation', icon: 'create', route: '/loyalty-schemes', permission: 'scheme_access_list' },
        // { label: 'Transaction Coupon History', icon: 'history', permission: 'transaction_history_access' },
        // { label: 'Mobile App Users', icon: 'developer_mode', permission: 'loyalty_mobile_app_users_access' },
        // { label: 'Damage QR Entries', icon: 'insert_page_break', permission: 'damage_entry_access' },
        { label: 'Redemption', icon: 'payments', route: '/redemptions', permission: 'redemption_access' },
        // { label: 'Gift Catalogue', icon: 'model_training', permission: 'gift_access' },
        // { label: 'Gift Categories', icon: 'redeem', permission: 'gift_category_access' },
        // { label: 'Gift Sub Categories', icon: 'redeem', permission: 'gift_subcategory_access' },
        // { label: 'Gift Model', icon: 'redeem', permission: 'gift_model_access' },
        // { label: 'Gift Brand', icon: 'redeem', permission: 'gift_brand_access' },
        // { label: 'Customer KYC', icon: 'verified', permission: 'customer_kyc_access' }
      ]
    },
    {
      label: 'Setting Management',
      icon: 'settings',
      permission: 'status_access',
      children: [
        // { label: 'Power BI Setting', icon: 'analytics', permission: 'power_bi_setting_access' },
        // { label: 'Invoice Setting', icon: 'settings', permission: 'invoice_setting_access' },
        { label: 'Loyalty App Setting', icon: 'manage_accounts', permission: 'loyalty_app_setting_access' },
        { label: 'FieldKonnect App Setting', icon: 'admin_panel_settings', route: '/field-konnect-app-setting', permission: 'loyalty_app_setting_access' },
        { label: 'Dealer portal Setting', icon: 'settings_applications', permission: 'dealer_portal_setting_access' },
        // { label: 'Status', icon: 'format_paint', permission: 'status_access' },
        { label: 'Roles', icon: 'vertical_shades_closed', route: '/roles', permission: 'role_access' },
        // { label: 'Permissions', icon: 'workspace_premium', permission: 'permission_access' }
      ]
    },
    // {
    //   label: 'Support Master',
    //   icon: 'houseboat',
    //   permission: 'supports_access',
    //   children: [
    //     { label: 'Support', icon: 'kitesurfing', permission: 'supports_access' }
    //   ]
    // },
    {
      label: 'Beats Management',
      icon: 'houseboat',
      permissions: ['visitreport_access', 'beat_access'],
      children: [
        { label: 'Beats', icon: 'kitesurfing', route: '/beats', permission: 'beat_access' },
        { label: 'Beat Detail', icon: 'waves', route: '/beat-details', permission: 'beatdetail_access' },
        { label: 'Checkin-Checkout', icon: 'assignment_turned_in', route: '/checkin-checkout', permission: 'checkin_access' },
        // { label: 'Visit Report', icon: 'summarize', permission: 'visitreport_access' },
        // { label: 'Visit Type', icon: 'border_color', permission: 'visittype_access' },
        // { label: 'Master VisitReport', icon: 'store', permission: 'visitreport_access' },
        // { label: 'Beat Adherence', icon: 'vrpano', permission: 'adherence_report' },
        // { label: 'Adherence Summary', icon: 'summarize', permission: 'summary_report' }
      ]
    },
    {
      label: 'Reports Management',
      icon: 'airplay',
      permissions: ['reports', 'activity_report_access'],
      children: [
        {
          label: 'User',
          icon: 'point_of_sale',
          permissions: ['reports_sale', 'activity_report_access'],
          children: [
            { label: 'Attendance Detail', icon: 'report', route: '/attendance-details', permission: 'attendance_report' },
            { label: 'Attendance Summary', icon: 'summarize', route: '/attendance-summary', permission: 'attendance_summary_report' },
            { label: 'Tours', icon: 'tour', route: '/tours', permission: 'tours' },
            { label: 'Orders', icon: 'shopping_bag', route: '/orders', permission: 'order_access' },
            { label: 'Check In & Check Out', icon: 'dashboard_customize', route: '/checkin-checkout-report', permission: 'visit_report' },
            { label: 'ASR Performance', icon: 'summarize', route: '/reports/asr-performance', permission: 'ASR_report_Download' },
            { label: 'Rating Report', icon: 'trending_down', route: '/reports/rating-report', permission: 'asm_rating_report' },
            { label: 'Activity Reports', icon: 'campaign', route: '/reports/activity-reports', permission: 'activity_report_access' },
            // { label: 'User working report', icon: 'hub', permission: 'user_working_report' },
            // { label: 'FOS Rating Report', icon: 'trending_down', permission: 'fos_rating_report' },
            // { label: 'Primary Sales', icon: 'stay_primary_landscape', permission: 'dashboard_primary_sales_access' },
            // { label: 'Secondary Sales', icon: 'cases', permission: 'dashboard_secondary_sales_access' },
            // { label: 'Product Analysis Branch', icon: 'add_chart', permission: 'product_analysis_branch_access' },
            // { label: 'Product Analysis Qty', icon: 'insert_chart', permission: 'product_analysis_qty_access' },
            // { label: 'Product Analysis Value', icon: 'add_chart', permission: 'product_analysis_value_access' },
            // { label: 'Group Wise Analysis', icon: 'query_stats', permission: 'group_wise_analysis_access' },
            // { label: 'Per Employee Costing', icon: 'temple_buddhist', permission: 'per_employee_costing_access' },
            // { label: 'Top Dealer', icon: 'lightbulb_circle', permission: 'top_dealer_access' },
            // { label: 'Dealer Growth', icon: 'diversity_2', permission: 'dealer_growth_access' },
            // { label: 'New Dealer Sale', icon: 'expand', permission: 'new_dealer_sale_access' },
            // { label: 'User Incentive', icon: 'biotech', permission: 'user_incentive_access' }
          ]
        },
        {
          label: 'Customers',
          icon: 'support_agent',
          permission: 'customers_report_access',
          children: [
            { label: 'Retailer Performance', icon: 'summarize', route: '/reports/retailer-performance', permission: 'retailer_productivity_report' },
            { label: 'Dealer Performance', icon: 'summarize', route: '/reports/dealer-performance', permission: 'retailer_productivity_report' },
            { label: 'Customer Master', icon: 'contact_emergency', route: '/reports/customer-master', permission: 'customers_report' },
            // { label: 'Calling Report', icon: 'dialpad', permission: 'calling_report' },
            { label: 'Market Intelligence', icon: 'nature_people', route: '/reports/market-intelligence', permission: 'market_intelligence_access' }
          ]
        },
        // {
        //   label: 'Legacy Reports',
        //   icon: 'store',
        //   children: [
        //     { label: 'Field Activity Report', icon: 'store', permission: 'fielda_ctivity_report' },
        //     { label: 'Tour Programme Report', icon: 'store', permission: 'tour_programme_report' },
        //     { label: 'Monthly Movement Report', icon: 'store', permission: 'monthly_movement_report' },
        //     { label: 'Point Collections Report', icon: 'store', permission: 'point_collections_report' },
        //     { label: 'Territory Coverage Report', icon: 'store', permission: 'territory_coverage_report' },
        //     { label: 'Performance Parameter', icon: 'store', permission: 'performance_parameter_report' },
        //     { label: 'Mechanics Points Report', icon: 'store', permission: 'mechanics_points_report' },
        //     { label: 'Target Vs Sales Report', icon: 'store', permission: 'targetvs_sales_report' },
        //     { label: 'Survey Analysis Report', icon: 'store', permission: 'survey_analysis_report' }
        //   ]
        // },
        {
          label: 'Loyalty',
          icon: 'loyalty',
          permission: 'loyalty_report_access',
          children: [
            // { label: 'Loyalty Summary Report', icon: 'card_membership', permission: 'loyalty_summary_report' },
            // { label: 'Loyalty Dealer Wise Summary Report', icon: 'sign_language', permission: 'loyalty_dealer_wise_summary_report' },
            // { label: 'Retailer Wise Loyalty Summary Report', icon: 'point_of_sale', permission: 'loyalty_retailer_wise_summary_report' }
          ]
        }
      ]
    }
  ];

  menuItems: MenuItem[] = [];
  activeRoute = '';

  constructor(private router: Router, private authService: AuthService) {
    this.menuItems = this.filterMenuItems(this.allMenuItems);

    this.router.events.subscribe(e => {
      if (e instanceof NavigationEnd) {
        this.activeRoute = e.urlAfterRedirects;
        this.menuItems.forEach(item => this.expandActiveBranch(item));
      }
    });
  }

  toggleSidebar() {
    this.collapsed = !this.collapsed;
    if (!this.collapsed) {
      this.menuItems.forEach(item => this.expandActiveBranch(item));
    }
    this.hideTooltip();
    this.collapsedChange.emit(this.collapsed);
  }

  expandOnHover() {
    if (!this.collapsed) return;
    this.hoverExpanded = true;
    this.hideTooltip();
  }

  collapseAfterHover() {
    this.hoverExpanded = false;
    this.hideTooltip();
  }

  get visuallyCollapsed() {
    return this.collapsed && !this.hoverExpanded;
  }

  showTooltip(item: MenuItem, event: MouseEvent) {
    if (!this.visuallyCollapsed) return;
    this.tooltipLabel = item.label;
    this.moveTooltip(event);
  }

  moveTooltip(event: MouseEvent) {
    if (!this.visuallyCollapsed || !this.tooltipLabel) return;
    this.tooltipTop = event.clientY;
  }

  hideTooltip() {
    this.tooltipLabel = '';
  }

  toggle(item: MenuItem) {
    if (!item.children?.length) return;
    item.expanded = !item.expanded;
  }

  navigate(item: MenuItem) {
    if (item.children?.length) {
      this.toggle(item);
      return;
    }

    if (item.route) {
      this.router.navigateByUrl(item.route);
    }
  }

  isActive(item: MenuItem): boolean {
    if (item.route && (this.activeRoute === item.route || this.activeRoute.startsWith(item.route + '/'))) {
      return true;
    }

    return item.children?.some(child => this.isActive(child)) ?? false;
  }

  private filterMenuItems(items: MenuItem[]): MenuItem[] {
    return items
      .map(item => {
        const children = item.children ? this.filterMenuItems(item.children) : undefined;
        return { ...item, children };
      })
      .filter(item => {
        const hasVisibleChildren = (item.children?.length ?? 0) > 0;
        if (item.children) {
          if (!this.canView(item)) return false;
          return hasVisibleChildren || (this.canView(item) && !!item.route);
        }

        return this.canView(item);
      });
  }

  private canView(item: MenuItem): boolean {
    if (item.permissions?.length) {
      return this.authService.hasAnyPermission(item.permissions);
    }

    return this.authService.hasPermission(item.permission);
  }

  private expandActiveBranch(item: MenuItem): boolean {
    const active = this.isActive(item);
    if (item.children?.length) {
      item.expanded = active || item.expanded;
      item.children.forEach(child => this.expandActiveBranch(child));
    }
    return active;
  }

}
