import { Component, inject, signal, computed, ElementRef, viewChildren, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormGroup, FormControl, FormGroupDirective, NgForm, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatFormField, MatLabel, MatError, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { ErrorStateMatcher } from '@angular/material/core';
import { AuthService } from '../../../core/auth/auth.service';

/** Validator to ensure passwords match */
export function passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  return password === confirmPassword ? null : { mismatch: true };
}

/**
 * Custom error state matcher for the confirm-password field.
 * Triggers error state when the individual control is invalid OR
 * when the parent FormGroup has the cross-field `mismatch` error.
 */
export class ConfirmPasswordErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(control: FormControl | null, form: FormGroupDirective | NgForm | null): boolean {
    const isControlInvalid = !!(control?.touched && control?.invalid);
    const isMismatch = !!(control?.touched && form?.hasError('mismatch'));
    return isControlInvalid || isMismatch;
  }
}

/**
 * Register component with a 2-step verification flow.
 */
@Component({
  selector: 'app-register',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormField,
    MatLabel,
    MatError,
    MatSuffix,
    MatInput,
    MatButton,
    MatIconButton,
    MatIcon,
    MatProgressSpinner
  ],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
  host: {
    class: 'auth-container'
  }
})
export class RegisterComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  currentStep = signal<1 | 2>(1);
  isLoading = this.authService.isLoading;
  hidePassword = signal(true);
  hideConfirmPassword = signal(true);

  isDarkMode = signal(true);

  /** Error state matcher that bridges the cross-field mismatch error to the confirm-password field. */
  readonly confirmPasswordMatcher = new ConfirmPasswordErrorStateMatcher();

  registerForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required, Validators.minLength(8)]),
    confirmPassword: new FormControl('', [Validators.required])
  }, { validators: passwordMatchValidator });

  passwordValue = toSignal(this.registerForm.controls.password.valueChanges, { initialValue: '' });

  passwordCriteria = computed(() => {
    const pwd = this.passwordValue() || '';
    return {
      length: pwd.length >= 8,
      uppercase: /[A-Z]/.test(pwd),
      lowercase: /[a-z]/.test(pwd),
      number: /[0-9]/.test(pwd),
      special: /[^A-Za-z0-9]/.test(pwd)
    };
  });

  passwordStrength = computed(() => {
    const criteria = this.passwordCriteria();
    const score = Object.values(criteria).filter(Boolean).length;
    if (score === 0) return 0;
    if (score === 1) return 1; // weak
    if (score <= 3) return 2; // fair
    if (score === 4) return 3; // good
    return 4; // strong
  });

  codeControls = Array.from({ length: 6 }, () => new FormControl('', [Validators.required, Validators.pattern(/^\d$/)]));
  digitInputs = viewChildren<ElementRef<HTMLInputElement>>('digitInput');

  resendCooldown = signal(0);
  private timerInterval: ReturnType<typeof setInterval> | undefined;

  ngOnInit() {
    const theme = localStorage.getItem('drive-lite-theme');
    if (theme) {
      this.isDarkMode.set(theme === 'dark');
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.isDarkMode.set(prefersDark);
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
  }

  ngOnDestroy() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  /** Toggles the application theme between light and dark mode */
  toggleTheme() {
    const newTheme = this.isDarkMode() ? 'light' : 'dark';
    this.isDarkMode.set(newTheme === 'dark');
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('drive-lite-theme', newTheme);
  }

  /** Toggles the visibility of the password field */
  togglePasswordVisibility() {
    this.hidePassword.update(v => !v);
  }

  /** Toggles the visibility of the confirm password field */
  toggleConfirmPasswordVisibility() {
    this.hideConfirmPassword.update(v => !v);
  }

  /** Submits the step 1 registration form */
  onRegisterSubmit(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }
    const { email, password } = this.registerForm.value;
    if (email && password) {
      try {
        this.authService.signUp(email, password);
        this.currentStep.set(2);
        this.startResendTimer();
      } catch (err) {
        console.error('Registration failed', err);
      }
    }
  }

  /** Submits the 6-digit verification code in step 2 */
  onCodeSubmit(): void {
    const isCodeValid = this.codeControls.every(ctrl => ctrl.valid);
    if (!isCodeValid) {
      this.codeControls.forEach(ctrl => ctrl.markAsTouched());
      return;
    }
    const code = this.codeControls.map(ctrl => ctrl.value).join('');
    const email = this.registerForm.value.email;
    if (email && code) {
      try {
        this.authService.confirmSignUp(email, code);
      } catch (err) {
        console.error('Verification failed', err);
      }
    }
  }

  /** Auto-advances the cursor to the next digit input */
  onCodeInput(event: Event, index: number) {
    const input = event.target as HTMLInputElement;
    if (input.value && /\d/.test(input.value) && index < 5) {
      const inputs = this.digitInputs();
      inputs[index + 1]?.nativeElement.focus();
    }
  }

  /** Handles deleting digits and moving back focus */
  onCodeKeydown(event: KeyboardEvent, index: number) {
    if (event.key === 'Backspace') {
      const ctrl = this.codeControls[index];
      if (!ctrl.value && index > 0) {
        const inputs = this.digitInputs();
        inputs[index - 1]?.nativeElement.focus();
        this.codeControls[index - 1].setValue('');
      }
    }
  }

  /** Handles pasting a verification code over the input fields */
  onCodePaste(event: ClipboardEvent) {
    event.preventDefault();
    const pastedData = event.clipboardData?.getData('text');
    if (!pastedData) return;
    
    const digits = pastedData.match(/\d/g);
    if (digits) {
      for (let i = 0; i < Math.min(digits.length, 6); i++) {
        this.codeControls[i].setValue(digits[i]);
      }
      const inputs = this.digitInputs();
      const focusIndex = Math.min(digits.length, 5);
      inputs[focusIndex]?.nativeElement.focus();
    }
  }

  /** Initiates a timer cooldown for resending the verification code */
  startResendTimer() {
    this.resendCooldown.set(60);
    this.timerInterval = setInterval(() => {
      const current = this.resendCooldown();
      if (current > 0) {
        this.resendCooldown.set(current - 1);
      } else {
        clearInterval(this.timerInterval);
      }
    }, 1000);
  }

  /** Requests a new verification code from the auth service */
  resendCode(): void {
    if (this.resendCooldown() > 0) return;
    const { email } = this.registerForm.value;
    if (email) {
      // STUB: replace with authService.resendSignUpCode(email) when available
      this.startResendTimer();
    }
  }
}
