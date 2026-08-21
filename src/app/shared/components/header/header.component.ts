import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  standalone: false,
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit {
  userName: string = '';
  userRole: string = '';
  menuOpen = false;

  constructor(
    private router: Router,
    private authService: AuthService,
    private elementRef: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    this.userName = user?.name || user?.email || user?.mobile || 'User';
    this.userRole = (user?.user_type ?? [])
      .map(role => this.formatRole(role))
      .filter(role => !!role)
      .join(', ');
  }

  toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpen = !this.menuOpen;
  }

  goToProfile(): void {
    this.menuOpen = false;
    this.router.navigate(['/profile']);
  }

  logout(): void {
    this.menuOpen = false;
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.menuOpen) return;
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.menuOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuOpen = false;
  }

  // Role names come straight from the roles table, so they mix acronyms (ASR, ZM.)
  // with plain words (superadmin). Acronyms are left untouched, words get cased.
  private formatRole(role: string): string {
    const name = (role || '').trim();
    if (!name) return '';

    const lower = name.toLowerCase();
    if (lower === 'superadmin') return 'Super Admin';
    if (lower === 'subadmin') return 'Sub Admin';
    if (name !== lower) return name;

    return name.charAt(0).toUpperCase() + name.slice(1);
  }
}
