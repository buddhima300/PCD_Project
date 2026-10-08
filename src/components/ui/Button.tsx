import React from 'react';
import { Loader2Icon } from 'lucide-react';
import { cn } from '../../utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'xs' | 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-700 disabled:bg-primary-200',
  secondary: 'bg-surface text-ink border border-line hover:bg-mist hover:border-line-strong disabled:text-ink-subtle',
  ghost: 'text-ink-muted hover:bg-mist hover:text-ink',
  danger: 'bg-danger text-white hover:bg-danger-600 disabled:bg-danger-100',
  subtle: 'bg-primary-50 text-primary-700 hover:bg-primary-100'
};

const sizes: Record<Size, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1 rounded-md',
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl'
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
{ variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
ref)
{
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:active:scale-100',
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}>
      
      {loading ? <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>);

});