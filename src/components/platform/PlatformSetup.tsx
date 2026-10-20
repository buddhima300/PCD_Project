import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { api, errorMessage } from '../../services/api';
import { useSessionStore } from '../../hooks/useSessionStore';
import type { DeptCode, Platform, ShiftCode } from '../../types/domain';
import type { CategoryCreateInput, PlatformCapacityInput } from '../../types/platformSetup';
import { deptNames } from '../../utils/format';

const DEPTS: DeptCode[] = ['GS', 'DP', 'WD', 'SAFETY'];
const blankCategory = (): CategoryCreateInput => ({ code: '', name: '', description: '' });
const emptyCapacity = (): PlatformCapacityInput => ({ departments: {}, staffingTargets: {} });

function CategoryFields({ value, onChange }: { value: CategoryCreateInput; onChange: (value: CategoryCreateInput) => void }) {
  return <div className="space-y-4">
    <Field label="Category code" htmlFor="new-category-code" hint="2–12 letters or numbers, starting with a letter."><Input id="new-category-code" value={value.code} onChange={e => onChange({ ...value, code: e.target.value.toUpperCase() })} maxLength={12} /></Field>
    <Field label="Category name" htmlFor="new-category-name"><Input id="new-category-name" value={value.name} onChange={e => onChange({ ...value, name: e.target.value })} maxLength={120} /></Field>
    <Field label="Description (optional)" htmlFor="new-category-description"><Textarea id="new-category-description" value={value.description} onChange={e => onChange({ ...value, description: e.target.value })} maxLength={1000} /></Field>
  </div>;
}

export function PlatformSetupActions({ categoryCode = '', platformCode, compact = false }: { categoryCode?: string; platformCode?: string; compact?: boolean }) {
  const role = useSessionStore(s => s.user?.role);
  const [mode, setMode] = useState<'category' | 'platform' | null>(null);
  if (role !== 'SUPERVISOR') return null;
  return <>
    <div className="flex flex-wrap gap-2">
      {!platformCode && <Button variant="secondary" size={compact ? 'sm' : 'md'} onClick={() => setMode('category')}>Add category</Button>}
      <Button size={compact ? 'sm' : 'md'} onClick={() => setMode('platform')}>{platformCode ? 'Manage platform setup' : 'Add platform'}</Button>
    </div>
    {mode === 'category' && <CategoryWizard onClose={() => setMode(null)} />}
    {mode === 'platform' && <PlatformWizard categoryCode={categoryCode} platformCode={platformCode} onClose={() => setMode(null)} />}
  </>;
}

