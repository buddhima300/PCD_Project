import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ServerIcon,
  LaptopIcon,
  SparklesIcon,
  ShieldAlertIcon,
  CheckCircleIcon,
  BanIcon,
  LayersIcon
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DeptTag } from '../../components/ui/Tags';
import { api } from '../../services/api';
import type { DeptCode, PlatformDemand } from '../../types/domain';
import { deptNames } from '../../utils/format';
import { cn } from '../../utils/cn';

export function PlatformDemand() {
  const [dept, setDept] = useState<DeptCode | ''>('');
  const [category, setCategory] = useState<string>('');
  const [vacancyOnly, setVacancyOnly] = useState(false);
  const [selectedDemand, setSelectedDemand] = useState<PlatformDemand | null>(null);

  const q = useQuery({
    queryKey: ['platform-demands', { dept, category }],
    queryFn: () => api.listPlatformDemands(dept || undefined, category || undefined)
  });

  const positionsQuery = useQuery({
    queryKey: ['platform-positions', selectedDemand?.platformCode, selectedDemand?.dept],
    queryFn: () =>
      selectedDemand ? api.getPlatformPositions(selectedDemand.platformCode, selectedDemand.dept) : Promise.resolve([]),
    enabled: !!selectedDemand
  });

  let demands = q.data ?? [];
  if (vacancyOnly) {
    demands = demands.filter((d) => d.vacancy > 0);
  }

  const totalVacancies = demands.reduce((acc, d) => acc + d.vacancy, 0);
  const blockedVacancies = demands.filter((d) => d.resourceStatus === 'RESOURCE_BLOCKED').length;
  const readyVacancies = demands.filter((d) => d.resourceStatus === 'READY').length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Platform workforce demand & capacity"
        description="Live calculation of genuine platform workforce vacancies across departments and categories. Reflects immediate capacity reservations when trainees are placed."
        actions={
          <Link to="/placement-queue">
            <Button icon={<SparklesIcon className="h-4 w-4 text-amber-300" />}>
              Open Placement Queue
            </Button>
          </Link>
        }
      />

      {/* Summary KPI Counters */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-medium text-ink-subtle">Total platform vacancies</p>
          <p className="mt-1 text-2xl font-bold text-ink tabular">{totalVacancies}</p>
          <p className="mt-1 text-[11px] text-ink-muted">Across operational platforms</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="text-xs font-medium text-emerald-800">Ready for recruit placement</p>
          <p className="mt-1 text-2xl font-bold text-emerald-900 tabular">{readyVacancies}</p>
          <p className="mt-1 text-[11px] text-emerald-700">Vacancy + Workstations available</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
          <p className="text-xs font-medium text-rose-800">Resource blocked</p>
          <p className="mt-1 text-2xl font-bold text-rose-900 tabular">{blockedVacancies}</p>
          <p className="mt-1 text-[11px] text-rose-700">Vacancy exists but 0 laptops</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-medium text-ink-subtle">Active on-platform trainees</p>
          <p className="mt-1 text-2xl font-bold text-primary-700 tabular">
            {demands.reduce((acc, d) => acc + d.trainingHeadcount, 0)}
          </p>
          <p className="mt-1 text-[11px] text-ink-muted">Occupying platform capacity</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className={cn(selectedDemand ? 'xl:col-span-8' : 'xl:col-span-12')}>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
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
                  aria-label="Category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="All categories"
                  options={['KANE', 'JAX', 'REX', 'IRIS', 'ZANE'].map((c) => ({ value: c, label: `Category ${c}` }))}
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vacancyOnly}
                    onChange={(e) => setVacancyOnly(e.target.checked)}
                    className="h-4 w-4 rounded text-primary focus:ring-primary"
                  />
                  Show Vacancies Only
                </label>
              </div>
            </div>

            <QueryView query={q}>
              {(items) => (
                <div className="scroll-thin overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-line bg-mist/50 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                        <th className="px-4 py-2.5">Platform</th>
                        <th className="px-3 py-2.5">Dept</th>
                        <th className="px-3 py-2.5">Target Headcount</th>
                        <th className="px-3 py-2.5">Active Staff</th>
                        <th className="px-3 py-2.5">In Training</th>
                        <th className="px-3 py-2.5">Vacancy</th>
                        <th className="px-3 py-2.5">Workstations</th>
                        <th className="px-3 py-2.5">Resource Status</th>
                        <th className="px-4 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {demands.map((row) => {
                        const isSelected = selectedDemand?.platformCode === row.platformCode && selectedDemand?.dept === row.dept;
                        return (
                          <tr
                            key={`${row.platformCode}-${row.dept}`}
                            onClick={() => setSelectedDemand(row)}
                            className={cn('cursor-pointer hover:bg-mist/40 transition-colors', isSelected && 'bg-primary-50/50')}
                          >
                            <td className="px-4 py-3 font-semibold text-ink">
                              <span className="font-bold text-primary-700">{row.platformCode}</span>
                              <span className="ml-1.5 text-ink-subtle">{row.categoryCode}</span>
                            </td>
                            <td className="px-3 py-3">
                              <DeptTag dept={row.dept} />
                            </td>
                            <td className="px-3 py-3 font-semibold tabular">{row.targetHeadcount}</td>
                            <td className="px-3 py-3 tabular text-ink-muted">{row.activeHeadcount}</td>
                            <td className="px-3 py-3 tabular">
                              {row.trainingHeadcount > 0 ? (
                                <span className="font-bold text-primary-700">{row.trainingHeadcount} trainee</span>
                              ) : (
                                <span className="text-ink-subtle">0</span>
                              )}
                            </td>
                            <td className="px-3 py-3 tabular">
                              <span
                                className={cn(
                                  'font-bold rounded px-1.5 py-0.5',
                                  row.vacancy > 0 ? 'bg-primary-100 text-primary-800' : 'text-ink-subtle'
                                )}
                              >
                                {row.vacancy}
                              </span>
                            </td>
                            <td className="px-3 py-3 tabular">
                              <span className={row.availableWorkstations > 0 ? 'text-emerald-700 font-semibold' : 'text-rose-600'}>
                                {row.availableWorkstations} / {row.workstationCapacity} free
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              {row.resourceStatus === 'READY' && (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                  <CheckCircleIcon className="h-3 w-3" /> Ready
                                </span>
                              )}
                              {row.resourceStatus === 'RESOURCE_BLOCKED' && (
                                <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                                  <BanIcon className="h-3 w-3" /> Blocked
                                </span>
                              )}
                              {row.resourceStatus === 'FULL' && (
                                <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                                  Full
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                size="sm"
                                variant={isSelected ? 'primary' : 'secondary'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDemand(row);
                                }}
                              >
                                Positions
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </QueryView>
          </Card>
        </div>

        {/* Selected Platform Position Breakdown */}
        {selectedDemand && (
          <div className="xl:col-span-4 space-y-4">
            <Card>
              <CardHeader
                title={`${selectedDemand.platformCode} / ${selectedDemand.dept} Positions`}
                description={`Workforce capacity: ${selectedDemand.activeHeadcount + selectedDemand.trainingHeadcount} / ${selectedDemand.targetHeadcount}`}
                action={
                  <button
                    onClick={() => setSelectedDemand(null)}
                    className="text-xs text-ink-subtle hover:text-ink"
                  >
                    Close
                  </button>
                }
              />
              <div className="p-4 space-y-2.5">
                <QueryView query={positionsQuery}>
                  {(positions) => (
                    <div className="space-y-2">
                      {positions.map((pos) => (
                        <div
                          key={pos.id}
                          className="flex items-center justify-between rounded-xl border border-line bg-surface p-3 text-xs"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-ink">{pos.positionCode}</span>
                              <StatusBadge status={pos.status} size="xs" />
                            </div>
                            <p className="mt-1 text-ink-muted">
                              {pos.status === 'ACTIVE' && (
                                <span>Assigned to {pos.assignedWorkerName || pos.assignedWorkerId}</span>
                              )}
                              {pos.status === 'TRAINING' && (
                                <span className="font-semibold text-primary-700">
                                  Trainee: {pos.assignedWorkerName || pos.assignedWorkerId}
                                </span>
                              )}
                              {pos.status === 'VACANT' && (
                                <span className="text-emerald-700 font-medium">Unfilled Vacancy · Ready for Placement</span>
                              )}
                            </p>
                          </div>
                          <div className="text-right text-[11px] font-mono text-ink-subtle">
                            {pos.workstationId?.slice(-5)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </QueryView>

                {selectedDemand.vacancy > 0 && selectedDemand.resourceStatus === 'READY' && (
                  <div className="pt-2">
                    <Link to="/placement-queue">
                      <Button size="sm" className="w-full" icon={<SparklesIcon className="h-4 w-4" />}>
                        Place Recruit to Fill Vacancy
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
