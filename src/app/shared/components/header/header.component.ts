import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { API_ORIGIN } from '../../../config/api.config';

@Component({
  standalone: false,
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit, OnDestroy {
  userName: string = '';
  userRole: string = '';
  photoUrl = '';
  menuOpen = false;

  private photoSubscription?: Subscription;

  constructor(
    private router: Router,
    private authService: AuthService,
    private elementRef: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    this.userName = user?.name || user?.email || user?.mobile || 'User';
    this.userRole = (user?.user_type ?? [])
      .map(role => this.formatRole(role))
      .filter(role => !!role)
      .join(', ');

    // Live stream, so uploading a new picture on the profile page refreshes the
    // avatar without a page reload.
    this.photoSubscription = this.authService.profileImage$.subscribe(path => {
      this.photoUrl = this.mediaUrl(path);
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy(): void {
    this.photoSubscription?.unsubscribe();
  }

  /** A stored path can point at a legacy file that no longer exists - fall back
   * to the placeholder icon instead of showing a broken image. */
  onPhotoError(): void {
    this.photoUrl = '';
    this.cdr.detectChanges();
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

  private mediaUrl(value?: string | null): string {
    const path = (value ?? '').trim();
    if (!path) return '';
    if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) return path;
    return `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
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
