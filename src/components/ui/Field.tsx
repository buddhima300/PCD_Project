import React from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

const base =
'w-full rounded-xl border border-line bg-surface text-sm text-ink placeholder:text-ink-subtle transition-[border-color,box-shadow] duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-mist disabled:text-ink-subtle';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(base, 'h-10 px-3', className)} {...rest} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(base, 'min-h-[88px] px-3 py-2', className)} {...rest} />;
});

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: {value: string;label: string;}[];
  placeholder?: string;
  compact?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select({ options, placeholder, className, compact, ...rest }, ref) {
  return (
    <div className={cn('relative', className)}>
      <select ref={ref} className={cn(base, 'appearance-none pl-3 pr-8', compact ? 'h-9 text-[13px]' : 'h-10')} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) =>
        <option key={o.value} value={o.value}>
            {o.label}
          </option>
        )}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
    </div>);

});

interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, error, hint, children, className }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {error ?
      <p role="alert" className="text-xs font-medium text-danger-600">
          {error}
        </p> :
      hint ?
      <p className="text-xs text-ink-subtle">{hint}</p> :
      null}
    </div>);

}

export function Checkbox({ label, checked, onChange, id }: {label: string;checked: boolean;onChange: (v: boolean) => void;id: string;}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-line-strong text-primary focus:ring-primary/30" />
      {label}
    </label>);

}