import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UsersIcon,
  UserCheckIcon,
  UserPlusIcon,
  CalendarCheckIcon,
  ClockIcon,
  SparklesIcon,
  ChevronRightIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Select } from '../../components/ui/Field';
import { KpiTile } from '../../components/ui/KpiTile';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DeptTag } from '../../components/ui/Tags';
import { PlacementWizardDialog } from '../../components/placement/PlacementWizardDialog';
import { api } from '../../services/api';
import type { CandidateStatus, DeptCode, RecruitCandidate } from '../../types/domain';
import { deptNames } from '../../utils/format';

export function Candidates() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState<DeptCode | ''>('');
  const [status, setStatus] = useState<string>('');
  const [placementWorker, setPlacementWorker] = useState<RecruitCandidate | null>(null);

  const q = useQuery({
    queryKey: ['candidates', { search, dept, status }],
    queryFn: () => api.listCandidates({ search, dept, status })
  });

  const selectMutation = useMutation({
    mutationFn: (cand: RecruitCandidate) => api.updateCandidateStatus(cand.id, 'SELECTED', 'Candidate marked as selected for platform placement.'),
    onSuccess: (_, cand) => {
      toast.success(`${cand.name} marked as SELECTED`, {
        description: 'Candidate is now ready for platform vacancy placement.'
      });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['placement-queue'] });
    }
  });

  const candidates = q.data ?? [];
  const selectedCount = candidates.filter((c) => c.status === 'SELECTED').length;
  const interviewingCount = candidates.filter((c) => c.status === 'INTERVIEW_SCHEDULED' || c.status === 'INTERVIEWED').length;
  const placedCount = candidates.filter((c) => c.status === 'PLACED').length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Candidate recruitment & selection"
        description="Recruitment pipeline for prospective permanent employees and freelancers. Once selected, supervisors place candidates directly into production platform vacancies."
        actions={
          <Button
            onClick={() => {
              const john = candidates.find((c) => c.id === 'CND-1052');
              if (john) setPlacementWorker(john);
              else toast.info('Select a candidate from the table below to place.');
            }}
            icon={<SparklesIcon className="h-4 w-4 text-amber-300" />}
          >
            Place John Silva (Demo Scenario)
          </Button>
        }
      />

      {/* Recruitment Pipeline KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Total candidates" value={candidates.length} sub="Pipeline registered" icon={UsersIcon} tone="info" />
        <KpiTile label="Selected candidates" value={selectedCount} sub="Ready for platform placement" icon={UserCheckIcon} tone="success" />
        <KpiTile label="Interviews in progress" value={interviewingCount} sub="Scheduled & reviewed" icon={ClockIcon} tone="warning" />
        <KpiTile label="Placed on platforms" value={placedCount} sub="In platform training / active" icon={CalendarCheckIcon} tone="violet" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search candidate ID, name, email" className="w-64" />
          <Select
            compact
            className="w-44"
            aria-label="Department"
            value={dept}
            onChange={(e) => setDept(e.target.value as DeptCode)}
            placeholder="All departments"
            options={(Object.keys(deptNames) as DeptCode[]).map((d) => ({ value: d, label: `${d} · ${deptNames[d]}` }))}
          />
          <Select
            compact
            className="w-40"
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="All statuses"
            options={[
              { value: 'SELECTED', label: 'Selected' },
              { value: 'INTERVIEW_SCHEDULED', label: 'Interview Scheduled' },
              { value: 'ONBOARDING', label: 'Onboarding' },
              { value: 'PLACED', label: 'Placed on Platform' },
              { value: 'WAITLISTED', label: 'Waitlisted' }
            ]}
          />
        </div>

        <QueryView query={q}>
          {(items) => (
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line bg-mist/50 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                    <th className="px-4 py-2.5">Candidate ID</th>
                    <th className="px-4 py-2.5">Name</th>
                    <th className="px-3 py-2.5">Department</th>
                    <th className="px-3 py-2.5">Position</th>
                    <th className="px-3 py-2.5">Employment</th>
                    <th className="px-3 py-2.5">Interview Date</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((c) => (
                    <tr key={c.id} className="hover:bg-mist/30">
                      <td className="px-4 py-3 font-mono font-semibold text-ink">{c.id}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink">{c.name}</p>
                        <p className="text-[11px] text-ink-subtle">{c.email}</p>
                      </td>
                      <td className="px-3 py-3">
                        <DeptTag dept={c.dept} />
                      </td>
                      <td className="px-3 py-3 text-ink-muted">{c.position}</td>
                      <td className="px-3 py-3">
                        <span className="rounded bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-800">
                          {c.employmentType === 'PERMANENT' ? 'Permanent' : 'Freelancer'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-ink-muted">{c.interviewDate}</td>
                      <td className="px-3 py-3">
                        <StatusBadge status={c.status} size="xs" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.status === 'SELECTED' || c.status === 'ONBOARDING' ? (
                          <Button
                            size="xs"
                            onClick={() => setPlacementWorker(c)}
                            icon={<SparklesIcon className="h-3 w-3 text-amber-500" />}
                          >
                            Place Worker
                          </Button>
                        ) : c.status === 'PLACED' ? (
                          <span className="text-xs font-medium text-emerald-600">Placed on Platform</span>
                        ) : (
                          <Button
                            size="xs"
                            variant="secondary"
                            onClick={() => selectMutation.mutate(c)}
                            loading={selectMutation.isPending}
                          >
                            Mark Selected
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryView>
      </Card>

      {/* Placement Wizard Dialog */}
      <PlacementWizardDialog
        open={!!placementWorker}
        onClose={() => setPlacementWorker(null)}
        worker={placementWorker}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['candidates'] });
        }}
      />
    </div>
  );
}
