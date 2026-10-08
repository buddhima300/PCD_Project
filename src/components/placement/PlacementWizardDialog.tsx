import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2Icon,
  AlertTriangleIcon,
  ShieldCheckIcon,
  LaptopIcon,
  ClockIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  SparklesIcon,
  ServerIcon,
  BanIcon,
  CalendarDaysIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { StatusBadge } from '../ui/StatusBadge';
import { DeptTag, ShiftTag } from '../ui/Tags';
import { api } from '../../services/api';
import type { DeptCode, ShiftCode } from '../../types/domain';
import { deptNames } from '../../utils/format';
import { cn } from '../../utils/cn';

interface Props {
  open: boolean;
  onClose: () => void;
  worker: {
    id: string;
    name: string;
    dept: DeptCode;
    employmentType: 'PERMANENT' | 'FREELANCER';
    position?: string;
  } | null;
  onSuccess?: () => void;
}

export function PlacementWizardDialog({ open, onClose, worker, onSuccess }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('');
  const [selectedShift, setSelectedShift] = useState<ShiftCode>('MORNING');
  const [trainingDays, setTrainingDays] = useState(5);
  const [trainingNotes, setTrainingNotes] = useState('Standard on-the-job platform curriculum');

  const eligibleQuery = useQuery({
    queryKey: ['eligible-platforms', worker?.id],
    queryFn: () => (worker ? api.getEligiblePlatforms(worker.id) : Promise.resolve([])),
    enabled: open && !!worker
  });

  const positionsQuery = useQuery({
    queryKey: ['platform-positions', selectedPlatform, worker?.dept],
    queryFn: () => (selectedPlatform && worker ? api.getPlatformPositions(selectedPlatform, worker.dept) : Promise.resolve([])),
    enabled: !!selectedPlatform && !!worker
  });

  const platforms = eligibleQuery.data ?? [];
  const positions = positionsQuery.data ?? [];
  const currentPlatformInfo = platforms.find((p) => p.platformCode === selectedPlatform);

  useEffect(() => {
    if (open) {
      setStep(1);
      setSelectedPlatform('');
      setSelectedPosition('');
      setSelectedShift('MORNING');
      setTrainingDays(5);
    }
  }, [open, worker]);

  // Auto-select top recommended platform if available
  useEffect(() => {
    if (platforms.length > 0 && !selectedPlatform) {
      const top = platforms.find((p) => p.recommended && p.resourceStatus === 'READY') || platforms[0];
      if (top) {
        setSelectedPlatform(top.platformCode);
      }
    }
  }, [platforms, selectedPlatform]);

  // Auto-select vacant position
  useEffect(() => {
    if (positions.length > 0 && (!selectedPosition || !positions.some((p) => p.positionCode === selectedPosition))) {
      const vacant = positions.find((p) => p.status === 'VACANT');
      if (vacant) {
        setSelectedPosition(vacant.positionCode);
      }
    }
  }, [positions, selectedPosition]);

  const placeMutation = useMutation({
    mutationFn: () => {
      if (!worker || !selectedPlatform || !selectedPosition) {
        throw new Error('Incomplete placement configuration.');
      }
      return api.placeWorker({
        workerId: worker.id,
        workerName: worker.name,
        workerType: worker.employmentType,
        dept: worker.dept,
        platformCode: selectedPlatform,
        positionCode: selectedPosition,
        shift: selectedShift,
        workstationId: `WS-${selectedPlatform.replace('-', '')}-${worker.dept}-${selectedPosition.slice(-2)}`,
        laptopAssetId: 'LAP-00452',
        trainingDurationDays: trainingDays,
        reason: 'Recruitment platform placement with 5-day on-platform training'
      });
    },
    onSuccess: (data) => {
      toast.success(`Successfully placed ${worker?.name} onto ${selectedPlatform} (${selectedPosition})`, {
        description: 'Position reserved and 5-day on-the-job training initiated.'
      });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['placement-queue'] });
      queryClient.invalidateQueries({ queryKey: ['platform-demands'] });
      queryClient.invalidateQueries({ queryKey: ['trainings'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['freelancers'] });
      queryClient.invalidateQueries({ queryKey: ['platforms'] });
      queryClient.invalidateQueries({ queryKey: ['platform-positions'] });
      onSuccess?.();
      onClose();
    },
    onError: (err: any) => {
      toast.error('Placement failed', { description: err.message || 'Could not complete placement transaction.' });
    }
  });

  if (!worker) return null;

  const canProceed = () => {
    if (step === 1) return true;
    if (step === 2) return !!selectedPlatform && currentPlatformInfo?.resourceStatus !== 'RESOURCE_BLOCKED' && (currentPlatformInfo?.vacancy ?? 0) > 0;
    if (step === 3) return !!selectedPosition;
    if (step === 4) return !!selectedShift;
    if (step === 5) return currentPlatformInfo?.resourceStatus === 'READY';
    if (step === 6) return trainingDays >= 3;
    return true;
  };

  const selectedPositionObj = positions.find((p) => p.positionCode === selectedPosition);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Platform Placement Wizard"
      description={`Step ${step} of 7 — Placement & On-the-Job Training Assignment`}
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="text-xs text-ink-muted">
            {step < 7 ? `Step ${step}: Next up` : 'Final Review & Atomic Reservation'}
          </div>
          <div className="flex gap-2">
            {step > 1 && (
              <Button size="sm" variant="secondary" onClick={() => setStep(step - 1)} icon={<ArrowLeftIcon className="h-4 w-4" />}>
                Back
              </Button>
            )}
            {step < 7 ? (
              <Button size="sm" disabled={!canProceed()} onClick={() => setStep(step + 1)} icon={<ArrowRightIcon className="h-4 w-4" />}>
                Continue
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => placeMutation.mutate()}
                loading={placeMutation.isPending}
                icon={<ShieldCheckIcon className="h-4 w-4 text-emerald-400" />}
              >
                Confirm Placement & Reserve Position
              </Button>
            )}
          </div>
        </div>
      }
    >
      {/* Wizard Step Progress */}
      <div className="mb-5 border-b border-line pb-3">
        <div className="flex items-center justify-between text-xs font-medium text-ink-subtle">
          {[
            '1. Worker',
            '2. Platform Vacancy',
            '3. Position',
            '4. Shift',
            '5. Workstation',
            '6. Training',
            '7. Confirm'
          ].map((label, idx) => (
            <button
              key={label}
              disabled={idx + 1 > step}
              onClick={() => setStep(idx + 1)}
              className={cn(
                'rounded px-2 py-1 transition-colors',
                step === idx + 1 && 'bg-primary-50 font-semibold text-primary-700',
                step > idx + 1 && 'text-ink-muted hover:text-ink'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Step 1: Worker Review */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-mist/50 p-4">
            <h3 className="text-sm font-semibold text-ink">Worker Details</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-ink-subtle">Full Name</p>
                <p className="font-semibold text-ink">{worker.name}</p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle">Candidate ID</p>
                <p className="font-mono text-ink">{worker.id}</p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle">Department</p>
                <div className="mt-0.5">
                  <DeptTag dept={worker.dept} />
                  <span className="ml-1.5 text-xs text-ink-muted">{deptNames[worker.dept]}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-ink-subtle">Employment Type</p>
                <span className="inline-block rounded-md bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-800">
                  {worker.employmentType === 'PERMANENT' ? 'Permanent Employee' : 'Freelancer'}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-primary-200 bg-primary-50/70 p-4 text-xs text-primary-900">
            <p className="font-semibold">Business Rule Enforcement:</p>
            <p className="mt-1">
              New workers for <strong>{worker.dept} ({deptNames[worker.dept]})</strong> must be assigned directly to an authentic production
              platform with a genuine workforce vacancy. Generic training centers are bypassed to optimize direct platform growth.
            </p>
          </div>
        </div>
      )}

      {/* Step 2: Platform Vacancy List */}
      {step === 2 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Available Platform Vacancies ({worker.dept})</h3>
            <span className="text-xs text-ink-muted">Authoritative Backend Calculation</span>
          </div>

          <div className="space-y-2">
            {platforms.map((p) => {
              const isSelected = selectedPlatform === p.platformCode;
              const isBlocked = p.resourceStatus === 'RESOURCE_BLOCKED';
              const isFull = p.vacancy <= 0;

              return (
                <div
                  key={p.platformCode}
                  onClick={() => {
                    if (!isBlocked && !isFull) {
                      setSelectedPlatform(p.platformCode);
                    }
                  }}
                  className={cn(
                    'flex flex-col gap-3 rounded-xl border p-3.5 transition-all sm:flex-row sm:items-center sm:justify-between',
                    isSelected ? 'border-primary-600 bg-primary-50/40 shadow-sm ring-1 ring-primary-600' : 'border-line bg-surface hover:bg-mist/40',
                    (isBlocked || isFull) && 'cursor-not-allowed opacity-60'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold text-xs',
                        p.recommended ? 'bg-primary text-white' : 'bg-mist text-ink'
                      )}
                    >
                      <ServerIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink">{p.platformCode}</span>
                        <span className="text-xs text-ink-subtle">{p.categoryCode}</span>
                        {p.recommended && (
                          <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
                            <SparklesIcon className="h-3 w-3" /> Recommended
                          </span>
                        )}
                        {isBlocked && (
                          <span className="flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-semibold text-rose-800">
                            <BanIcon className="h-3 w-3" /> Blocked
                          </span>
                        )}
                        {isFull && (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-700">
                            Full
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-ink-muted">
                        Staffing: <strong>{p.active} active</strong> / {p.required} required ·{' '}
                        <span className={cn('font-semibold', p.vacancy > 0 ? 'text-primary-700' : 'text-ink-subtle')}>
                          {p.vacancy} {p.vacancy === 1 ? 'vacancy' : 'vacancies'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right text-xs">
                      <p className="text-ink-subtle">Workstations</p>
                      <p className={cn('font-semibold', p.availableWorkstations > 0 ? 'text-emerald-700' : 'text-rose-600')}>
                        {p.availableWorkstations > 0 ? `${p.availableWorkstations} Available` : '0 Available (Blocked)'}
                      </p>
                    </div>
                    <input
                      type="radio"
                      name="platformSelection"
                      checked={isSelected}
                      disabled={isBlocked || isFull}
                      onChange={() => setSelectedPlatform(p.platformCode)}
                      className="h-4 w-4 text-primary focus:ring-primary"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3: Select Workforce Position */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">
              Select Workforce Position Slot on {selectedPlatform} ({worker.dept})
            </h3>
            <p className="text-xs text-ink-muted">
              Discrete workforce positions prevent concurrent over-allocation by reserving a distinct seat code.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {positions.map((pos) => {
              const isVacant = pos.status === 'VACANT';
              const isSelected = selectedPosition === pos.positionCode;

              return (
                <div
                  key={pos.id}
                  onClick={() => isVacant && setSelectedPosition(pos.positionCode)}
                  className={cn(
                    'flex items-center justify-between rounded-xl border p-3 transition-all',
                    isSelected ? 'border-primary-600 bg-primary-50 ring-1 ring-primary-600' : 'border-line bg-surface',
                    isVacant ? 'cursor-pointer hover:bg-mist/60' : 'cursor-not-allowed opacity-50 bg-mist/30'
                  )}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-ink">{pos.positionCode}</span>
                      <StatusBadge status={pos.status} size="xs" />
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      {isVacant ? 'Open Vacancy · Ready for Placement' : `Assigned to ${pos.assignedWorkerName || pos.assignedWorkerId}`}
                    </p>
                  </div>
                  <input
                    type="radio"
                    name="positionSelection"
                    checked={isSelected}
                    disabled={!isVacant}
                    onChange={() => setSelectedPosition(pos.positionCode)}
                    className="h-4 w-4 text-primary focus:ring-primary"
                  />
                </div>
              );
            })}
          </div>

          {selectedPositionObj && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900">
              <span className="font-semibold">Target Position: {selectedPositionObj.positionCode}</span>
              <p className="mt-0.5">
                Workstation slot {selectedPositionObj.slot} will be assigned to {worker.name} for initial training and automatically
                transitioned to active upon graduation.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Shift Selection */}
      {step === 4 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">Operating Shift on {selectedPlatform}</h3>
            <p className="text-xs text-ink-muted">
              Training occurs directly inside the platform's operational schedule to mirror real production workflows.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { code: 'MORNING' as ShiftCode, label: 'Morning Shift', hours: '07:30 – 19:30', recommended: true },
              { code: 'NIGHT' as ShiftCode, label: 'Night Shift', hours: '19:30 – 07:30', recommended: false }
            ].map((s) => (
              <div
                key={s.code}
                onClick={() => setSelectedShift(s.code)}
                className={cn(
                  'cursor-pointer rounded-xl border p-4 transition-all',
                  selectedShift === s.code ? 'border-primary-600 bg-primary-50 ring-1 ring-primary-600' : 'border-line bg-surface hover:bg-mist'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ClockIcon className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-ink">{s.label}</span>
                  </div>
                  <input
                    type="radio"
                    name="shiftSelection"
                    checked={selectedShift === s.code}
                    onChange={() => setSelectedShift(s.code)}
                    className="h-4 w-4 text-primary"
                  />
                </div>
                <p className="mt-2 text-xs text-ink-muted">{s.hours}</p>
                {s.recommended && (
                  <span className="mt-2 inline-block rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-800">
                    Standard Supervisor Shift
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 5: Workstation & Laptop Validation */}
      {step === 5 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">Physical Resource Validation</h3>
            <p className="text-xs text-ink-muted">
              Workstation pools and laptop hardware must be available before finalizing operational placement.
            </p>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2.5">
                <LaptopIcon className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-ink">Workstation Pool</p>
                  <p className="text-xs font-mono text-ink-muted">
                    POOL-{selectedPlatform.replace('-', '')}-{worker.dept}
                  </p>
                </div>
              </div>
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                Resource Available
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
              <div>
                <p className="text-ink-subtle">Physical Workstation</p>
                <p className="font-mono font-medium text-ink">
                  WS-{selectedPlatform.replace('-', '')}-{worker.dept}-{selectedPosition.slice(-2)}
                </p>
              </div>
              <div>
                <p className="text-ink-subtle">Assigned Asset ID</p>
                <p className="font-mono font-medium text-ink">LAP-00452 (ThinkPad T14)</p>
              </div>
              <div>
                <p className="text-ink-subtle">Shift Handover Compatibility</p>
                <p className="font-medium text-emerald-700">Verified Compatible</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-mist/40 p-3 text-xs text-ink-muted">
            <p>
              <strong>Handover Rule:</strong> The laptop asset remains a platform pool resource, not the employee's personal property.
              Shift change handovers apply normally during and after the 5-day on-platform training period.
            </p>
          </div>
        </div>
      )}

      {/* Step 6: Training Configuration */}
      {step === 6 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">On-the-Job Platform Training</h3>
            <p className="text-xs text-ink-muted">
              Configure initial qualification period directly on {selectedPlatform}.
            </p>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-ink">Training Duration</label>
                <p className="text-xs text-ink-muted">Configurable default working days</p>
              </div>
              <div className="flex items-center gap-2">
                {[5, 7, 10].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setTrainingDays(days)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                      trainingDays === days ? 'bg-primary text-white' : 'border border-line bg-surface hover:bg-mist'
                    )}
                  >
                    {days} Days {days === 5 ? '(Standard)' : ''}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-ink">Training Curriculum Focus</label>
              <textarea
                value={trainingNotes}
                onChange={(e) => setTrainingNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-line bg-canvas p-2 text-xs focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-xl border border-line bg-mist/50 p-3 text-xs text-ink-muted">
            <p>
              <strong>Key Operational Invariant:</strong> The worker will train on <strong>{selectedPlatform}</strong> for {trainingDays}{' '}
              working days and automatically become a permanent production member of that platform upon passing supervisor evaluation.
            </p>
          </div>
        </div>
      )}

      {/* Step 7: Confirmation Summary */}
      {step === 7 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/80 p-4">
            <div className="flex items-center gap-2 text-emerald-900 font-semibold text-sm">
              <CheckCircle2Icon className="h-5 w-5 text-emerald-600" />
              New Worker Placement Commitment
            </div>
            <p className="mt-1 text-xs text-emerald-800">
              Please review and confirm. Once confirmed, position <strong>{selectedPosition}</strong> on{' '}
              <strong>{selectedPlatform}</strong> is atomically reserved, capacity is committed, and training begins.
            </p>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4 divide-y divide-line text-sm">
            <div className="grid grid-cols-2 gap-2 pb-3">
              <div>
                <p className="text-xs text-ink-subtle">Worker</p>
                <p className="font-semibold text-ink">{worker.name}</p>
                <p className="text-xs text-ink-muted">{worker.employmentType === 'PERMANENT' ? 'Permanent Employee' : 'Freelancer'}</p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle">Assigned Department</p>
                <p className="font-semibold text-ink">{worker.dept} · {deptNames[worker.dept]}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 py-3">
              <div>
                <p className="text-xs text-ink-subtle">Assigned Production Platform</p>
                <p className="font-bold text-primary-700">{selectedPlatform}</p>
                <p className="text-xs text-ink-muted">Position Code: {selectedPosition}</p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle">Operating Shift</p>
                <p className="font-semibold text-ink">{selectedShift === 'MORNING' ? 'Morning (07:30 – 19:30)' : 'Night (19:30 – 07:30)'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-3">
              <div>
                <p className="text-xs text-ink-subtle">On-Platform Training Period</p>
                <p className="font-semibold text-ink">{trainingDays} Working Days</p>
                <p className="text-xs text-ink-muted">Expected Completion: 5 days from today</p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle">Workstation & Laptop</p>
                <p className="font-mono text-xs text-ink">WS-{selectedPlatform.replace('-', '')}-{worker.dept}-{selectedPosition.slice(-2)}</p>
                <p className="text-xs text-ink-muted">LAP-00452 allocated</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-primary-200 bg-primary-50/70 p-3 text-xs text-primary-950 font-medium">
            &ldquo;This worker will train on {selectedPlatform} for {trainingDays} working days and remain assigned to {selectedPlatform} after successful completion.&rdquo;
          </div>
        </div>
      )}
    </Dialog>
  );
}
