import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRightIcon, BriefcaseIcon, ShieldCheckIcon, UserRoundCogIcon, LockIcon, MailIcon, EyeIcon, EyeOffIcon, HelpCircleIcon, PauseIcon, PlayIcon, TriangleAlertIcon, SparklesIcon } from 'lucide-react';
import { BrandLogo } from '../components/layout/BrandLogo';
import { Dialog } from '../components/ui/Dialog';
import { useSessionStore } from '../hooks/useSessionStore';
import { errorMessage } from '../services/api';
import { login as serverLogin } from '../services/http';
import type { Role } from '../types/domain';

const schema = z.object({
  email: z.string().min(1, 'Enter your work email').email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});
type FormValues = z.infer<typeof schema>;
const roleConfig = {
  SUPERVISOR: { icon: ShieldCheckIcon, title: 'A clearer view.', accent: 'A calmer day.', copy: 'Bring your people, coverage and daily decisions into focus.', hint: 'Operations, scheduling and workforce oversight' },
  EMPLOYEE: { icon: BriefcaseIcon, title: 'Your workday.', accent: 'A little simpler.', copy: 'Know your next shift, find your workspace and feel ready for the day.', hint: 'Your schedule, workstation and daily updates' },
  FREELANCER: { icon: UserRoundCogIcon, title: 'Your next shift.', accent: 'A fresh start.', copy: 'Make space for new opportunities. Your availability and assignments, together.', hint: 'Availability, assignments and replacement coverage' },
} satisfies Record<Role, { icon: typeof ShieldCheckIcon; title: string; accent: string; copy: string; hint: string }>;

