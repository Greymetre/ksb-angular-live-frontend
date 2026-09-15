import { ChangeDetectorRef, Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';

type LoginMode = 'login' | 'forgot' | 'reset';

@Component({
  standalone: false,
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  loginForm: FormGroup;
  forgotForm: FormGroup;
  resetForm: FormGroup;
  mode: LoginMode = 'login';
  loading = false;
  errorMessage = '';
  successMessage = '';
  showPassword = false;
  showNewPassword = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthService,
    private changeDetector: ChangeDetectorRef
  ) {
    this.loginForm = this.fb.group({
      username: ['', [Validators.required]],
      password: ['', [Validators.required]]
    });
    this.forgotForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
    this.resetForm = this.fb.group({
      code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    });
  }

  get subtitle(): string {
    if (this.mode === 'forgot') return 'Reset your password';
    if (this.mode === 'reset') return 'Enter the code from your email';
    return 'Please log in to your account';
  }

  get resetEmail(): string {
    return (this.forgotForm.get('email')?.value || '').trim();
  }

  get passwordsMismatch(): boolean {
    const { password, confirmPassword } = this.resetForm.getRawValue();
    return !!confirmPassword && password !== confirmPassword;
  }

  onLogin(): void {
    this.clearMessages();

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const { username, password } = this.loginForm.getRawValue();
    this.loading = true;

    this.authService.login(username.trim(), password).pipe(
      finalize(() => {
        this.loading = false;
        this.changeDetector.detectChanges();
      })
    ).subscribe({
      next: () => {
        this.router.navigate(['/dashboard']);
      },
      error: (error: unknown) => {
        this.errorMessage = this.readErrorMessage(error);
        this.changeDetector.detectChanges();
      }
    });
  }

  openForgotPassword(): void {
    this.clearMessages();
    // Start from whatever was typed as the login, when it is an email.
    const typed = (this.loginForm.get('username')?.value || '').trim();
    if (typed.includes('@') && !this.resetEmail) this.forgotForm.patchValue({ email: typed });
    this.mode = 'forgot';
  }

  backToLogin(): void {
    this.clearMessages();
    this.mode = 'login';
  }

  /** Sends the code, and again from the code screen when somebody asks for a new one. */
  onRequestCode(): void {
    this.clearMessages();

    if (this.forgotForm.invalid) {
      this.forgotForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.authService.requestPasswordReset(this.resetEmail).pipe(
      finalize(() => {
        this.loading = false;
        this.changeDetector.detectChanges();
      })
    ).subscribe({
      next: message => {
        this.successMessage = message;
        this.resetForm.reset({ code: '', password: '', confirmPassword: '' });
        this.mode = 'reset';
        this.changeDetector.detectChanges();
      },
      error: (error: unknown) => {
        this.errorMessage = this.readErrorMessage(error);
        this.changeDetector.detectChanges();
      }
    });
  }

  onResetPassword(): void {
    this.clearMessages();

    if (this.resetForm.invalid || this.passwordsMismatch) {
      this.resetForm.markAllAsTouched();
      if (this.passwordsMismatch) this.errorMessage = 'The two passwords do not match.';
      return;
    }

    const { code, password, confirmPassword } = this.resetForm.getRawValue();
    this.loading = true;
    this.authService.resetPassword(this.resetEmail, code.trim(), password, confirmPassword).pipe(
      finalize(() => {
        this.loading = false;
        this.changeDetector.detectChanges();
      })
    ).subscribe({
      next: message => {
        this.mode = 'login';
        this.loginForm.patchValue({ username: this.resetEmail, password: '' });
        this.resetForm.reset({ code: '', password: '', confirmPassword: '' });
        this.successMessage = message;
        this.changeDetector.detectChanges();
      },
      error: (error: unknown) => {
        this.errorMessage = this.readErrorMessage(error);
        this.changeDetector.detectChanges();
      }
    });
  }

  onlyDigits(value: string): string {
    return (value || '').replace(/\D/g, '').slice(0, 6);
  }

  private clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }

  private readErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    if (typeof error === 'string' && error.trim()) {
      return error;
    }

    return 'Something went wrong. Please try again.';
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleNewPasswordVisibility(): void {
    this.showNewPassword = !this.showNewPassword;
  }
}
