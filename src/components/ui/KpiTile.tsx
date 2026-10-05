import React from "react";
import { Link } from "react-router-dom";
import { cn } from "../../utils/cn";
import { toneClass, Tone } from "./StatusBadge";
import { BoxIcon } from "lucide-react";
interface KpiTileProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: BoxIcon;
  tone?: Tone;
  to?: string;
  emphasis?: boolean;
}
const tint: Record<Tone, string> = {
  info: 'bg-primary-50/60',
  success: 'bg-success-50/60',
  warning: 'bg-warning-50/70',
  danger: 'bg-danger-50/70',
  violet: 'bg-violet-50/60',
  neutral: 'bg-surface'
};
export function KpiTile({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'neutral',
  to,
  emphasis
}: KpiTileProps) {
  const body = <div className={cn('flex h-full items-start justify-between gap-3 rounded-2xl border border-line p-4', emphasis ? tint[tone] : 'bg-surface')}>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-ink-muted">{label}</p>
        <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink tabular">{value}</p>
        {sub && <p className="mt-0.5 truncate text-xs text-ink-muted">{sub}</p>}
      </div>
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset', toneClass[tone])}>
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
    </div>;
  if (!to) return body;
  return <Link to={to} className="block rounded-2xl transition-shadow duration-150 hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
      {body}
    </Link>;
}