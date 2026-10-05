import React from 'react';
import { Link } from 'react-router-dom';
import { CheckIcon, XIcon } from 'lucide-react';
import type { Candidate } from '../../types/domain';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import { IdText } from '../ui/Tags';

const CHECK_LABELS: Record<Candidate['checks'][number]['key'], string> = {
  department: 'Dept',
  platform: 'Platform',
  availability: 'Available',
  conflict: 'No conflict',
  workload: 'Workload',
  account: 'Active'
};

interface Props {
  candidates: Candidate[];
  canAssign: boolean;
  assigningId?: string | null;
  onAssign?: (id: string) => void;
}

// Candidates in manager-defined priority order with every eligibility check shown.
export function CandidateList({ candidates, canAssign, assigningId, onAssign }: Props) {
  if (candidates.length === 0) return <p className="px-5 py-6 text-sm text-ink-muted">No candidate evaluation yet. Run the search to evaluate freelancers.</p>;
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full min-w-[860px] text-[13px]">
        <caption className="sr-only">Replacement candidates</caption>
        <thead>
          <tr className="border-b border-line bg-mist/70 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
            <th scope="col" className="px-4 py-2.5 text-left">Priority</th>
            <th scope="col" className="px-3 py-2.5 text-left">Freelancer</th>
            {Object.values(CHECK_LABELS).map((l) =>
            <th key={l} scope="col" className="px-2 py-2.5 text-center">{l}</th>
            )}
            <th scope="col" className="px-3 py-2.5 text-left">Result</th>
            <th scope="col" className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => {
            const failed = c.checks.filter((k) => !k.passed);
            return (
              <tr key={c.freelancerId} className={cn('border-b border-line last:border-0', c.selected && 'bg-primary-50/60')}>
                <td className="px-4 py-2.5 font-semibold tabular">#{c.priority}</td>
                <td className="px-3 py-2.5">
                  <Link to={`/freelancers/${c.freelancerId}`} className="hover:text-primary"><IdText>{c.freelancerId}</IdText></Link>
                  <span className="ml-1.5 text-ink-muted">{c.name}</span>
                </td>
                {c.checks.map((k) =>
                <td key={k.key} className="px-2 py-2.5 text-center" title={k.label}>
                    {k.passed ? <CheckIcon className="mx-auto h-4 w-4 text-success" aria-label={`Passed: ${k.label}`} /> : <XIcon className="mx-auto h-4 w-4 text-danger" aria-label={`Failed: ${k.label}`} />}
                  </td>
                )}
                <td className="px-3 py-2.5">
                  {c.selected ? <StatusBadge status="CONFIRMED" label="Selected" size="xs" /> : c.eligible ? <StatusBadge status="AVAILABLE" label="Eligible" size="xs" /> : <span className="block max-w-[220px] truncate text-xs text-danger-600">{failed.map((f) => f.label).join(' · ')}</span>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {canAssign && !c.selected &&
                  <Button size="sm" variant="secondary" disabled={!c.eligible} loading={assigningId === c.freelancerId} onClick={() => onAssign?.(c.freelancerId)} title={c.eligible ? 'Assign manually' : 'Not eligible — assignment would be invalid'}>
                      Assign
                    </Button>
                  }
                </td>
              </tr>);

          })}
        </tbody>
      </table>
    </div>);

}