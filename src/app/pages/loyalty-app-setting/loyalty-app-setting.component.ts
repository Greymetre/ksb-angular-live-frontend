import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize, timeout } from 'rxjs';
import {
  LoyaltyAppSettingPayload,
  LoyaltyAppSettingService
} from '../../services/loyalty-app-setting.service';
import { AuthService } from '../../services/auth.service';

@Component({
  standalone: false,
  selector: 'app-loyalty-app-setting',
  templateUrl: './loyalty-app-setting.component.html',
  styleUrls: ['./loyalty-app-setting.component.scss']
})
export class LoyaltyAppSettingComponent implements OnInit {
  form: LoyaltyAppSettingPayload = {
    androidVersion: '',
    iosVersion: ''
  };
  loading = false;
  saving = false;
  errorMessage = '';
  successMessage = '';
  updatedAt: string | null = null;

  constructor(
    private settingService: LoyaltyAppSettingService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  /** Reading the setting and saving it are separate permissions. */
  get canEdit(): boolean {
    return this.authService.hasPermission('app_setting.edit');
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';
    this.settingService.get().pipe(
      timeout(20000),
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: setting => {
        this.form = {
          androidVersion: setting.androidVersion,
          iosVersion: setting.iosVersion
        };
        this.updatedAt = setting.updatedAt;
      },
      error: error => this.errorMessage = error.name === 'TimeoutError'
        ? 'Loyalty App Setting API request timed out.'
        : error.message
    });
  }

  save(): void {
    this.errorMessage = '';
    this.successMessage = '';
    if (!this.validVersion(this.form.androidVersion)) {
      this.errorMessage = 'Enter a valid Android version, for example 1.0 or 2.3.1.';
      return;
    }
    if (this.form.iosVersion.trim() && !this.validVersion(this.form.iosVersion)) {
      this.errorMessage = 'Enter a valid iOS version, for example 1.0 or 2.3.1.';
      return;
    }

    this.saving = true;
    this.settingService.save(this.form).pipe(
      timeout(20000),
      finalize(() => {
        this.saving = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: result => {
        this.form = {
          androidVersion: result.setting.androidVersion,
          iosVersion: result.setting.iosVersion
        };
        this.updatedAt = result.setting.updatedAt;
        this.successMessage = result.message;
      },
      error: error => this.errorMessage = error.name === 'TimeoutError'
        ? 'Loyalty App Setting API request timed out.'
        : error.message
    });
  }

  private validVersion(value: string): boolean {
    return /^\d+(\.\d+){0,3}$/.test(value.trim());
  }
}
