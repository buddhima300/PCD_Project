import { Link } from 'react-router-dom';
import type { PlatformSummary, ShiftCode } from '../../types/domain';
import { DataTable } from '../ui/DataTable';
import { StatusBadge } from '../ui/StatusBadge';

export function PlatformTable({ rows, mode = 'live', onSelect }: { rows: PlatformSummary[]; mode?: 'live' | ShiftCode; onSelect?: (platform: PlatformSummary) => void }) {
  const used = (platform: PlatformSummary) => platform.occupancy.reduce((sum, occupancy) => sum + (mode === 'live' ? occupancy.occupiedNow : mode === 'MORNING' ? occupancy.morning : occupancy.night), 0);
  return <DataTable rows={rows} rowKey={platform => platform.code} caption="Platform operations" onRowClick={onSelect} columns={[
    { key: 'code', header: 'Platform', cell: platform => onSelect ? <span className="font-semibold">{platform.code}</span> : <Link className="font-semibold text-primary" to={`/platforms/${platform.code}`}>{platform.code}</Link> },
    { key: 'category', header: 'Category', cell: platform => platform.categoryCode },
    { key: 'departments', header: 'Departments', cell: platform => platform.occupancy.map(occupancy => occupancy.dept).join(' · ') },
    { key: 'status', header: 'Status', cell: platform => <div className="space-y-1"><StatusBadge status={platform.shiftStatuses?.[mode === 'live' ? platform.equipmentShift ?? 'MORNING' : mode] ?? platform.opStatus} size="xs" /><p className="text-[10px] text-ink-muted">{platform.occupancy.reduce((n,o) => n+(o.coverage?.[mode === 'live' ? platform.equipmentShift ?? 'MORNING' : mode]?.vacancies ?? 0),0)} vacancies</p></div> },
    { key: 'occupancy', header: mode === 'live' ? 'Occupied / capacity' : 'Rostered / capacity', cell: platform => `${used(platform)} / ${platform.totalWorkstations}`, align: 'right' },
    { key: 'replacements', header: 'Pending replacements', cell: platform => platform.pendingReplacements, align: 'right' },
    { key: 'incidents', header: 'Open incidents', cell: platform => platform.activeIncidents, align: 'right' },
  ]} />;
}