export function Login() {
  const user = useSessionStore(state => state.user);
  const signIn = useSessionStore(state => state.signIn);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const switchingWorker = params.get('switchWorker') === '1';
  const reducedMotion = useReducedMotion();
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [savedEmail] = useState(() => switchingWorker ? '' : localStorage.getItem('portcity-login-email') ?? '');
  const [rememberEmail, setRememberEmail] = useState(Boolean(savedEmail));
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const selectedRole: Role = 'SUPERVISOR';
  const [showHelp, setShowHelp] = useState(false);
  const isAnimated = motionEnabled && !reducedMotion;
  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema), defaultValues: { email: switchingWorker ? '' : savedEmail, password: '' },
  });
  const welcome = roleConfig[selectedRole];
  const login = useMutation({
    mutationFn: (values: FormValues) => serverLogin(values.email, values.password),
    onSuccess: (session, values) => {
      if (rememberEmail) localStorage.setItem('portcity-login-email', values.email.trim());
      else localStorage.removeItem('portcity-login-email');
      signIn(session.user, session.permissions);
      navigate('/');
    },
  });
  if (user) return <Navigate to="/" replace />;

  return <div className="login-page login-experience" data-motion={isAnimated ? 'running' : 'paused'}>
    <div className="login-exposure" aria-hidden="true" />
    <div className="login-exposure-shade" aria-hidden="true" />
    <div className="login-light-trace" aria-hidden="true" />
    <header className="login-topbar">
      <div className="flex items-center gap-3"><BrandLogo compact /><div><p className="text-sm font-semibold text-ink">PortCity Digital</p><p className="text-[11px] text-ink-muted">A more connected workday</p></div></div>
      <div className="flex items-center gap-2">
        {!reducedMotion && <button type="button" className="login-utility" onClick={() => setMotionEnabled(!motionEnabled)} aria-label={motionEnabled ? 'Pause motion' : 'Resume motion'} title={motionEnabled ? 'Pause background animation' : 'Resume background animation'}>{motionEnabled ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}</button>}
        <button type="button" className="login-utility" onClick={() => setShowHelp(true)} aria-label="Platform help"><HelpCircleIcon className="h-4 w-4" /></button>
      </div>
    </header>
    <main className="login-stage">
      <motion.section className="login-intro login-welcome" aria-label="Platform introduction" initial={isAnimated ? { opacity: 0, y: 16 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: isAnimated ? 0.6 : 0 }}>
        <p className="login-eyebrow"><span className="login-eyebrow-dot" /> PEOPLE FIRST. WORK, IN SYNC.</p>
        <div className="login-welcome-message" aria-live="polite" aria-atomic="true">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={selectedRole} initial={isAnimated ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: isAnimated ? -8 : 0 }} transition={{ duration: isAnimated ? 0.2 : 0 }}>
              <h2>{welcome.title}<br /><span>{welcome.accent}</span></h2>
              <p className="login-welcome-description">{welcome.copy}</p>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="login-human-note"><span className="login-note-icon"><SparklesIcon className="h-4 w-4" /></span><p>Good work starts with people.<br /><span>Let’s make today a little easier.</span></p></div>
      </motion.section>
      <motion.section className="login-signin-card" aria-label="Sign in" initial={isAnimated ? { opacity: 0, y: 20 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: isAnimated ? 0.55 : 0, delay: isAnimated ? 0.12 : 0 }}>
        <div className="login-card-intro"><span className="login-card-kicker">YOUR WORKSPACE AWAITS</span><h1>Welcome Back</h1><p>A little clarity for the day ahead.</p></div>
        <form onSubmit={handleSubmit(values => login.mutate(values))} className="space-y-4" noValidate aria-busy={login.isPending}>
          <div>
            <label htmlFor="email" className="login-field-label">Work email</label>
            <div className="login-field"><MailIcon className="h-4 w-4 shrink-0" aria-hidden /><input id="email" type="email" autoComplete="username" placeholder="you@company.com" aria-invalid={Boolean(formState.errors.email)} aria-describedby={formState.errors.email ? 'email-error' : undefined} {...register('email')} /></div>
            {formState.errors.email && <p id="email-error" role="alert" className="login-field-error">{formState.errors.email.message}</p>}
          </div>
          <div>
            <label htmlFor="password" className="login-field-label">Password</label>
            <div className="login-field"><LockIcon className="h-4 w-4 shrink-0" aria-hidden /><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Your password" aria-invalid={Boolean(formState.errors.password)} aria-describedby={[formState.errors.password ? 'password-error' : '', capsLock ? 'caps-lock-hint' : ''].filter(Boolean).join(' ') || undefined} {...register('password', { onBlur: () => setCapsLock(false) })} onKeyDown={event => setCapsLock(event.getModifierState('CapsLock'))} onKeyUp={event => setCapsLock(event.getModifierState('CapsLock'))} /><button type="button" className="login-password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>{showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}</button></div>
            {formState.errors.password && <p id="password-error" role="alert" className="login-field-error">{formState.errors.password.message}</p>}
            {capsLock && <p id="caps-lock-hint" role="status" className="mt-1 text-xs text-warning">Caps Lock is on.</p>}
          </div>
          <div className="login-form-options"><label className="flex cursor-pointer items-center gap-2 text-xs text-ink-muted"><input type="checkbox" checked={rememberEmail} onChange={event => setRememberEmail(event.target.checked)} />Remember my email</label><button type="button" onClick={() => setShowHelp(true)} className="text-xs font-medium text-primary">Forgot password?</button></div>
          <AnimatePresence initial={false}>{login.isError && <motion.div role="alert" className="login-api-error" initial={{ opacity: 0, y: isAnimated ? -4 : 0 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: isAnimated ? 0.15 : 0 }}><TriangleAlertIcon className="h-4 w-4 shrink-0" aria-hidden /><span>{errorMessage(login.error)}</span></motion.div>}</AnimatePresence>
          <motion.button type="submit" className="login-submit" disabled={login.isPending} whileHover={isAnimated && !login.isPending ? { y: -2 } : undefined} whileTap={isAnimated ? { scale: 0.99 } : undefined} transition={{ duration: 0.15 }}>
            <span>{login.isPending ? 'Signing in…' : 'Login'}</span>{login.isPending ? <span className="login-loading-ring" aria-hidden /> : <ArrowRightIcon className="h-4 w-4" aria-hidden />}
          </motion.button>
        </form>
        <p className="login-access-note">Need access? <button type="button" onClick={() => setShowHelp(true)}>We’ll help you get started.</button></p>
      </motion.section>
    </main>
    <footer className="login-footer"><span>People. Coverage. Clarity.</span><span>PortCity Digital · Your connected workspace</span></footer>
    <Dialog open={showHelp} onClose={() => setShowHelp(false)} title="Platform Access & Credentials" description="A little help getting started" footer={<button type="button" className="rounded-lg border border-line px-4 py-2 text-sm" onClick={() => setShowHelp(false)}>Close</button>}>
      <p className="text-sm leading-relaxed text-ink-muted">Sign in with the account created by your administrator. Your account determines your workspace and access. Contact an account administrator if you need access or password assistance.</p>
    </Dialog>
  </div>;
}
