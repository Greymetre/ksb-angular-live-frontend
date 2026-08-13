import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize, timeout } from 'rxjs';
import {
  FieldKonnectAppSettingPayload,
  FieldKonnectAppSettingService
} from '../../services/field-konnect-app-setting.service';

@Component({
  standalone: false,
  selector: 'app-field-konnect-app-setting',
  templateUrl: './field-konnect-app-setting.component.html',
  styleUrls: ['./field-konnect-app-setting.component.scss']
})
export class FieldKonnectAppSettingComponent implements OnInit {
  form: FieldKonnectAppSettingPayload = {
    androidVersion: '',
    iosVersion: '',
    orderDiscountLimit: null
  };
  loading = false;
  saving = false;
  errorMessage = '';
  successMessage = '';
  updatedAt: string | null = null;

  constructor(
    private settingService: FieldKonnectAppSettingService,
    private cdr: ChangeDetectorRef
  ) {}

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
          iosVersion: setting.iosVersion,
          orderDiscountLimit: setting.orderDiscountLimit
        };
        this.updatedAt = setting.updatedAt;
      },
      error: error => this.errorMessage = error.name === 'TimeoutError'
        ? 'FieldKonnect App Setting API request timed out.'
        : error.message
    });
  }

  save(): void {
    this.errorMessage = '';
    this.successMessage = '';
    if (!this.validVersion(this.form.androidVersion)) {
      this.errorMessage = 'Enter a valid Android version, for example 1.3 or 16.0.';
      return;
    }
    if (this.form.iosVersion.trim() && !this.validVersion(this.form.iosVersion)) {
      this.errorMessage = 'Enter a valid iOS version, for example 1.1 or 2.3.';
      return;
    }
    if (this.form.orderDiscountLimit !== null
      && (this.form.orderDiscountLimit < 0 || this.form.orderDiscountLimit > 100)) {
      this.errorMessage = 'Order discount limit must be between 0 and 100.';
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
          iosVersion: result.setting.iosVersion,
          orderDiscountLimit: result.setting.orderDiscountLimit
        };
        this.updatedAt = result.setting.updatedAt;
        this.successMessage = result.message;
      },
      error: error => this.errorMessage = error.name === 'TimeoutError'
        ? 'FieldKonnect App Setting API request timed out.'
        : error.message
    });
  }

  private validVersion(value: string): boolean {
    return /^\d+(\.\d+){0,3}$/.test(value.trim());
  }
}
