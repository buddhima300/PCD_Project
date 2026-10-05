import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { useSessionStore } from '../../hooks/useSessionStore';
import { api, errorMessage } from '../../services/api';
import type { Severity } from '../../types/domain';

const CATEGORIES = ['Physical damage', 'Missing peripheral', 'Software / login', 'Network', 'Performance', 'Other'];

export function ReportIssue() {
  const role = useSessionStore((s) => s.user?.role);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const work = useQuery({ queryKey: ['my-work'], queryFn: () => api.getMyWork(), enabled: role === 'EMPLOYEE' || role === 'FREELANCER' });
  const [assetId, setAssetId] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [severity, setSeverity] = useState<Severity>('MEDIUM');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  useEffect(() => {
    if (work.data?.workstation && !assetId) setAssetId(work.data.workstation.assetId);
  }, [work.data, assetId]);
  const submit = useMutation({
    mutationFn: () => api.createIncident({ assetId: assetId.trim().toUpperCase(), category, severity, title, description }),
    onSuccess: (i) => {toast.success(`Incident ${i.id} created`, { description: 'Managers have been notified.' });qc.invalidateQueries();navigate('/incidents');}
  });

  return (
    <div>
      <PageHeader title="Report an issue" description="Report a problem with a laptop or workstation. High and critical issues take the laptop out of service." />
      <Card className="max-w-2xl p-5">
        <form className="space-y-4" onSubmit={(e) => {e.preventDefault();submit.mutate();}}>
          <Field label="Laptop asset ID" htmlFor="asset" hint={work.data?.workstation ? `Your workstation: ${work.data.workstation.workstationId}` : 'e.g. LAP-00041'}>
            <Input id="asset" value={assetId} onChange={(e) => setAssetId(e.target.value)} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="cat"><Select id="cat" value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORIES.map((c) => ({ value: c, label: c }))} /></Field>
            <Field label="Severity" htmlFor="sev"><Select id="sev" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} options={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))} /></Field>
          </div>
          <Field label="Title" htmlFor="title"><Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Screen flickering" /></Field>
          <Field label="Description" htmlFor="desc"><Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          {submit.isError && <p role="alert" className="rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger-600">{errorMessage(submit.error)}</p>}
          <div className="flex justify-end"><Button type="submit" loading={submit.isPending} disabled={!assetId || !title}>Submit incident</Button></div>
        </form>
      </Card>
    </div>);

}