import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowRightIcon,
  BriefcaseIcon,
  ShieldCheckIcon,
  UserRoundCogIcon,
  LockIcon,
  MailIcon,
  EyeIcon,
  EyeOffIcon,
  CheckIcon,
  MoonIcon,
  SunIcon,
  HelpCircleIcon,
  XIcon,
  SparklesIcon,
  TriangleAlertIcon,
  LayersIcon,
  InfoIcon,
} from 'lucide-react';
import { demoUsers } from '../data/reference';
import { roleLabels } from '../data/navigation';
import { useSessionStore } from '../hooks/useSessionStore';
import { api, errorMessage } from '../services/api';
import type { Role } from '../types/domain';

const schema = z.object({
  email: z.string().min(1, 'Enter your work email').email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type FormValues = z.infer<typeof schema>;

const roleConfig: Record<Role, {
  icon: typeof ShieldCheckIcon;
  badge: string;
  hint: string;
  gradient: string;
  color: string;
  accentBg: string;
}> = {
  SUPERVISOR: {
    icon: ShieldCheckIcon,
    badge: 'SUPERVISOR',
    hint: 'Full operations, scheduling, configuration & audit',
    gradient: 'from-blue-600 to-indigo-700',
    color: '#2457E8',
    accentBg: 'bg-primary-50 text-primary-700 border-primary-200',
  },
  EMPLOYEE: {
    icon: BriefcaseIcon,
    badge: 'EMPLOYEE',
    hint: 'KANE-13 · DP · Night shift operations',
    gradient: 'from-sky-500 to-blue-600',
    color: '#0284C7',
    accentBg: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  FREELANCER: {
    icon: UserRoundCogIcon,
    badge: 'FREELANCER',
    hint: 'DP freelancer · Priority 1 queue coverage',
    gradient: 'from-indigo-500 to-violet-600',
    color: '#6366F1',
    accentBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
};

export function Login() {
  const user = useSessionStore((s) => s.user);
  const signIn = useSessionStore((s) => s.signIn);
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Role | null>('SUPERVISOR');
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const { register, handleSubmit, setValue, watch, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: demoUsers[0]?.email || '',
      password: 'demo-password',
    },
  });

  const currentEmail = watch('email');

  const loginMutation = useMutation({
    mutationFn: (v: FormValues) => api.login(v.email, v.password),
    onSuccess: (u) => {
      signIn(u);
      navigate('/');
    },
  });

  if (user) return <Navigate to="/" replace />;

  const handleSelectRole = (r: Role) => {
    setSelectedRole(r);
    const targetUser = demoUsers.find((u) => u.role === r);
    if (targetUser) {
      setValue('email', targetUser.email, { shouldValidate: true });
      setValue('password', 'demo-password', { shouldValidate: true });
    }
  };

  const activeDemoUser = demoUsers.find((u) => u.email.toLowerCase() === currentEmail.trim().toLowerCase()) 
    || demoUsers.find((u) => u.role === selectedRole);

  return (
    <div className={`min-h-screen w-full relative flex flex-col justify-between items-center px-4 py-8 sm:py-12 transition-colors duration-500 overflow-x-hidden font-sans select-none ${
      isDarkMode 
        ? 'bg-gradient-to-b from-[#0B0F19] via-[#111827] to-[#0D1322] text-white' 
        : 'neumorph-canvas text-ink'
    }`}>
      {/* ============================================================ */}
      {/* AMBIENT BACKGROUND SHAPES & DECORATIONS (FROM REFERENCE IMAGE 1 & 2) */}
      {/* ============================================================ */}

      {/* Top-Left Ambient Frosted Glass Ring */}
      <div 
        className="ambient-glass-ring absolute -top-24 -left-24 sm:-top-32 sm:-left-32 w-80 h-80 sm:w-96 sm:h-96 rounded-full pointer-events-none opacity-70 transition-transform duration-1000 ease-out hover:scale-105"
        aria-hidden="true"
      />

      {/* Mid-Right Floating Glass Orb */}
      <div 
        className="ambient-glass-orb absolute top-28 sm:top-36 -right-12 sm:-right-8 w-32 h-32 sm:w-48 sm:h-48 rounded-full pointer-events-none opacity-80"
        aria-hidden="true"
      />

      {/* Bottom-Left Concentric Glass Wave */}
      <div 
        className="ambient-glass-ring absolute -bottom-24 -left-20 w-72 h-72 sm:w-88 sm:h-88 rounded-full pointer-events-none opacity-50"
        aria-hidden="true"
      />

      {/* Floating Typography Showcase Badge (Homage to Reference Image 2: "Inter Google Font") */}
      <div className="hidden lg:flex items-center gap-2 absolute top-10 left-12 z-20">
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-tight text-ink/90 flex items-center gap-1.5">
            Inter
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-700 tracking-wide uppercase">
              UI
            </span>
          </span>
          <span className="text-xs text-ink-subtle">Google Font Craft</span>
        </div>
      </div>

      {/* Top Bar Actions (Theme Toggle & Info) */}
      <header className="w-full max-w-5xl flex justify-between items-center z-20 mb-4 sm:mb-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl neumorph-btn text-primary">
            <LayersIcon className="h-4 w-4" />
          </span>
          <div>
            <span className="text-sm font-bold tracking-tight text-ink">Relay WFM</span>
            <span className="hidden sm:inline-block text-[11px] text-ink-muted ml-2 font-medium tracking-wide">
              BPO Platform Console
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Help Modal Trigger */}
          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            title="Platform Help & Information"
            className="w-10 h-10 rounded-2xl neumorph-btn flex items-center justify-center text-ink-muted hover:text-primary transition-colors"
          >
            <HelpCircleIcon className="w-4 h-4" />
          </button>

          {/* Theme Toggle (Exact Squircle from Reference Image 1 top right) */}
          <button
            type="button"
            onClick={() => setIsDarkMode(!isDarkMode)}
            title={isDarkMode ? 'Switch to light neumorphic theme' : 'Switch to ambient dark theme'}
            className="w-10 h-10 rounded-2xl neumorph-btn flex items-center justify-center text-ink-muted hover:text-primary transition-transform active:scale-95"
          >
            {isDarkMode ? (
              <SunIcon className="w-4 h-4 text-amber-400" />
            ) : (
              <MoonIcon className="w-4 h-4 text-ink-muted" />
            )}
          </button>
        </div>
      </header>

      {/* ============================================================ */}
      {/* MAIN NEUMORPHIC CARD (ACCORDING TO REFERENCE IMAGE 1 & 2) */}
      {/* ============================================================ */}
      <main className="w-full flex-1 flex flex-col justify-center items-center py-4 z-10 relative">
        <div className="w-full max-w-[420px] sm:max-w-[440px] neumorph-card rounded-[32px] sm:rounded-[36px] p-6 sm:p-9 relative transition-all duration-300">
          
          {/* Floating 3D Brand Logo Medallion (From Reference Image 1) */}
          <div className="flex justify-center -mt-16 sm:-mt-20 mb-4">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-[28px] sm:rounded-[32px] neumorph-medallion flex items-center justify-center p-3.5 relative group cursor-pointer transition-transform duration-300 hover:scale-105">
              {/* Layered 3D Liquid Waves SVG Emblem */}
              <svg 
                viewBox="0 0 100 100" 
                className="w-full h-full drop-shadow-[0_8px_16px_rgba(36,87,232,0.35)] transition-transform duration-500 group-hover:rotate-6"
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  {/* Top Crystal Wave Gradient */}
                  <linearGradient id="crestGlass" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
                    <stop offset="60%" stopColor="#DCE6FE" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#93C5FD" stopOpacity="0.7" />
                  </linearGradient>

                  {/* Mid Vivid Blue Gradient */}
                  <linearGradient id="midVividBlue" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#60A5FA" />
                    <stop offset="50%" stopColor="#2563EB" />
                    <stop offset="100%" stopColor="#1D4ED8" />
                  </linearGradient>

                  {/* Deep Royal Blue Gradient */}
                  <linearGradient id="deepRoyalBlue" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#1E40AF" />
                    <stop offset="50%" stopColor="#1D4ED8" />
                    <stop offset="100%" stopColor="#0F172A" />
                  </linearGradient>

                  {/* Specular Highlight Filter */}
                  <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="1" dy="3" stdDeviation="2" floodColor="#1C44C2" floodOpacity="0.3" />
                  </filter>
                </defs>

                {/* Back / Deep Wave */}
                <path
                  d="M38 78C30 74 26 62 31 52C36 42 47 38 43 25C54 32 58 45 52 56C47 66 50 74 38 78Z"
                  fill="url(#deepRoyalBlue)"
                  filter="url(#softGlow)"
                />

                {/* Middle Radiant Wave */}
                <path
                  d="M48 74C40 70 38 56 46 45C52 35 56 25 50 16C62 23 68 37 60 49C54 59 58 68 48 74Z"
                  fill="url(#midVividBlue)"
                />

                {/* Front Frosted Glass Crest */}
                <path
                  d="M58 66C52 62 52 48 60 38C66 28 68 20 62 14C72 19 76 30 71 40C66 50 68 59 58 66Z"
                  fill="url(#crestGlass)"
                />
              </svg>

              {/* Glossy Reflection Arc */}
              <div className="absolute inset-0 rounded-[28px] sm:rounded-[32px] pointer-events-none border border-white/60 bg-gradient-to-t from-transparent via-white/10 to-white/40" />
            </div>
          </div>

          {/* Heading & Subtitle */}
          <div className="text-center mb-6">
            <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-ink">
              Welcome Back
            </h1>
            <p className="mt-1 text-xs sm:text-[13px] font-medium tracking-[0.16em] uppercase text-ink-muted">
              Sign in to continue
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit((v) => loginMutation.mutate(v))} className="space-y-4" noValidate>
            
            {/* Input 1: Username / Work Email */}
            <div className="space-y-1">
              <div className="relative flex items-center neumorph-inset rounded-2xl px-4 py-3 sm:py-3.5 transition-all">
                <MailIcon className="h-5 w-5 text-ink-subtle mr-3 shrink-0" aria-hidden="true" />
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="Username or Email"
                  aria-invalid={Boolean(formState.errors.email)}
                  className="w-full bg-transparent border-0 outline-none text-sm font-medium text-ink placeholder:text-ink-subtle/80 focus:ring-0 p-0"
                  {...register('email')}
                />
              </div>
              {formState.errors.email && (
                <p role="alert" className="text-xs font-medium text-danger-600 px-3">
                  {formState.errors.email.message}
                </p>
              )}
            </div>

            {/* Input 2: Password */}
            <div className="space-y-1">
              <div className="relative flex items-center neumorph-inset rounded-2xl px-4 py-3 sm:py-3.5 transition-all">
                <LockIcon className="h-5 w-5 text-ink-subtle mr-3 shrink-0" aria-hidden="true" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Password"
                  aria-invalid={Boolean(formState.errors.password)}
                  className="w-full bg-transparent border-0 outline-none text-sm font-medium text-ink placeholder:text-ink-subtle/80 focus:ring-0 p-0"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-ink-subtle hover:text-ink transition-colors ml-2 p-1 focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOffIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
              {formState.errors.password && (
                <p role="alert" className="text-xs font-medium text-danger-600 px-3">
                  {formState.errors.password.message}
                </p>
              )}
            </div>

            {/* Form Options: Remember Me & Forgot Password */}
            <div className="flex items-center justify-between pt-1 pb-1">
              {/* Neumorphic Styled Checkbox */}
              <label 
                htmlFor="rememberMe" 
                className="flex items-center gap-2.5 cursor-pointer text-xs sm:text-[13px] font-medium text-ink/80 select-none group"
              >
                <div 
                  onClick={() => setRememberMe(!rememberMe)}
                  className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all ${
                    rememberMe 
                      ? 'bg-primary text-white shadow-[0_2px_8px_rgba(36,87,232,0.4)]' 
                      : 'neumorph-inset bg-white text-transparent border border-line-strong'
                  }`}
                >
                  <CheckIcon className={`w-3.5 h-3.5 stroke-[3] transition-transform ${rememberMe ? 'scale-100' : 'scale-0'}`} />
                </div>
                <input
                  id="rememberMe"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="sr-only"
                />
                <span className="group-hover:text-ink transition-colors">Remember Me</span>
              </label>

              {/* Forgot Password Link */}
              <button
                type="button"
                onClick={() => setShowHelpModal(true)}
                className="text-xs sm:text-[13px] font-semibold text-primary hover:text-primary-700 transition-colors"
              >
                Forgot Password?
              </button>
            </div>

            {/* Error Message Box */}
            {loginMutation.isError && (
              <div 
                role="alert" 
                className="rounded-2xl border border-danger-100 bg-danger-50/90 px-4 py-3 text-xs font-medium text-danger-700 flex items-center gap-2.5 shadow-sm"
              >
                <TriangleAlertIcon className="w-4 h-4 shrink-0 text-danger-600" />
                <span>{errorMessage(loginMutation.error)}</span>
              </div>
            )}

            {/* Primary Action Button (Vibrant Pill CTA from Reference Image 1) */}
            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full h-13 sm:h-14 rounded-2xl neumorph-cta-btn flex items-center justify-center relative font-semibold text-white text-base tracking-wide mt-3 group"
            >
              {loginMutation.isPending ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Signing in...</span>
                </div>
              ) : (
                <>
                  <span className="mx-auto pl-8">Login</span>
                  <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center absolute right-3 backdrop-blur-sm shadow-sm transition-transform group-hover:translate-x-0.5">
                    <ArrowRightIcon className="w-4 h-4 text-white" />
                  </span>
                </>
              )}
            </button>
          </form>

          {/* Divider: "OR CONTINUE WITH" (From Reference Image 1) */}
          <div className="my-6 flex items-center">
            <div className="flex-1 border-t border-[#DDE5F2]/80" />
            <span className="px-3 text-[11px] font-bold tracking-[0.14em] text-ink-subtle uppercase">
              Or continue with
            </span>
            <div className="flex-1 border-t border-[#DDE5F2]/80" />
          </div>

          {/* Neumorphic Role Quick-Select Squircles (Reference Image 1 Social Buttons Layout) */}
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-4 sm:gap-5">
              {demoUsers.map((u) => {
                const conf = roleConfig[u.role];
                const Icon = conf.icon;
                const isSelected = activeDemoUser?.id === u.id;

                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelectRole(u.role)}
                    title={`Select ${roleLabels[u.role]}: ${u.name}`}
                    className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl neumorph-btn flex flex-col items-center justify-center relative cursor-pointer group transition-all duration-200 ${
                      isSelected 
                        ? 'is-active ring-2 ring-primary ring-offset-2 ring-offset-white' 
                        : ''
                    }`}
                  >
                    <Icon 
                      className="w-6 h-6 transition-transform group-hover:scale-110" 
                      style={{ color: conf.color }} 
                    />
                    
                    {/* Active Checkmark Pin */}
                    {isSelected && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center shadow-sm">
                        <CheckIcon className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active Selected Role Preview Banner */}
            {activeDemoUser && (
              <div className="mt-3 p-3 rounded-2xl neumorph-inset flex items-center justify-between text-left transition-all">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-2 h-2 rounded-full ${
                    activeDemoUser.role === 'SUPERVISOR' ? 'bg-primary' : activeDemoUser.role === 'EMPLOYEE' ? 'bg-sky-500' : 'bg-indigo-500'
                  } shrink-0`} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink truncate">
                      {activeDemoUser.name} <span className="text-[11px] font-normal text-ink-muted">({roleLabels[activeDemoUser.role]})</span>
                    </p>
                    <p className="text-[11px] text-ink-subtle truncate">
                      {roleConfig[activeDemoUser.role].hint}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => loginMutation.mutate({ email: activeDemoUser.email, password: 'demo-password' })}
                  disabled={loginMutation.isPending}
                  className="shrink-0 ml-2 px-2.5 py-1 rounded-xl bg-white border border-line text-[11px] font-semibold text-primary hover:bg-primary-50 transition-colors shadow-sm"
                >
                  Quick Sign-in
                </button>
              </div>
            )}
          </div>

          {/* Reference Image 2 Style Footer Text */}
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => setShowHelpModal(true)}
              className="text-xs text-ink-muted hover:text-primary transition-colors font-medium"
            >
              Need operational credentials? <span className="font-semibold text-primary">View Info</span>
            </button>
          </div>
        </div>
      </main>

      {/* ============================================================ */}
      {/* BOTTOM TAGLINE & METRICS (FROM REFERENCE IMAGE 1 & 2) */}
      {/* ============================================================ */}
      <footer className="w-full max-w-4xl flex flex-col sm:flex-row items-center justify-between gap-3 text-center z-10 pt-4">
        {/* Spaced Uppercase Tagline (Matching Image 1: "PLAY • COMPETE • GROW TOGETHER") */}
        <p className="text-[11px] sm:text-xs font-bold tracking-[0.25em] text-ink-subtle/80 uppercase mx-auto sm:mx-0">
          ALLOCATION • CAPACITY • REPLACEMENTS • SHIFTS
        </p>

        {/* Platform Codes Badge */}
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
          <span>Supported Platforms:</span>
          <span className="font-semibold text-ink">KANE · JAX · REX · IRIS · ZANE</span>
        </div>
      </footer>

      {/* Bottom Right Floating Badge (Matching Reference Image 1 "MORE THAN A GAME" tab) */}
      <aside className="hidden xl:block fixed bottom-4 right-6 z-20">
        <div className="neumorph-card rounded-2xl px-4 py-2.5 text-right shadow-lg">
          <p className="text-[10px] font-extrabold tracking-widest uppercase text-ink-subtle">
            BPO PLATFORM CONSOLE
          </p>
          <p className="text-xs font-semibold text-primary">
            Relay Workforce Operations
          </p>
        </div>
      </aside>

      {/* ============================================================ */}
      {/* HELP & PLATFORM CONSOLE INFORMATION MODAL */}
      {/* ============================================================ */}
      {showHelpModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/30 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowHelpModal(false)}
        >
          <div 
            className="w-full max-w-lg neumorph-card rounded-3xl p-6 sm:p-7 relative shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary">
                  <InfoIcon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-ink">Platform Access & Credentials</h3>
                  <p className="text-xs text-ink-muted">Enterprise Work Scheduling System</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="w-8 h-8 rounded-xl neumorph-btn flex items-center justify-center text-ink-muted hover:text-ink"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs text-ink-muted leading-relaxed">
              <p>
                Relay WFM governs workforce allocation, off-day capacity, and shift replacements across APAC sportsbook and casino platforms (KANE, JAX, REX, IRIS, ZANE).
              </p>

              <div className="grid grid-cols-3 gap-3 p-3 rounded-2xl bg-primary-50/50 border border-primary-100 text-center">
                <div>
                  <p className="text-sm font-bold text-ink">12h</p>
                  <p className="text-[10px] text-ink-muted">Morning / Night</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-ink">2 / day</p>
                  <p className="text-[10px] text-ink-muted">Off-day Dept Cap</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-ink">T-7</p>
                  <p className="text-[10px] text-ink-muted">Replacement Pool</p>
                </div>
              </div>

              <div>
                <p className="font-semibold text-ink mb-1.5">Pre-configured Demo Accounts:</p>
                <ul className="space-y-1.5">
                  {demoUsers.map((u) => (
                    <li key={u.id} className="p-2 rounded-xl border border-line bg-surface/60 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-ink">{u.name}</span>
                        <span className="text-[11px] text-ink-subtle ml-1.5">({roleLabels[u.role]})</span>
                        <p className="text-[11px] text-ink-muted">{u.email}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          handleSelectRole(u.role);
                          setShowHelpModal(false);
                        }}
                        className="px-2 py-1 rounded-lg bg-primary-50 text-primary font-semibold text-[11px] hover:bg-primary-100"
                      >
                        Fill
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-[11px] text-ink-subtle italic border-t border-line/60 pt-3">
                Biometric clock-in and attendance verification occur in the external payroll system.
              </p>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-2 rounded-xl neumorph-btn text-xs font-semibold text-ink"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}