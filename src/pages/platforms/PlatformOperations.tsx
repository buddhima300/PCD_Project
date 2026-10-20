import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PlatformTable } from '../../components/platform/PlatformTable';
import { Card } from '../../components/ui/Card';
import { Dialog } from '../../components/ui/Dialog';
import { Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { ScopeFilters, type Scope } from '../../components/ui/ScopeFilters';
import { QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Tabs } from '../../components/ui/Tabs';
import { WorkspaceSummary } from '../../components/ui/WorkspaceSummary';
import { api } from '../../services/api';
import type { ShiftCode } from '../../types/domain';
import { PlatformSetupActions } from '../../components/platform/PlatformSetup';

type Mode = 'live' | ShiftCode;

export function PlatformOperations({ embedded = false }: { embedded?: boolean }) {
  const [scope, setScope] = useState<Scope>({ category: '', platform: '', dept: '' });
  const [opStatus, setOpStatus] = useState('');
  const [mode, setMode] = useState<Mode>('live');
  const [sort, setSort] = useState('attention');
  const [compact, setCompact] = useState(false);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const status = opStatus === 'SETUP' ? undefined : opStatus === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
  const q = useQuery({ queryKey: ['platforms', { category: scope.category, dept: scope.dept, opStatus, status }], queryFn: () => api.listPlatforms({ category: scope.category, dept: scope.dept, status }), refetchInterval:15000 });
  const detail = useQuery({ queryKey: ['platform', selectedCode], queryFn: () => api.getPlatform(selectedCode ?? ''), enabled: !!selectedCode });
  const rows = q.data?.filter(platform => (!scope.platform || platform.code === scope.platform) && (!opStatus || (platform.shiftStatuses?.[mode === 'live' ? platform.equipmentShift ?? 'MORNING' : mode] ?? platform.opStatus) === opStatus));
  const platforms = rows ? [...rows].sort((a, b) => sort === 'capacity' ? b.totalWorkstations - a.totalWorkstations : sort === 'attention' ? (b.activeIncidents - a.activeIncidents) || (b.pendingReplacements - a.pendingReplacements) || a.code.localeCompare(b.code) : a.code.localeCompare(b.code)) : [];
  const occupied = rows?.reduce((sum, platform) => sum + platform.occupancy.reduce((seats, occupancy) => seats + (mode === 'live' ? occupancy.occupiedNow : mode === 'MORNING' ? occupancy.morning : occupancy.night), 0), 0);
  return <div className={compact ? 'workspace-compact' : undefined}>
    {!embedded && <PageHeader title="Platform operations" description="Inspect platform coverage, staffing gaps and operational issues." actions={<PlatformSetupActions compact />} />}
    {embedded && <div className="mb-3 flex justify-end"><PlatformSetupActions compact /></div>}
    <WorkspaceSummary label="Filtered platform summary" items={[
      { label: 'Matching platforms', value: rows?.length },
      { label: 'Configured seats', value: rows?.reduce((sum, platform) => sum + platform.totalWorkstations, 0) },
      { label: mode === 'live' ? 'Occupied now' : 'Rostered staff', value: occupied },
      { label: 'Pending replacements', value: rows?.reduce((sum, platform) => sum + platform.pendingReplacements, 0) },
      { label: 'Open incidents', value: rows?.reduce((sum, platform) => sum + platform.activeIncidents, 0) },
    ]} />
    {embedded && <div className="mb-3"><h2 className="text-base font-semibold">Live operations</h2><p className="mt-1 text-xs text-ink-muted">Platforms with incidents and coverage gaps appear first. Select a row to inspect it.</p></div>}
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <ScopeFilters value={scope} onChange={setScope} show={['category', 'platform', 'dept']} />
        <Select compact aria-label="Operational status" className="w-40" value={opStatus} onChange={event => setOpStatus(event.target.value)} placeholder="Any status" options={['SETUP', 'CONFLICT', 'EQUIPMENT_SHORTAGE', 'NEEDS_ALLOCATION', 'STAFFING_GAP', 'READY', 'OPERATING', 'INACTIVE'].map(status => ({ value: status, label: status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g,' ') }))} />
        <Select compact aria-label="Platform sort" className="w-40" value={sort} onChange={event => setSort(event.target.value)} options={[{ value: 'attention', label: 'Pending work first' }, { value: 'code', label: 'Platform code' }, { value: 'capacity', label: 'Largest capacity' }]} />
        <button aria-pressed={compact} onClick={() => setCompact(!compact)} className="rounded-lg border border-line px-3 py-2 text-xs text-ink-muted">{compact ? 'Comfortable rows' : 'Compact rows'}</button>
        {(opStatus || Object.values(scope).some(Boolean)) && <button onClick={() => { setScope({ category: '', platform: '', dept: '' }); setOpStatus(''); }} className="px-3 py-2 text-xs text-primary">Clear filters</button>}
      </div>
      <div className="border-b border-line px-3 py-2"><Tabs value={mode} onChange={setMode} tabs={[{ id: 'live', label: 'Live occupancy' }, { id: 'MORNING', label: 'Morning roster' }, { id: 'NIGHT', label: 'Night roster' }]} /></div>
      <QueryView query={q} isEmpty={() => platforms.length === 0}>{() => <PlatformTable rows={platforms} mode={mode} onSelect={platform => setSelectedCode(platform.code)} />}</QueryView>
    </Card>
    <Dialog open={!!selectedCode} onClose={() => setSelectedCode(null)} placement="right" title={selectedCode ?? 'Platform details'} description="Coverage and operational attention" footer={selectedCode && <Link to={`/platforms/${selectedCode}`} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white">Open full record</Link>}>
      <QueryView query={detail}>{data => <><StatusBadge status={data.platform.opStatus} /><h3 className="mb-3 mt-5 text-sm font-semibold">Department coverage · live</h3><dl className="space-y-3">{data.platform.occupancy.map(occupancy => <div key={occupancy.dept} className="flex justify-between border-b border-line pb-3 text-sm"><dt>{occupancy.dept}</dt><dd>{occupancy.occupiedNow} / {occupancy.capacity} seats</dd></div>)}</dl><h3 className="mb-3 mt-5 text-sm font-semibold">Pending work</h3><dl className="space-y-3 text-sm"><div className="flex justify-between"><dt>Replacements</dt><dd>{data.platform.pendingReplacements}</dd></div><div className="flex justify-between"><dt>Open incidents</dt><dd>{data.platform.activeIncidents}</dd></div></dl></>}</QueryView>
    </Dialog>
  </div>;
}
