import { Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { MENU_ITEMS, MenuItem } from '../config/menu';

/**
 * The browser tab reads the menu, not a per-route string.
 *
 * It stays "KSBaaroh" on its own, and on any page reachable from the left nav it becomes
 * "KSBaaroh - <that menu item's name>" - so a Customers Management sub-menu shows exactly
 * the sub-menu's label. A page the menu does not list (a detail or editor opened from a
 * listing) borrows the label of the listing it sits under, so the tab still says which
 * part of the app you are in.
 *
 * The map is built from MENU_ITEMS, the same source the sidebar renders, so a menu label
 * changed in one place changes the tab too.
 */
@Injectable()
export class PageTitleStrategy extends TitleStrategy {
  private static readonly AppName = 'KSBaaroh';
  private readonly labelByRoute = new Map<string, string>();

  constructor(private readonly title: Title) {
    super();
    this.index(MENU_ITEMS);
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const label = this.labelFor(snapshot.url);
    this.title.setTitle(label ? `${PageTitleStrategy.AppName} - ${label}` : PageTitleStrategy.AppName);
  }

  private labelFor(url: string): string | null {
    const path = this.normalise(url.split('?')[0].split('#')[0]);
    const exact = this.labelByRoute.get(path);
    if (exact) return exact;

    // No exact menu entry - take the longest menu route that this page sits under, so a
    // customer's detail page under /customers still reads as the Customers menu item.
    let best: string | null = null;
    let bestLength = -1;
    for (const [route, label] of this.labelByRoute) {
      if (route.length > bestLength && (path === route || path.startsWith(route + '/'))) {
        best = label;
        bestLength = route.length;
      }
    }
    return best;
  }

  private index(items: MenuItem[]): void {
    for (const item of items) {
      if (item.route) this.labelByRoute.set(this.normalise(item.route), item.label);
      if (item.children) this.index(item.children);
    }
  }

  private normalise(path: string): string {
    const trimmed = (path || '').replace(/\/+$/, '');
    return trimmed.length ? trimmed : '/';
  }
}