function CategoryWizard({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient(); const [value, setValue] = useState(blankCategory); const [review, setReview] = useState(false); const [error, setError] = useState(''); const [discard, setDiscard] = useState(false);
  const save = useMutation({ mutationFn: () => api.createPlatformCategory(value), onSuccess: c => { void qc.invalidateQueries(); toast.success(`Category ${c.code} created`); onClose(); }, onError: e => setError(errorMessage(e)) });
  const close = () => { if (!save.isPending) { if (value.code || value.name || value.description) setDiscard(true); else onClose(); } };
  const next = () => { if (!/^[A-Z][A-Z0-9]{1,11}$/.test(value.code.trim()) || !value.name.trim()) { setError('Enter a valid category code and name.'); return; } setError(''); setReview(true); };
  return <Dialog open onClose={close} title="Add platform category" description={review ? 'Step 2 of 2 · Review' : 'Step 1 of 2 · Category details'} footer={<><Button variant="secondary" onClick={review ? () => setReview(false) : close} disabled={save.isPending}>{review ? 'Back' : 'Cancel'}</Button><Button loading={save.isPending} onClick={review ? () => save.mutate() : next}>{review ? 'Create category' : 'Review'}</Button></>}>
    {discard ? <div className="space-y-3"><p>Discard these unsaved category details?</p><Button variant="secondary" onClick={() => setDiscard(false)}>Keep editing</Button> <Button variant="danger" onClick={onClose}>Discard</Button></div> : review ? <dl className="space-y-3"><dt className="text-xs text-ink-muted">Category</dt><dd className="font-semibold">{value.code} · {value.name}</dd><dd>{value.description || 'No description'}</dd><dd className="text-sm text-ink-muted">The category will be active and available when creating platforms.</dd></dl> : <CategoryFields value={value} onChange={setValue} />}
    {error && <p role="alert" className="mt-4 text-sm text-danger-600">{error}</p>}
  </Dialog>;
}

function PlatformWizard({ categoryCode, platformCode, onClose }: { categoryCode: string; platformCode?: string; onClose: () => void }) {
  const qc = useQueryClient(); const navigate = useNavigate();
  const [step, setStep] = useState(platformCode ? 2 : 0); const [code, setCode] = useState(platformCode ?? ''); const [category, setCategory] = useState(categoryCode); const [newCategory, setNewCategory] = useState(false); const [categoryValue, setCategoryValue] = useState(blankCategory);
  const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [capacity, setCapacity] = useState<PlatformCapacityInput>(emptyCapacity); const [dirty, setDirty] = useState(false); const [discard, setDiscard] = useState(false); const [error, setError] = useState('');
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.listCategories() });
  const detail = useQuery({ queryKey: ['platform', code], queryFn: () => api.getPlatform(code), enabled: !!code && step >= 2 });
  const trainings = useQuery({ queryKey: ['trainings', { platform: code }], queryFn: () => api.listTrainings({ platform: code }), enabled: !!code && step >= 3 });
  useEffect(() => {
    if (detail.data && !dirty) { const p = detail.data.platform; setCapacity({ departments: { ...p.departments }, staffingTargets: Object.fromEntries(DEPTS.map(d => [d, p.staffingTargets?.[d] ?? { MORNING: p.departments[d] ?? 0, NIGHT: p.departments[d] ?? 0 }])) }); }
  }, [detail.data, dirty]);
  const refresh = () => qc.invalidateQueries();
  const fail = (e: unknown) => setError(errorMessage(e));
  const create = useMutation({ mutationFn: () => api.createPlatform({ categoryCode: category, category: newCategory ? categoryValue : undefined, code, name, description }), onSuccess: p => { setCode(p.code); setDirty(false); setStep(2); refresh(); toast.success(`${p.code} created in setup`); }, onError: fail });
  const configure = useMutation({ mutationFn: () => api.configurePlatformCapacity(code, { ...capacity, expectedRevision:detail.data?.platform.revision ?? 1 }), onSuccess: async () => { setDirty(false); await refresh(); setStep(3); toast.success('Capacity and staffing targets saved'); }, onError: fail });
  const activate = useMutation({ mutationFn: () => api.activatePlatform(code), onSuccess: async () => { await refresh(); toast.success(`${code} activated`); onClose(); navigate(`/platforms/${code}`); }, onError: fail });
  const busy = create.isPending || configure.isPending || activate.isPending;
  const close = () => { if (busy) return; if (dirty) setDiscard(true); else onClose(); };
  const selectedCategory = newCategory ? categoryValue.code.trim() : category;
  const next = () => {
    setError('');
    if (step === 0) {
      if (!selectedCategory || (newCategory && (!/^[A-Z][A-Z0-9]{1,11}$/.test(selectedCategory) || !categoryValue.name.trim()))) { setError('Choose an active category or enter a valid new category code and name.'); return; }
      if (!code || !code.startsWith(`${selectedCategory}-`)) setCode(`${selectedCategory}-1`);
      setStep(1);
    } else if (step === 1) create.mutate();
    else if (step === 2) configure.mutate();
    else if (step === 3) setStep(4);
  };
  const p: Platform | undefined = detail.data?.platform;
  const steps = ['Category', 'Platform', 'Capacity', 'Workforce', 'Review'];
  const changeCapacity = (d: DeptCode, field: 'seats' | ShiftCode, value: number) => {
    setDirty(true); setCapacity(prev => field === 'seats' ? { ...prev, departments: { ...prev.departments, [d]: value } } : { ...prev, staffingTargets: { ...prev.staffingTargets, [d]: { ...(prev.staffingTargets[d] ?? { MORNING: 0, NIGHT: 0 }), [field]: value } } });
  };
  return <Dialog open size="lg" onClose={close} title={platformCode ? `Manage ${code}` : 'Add platform'} description={`Step ${step + 1} of 5 · ${steps[step]}`} footer={<>
    <Button variant="secondary" disabled={busy} onClick={close}>{code && step >= 2 ? 'Close · keep saved work' : 'Cancel'}</Button>
    {step > (code && step >= 2 ? 2 : 0) && <Button variant="secondary" disabled={busy} onClick={() => { setStep(step - 1); setError(''); }}>Back</Button>}
    {step < 4 ? <Button onClick={next} disabled={(step === 2 && !detail.data) || (step === 0 && categories.isPending)} loading={create.isPending || configure.isPending}>{step === 1 ? 'Create platform in setup' : step === 2 ? 'Save capacity & continue' : step === 3 ? 'Review platform' : 'Continue'}</Button> : p?.lifecycle === 'SETUP' ? <Button loading={activate.isPending} disabled={busy} onClick={() => activate.mutate()}>Activate platform</Button> : <Button disabled={busy} onClick={() => { onClose(); navigate(`/platforms/${code}`); }}>Open platform</Button>}
  </>}>
    <ol aria-label="Platform setup progress" className="mb-5 flex flex-wrap gap-2 text-xs">{steps.map((label, i) => <li key={label} aria-current={i === step ? 'step' : undefined} className={`rounded-lg px-3 py-2 ${i === step ? 'bg-primary-50 font-semibold text-primary-700' : 'bg-mist text-ink-muted'}`}>{i + 1}. {label}</li>)}</ol>
    {discard && <div className="mb-4 space-y-3 rounded-xl border border-line p-4"><p className="text-sm">Discard unsaved form changes? Previously saved records and assignments will remain.</p><Button variant="secondary" onClick={() => setDiscard(false)}>Keep editing</Button> <Button variant="danger" onClick={onClose}>Discard changes</Button></div>}
    <fieldset disabled={busy} className="min-w-0 space-y-4">
      {step === 0 && <>
        <div className="flex gap-2"><Button variant={newCategory ? 'secondary' : 'primary'} onClick={() => { setNewCategory(false); setDirty(true); }}>Existing category</Button><Button variant={newCategory ? 'primary' : 'secondary'} onClick={() => { setNewCategory(true); setDirty(true); }}>New category</Button></div>
        {newCategory ? <CategoryFields value={categoryValue} onChange={v => { setCategoryValue(v); setDirty(true); }} /> : <Field label="Platform category" htmlFor="setup-category"><Select id="setup-category" placeholder="Choose category" value={category} onChange={e => { setCategory(e.target.value); setDirty(true); }} options={(categories.data ?? []).filter(c => c.status === 'ACTIVE').map(c => ({ value: c.code, label: `${c.code} · ${c.name}` }))} /></Field>}
        {categories.isError && <p role="alert">{errorMessage(categories.error)} <Button variant="secondary" onClick={() => void categories.refetch()}>Retry</Button></p>}
        <p className="text-xs text-ink-muted">A new category is saved together with the platform at the next step.</p>
      </>}
      {step === 1 && <>
        <p className="text-sm text-ink-muted">Category: {selectedCategory} · New platforms start in setup.</p>
        <Field label="Platform code" htmlFor="setup-code" hint={`Use the category prefix and a number, e.g. ${selectedCategory}-1.`}><Input id="setup-code" value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setDirty(true); }} /></Field>
        <Field label="Platform name" htmlFor="setup-name"><Input id="setup-name" value={name} maxLength={120} onChange={e => { setName(e.target.value); setDirty(true); }} /></Field>
        <Field label="Description (optional)" htmlFor="setup-description"><Textarea id="setup-description" value={description} maxLength={1000} onChange={e => { setDescription(e.target.value); setDirty(true); }} /></Field>
      </>}
      {step === 2 && <>
        <p className="text-sm text-ink-muted">{code} · Enter shared device counts and production staffing targets. Devices are shared across shifts; each shift target must fit within its department seats.</p>
        {detail.isPending ? <p role="status">Loading configuration…</p> : detail.isError ? <p role="alert">{errorMessage(detail.error)} <Button onClick={() => void detail.refetch()}>Retry</Button></p> : DEPTS.map(d => <div key={d} className="rounded-xl border border-line p-4"><h3 className="mb-3 text-sm font-semibold">{d} · {deptNames[d]}</h3><div className="grid gap-3 sm:grid-cols-3"><Field label="Shared devices" htmlFor={`seats-${d}`}><Input id={`seats-${d}`} type="number" min={0} max={10000} value={capacity.departments[d] ?? 0} onChange={e => changeCapacity(d, 'seats', Number(e.target.value))} /></Field>{(['MORNING', 'NIGHT'] as const).map(s => <Field key={s} label={`${s === 'MORNING' ? 'Morning' : 'Night'} staffing target`} htmlFor={`target-${d}-${s}`}><Input id={`target-${d}-${s}`} type="number" min={0} max={capacity.departments[d] ?? 0} value={capacity.staffingTargets[d]?.[s] ?? 0} onChange={e => changeCapacity(d, s, Number(e.target.value))} /></Field>)}</div></div>)}
        <p className="text-xs text-ink-muted">Zero devices disables a department. This count sets platform capacity; register individual assets in equipment inventory for inventory and maintenance.</p>
      </>}
      {step === 3 && <div className="space-y-4"><h3 className="text-sm font-semibold">Staffing is managed in Workforce</h3><p className="text-sm text-ink-muted">Register staff, start training and evaluate readiness before assigning a production platform. You can activate this platform before staffing it.</p><div className="flex flex-wrap gap-3"><Link to="/training" className="text-sm font-semibold text-primary">Manage training</Link><Link to="/workforce/assignments" className="text-sm font-semibold text-primary">Assign qualified staff</Link></div><Coverage platform={p} trainings={trainings.data ?? []}/></div>}
      {step === 4 && <><h3 className="font-semibold">{p?.name || code} · {code}</h3><p className="text-sm">Category {p?.categoryCode} · {p?.lifecycle === 'SETUP' ? 'Setup' : 'Operational'}</p><Coverage platform={p} trainings={trainings.data ?? []} /><p className="text-sm text-ink-muted">Activation makes this platform available for operations. Staffing gaps do not block activation. Training qualification and production assignment remain separate actions.</p></>}
    </fieldset>
    {error && <p role="alert" className="mt-4 text-sm text-danger-600">{error}</p>}
  </Dialog>;
}

