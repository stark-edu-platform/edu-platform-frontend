'use client';
import { Button, Checkbox, EduPlatformLogo, Icon, InputBox } from '@/components';
import { useAuthStore } from '@/store/auth/auth.store';
import appToast from '@/lib/toast';
import { useZodForm } from '@/lib/forms/useZodForm';
import { loginSchema } from '@/lib/validation';
import { highlights } from './utils';

export default function Login() {
  const { onLogin } = useAuthStore();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useZodForm(loginSchema);

  const onSubmit = handleSubmit(async (values) => {
    const result = await onLogin({ loginId: values.loginId, password: values.password });
    if (!result.success) {
      const message = result.message || 'Unable to sign in. Please try again.';
      // Surface the server error inline (root), not just as a toast (LG1).
      setError('root', { message });
      appToast.error(message);
      return;
    }
    // On success the store flips status → authenticated; AuthProvider redirects
    // to the role home (single redirect authority).
  });
  return (
    <main className="min-h-screen bg-base px-3 py-3 text-text sm:px-6 lg:h-screen lg:overflow-hidden lg:px-8 lg:py-6">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1360px] overflow-hidden rounded-[28px] border border-surfaceSoft bg-surface shadow-[0_24px_80px_rgba(31,41,55,0.08)] lg:h-full lg:min-h-0 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden flex-col justify-between overflow-hidden bg-base px-5 py-5 sm:px-8 lg:flex lg:px-10 lg:py-8">
          <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,var(--color-primaryLight),transparent_58%)] opacity-20" />
          <div className="absolute bottom-0 right-0 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />

          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <EduPlatformLogo />
              <div>
                <p className="text-base font-semibold tracking-tight text-text">Edu Platform</p>
                <p className="text-sm text-textLight">School management workspace</p>
              </div>
            </div>

            <div className="mt-6 max-w-xl lg:mt-10">
              <span className="inline-flex rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Welcome Back
              </span>
              <h1 className="mt-3 text-2xl font-semibold leading-[1.04] tracking-tight text-text sm:text-4xl lg:text-[3.5rem]">
                Run every school operation from one calm control center.
              </h1>
              <p className="mt-3 max-w-lg text-sm leading-5 text-textLight sm:text-base sm:leading-6">
                Sign in to manage schools, configure access, and keep communication, attendance, and
                billing workflows moving without friction.
              </p>
            </div>

            <div className="mt-5 hidden gap-3 sm:grid-cols-3 lg:mt-8 lg:grid">
              <div className="rounded-[22px] border border-surfaceSoft bg-surface px-4 py-3 shadow-sm">
                <p className="text-xl font-semibold text-text">42</p>
                <p className="mt-1 text-xs text-textLight">Schools connected</p>
              </div>
              <div className="rounded-[22px] border border-surfaceSoft bg-surface px-4 py-3 shadow-sm">
                <p className="text-xl font-semibold text-text">12k+</p>
                <p className="mt-1 text-xs text-textLight">Daily active users</p>
              </div>
              <div className="rounded-[22px] border border-surfaceSoft bg-surface px-4 py-3 shadow-sm">
                <p className="text-xl font-semibold text-text">99.9%</p>
                <p className="mt-1 text-xs text-textLight">Workflow uptime</p>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-6 hidden rounded-[24px] border border-surfaceSoft bg-surface px-5 py-4 shadow-sm lg:block">
            <p className="text-sm font-semibold text-text">Why teams choose Edu Platform</p>
            <div className="mt-3 space-y-2.5">
              {highlights.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
                    <Icon name="dashboard" size="tiny" color="primary" />
                  </span>
                  <p className="text-sm leading-5 text-textLight">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center bg-surface px-4 py-4 sm:px-8 lg:min-h-0 lg:px-5 lg:py-8 xl:px-6">
          <div className="w-full max-w-[680px]">
            <div className="rounded-[28px] border border-surfaceSoft bg-surface px-4 py-4 shadow-[0_20px_60px_rgba(31,41,55,0.06)] sm:px-7 sm:py-6 lg:px-10 lg:py-8 xl:px-12">
              <div className="mb-5 flex items-center gap-3 lg:hidden">
                <EduPlatformLogo />
                <div className="min-w-0">
                  <p className="text-base font-semibold tracking-tight text-text">Edu Platform</p>
                  <p className="text-sm text-textLight">School management workspace</p>
                </div>
              </div>
              <div className="mb-5 rounded-[22px] border border-primary/15 bg-primary/5 px-4 py-3 lg:hidden">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  Welcome Back
                </p>
                <p className="mt-2 text-sm leading-6 text-textLight">
                  Sign in to manage schools, access, communication, and daily workflows.
                </p>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-text sm:text-2xl lg:text-3xl">
                    Sign in
                  </h2>
                  <p className="mt-1 text-sm text-textLight lg:text-base">
                    Use your workspace account to continue.
                  </p>
                </div>
                <span className="rounded-full border border-surfaceSoft bg-base px-3 py-1 text-xs font-medium text-textLight">
                  Secure login
                </span>
              </div>
              <form className="mt-6 space-y-4 lg:mt-7 lg:space-y-5" onSubmit={onSubmit} noValidate>
                <InputBox
                  id="userId"
                  type="text"
                  label="Username or Email ID"
                  placeholder="Enter your username or email id"
                  variant="filled"
                  size="large"
                  required
                  {...register('loginId')}
                  error={errors.loginId?.message}
                />

                <div>
                  <InputBox
                    id="password"
                    label="Password"
                    required
                    type="password"
                    placeholder="Enter your password"
                    variant="filled"
                    className="mt-1.5"
                    size="large"
                    {...register('password')}
                    error={errors.password?.message}
                  />
                </div>

                {errors.root?.message && (
                  <p role="alert" className="text-sm text-danger">
                    {errors.root.message}
                  </p>
                )}

                <div className="flex items-center justify-between gap-3">
                  <Checkbox id="keep-signed-in" label="Keep me signed in" />
                  <span className="text-xs text-textMuted">Protected session</span>
                </div>

                <Button
                  type="submit"
                  size="medium"
                  label="Sign in"
                  tone="primary"
                  radius="md"
                  isLoading={isSubmitting}
                />
              </form>
              <div className="mt-5 rounded-[22px] border border-surfaceSoft bg-base px-4 py-3 lg:px-5 lg:py-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                    <Icon name="help" size="small" color="primary" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-text lg:text-[15px]">
                      Need access support?
                    </p>
                    <p className="mt-1 text-sm leading-5 text-textLight lg:text-[15px]">
                      Reach your admin for activation or role access help. Real authentication still
                      needs to be connected for this screen.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
