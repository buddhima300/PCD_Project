import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GraduationCapIcon,
  CheckCircle2Icon,
  ClockIcon,
  AwardIcon,
  AlertTriangleIcon,
  CalendarDaysIcon,
  ServerIcon,
  LaptopIcon,
  SparklesIcon,
  CheckIcon,
  ArrowRightIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Dialog } from '../../components/ui/Dialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DeptTag, ShiftTag } from '../../components/ui/Tags';
import { api } from '../../services/api';
import type { DeptCode, PlatformTrainingAssignment } from '../../types/domain';
import { deptNames } from '../../utils/format';
import { cn } from '../../utils/cn';

export function PlatformTraining() {
  const queryClient = useQueryClient();
  const [selectedTraining, setSelectedTraining] = useState<PlatformTrainingAssignment | null>(null);
  const [evaluationModal, setEvaluationModal] = useState<PlatformTrainingAssignment | null>(null);

  // Evaluation form state
  const [platformKnowledge, setPlatformKnowledge] = useState(5);
  const [deptKnowledge, setDeptKnowledge] = useState(5);
  const [processAccuracy, setProcessAccuracy] = useState(4);
  const [systemUsage, setSystemUsage] = useState(5);
  const [qualityStandards, setQualityStandards] = useState(5);
  const [feedback, setFeedback] = useState('Demonstrates exceptional aptitude in platform tools and payment exception workflows.');

  const q = useQuery({
    queryKey: ['trainings'],
    queryFn: () => api.listTrainings()
  });

  const progressMutation = useMutation({
    mutationFn: ({ id, day }: { id: string; day: number }) =>
      api.logTrainingProgress(id, day, `Supervisor approved completion of operational shift day ${day}.`),
    onSuccess: (updated) => {
      toast.success(`Training progress updated`, {
        description: `${updated.workerName} completed Day ${updated.completedTrainingDays}/${updated.requiredTrainingDays}.`
      });
      setSelectedTraining(updated);
      queryClient.invalidateQueries({ queryKey: ['trainings'] });
      queryClient.invalidateQueries({ queryKey: ['platform-demands'] });
      queryClient.invalidateQueries({ queryKey: ['platform-positions'] });
    }
  });

  const evalMutation = useMutation({
    mutationFn: ({ id, result, extensionDays }: { id: string; result: 'PASSED' | 'FAILED' | 'EXTEND'; extensionDays?: number }) =>
      api.evaluateTraining(id, {
        platformKnowledge,
        departmentKnowledge: deptKnowledge,
        processAccuracy,
        systemUsage,
        qualityStandards,
        result,
        extensionDays,
        feedback
      }),
    onSuccess: (updated, vars) => {
      if (vars.result === 'PASSED') {
        toast.success(`Qualification Passed: Permanent Production Activated!`, {
          description: `${updated.workerName} is now PRODUCTION_ACTIVE on ${updated.platformCode} (${updated.positionCode}). No second platform selection required.`
        });
      } else if (vars.result === 'EXTEND') {
        toast.warning(`Training Extended`, {
          description: `Added ${vars.extensionDays || 2} days on ${updated.platformCode}. Worker remains on same platform.`
        });
      } else {
        toast.error(`Training Failed`, {
          description: `Supervisor recorded training failure for ${updated.workerName}.`
        });
      }
      setEvaluationModal(null);
      setSelectedTraining(null);
      queryClient.invalidateQueries({ queryKey: ['trainings'] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['placement-queue'] });
      queryClient.invalidateQueries({ queryKey: ['platform-demands'] });
      queryClient.invalidateQueries({ queryKey: ['platform-positions'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['freelancers'] });
      queryClient.invalidateQueries({ queryKey: ['platforms'] });
    }
  });

  const trainings = q.data ?? [];
  const inTrainingCount = trainings.filter((t) => t.trainingStatus === 'IN_TRAINING').length;
  const completedCount = trainings.filter((t) => t.trainingStatus === 'TRAINING_COMPLETED').length;
  const extendedCount = trainings.filter((t) => t.trainingStatus === 'TRAINING_EXTENDED').length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="On-platform training & permanent qualification"
        description="Every new recruit trains directly on the operational platform where their vacancy exists. Upon completing 5 working days and passing supervisor evaluation, they automatically transition to permanent production staff on that same platform."
      />

      {/* KPI Counters */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-medium text-ink-subtle">Total on-platform trainees</p>
          <p className="mt-1 text-2xl font-bold text-ink tabular">{trainings.length}</p>
          <p className="mt-1 text-[11px] text-ink-muted">Assigned directly to production platforms</p>
        </div>
        <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-4">
          <p className="text-xs font-medium text-primary-800">Currently in training</p>
          <p className="mt-1 text-2xl font-bold text-primary-900 tabular">{inTrainingCount}</p>
          <p className="mt-1 text-[11px] text-primary-700">Occupying platform capacity</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="text-xs font-medium text-emerald-800">Graduated to production</p>
          <p className="mt-1 text-2xl font-bold text-emerald-900 tabular">{completedCount}</p>
          <p className="mt-1 text-[11px] text-emerald-700">Active permanent members on platform</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <p className="text-xs font-medium text-amber-800">Extended qualification</p>
          <p className="mt-1 text-2xl font-bold text-amber-900 tabular">{extendedCount}</p>
          <p className="mt-1 text-[11px] text-amber-700">Reinforcement days on same platform</p>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Active on-platform training assignments"
          description="Track daily shift progress and execute final supervisor evaluations."
        />

        <QueryView query={q}>
          {(items) => (
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line bg-mist/50 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                    <th className="px-4 py-2.5">Platform</th>
                    <th className="px-3 py-2.5">Dept</th>
                    <th className="px-4 py-2.5">Worker</th>
                    <th className="px-3 py-2.5">Position</th>
                    <th className="px-3 py-2.5">Shift</th>
                    <th className="px-3 py-2.5">Progress</th>
                    <th className="px-3 py-2.5">Training Status</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((t) => {
                    const percent = Math.min(100, Math.round((t.completedTrainingDays / t.requiredTrainingDays) * 100));
                    const isComplete = t.completedTrainingDays >= t.requiredTrainingDays;
                    return (
                      <tr key={t.id} className="hover:bg-mist/30">
                        <td className="px-4 py-3">
                          <span className="font-bold text-primary-700">{t.platformCode}</span>
                          <span className="ml-1 text-[11px] text-ink-subtle">{t.categoryCode}</span>
                        </td>
                        <td className="px-3 py-3">
                          <DeptTag dept={t.dept} />
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-ink">{t.workerName}</p>
                          <p className="font-mono text-[11px] text-ink-subtle">{t.workerId}</p>
                        </td>
                        <td className="px-3 py-3 font-mono font-semibold text-ink">
                          {t.positionCode}
                        </td>
                        <td className="px-3 py-3">
                          <ShiftTag shift={t.shift} />
                        </td>
                        <td className="px-3 py-3">
                          <div className="w-32">
                            <div className="flex items-center justify-between text-[11px] font-medium text-ink">
                              <span>
                                {t.completedTrainingDays} / {t.requiredTrainingDays} days
                              </span>
                              <span>{percent}%</span>
                            </div>
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-mist">
                              <div
                                className={cn('h-full transition-all', isComplete ? 'bg-emerald-500' : 'bg-primary-600')}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={t.trainingStatus} size="xs" />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button size="xs" variant="secondary" onClick={() => setSelectedTraining(t)}>
                              View Progress
                            </Button>
                            {t.trainingStatus === 'IN_TRAINING' || t.trainingStatus === 'TRAINING_EXTENDED' ? (
                              isComplete ? (
                                <Button
                                  size="xs"
                                  onClick={() => setEvaluationModal(t)}
                                  icon={<AwardIcon className="h-3 w-3 text-amber-400" />}
                                >
                                  Evaluate
                                </Button>
                              ) : (
                                <Button
                                  size="xs"
                                  variant="secondary"
                                  onClick={() => progressMutation.mutate({ id: t.id, day: t.completedTrainingDays + 1 })}
                                  loading={progressMutation.isPending}
                                  icon={<CheckIcon className="h-3 w-3 text-emerald-600" />}
                                >
                                  Advance Day
                                </Button>
                              )
                            ) : null}
                          </div>
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

      {/* Progress Detail Modal */}
      {selectedTraining && (
        <Dialog
          open={!!selectedTraining}
          onClose={() => setSelectedTraining(null)}
          size="lg"
          title={`On-Platform Training: ${selectedTraining.workerName}`}
          description={`${selectedTraining.platformCode} · Position ${selectedTraining.positionCode} · ${selectedTraining.dept}`}
          footer={
            <div className="flex w-full items-center justify-between">
              <span className="text-xs text-ink-muted">
                Completed {selectedTraining.completedTrainingDays} of {selectedTraining.requiredTrainingDays} working days
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setSelectedTraining(null)}>
                  Close
                </Button>
                {selectedTraining.completedTrainingDays < selectedTraining.requiredTrainingDays && (
                  <Button
                    size="sm"
                    onClick={() => progressMutation.mutate({ id: selectedTraining.id, day: selectedTraining.completedTrainingDays + 1 })}
                    loading={progressMutation.isPending}
                    icon={<CheckIcon className="h-4 w-4" />}
                  >
                    Simulate Day {selectedTraining.completedTrainingDays + 1} Completion
                  </Button>
                )}
                {selectedTraining.completedTrainingDays >= selectedTraining.requiredTrainingDays &&
                  selectedTraining.trainingStatus === 'IN_TRAINING' && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setEvaluationModal(selectedTraining);
                        setSelectedTraining(null);
                      }}
                      icon={<AwardIcon className="h-4 w-4 text-amber-300" />}
                    >
                      Complete Supervisor Evaluation
                    </Button>
                  )}
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-mist/40 p-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div>
                <p className="text-ink-subtle">Platform</p>
                <p className="font-bold text-primary-700 text-sm">{selectedTraining.platformCode}</p>
              </div>
              <div>
                <p className="text-ink-subtle">Assigned Position</p>
                <p className="font-mono font-bold text-ink text-sm">{selectedTraining.positionCode}</p>
              </div>
              <div>
                <p className="text-ink-subtle">Workstation</p>
                <p className="font-mono text-ink">{selectedTraining.workstationId?.slice(-18)}</p>
              </div>
              <div>
                <p className="text-ink-subtle">Shift</p>
                <p className="font-semibold text-ink">{selectedTraining.shift}</p>
              </div>
            </div>

            {/* Daily Progression Timeline */}
            <div>
              <h4 className="text-xs font-semibold text-ink uppercase tracking-wide">Daily Shift Progress</h4>
              <div className="mt-2.5 divide-y divide-line rounded-xl border border-line bg-surface">
                {selectedTraining.dailyLogs.map((log) => (
                  <div key={log.day} className="flex items-center justify-between p-3 text-xs">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-bold text-xs',
                          log.status === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : log.status === 'IN_PROGRESS'
                            ? 'bg-primary-100 text-primary-800'
                            : 'bg-mist text-ink-subtle'
                        )}
                      >
                        {log.day}
                      </div>
                      <div>
                        <p className="font-semibold text-ink">
                          Day {log.day} · {log.date}
                        </p>
                        <p className="text-[11px] text-ink-muted">{log.notes || 'Scheduled platform operational shift'}</p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'rounded px-2 py-0.5 text-[10px] font-bold uppercase',
                        log.status === 'COMPLETED'
                          ? 'bg-emerald-50 text-emerald-700'
                          : log.status === 'IN_PROGRESS'
                          ? 'bg-primary-50 text-primary-700'
                          : 'bg-mist text-ink-subtle'
                      )}
                    >
                      {log.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-primary-200 bg-primary-50/60 p-3 text-xs text-primary-950 font-medium">
              &ldquo;This worker is training on {selectedTraining.platformCode} and will automatically become a permanent member of{' '}
              {selectedTraining.platformCode} upon passing qualification evaluation.&rdquo;
            </div>
          </div>
        </Dialog>
      )}

      {/* Supervisor Evaluation Modal */}
      {evaluationModal && (
        <Dialog
          open={!!evaluationModal}
          onClose={() => setEvaluationModal(null)}
          size="lg"
          title="Platform Qualification Evaluation"
          description={`Worker: ${evaluationModal.workerName} · Platform: ${evaluationModal.platformCode} · Position: ${evaluationModal.positionCode}`}
          footer={
            <div className="flex w-full items-center justify-between">
              <Button size="sm" variant="secondary" onClick={() => setEvaluationModal(null)}>
                Cancel
              </Button>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => evalMutation.mutate({ id: evaluationModal.id, result: 'EXTEND', extensionDays: 2 })}
                  loading={evalMutation.isPending}
                >
                  Extend (+2 Days)
                </Button>
                <Button
                  size="sm"
                  onClick={() => evalMutation.mutate({ id: evaluationModal.id, result: 'PASSED' })}
                  loading={evalMutation.isPending}
                  icon={<AwardIcon className="h-4 w-4 text-emerald-400" />}
                >
                  Grade PASSED & Activate Permanently
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-mist/30 p-3 text-xs text-ink-muted">
              Rate the candidate across the 5 core operational dimensions. Passing evaluation activates position{' '}
              <strong>{evaluationModal.positionCode}</strong> permanently on <strong>{evaluationModal.platformCode}</strong> without requiring a second platform selection.
            </div>

            <div className="space-y-3">
              {[
                { label: 'Platform Knowledge (Brand workflows & tools)', val: platformKnowledge, set: setPlatformKnowledge },
                { label: 'Department Knowledge (Deposit/KYC standards)', val: deptKnowledge, set: setDeptKnowledge },
                { label: 'Process Accuracy (Reconciliation speed & zero errors)', val: processAccuracy, set: setProcessAccuracy },
                { label: 'System Usage (Back-office and terminal operations)', val: systemUsage, set: setSystemUsage },
                { label: 'Quality Standards & Compliance (Escalation protocol)', val: qualityStandards, set: setQualityStandards }
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between rounded-lg border border-line p-2.5 text-xs">
                  <span className="font-medium text-ink">{row.label}</span>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => row.set(star)}
                        className={cn(
                          'h-7 w-7 rounded-md font-bold text-xs transition-all',
                          row.val >= star ? 'bg-primary text-white' : 'border border-line bg-canvas text-ink-subtle hover:bg-mist'
                        )}
                      >
                        {star}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="text-xs font-semibold text-ink">Supervisor Assessment Feedback</label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-line bg-canvas p-2 text-xs focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
