import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlusIcon, ArrowRightIcon, CheckCircle2Icon, SparklesIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { DeptTag } from '../../components/ui/Tags';
import { api } from '../../services/api';
import type { DeptCode, InterviewResult } from '../../types/domain';
import { deptNames } from '../../utils/format';

export function RegisterWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dept, setDept] = useState<DeptCode>('DP');
  const [employmentType, setEmploymentType] = useState<'PERMANENT' | 'FREELANCER'>('PERMANENT');
  const [position, setPosition] = useState('Deposit Agent');
  const [interviewResult, setInterviewResult] = useState<InterviewResult>('SELECTED');
  const [notes, setNotes] = useState('Registered via workforce intake wizard.');

  const createMutation = useMutation({
    mutationFn: () =>
      api.createCandidate({
        name,
        email,
        phone,
        interviewDate: new Date().toISOString().slice(0, 10),
        interviewResult,
        employmentType,
        dept,
        position,
        notes
      }),
    onSuccess: (candidate) => {
      toast.success(`Candidate ${candidate.name} registered`, {
        description: 'Candidate is ready for platform vacancy placement.'
      });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['placement-queue'] });
      navigate('/placement-queue');
    },
    onError: (err: any) => {
      toast.error('Registration failed', { description: err.message || 'Could not register candidate.' });
    }
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Register new workforce candidate"
        description="Add a newly interviewed candidate and assign their department before selecting an authentic platform vacancy."
      />

      <Card>
        <CardHeader
          title="Intake details"
          description="Enter personal details, assigned operational department, and employment type."
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="p-5 space-y-4 text-xs"
        >
          <div>
            <label className="font-semibold text-ink">Full Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Maya Lin"
              className="mt-1 w-full rounded-lg border border-line bg-canvas p-2.5 text-xs focus:border-primary focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-ink">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="maya.lin@relayops.com"
                className="mt-1 w-full rounded-lg border border-line bg-canvas p-2.5 text-xs focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="font-semibold text-ink">Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+63 917 123 4567"
                className="mt-1 w-full rounded-lg border border-line bg-canvas p-2.5 text-xs focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-ink">Department</label>
              <select
                value={dept}
                onChange={(e) => setDept(e.target.value as DeptCode)}
                className="mt-1 w-full rounded-lg border border-line bg-canvas p-2.5 text-xs focus:border-primary focus:outline-none"
              >
                {(Object.keys(deptNames) as DeptCode[]).map((d) => (
                  <option key={d} value={d}>
                    {d} · {deptNames[d]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-semibold text-ink">Employment Type</label>
              <select
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value as any)}
                className="mt-1 w-full rounded-lg border border-line bg-canvas p-2.5 text-xs focus:border-primary focus:outline-none"
              >
                <option value="PERMANENT">Permanent Employee</option>
                <option value="FREELANCER">Freelancer</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-ink">Position / Role Title</label>
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="Deposit Agent"
                className="mt-1 w-full rounded-lg border border-line bg-canvas p-2.5 text-xs focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="font-semibold text-ink">Interview Result</label>
              <select
                value={interviewResult}
                onChange={(e) => setInterviewResult(e.target.value as any)}
                className="mt-1 w-full rounded-lg border border-line bg-canvas p-2.5 text-xs focus:border-primary focus:outline-none"
              >
                <option value="SELECTED">Selected (Ready for Placement)</option>
                <option value="RECOMMENDED">Recommended</option>
                <option value="PENDING">Pending Final Review</option>
              </select>
            </div>
          </div>

          <div>
            <label className="font-semibold text-ink">Recruitment Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-line bg-canvas p-2 text-xs focus:border-primary focus:outline-none"
            />
          </div>

          <div className="rounded-xl border border-primary-100 bg-primary-50/50 p-3 text-xs text-primary-950">
            <p className="font-semibold flex items-center gap-1.5">
              <SparklesIcon className="h-4 w-4 text-primary" /> Vacancy-Driven Placement Workflow:
            </p>
            <p className="mt-1 text-ink-muted">
              After registration, the supervisor will be taken directly to the Platform Placement Queue to match this recruit
              with an authentic production platform vacancy.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={createMutation.isPending}
              icon={<ArrowRightIcon className="h-4 w-4" />}
            >
              Register & Proceed to Placement
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