export function Coverage({ platform, trainings }: { platform?: Platform & { occupancy?: { dept: DeptCode; morning: number; night: number }[] }; trainings: { dept: DeptCode; shift: ShiftCode; promotedAt?: string; trainingStatus: string; trainingOnly?: boolean }[] }) {
  return <div className="space-y-2 rounded-xl bg-mist p-4"><h3 className="text-sm font-semibold">Saved capacity & coverage</h3>{DEPTS.filter(d => platform?.departments[d]).map(d => <div key={d} className="border-t border-line pt-2 text-xs"><p className="font-semibold">{d} · {platform?.departments[d]} shared devices</p>{(['MORNING', 'NIGHT'] as const).map(s => {
    const production = platform?.occupancy?.find(o => o.dept === d)?.[s === 'MORNING' ? 'morning' : 'night'] ?? 0; const target = platform?.staffingTargets?.[d]?.[s] ?? platform?.departments[d] ?? 0; const training = trainings.filter(t => t.dept === d && t.shift === s && (t.trainingOnly ? !t.promotedAt && t.trainingStatus !== 'TRAINING_FAILED' : ['IN_TRAINING', 'TRAINING_EXTENDED', 'TRAINING_ASSIGNED'].includes(t.trainingStatus))).length;
    return <p key={s} className="mt-1 text-ink-muted">{s === 'MORNING' ? 'Morning' : 'Night'}: {production} / {target} production · {Math.max(0, target - production)} staffing gap · {training} training · {Math.max(0, (platform?.departments[d] ?? 0) - production - training)} seats free</p>;
  })}</div>)}</div>;
}
