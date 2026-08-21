import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { User, UserService } from '../../services/user.service';

interface ProfileField {
  label: string;
  value: string;
}

interface ProfileSection {
  title: string;
  icon: string;
  fields: ProfileField[];
}

@Component({
  standalone: false,
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  loading = true;
  error = '';

  name = '';
  initials = '';
  roles: string[] = [];
  employeeCode = '';
  active = true;
  sections: ProfileSection[] = [];

  constructor(
    private router: Router,
    private authService: AuthService,
    private userService: UserService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.applyStoredUser();

    this.userService.getMyProfile().subscribe({
      next: user => {
        this.applyUser(user);
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: error => {
        // The signed-in user always exists, so a failure here is a transport or
        // session problem. Keep the login payload on screen instead of a blank page.
        this.error = error?.message || 'Unable to load the complete profile right now.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  back(): void {
    this.router.navigate(['/dashboard']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  private applyStoredUser(): void {
    const user = this.authService.getCurrentUser();
    if (!user) return;

    this.name = user.name || user.email || user.mobile || 'User';
    this.initials = this.buildInitials(this.name);
    this.roles = (user.user_type ?? []).map(role => this.formatRole(role)).filter(role => !!role);
    this.sections = [
      {
        title: 'Contact',
        icon: 'contact_mail',
        fields: [
          { label: 'Email', value: this.text(user.email) },
          { label: 'Mobile', value: this.text(user.mobile) }
        ]
      }
    ];
  }

  private applyUser(user: User): void {
    this.name = user.name || `${user.firstName} ${user.lastName}`.trim() || this.name;
    this.initials = this.buildInitials(this.name);
    this.roles = user.roles.map(role => this.formatRole(role.name)).filter(role => !!role);
    this.employeeCode = this.text(user.employeeCodes, '');
    this.active = (user.active || 'Y').toUpperCase() !== 'N';

    this.sections = [
      {
        title: 'Contact',
        icon: 'contact_mail',
        fields: [
          { label: 'Email', value: this.text(user.email) },
          { label: 'Mobile', value: this.text(user.mobile) },
          { label: 'Base Location', value: this.text(user.location) },
          { label: 'Coordinates', value: this.coordinates(user) }
        ]
      },
      {
        title: 'Organization',
        icon: 'corporate_fare',
        fields: [
          { label: 'Designation', value: this.text(user.designationName) },
          { label: 'Department', value: this.text(user.departmentName) },
          { label: 'Zone', value: this.text(user.divisionName) },
          { label: 'Branches', value: this.text(user.branchNames) },
          { label: 'Reporting Manager', value: this.text(user.reportingName) },
          { label: 'Sales Type', value: this.text(user.salesType) }
        ]
      },
      {
        title: 'Employment',
        icon: 'badge',
        fields: [
          { label: 'Employee Code', value: this.text(user.employeeCodes) },
          { label: 'Date of Joining', value: this.date(user.dateOfJoining) },
          { label: 'Payroll Grade', value: this.text(user.payrollName || user.payroll) },
          { label: 'Attendance Report', value: user.showAttandanceReport === '0' ? 'Hidden' : 'Visible' },
          { label: 'Assigned Cities', value: this.cities(user) }
        ]
      },
      {
        title: 'Account',
        icon: 'manage_accounts',
        fields: [
          { label: 'User ID', value: String(user.id) },
          { label: 'Status', value: this.active ? 'Active' : 'Inactive' },
          { label: 'Roles', value: this.text(this.roles.join(', ')) },
          { label: 'Created On', value: this.date(user.createdAt) },
          { label: 'Last Updated', value: this.date(user.updatedAt) }
        ]
      }
    ];
  }

  // City names come from the profile endpoint. Fall back to a count so the row
  // still says something if only the id list is available.
  private cities(user: User): string {
    const names = (user.cityNames || '').trim();
    if (names) return names;
    return user.cityIds.length ? `${user.cityIds.length} assigned` : '-';
  }

  private coordinates(user: User): string {
    const latitude = (user.latitude || '').trim();
    const longitude = (user.longitude || '').trim();
    return latitude && longitude ? `${latitude}, ${longitude}` : '-';
  }

  // Same casing rule the header uses: acronym role names (ASR, ZM.) stay as they
  // are stored, plain lowercase words get presentable casing.
  private formatRole(role: string): string {
    const name = (role || '').trim();
    if (!name) return '';

    const lower = name.toLowerCase();
    if (lower === 'superadmin') return 'Super Admin';
    if (lower === 'subadmin') return 'Sub Admin';
    if (name !== lower) return name;

    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  private buildInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(part => !!part);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  private date(value?: string | null): string {
    if (!value) return '-';

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;

    return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private text(value?: string | null, fallback: string = '-'): string {
    const text = (value ?? '').toString().trim();
    return text || fallback;
  }
}
