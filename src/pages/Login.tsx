import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowRightIcon, BriefcaseIcon, ShieldCheckIcon, UserRoundCogIcon, UsersIcon, WaypointsIcon } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { demoUsers } from '../data/reference';
import { roleLabels } from '../data/navigation';
import { useSessionStore } from '../hooks/useSessionStore';
import { api, errorMessage } from '../services/api';
import type { Role } from '../types/domain';

const schema = z.object({
  email: z.string().min(1, 'Enter your work email').email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});
type FormValues = z.infer<typeof schema>;

const roleIcons: Record<Role, typeof UsersIcon> = { SUPERVISOR: ShieldCheckIcon, EMPLOYEE: BriefcaseIcon, FREELANCER: UserRoundCogIcon };
const roleHints: Record<Role, string> = {
  SUPERVISOR: 'Full operations, scheduling, configuration & audit',
  EMPLOYEE: 'KANE-13 · DP · Night shift',
  FREELANCER: 'DP freelancer · Priority 1'
};

export function Login() {
  const user = useSessionStore((s) => s.user);
  const signIn = useSessionStore((s) => s.signIn);
  const navigate = useNavigate();
  const { register, handleSubmit, setValue, formState } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });
  const login = useMutation({
    mutationFn: (v: FormValues) => api.login(v.email, v.password),
    onSuccess: (u) => {
      signIn(u);
      navigate('/');
    }
  });
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen w-full bg-canvas">
      <aside className="hidden w-[44%] max-w-xl flex-col justify-between bg-primary p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-primary">
            <WaypointsIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-lg font-semibold">Relay WFM</p>
            <p className="text-xs text-primary-100">BPO Platform Operations Console</p>
          </div>
        </div>
        <div>
          <h1 className="text-3xl font-semibold leading-tight">Every platform, every seat, every shift — accounted for.</h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-primary-100">
            Workforce allocation, off-day capacity, freelancer replacement and shared workstation handovers across KANE, JAX, REX, IRIS and ZANE platforms.
          </p>
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t border-white/20 pt-6">
            {[
            ['12h', 'Morning & night shifts'],
            ['2 / day', 'Off-day cap per platform dept'],
            ['T-7', 'Planned replacement search']].
            map(([v, l]) =>
            <div key={l}>
                <dt className="text-xl font-semibold tabular">{v}</dt>
                <dd className="mt-1 text-xs text-primary-100">{l}</dd>
              </div>
            )}
          </dl>
        </div>
        <p className="text-xs text-primary-100">Attendance and biometric clock-in are managed in a separate system.</p>
      </aside>

      <main className="flex flex-1 items-center justify-center p-5 md:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
              <WaypointsIcon className="h-5 w-5" />
            </span>
            <p className="text-base font-semibold">Relay WFM</p>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h2>
          <p className="mt-1 text-sm text-ink-muted">Use your company account. Access is scoped to your role.</p>

          <form onSubmit={handleSubmit((v) => login.mutate(v))} className="mt-6 space-y-4" noValidate>
            <Field label="Work email" htmlFor="email" error={formState.errors.email?.message}>
              <Input id="email" type="email" autoComplete="username" placeholder="name@relayops.com" aria-invalid={Boolean(formState.errors.email)} {...register('email')} />
            </Field>
            <Field label="Password" htmlFor="password" error={formState.errors.password?.message}>
              <Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" aria-invalid={Boolean(formState.errors.password)} {...register('password')} />
            </Field>
            {login.isError &&
            <p role="alert" className="rounded-xl border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-600">
                {errorMessage(login.error)}
              </p>
            }
            <Button type="submit" className="w-full" loading={login.isPending} icon={!login.isPending ? <ArrowRightIcon className="h-4 w-4" /> : undefined}>
              Sign in
            </Button>
          </form>

          <div className="mt-8">
            <p className="text-xs font-medium text-ink-muted">Demo accounts — select to fill credentials</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {demoUsers.map((u) => {
                const Icon = roleIcons[u.role];
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setValue('email', u.email, { shouldValidate: true });
                      setValue('password', 'demo-password', { shouldValidate: true });
                    }}
                    className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3 text-left transition-[border-color,background-color] duration-150 hover:border-primary-200 hover:bg-primary-50/50">
                    
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-ink">{roleLabels[u.role]}</span>
                      <span className="block truncate text-[11px] text-ink-muted">{roleHints[u.role]}</span>
                    </span>
                  </button>);

              })}
            </div>
          </div>
        </div>
      </main>
    </div>);

}