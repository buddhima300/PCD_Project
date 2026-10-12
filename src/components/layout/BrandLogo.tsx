import { cn } from '../../utils/cn';

/** Uses the supplied logo unchanged; compact mode shows its city emblem. */
export function BrandLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return <span style={{ backgroundColor: compact ? 'transparent' : '#fff' }} className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg p-1', compact ? 'h-9 w-9' : 'h-12 w-24', className)}>
    <img src="/branding/portcity-digital-logo.png" alt="PortCity Digital" style={compact ? { clipPath: 'inset(0 54% 0 0)' } : undefined} className={compact ? 'h-8 w-auto max-w-none shrink-0 translate-x-[14px]' : 'h-full w-full object-contain'} />
  </span>;
}
