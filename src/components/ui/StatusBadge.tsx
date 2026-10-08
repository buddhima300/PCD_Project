import React from "react";
import { ActivityIcon, AlertOctagonIcon, ArchiveIcon, ArrowDownLeftIcon, ArrowLeftRightIcon, ArrowUpRightIcon, BanIcon, CalendarClockIcon, CalendarOffIcon, CheckCheckIcon, CheckCircle2Icon, CircleDotIcon, ClockIcon, GaugeIcon, LockIcon, MailIcon, MinusCircleIcon, PlaneIcon, RepeatIcon, SearchIcon, ShieldAlertIcon, ShieldCheckIcon, SirenIcon, TriangleAlertIcon, UserCheckIcon, UserXIcon, WrenchIcon, XCircleIcon, XOctagonIcon, BoxIcon } from "lucide-react";
import { cn } from "../../utils/cn";
import { humanize } from "../../utils/format";
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'neutral';
export const toneClass: Record<Tone, string> = {
  success: 'bg-success-50 text-success-600 ring-success-100',
  warning: 'bg-warning-50 text-warning-600 ring-warning-100',
  danger: 'bg-danger-50 text-danger-600 ring-danger-100',
  info: 'bg-primary-50 text-primary-700 ring-primary-100',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100',
  neutral: 'bg-mist text-ink-muted ring-line'
};
const map: Record<string, {
  tone: Tone;
  icon: typeof BoxIcon;
  label?: string;
}> = {
  ACTIVE: {
    tone: 'success',
    icon: CheckCircle2Icon
  },
  INACTIVE: {
    tone: 'neutral',
    icon: MinusCircleIcon
  },
  OPERATIONAL: {
    tone: 'success',
    icon: ActivityIcon
  },
  FULL: {
    tone: 'info',
    icon: GaugeIcon
  },
  WARNING: {
    tone: 'warning',
    icon: TriangleAlertIcon
  },
  INCIDENT: {
    tone: 'danger',
    icon: ShieldAlertIcon
  },
  AVAILABLE: {
    tone: 'success',
    icon: CheckCircle2Icon
  },
  PARTIAL: {
    tone: 'warning',
    icon: CircleDotIcon,
    label: 'Partial'
  },
  ASSIGNED: {
    tone: 'info',
    icon: UserCheckIcon
  },
  HANDOVER_PENDING: {
    tone: 'warning',
    icon: ArrowLeftRightIcon,
    label: 'Handover pending'
  },
  MAINTENANCE: {
    tone: 'neutral',
    icon: WrenchIcon
  },
  RETIRED: {
    tone: 'neutral',
    icon: ArchiveIcon
  },
  PENDING: {
    tone: 'warning',
    icon: ClockIcon
  },
  SEARCHING: {
    tone: 'info',
    icon: SearchIcon
  },
  CONFIRMED: {
    tone: 'success',
    icon: CheckCheckIcon
  },
  CANCELLED: {
    tone: 'neutral',
    icon: XCircleIcon
  },
  FAILED: {
    tone: 'danger',
    icon: XOctagonIcon
  },
  OUTGOING_CONFIRMED: {
    tone: 'info',
    icon: ArrowUpRightIcon,
    label: 'Outgoing confirmed'
  },
  RECEIVED: {
    tone: 'info',
    icon: ArrowDownLeftIcon
  },
  ISSUE_REPORTED: {
    tone: 'danger',
    icon: AlertOctagonIcon,
    label: 'Issue reported'
  },
  COMPLETED: {
    tone: 'success',
    icon: CheckCircle2Icon
  },
  WORKING: {
    tone: 'success',
    icon: CheckCircle2Icon
  },
  OFF: {
    tone: 'violet',
    icon: CalendarOffIcon
  },
  ABSENT: {
    tone: 'danger',
    icon: UserXIcon
  },
  REPLACED: {
    tone: 'info',
    icon: RepeatIcon
  },
  LEAVE: {
    tone: 'warning',
    icon: PlaneIcon
  },
  ON_LEAVE: {
    tone: 'warning',
    icon: PlaneIcon,
    label: 'On leave'
  },
  SUSPENDED: {
    tone: 'danger',
    icon: BanIcon
  },
  APPROVED: {
    tone: 'success',
    icon: CheckCircle2Icon
  },
  REJECTED: {
    tone: 'danger',
    icon: XCircleIcon
  },
  REQUESTED: {
    tone: 'warning',
    icon: ClockIcon
  },
  OVERRIDE_APPROVED: {
    tone: 'violet',
    icon: ShieldCheckIcon,
    label: 'Override approved'
  },
  UNAVAILABLE: {
    tone: 'neutral',
    icon: BanIcon
  },
  CONFLICT: {
    tone: 'danger',
    icon: TriangleAlertIcon
  },
  OPEN: {
    tone: 'danger',
    icon: CircleDotIcon
  },
  IN_PROGRESS: {
    tone: 'warning',
    icon: WrenchIcon,
    label: 'In progress'
  },
  RESOLVED: {
    tone: 'success',
    icon: CheckCircle2Icon
  },
  LOCKED: {
    tone: 'danger',
    icon: LockIcon
  },
  INVITED: {
    tone: 'info',
    icon: MailIcon
  },
  PLANNED: {
    tone: 'info',
    icon: CalendarClockIcon
  },
  EMERGENCY: {
    tone: 'danger',
    icon: SirenIcon
  },
  LOW: {
    tone: 'neutral',
    icon: CircleDotIcon
  },
  MEDIUM: {
    tone: 'warning',
    icon: CircleDotIcon
  },
  HIGH: {
    tone: 'danger',
    icon: TriangleAlertIcon
  },
  CRITICAL: {
    tone: 'danger',
    icon: SirenIcon
  },
  GOOD: {
    tone: 'success',
    icon: CheckCircle2Icon
  },
  FAIR: {
    tone: 'warning',
    icon: CircleDotIcon
  },
  DAMAGED: {
    tone: 'danger',
    icon: AlertOctagonIcon
  },
  SENT: {
    tone: 'info',
    icon: MailIcon,
    label: 'Email sent'
  },
  DELIVERED: {
    tone: 'success',
    icon: MailIcon,
    label: 'Email delivered'
  },
  NOT_SENT: {
    tone: 'neutral',
    icon: MailIcon,
    label: 'In-app only'
  },
  CURRENT: {
    tone: 'info',
    icon: CircleDotIcon
  },
  SCHEDULED: {
    tone: 'warning',
    icon: CalendarClockIcon
  },
  CONNECTED: {
    tone: 'success',
    icon: CheckCircle2Icon
  },
  DEGRADED: {
    tone: 'warning',
    icon: TriangleAlertIcon
  }
};
export function statusTone(status: string): Tone {
  return map[status]?.tone ?? 'neutral';
}
interface StatusBadgeProps {
  status: string;
  label?: string;
  size?: 'sm' | 'xs';
  className?: string;
}
export function StatusBadge({
  status,
  label,
  size = 'sm',
  className
}: StatusBadgeProps) {
  const cfg = map[status] ?? {
    tone: 'neutral' as Tone,
    icon: CircleDotIcon
  };
  const Icon = cfg.icon;
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md font-medium ring-1 ring-inset', size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-px text-[11px]', toneClass[cfg.tone], className)}>
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-3 w-3'} aria-hidden />
      {label ?? cfg.label ?? humanize(status)}
    </span>;
}
export function Tag({
  children,
  tone = 'neutral',
  className




}: {children: React.ReactNode;tone?: Tone;className?: string;}) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset', toneClass[tone], className)}>
      {children}
    </span>;
}