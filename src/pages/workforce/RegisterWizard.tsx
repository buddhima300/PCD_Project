import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRightIcon, SparklesIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { backend } from '../../services/backend';
import { useSessionStore } from '../../hooks/useSessionStore';
import { PermissionDenied } from '../../components/ui/States';
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
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const canRegister = useSessionStore(state => state.permissions.includes('accounts.manage'));

  const createMutation = useMutation({
    mutationFn: () =>
      backend.registerStaff({
        name,
        email,
        phone,
        password,
        interviewResult,
        employmentType,
        dept,
        position,
        notes
      }),
    onSuccess: ({ candidate }) => {
      setPassword(''); setConfirmation('');
      toast.success(`Candidate ${candidate.name} registered`, {
        description: 'Staff and login created together. They can sign in with this email and initial password, then change it under My profile.'
      });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['placement-queue'] });
      queryClient.invalidateQueries({ queryKey: ['workforce-overview'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['freelancers'] });
      queryClient.invalidateQueries({ queryKey: ['backend'] });
      navigate('/placement-queue');
    },
    onError: (err: any) => {
      toast.error('Registration failed', { description: err.message || 'Could not register candidate.' });
    }
  });
  if (!canRegister) return <PermissionDenied message="Staff registration with login access requires the accounts.manage permission." />;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Register staff"
        description="Register staff and create their login together, then continue to the existing placement workflow."
      />

      <Card>
        <CardHeader
          title="Intake details"
          description="Enter personal details, assigned operational department, and employment type."
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (password !== confirmation) { toast.error('Passwords do not match'); return; }
            if (createMutation.isPending) return;
            createMutation.mutate();
          }}
          className="p-5 space-y-4 text-xs"
        >
          <div>
            <label htmlFor="staff-name" className="font-semibold text-ink">Full Name</label>
            <input
              id="staff-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              placeholder="e.g. Kasun Perera"
              className="mt-1 w-full rounded-lg border border-line bg-canvas p-2.5 text-xs focus:border-primary focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="staff-email" className="font-semibold text-ink">Email Address</label>
              <input
                id="staff-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={254}
                placeholder="kasun@example.com"
                className="mt-1 w-full rounded-lg border border-line bg-canvas p-2.5 text-xs focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="staff-phone" className="font-semibold text-ink">Phone</label>
              <input
                id="staff-phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={50}
                placeholder="+94 77 123 4567"
                className="mt-1 w-full rounded-lg border border-line bg-canvas p-2.5 text-xs focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="staff-department" className="font-semibold text-ink">Department</label>
              <select
                id="staff-department"
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
              <label htmlFor="staff-type" className="font-semibold text-ink">Employment Type</label>
              <select
                id="staff-type"
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
              <label htmlFor="staff-position" className="font-semibold text-ink">Position / Role Title</label>
              <input
                id="staff-position"
                required
                maxLength={200}
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="Deposit Agent"
                className="mt-1 w-full rounded-lg border border-line bg-canvas p-2.5 text-xs focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="staff-interview" className="font-semibold text-ink">Interview Result</label>
              <select
                id="staff-interview"
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
            <label htmlFor="staff-notes" className="font-semibold text-ink">Recruitment Notes</label>
            <textarea
              id="staff-notes"
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-line bg-canvas p-2 text-xs focus:border-primary focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label htmlFor="staff-password" className="font-semibold text-ink">Initial password
              <input id="staff-password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-line bg-canvas p-2.5 text-xs focus:border-primary focus:outline-none" />
            </label>
            <label htmlFor="staff-password-confirm" className="font-semibold text-ink">Confirm initial password
              <input id="staff-password-confirm" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-1 w-full rounded-lg border border-line bg-canvas p-2.5 text-xs focus:border-primary focus:outline-none" />
            </label>
            <p className="col-span-2 text-ink-muted">Use 12–128 characters. Share the initial password privately. Staff can change it later in My profile.</p>
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
