'use client';

import { useState, useEffect } from 'react';
import { Button, InputBox } from '@/components';
import appToast from '@/lib/toast';
import { useAuthStore } from '@/store/auth/auth.store';
import constants from '@/constants';
import { useRouter, useSearchParams } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { useZodForm } from '@/lib/forms/useZodForm';
import { setPasswordSchema, passwordRules, getPasswordStrength } from '@/lib/validation';

export default function SetPassword() {
  const { validateSetPasswordToken, setUserPassword } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  // Token validation is its own flow, separate from the password form fields.
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useZodForm(setPasswordSchema);

  const passwordValue = watch('password') ?? '';
  const strength = getPasswordStrength(passwordValue);
  const strengthLabel = strength >= 100 ? 'Strong' : strength >= 60 ? 'Medium' : 'Weak';

  // ✅ Verify the invite token on mount.
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setTokenError('Invalid or missing token');
        appToast.error('Invalid or missing token');
        return;
      }

      const result = await validateSetPasswordToken(token);

      if (result?.statusCode !== constants.API_STATUS.OK) {
        setTokenError(result?.message || 'Invalid or expired token');
        setIsTokenValid(false);
        appToast.error(result?.message || 'Invalid or expired token');
        return;
      }

      setIsTokenValid(true);
      setTokenError(null);
    };

    verifyToken();
  }, [token, validateSetPasswordToken]);

  // ✅ Submit handler — validation comes from setPasswordSchema via useZodForm.
  const onSubmit = handleSubmit(async (values) => {
    if (!token) {
      setTokenError('Invalid or missing token');
      appToast.error('Invalid or missing token');
      return;
    }

    const result = await setUserPassword(token, values.password);
    if (result?.statusCode !== constants.API_STATUS.OK) {
      const message = result?.message || 'Failed to set password';
      setError('root', { message });
      appToast.error(message);
      return;
    }

    appToast.success('Password set successfully! Redirecting...');
    router.push(APP_ROUTES.login);
  });

  const headerError = tokenError || errors.root?.message;

  return (
    <div className="min-h-screen bg-base flex items-center justify-center px-4">
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 bg-surface rounded-2xl shadow-lg overflow-hidden">
        {/* Left Section */}
        <div className="hidden md:flex flex-col justify-center p-10 bg-base">
          <h1 className="text-4xl font-bold text-text mb-4">Set your password securely</h1>
          <p className="text-textLight mb-6">
            Create a strong password to protect your account and continue using the platform.
          </p>

          {/* Advertised rules — rendered from the single password policy source. */}
          <ul className="space-y-3 text-sm text-textMuted">
            {passwordRules.map((rule) => (
              <li key={rule.id}>• {rule.label}</li>
            ))}
          </ul>
        </div>

        {/* Right Section */}
        <div className="p-6 md:p-10">
          <div className="max-w-md mx-auto">
            <h2 className="text-2xl font-semibold text-text mb-2">Set Password</h2>

            {/* ✅ Stable text / token or server error */}
            <p className={`mb-6 ${headerError ? 'text-danger' : 'text-textLight'}`}>
              {headerError || 'Enter your new password below'}
            </p>

            <form onSubmit={onSubmit} noValidate>
              <div className="space-y-4 mb-6">
                <InputBox
                  label="New Password"
                  id="password"
                  type="password"
                  placeholder="Enter new password"
                  variant="filled"
                  className="mt-1.5"
                  disabled={!isTokenValid}
                  {...register('password')}
                  error={errors.password?.message}
                />

                {/* Confirm Password */}
                <InputBox
                  label="Confirm Password"
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  variant="filled"
                  className="mt-1.5"
                  disabled={!isTokenValid}
                  {...register('confirmPassword')}
                  error={errors.confirmPassword?.message}
                />
              </div>

              {/* Password Strength — driven by the real policy */}
              <div>
                <div className="h-2 w-full bg-surfaceSoft rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${strength}%` }}
                  />
                </div>
                <p className="text-xs text-textMuted mt-1">Password strength: {strengthLabel}</p>
              </div>

              {/* Per-rule live feedback matching the advertised policy */}
              <ul className="space-y-1.5 mt-3 mb-6">
                {passwordRules.map((rule) => {
                  const passed = rule.test(passwordValue);
                  return (
                    <li
                      key={rule.id}
                      className={`flex items-center gap-2 text-xs ${
                        passed ? 'text-primary' : 'text-textMuted'
                      }`}
                    >
                      <span aria-hidden="true">{passed ? '✓' : '○'}</span>
                      {rule.label}
                    </li>
                  );
                })}
              </ul>

              <Button
                tone="primary"
                type="submit"
                reaponsive
                size="large"
                disabled={!isTokenValid}
                isLoading={isSubmitting}
                label="Set Password"
              />
            </form>

            {/* Footer */}
            <p className="text-xs text-textMuted mt-6 text-center">
              Make sure your password is secure and not shared with anyone.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
