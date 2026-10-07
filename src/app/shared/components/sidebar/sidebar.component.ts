import { Component, EventEmitter, Output } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { MenuItem, MENU_ITEMS } from '../../config/menu';

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

  private readonly allMenuItems: MenuItem[] = MENU_ITEMS;

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
        // A section is a container: it shows when something inside it shows. Its own
        // permission matters only when it is also a link in its own right. Sections used
        // to carry a permission of their own, which hid a whole menu from a role that
        // held every page inside it.
        if (item.children) {
          const hasVisibleChildren = item.children.length > 0;
          return hasVisibleChildren || (!!item.route && this.canView(item));
        }

        return this.canView(item);
      });
  }

  private canView(item: MenuItem): boolean {
    if (item.permissions?.length) {
      return this.authService.hasAnyPermission(item.permissions);
    }

    // An entry with no permission of its own is open to every signed-in user.
    if (!item.permission) return true;

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
