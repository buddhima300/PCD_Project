import React from "react";
import { UseQueryResult } from "@tanstack/react-query";
import { InboxIcon, LockIcon, RefreshCwIcon, WifiOffIcon, SearchXIcon, BoxIcon } from "lucide-react";
import { ApiError } from "../../services/api";
import { cn } from "../../utils/cn";
import { Button } from "./Button";
export function Skeleton({
  className


}: {className?: string;}) {
  return <div className={cn('animate-pulse rounded-lg bg-mist', className)} />;
}
export function LoadingBlock({
  rows = 5,
  className



}: {rows?: number;className?: string;}) {
  return <div className={cn('space-y-2.5 p-5', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({
      length: rows
    }).map((_, i) => <Skeleton key={i} className="h-9" />)}
    </div>;
}
interface EmptyProps {
  title: string;
  description?: string;
  icon?: typeof BoxIcon;
  action?: React.ReactNode;
  className?: string;
}
export function EmptyState({
  title,
  description,
  icon: Icon = InboxIcon,
  action,
  className
}: EmptyProps) {
  return <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-mist text-ink-subtle">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>;
}
export function ErrorState({
  error,
  onRetry,
  className




}: {error: unknown;onRetry?: () => void;className?: string;}) {
  const e = error instanceof ApiError ? error : null;
  if (e?.code === 'FORBIDDEN') return <PermissionDenied message={e.message} className={className} />;
  const network = e?.code === 'NETWORK_FAILURE';
  const notFound = e?.code === 'NOT_FOUND';
  const Icon = network ? WifiOffIcon : notFound ? SearchXIcon : RefreshCwIcon;
  return <div role="alert" className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-danger-50 text-danger-600">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-ink">{network ? 'Network connection lost' : notFound ? 'Record not found' : 'Request could not be completed'}</p>
      <p className="mt-1 max-w-md text-sm text-ink-muted">{error instanceof Error ? error.message : 'The operations API returned an unexpected response.'}</p>
      {e && <p className="mt-1 font-mono text-[11px] text-ink-subtle">Code: {e.code}</p>}
      {onRetry && !notFound && <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry} icon={<RefreshCwIcon className="h-3.5 w-3.5" />}>
          Retry
        </Button>}
    </div>;
}
export function PermissionDenied({
  message,
  className



}: {message?: string;className?: string;}) {
  return <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-warning-50 text-warning-600">
        <LockIcon className="h-5 w-5" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-ink">Permission denied</p>
      <p className="mt-1 max-w-md text-sm text-ink-muted">{message ?? 'Your role does not have access to this area. Contact your system administrator if you need access.'}</p>
    </div>;
}
interface QueryViewProps<T> {
  query: UseQueryResult<T>;
  children: (data: T) => React.ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: React.ReactNode;
  loading?: React.ReactNode;
}
export function QueryView<T>({
  query,
  children,
  isEmpty,
  empty,
  loading
}: QueryViewProps<T>) {
  if (query.isPending) return <>{loading ?? <LoadingBlock />}</>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (isEmpty?.(query.data)) return <>{empty ?? <EmptyState title="No records match these filters" description="Adjust or clear filters to see more results." />}</>;
  return <>{children(query.data)}</>;
}