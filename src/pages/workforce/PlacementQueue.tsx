import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserPlusIcon,
  SparklesIcon,
  ServerIcon,
  LaptopIcon,
  ClockIcon,
  AlertCircleIcon,
  TrendingUpIcon
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DeptTag } from '../../components/ui/Tags';
import { PlacementWizardDialog } from '../../components/placement/PlacementWizardDialog';
import { api } from '../../services/api';
import type { DeptCode, PlacementQueueItem } from '../../types/domain';
import { deptNames } from '../../utils/format';

export function PlacementQueue() {
  const queryClient = useQueryClient();
  const [placementWorker, setPlacementWorker] = useState<PlacementQueueItem | null>(null);

  const queueQuery = useQuery({
    queryKey: ['placement-queue'],
    queryFn: () => api.listPlacementQueue()
  });

  const forecastQuery = useQuery({
    queryKey: ['demand-forecast'],
    queryFn: () => api.getDemandForecast()
  });

  const queue = queueQuery.data ?? [];
  const forecast = forecastQuery.data ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="New worker placement queue"
        description="Newly recruited employees and freelancers awaiting platform placement or currently in on-the-job training. Match recruits directly to genuine platform vacancies."
        actions={
          <Button
            onClick={() => {
              const john = queue.find((q) => q.workerId === 'CND-1052');
              if (john) setPlacementWorker(john);
              else if (queue.length > 0) setPlacementWorker(queue[0]);
            }}
            icon={<SparklesIcon className="h-4 w-4 text-amber-300" />}
          >
            Place New Worker
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <Card>
            <CardHeader
              title="Awaiting platform placement & in-training"
              description="Each worker must be provisioned onto an operational production platform in their department."
            />
            <QueryView query={queueQuery}>
              {(items) => (
                <div className="scroll-thin overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-line bg-mist/50 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                        <th className="px-4 py-2.5">Worker</th>
                        <th className="px-3 py-2.5">Dept</th>
                        <th className="px-3 py-2.5">Employment</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-3 py-2.5">Recommended Platform</th>
                        <th className="px-3 py-2.5">Workstation</th>
                        <th className="px-4 py-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {items.map((row) => (
                        <tr key={row.workerId} className="hover:bg-mist/30">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-ink">{row.workerName}</p>
                            <p className="font-mono text-[11px] text-ink-subtle">{row.workerId}</p>
                          </td>
                          <td className="px-3 py-3">
                            <DeptTag dept={row.dept} />
                          </td>
                          <td className="px-3 py-3">
                            <span className="rounded bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-800">
                              {row.employmentType === 'PERMANENT' ? 'Permanent' : 'Freelancer'}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <StatusBadge status={row.lifecycle} size="xs" />
                          </td>
                          <td className="px-3 py-3">
                            {row.assignedPlatform ? (
                              <span className="font-semibold text-ink">{row.assignedPlatform} ({row.assignedPosition})</span>
                            ) : (
                              <div className="flex items-center gap-1.5 text-primary-700 font-semibold">
                                <ServerIcon className="h-3.5 w-3.5" />
                                {row.recommendedPlatform || 'KANE-13'}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <span className="flex items-center gap-1 text-emerald-700 font-medium">
                              <LaptopIcon className="h-3.5 w-3.5 text-emerald-600" />
                              Available
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {row.lifecycle === 'IN_PLATFORM_TRAINING' || row.lifecycle === 'TRAINING_EXTENDED' ? (
                              <span className="text-xs font-semibold text-primary-700">Currently Training</span>
                            ) : (
                              <Button
                                size="xs"
                                onClick={() => setPlacementWorker(row)}
                                icon={<SparklesIcon className="h-3 w-3 text-amber-400" />}
                              >
                                Place Worker
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
        </div>

        {/* Demand & Vacancy Forecast Sidebar */}
        <div className="xl:col-span-4 space-y-4">
          <Card>
            <CardHeader
              title="Platform workforce demand forecast"
              description="Forecasted vacancies and planned expansion staffing."
            />
            <div className="p-4 space-y-3">
              {forecast.map((f) => (
                <div key={`${f.platformCode}-${f.dept}`} className="rounded-xl border border-line bg-mist/40 p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-semibold text-ink">
                      <span className="font-bold text-primary-700">{f.platformCode}</span>
                      <DeptTag dept={f.dept as DeptCode} />
                    </div>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        f.urgency === 'CRITICAL'
                          ? 'bg-rose-100 text-rose-800'
                          : f.urgency === 'HIGH'
                          ? 'bg-amber-100 text-amber-800'
                          : f.urgency === 'BLOCKED'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {f.urgency}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-ink-muted">
                    <span>Headcount: <strong>{f.currentHeadcount}</strong></span>
                    <span>Expected Vacancy: <strong>{f.expectedVacancy}</strong></span>
                  </div>
                  <p className="text-ink-subtle">{f.reason}</p>
                  <p className="border-t border-line/60 pt-1 text-[11px] font-medium text-ink">
                    Action: {f.recommendedAction}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Placement Wizard Dialog */}
      <PlacementWizardDialog
        open={!!placementWorker}
        onClose={() => setPlacementWorker(null)}
        worker={
          placementWorker
            ? {
                id: placementWorker.workerId,
                name: placementWorker.workerName,
                dept: placementWorker.dept,
                employmentType: placementWorker.employmentType
              }
            : null
        }
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['placement-queue'] });
          queryClient.invalidateQueries({ queryKey: ['candidates'] });
        }}
      />
    </div>
  );
}
