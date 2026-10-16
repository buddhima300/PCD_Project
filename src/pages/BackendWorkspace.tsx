import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { backend, type PlatformRecord, type WorkerRecord, type AccountRecord, type Page } from '../services/backend';
import { useSessionStore } from '../hooks/useSessionStore';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { ErrorState, LoadingBlock, PermissionDenied } from '../components/ui/States';
import { announceSessionChange } from '../services/http';

type Field = { name: string; label: string; type?: string; options?: string[]; optional?: boolean; min?: number; max?: number };
const departments = ['GS', 'DP', 'WD', 'SAFETY'];
const managementGrants = ['accounts.manage', 'audit.read', 'disciplinary.approve', 'breaks.policy', 'breaks.review', 'reports.export', 'attendance.correct'];

function Form({ title, fields, submit, label = 'Save', success = 'Saved' }: { title: string; fields: Field[]; submit: (values: Record<string, string>) => Promise<unknown>; label?: string; success?: string }) {
  const formId = useId();
  const client = useQueryClient();
  const mutation = useMutation({ mutationFn: submit, retry: false, onSuccess: () => { void client.invalidateQueries({ queryKey: ['backend'] }); toast.success('Saved'); } });
  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    mutation.mutate(data, { onSuccess: () => form.reset() });
  };
  return <Card className="p-5"><h2 className="mb-4 font-semibold">{title}</h2><form onSubmit={send} className="grid gap-3 sm:grid-cols-2">
    {fields.map(field => <div key={field.name} className="grid gap-1 text-xs font-medium"><label htmlFor={`${formId}-${field.name}`}>{field.label}</label>
      {field.options ? <select id={`${formId}-${field.name}`} name={field.name} required={!field.optional} className="app-input rounded-lg border p-2"><option value="">Select…</option>{field.options.map(value => <option key={value}>{value}</option>)}</select> : <input id={`${formId}-${field.name}`} name={field.name} type={field.type ?? 'text'} min={field.min} max={field.max} minLength={field.type === 'password' ? 12 : undefined} maxLength={field.type === 'password' ? 128 : 200} required={!field.optional} autoComplete={field.type === 'password' ? 'new-password' : 'off'} className="app-input rounded-lg border p-2" />}
    </div>)}
    <div className="sm:col-span-2"><Button type="submit" loading={mutation.isPending}>{label}</Button></div>
    {mutation.isError && <p role="alert" className="text-sm text-danger sm:col-span-2">{mutation.error.message}</p>}
    {mutation.isSuccess && <p role="status" className="text-sm sm:col-span-2">{success}</p>}
  </form></Card>;
}

function Table<T extends { id?: string; code?: string }>({ page, columns, current, setPage, actions }: { page: Page<T>; columns: { key: keyof T; label: string }[]; current: number; setPage: (page: number) => void; actions?: (item: T) => ReactNode }) {
  return <Card><div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Saved records</caption><thead><tr>{columns.map(column => <th key={String(column.key)} scope="col" className="border-b p-3">{column.label}</th>)}{actions && <th scope="col" className="p-3">Actions</th>}</tr></thead><tbody>{page.items.map((item,index) => <tr key={item.id ?? item.code ?? index}>{columns.map(column => <td key={String(column.key)} className="border-b p-3">{item[column.key] == null ? '—' : typeof item[column.key] === 'object' ? JSON.stringify(item[column.key]) : String(item[column.key])}</td>)}{actions && <td className="border-b p-3">{actions(item)}</td>}</tr>)}</tbody></table></div>
    {page.items.length === 0 && <p className="p-6 text-sm text-ink-muted">No records yet.</p>}
    <div className="flex items-center gap-3 p-3 text-xs"><Button size="sm" variant="secondary" disabled={current <= 1} onClick={() => setPage(current-1)}>Previous</Button><span>Page {current} · {page.total} records</span><Button size="sm" variant="secondary" disabled={current * page.pageSize >= page.total} onClick={() => setPage(current+1)}>Next</Button></div>
  </Card>;
}

function Workers({ type }: { type?: string }) {
  const user = useSessionStore(s => s.user)!;
  const [page,setPage] = useState(1);
  const [selected,setSelected] = useState<WorkerRecord | null>(null);
  const query = useQuery({ queryKey: ['backend',user.id,'workers',page,type], queryFn: () => backend.workers(page,type) });
  return <div className="space-y-4"><PageHeader title={type === 'FREELANCER' ? 'Freelancers' : type === 'EMPLOYEE' ? 'Employees' : 'Workforce'} description="Registered worker records. Placement, training and scheduling are not yet available." />
    {query.isPending ? <LoadingBlock /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : <Table page={query.data} current={page} setPage={setPage} columns={[{key:'worker_number',label:'Worker number'},{key:'name',label:'Name'},{key:'email',label:'Email'},{key:'department_code',label:'Department'},{key:'worker_type',label:'Type'},{key:'status',label:'Status'},{key:'id',label:'Worker ID'}]} actions={user.role === 'SUPERVISOR' ? worker => <Button size="sm" variant="secondary" onClick={() => setSelected(worker)}>Change status</Button> : undefined} />}
    {selected && <Form key={`${selected.id}-${selected.revision}`} title={`Update ${selected.name}`} fields={[{name:'status',label:'Status',options:['ACTIVE','ON_LEAVE','SUSPENDED','INACTIVE']},{name:'reason',label:'Reason'}]} submit={async v => { await backend.workerStatus(selected,v.status,v.reason); setSelected(null); }} />}
  </div>;
}

function Platforms({ categoriesOnly = false }: { categoriesOnly?: boolean }) {
  const [page,setPage] = useState(1);
  const [categoryPage,setCategoryPage] = useState(1);
  const [selected,setSelected] = useState<PlatformRecord | null>(null);
  const user = useSessionStore(s => s.user)!;
  const categories = useQuery({queryKey:['backend',user.id,'categories',categoryPage],queryFn:()=>backend.categories(categoryPage)});
  const platforms = useQuery({queryKey:['backend',user.id,'platforms',page],queryFn:()=>backend.platforms(page),enabled:!categoriesOnly});
  const client = useQueryClient();
  const activate = useMutation({mutationFn:backend.activate,retry:false,onSuccess:()=>{ void client.invalidateQueries({queryKey:['backend']}); toast.success('Platform activated'); }});
  return <div className="space-y-4"><PageHeader title={categoriesOnly?'Platform categories':'Platforms'} description="Configure platform capacity before activation. Staffing assignments are not yet available." />
    <Form title="Create category" fields={[{name:'code',label:'Category code'},{name:'name',label:'Category name'},{name:'description',label:'Description',optional:true}]} submit={v=>backend.createCategory({code:v.code,name:v.name,description:v.description})} />
    {categoriesOnly ? categories.isPending ? <LoadingBlock /> : categories.isError ? <ErrorState error={categories.error} onRetry={()=>void categories.refetch()} /> : <Table page={categories.data} current={categoryPage} setPage={setCategoryPage} columns={[{key:'code',label:'Code'},{key:'name',label:'Name'},{key:'status',label:'Status'},{key:'id',label:'Category ID'}]} /> : <>
      {categories.isError && <ErrorState error={categories.error} onRetry={()=>void categories.refetch()} />}
      <Form title="Create platform" fields={[{name:'code',label:'Platform code'},{name:'name',label:'Platform name'},{name:'categoryId',label:'Category ID (from Categories)'},{name:'description',label:'Description',optional:true}]} submit={v=>backend.createPlatform({code:v.code,name:v.name,categoryId:v.categoryId,description:v.description})} />
      <Link to="/categories" className="text-sm text-primary underline">View category IDs</Link>
      {platforms.isPending ? <LoadingBlock /> : platforms.isError ? <ErrorState error={platforms.error} onRetry={()=>void platforms.refetch()} /> : <Table page={platforms.data} current={page} setPage={setPage} columns={[{key:'code',label:'Code'},{key:'name',label:'Name'},{key:'category_code',label:'Category'},{key:'lifecycle',label:'Lifecycle'},{key:'status',label:'Status'},{key:'revision',label:'Revision'}]} actions={platform=><div className="flex gap-2"><Button size="sm" variant="secondary" disabled={platform.lifecycle!=='SETUP'} onClick={()=>setSelected(platform)}>Capacity</Button><Button size="sm" disabled={platform.lifecycle!=='SETUP'||activate.isPending} onClick={()=>activate.mutate(platform)}>Activate</Button></div>} />}
      {activate.isError && <p role="alert" className="text-sm text-danger">{activate.error.message}</p>}
      {selected && <Form key={`${selected.id}-${selected.revision}`} title={`Capacity for ${selected.code}`} fields={[{name:'department',label:'Department',options:departments},{name:'seats',label:'Physical seats',type:'number',min:0,max:10000},{name:'morning',label:'Morning production target',type:'number',min:0},{name:'night',label:'Night production target',type:'number',min:0}]} submit={async v=>{await backend.capacity(selected,v.department,Number(v.seats),Number(v.morning),Number(v.night));setSelected(null);}} />}
    </>}
  </div>;
}

const loginInstructions = 'Account created. The new user can sign in at /login with the work email and initial password entered here. Share those credentials privately; they can change their password under My profile.';

function OperationalLinks() {
  const query = useQuery({ queryKey: ['backend','account-links'], queryFn: backend.accountLinks });
  const client = useQueryClient();
  const [accountId, setAccountId] = useState(''); const [workerId, setWorkerId] = useState('');
  const selected = query.data?.accounts.find(account => account.id === accountId);
  const mutation = useMutation({ mutationFn: () => backend.linkAccount(accountId, workerId), onSuccess: () => { void client.invalidateQueries({ queryKey: ['backend'] }); toast.success('Login linked. This worker must sign in again.'); } });
  return <Card className="space-y-3 p-5"><h2 className="font-semibold">Map login to operational worker</h2><p className="text-sm text-ink-muted">Choose the original workforce record this login should use for schedules, equipment and other workflows. Each worker can have one login.</p>
    {query.isPending ? <LoadingBlock /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : <form className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); mutation.mutate(); }}>
      <label className="grid gap-1 text-xs">Login account<select aria-label="Login account" required className="app-input rounded-lg border p-2" value={accountId} onChange={event => { setAccountId(event.target.value); setWorkerId(''); }}><option value="">Select login</option>{query.data.accounts.filter(account => account.role !== 'SUPERVISOR').map(account => <option key={account.id} value={account.id}>{account.name} · {account.email} · {account.worker_id ?? 'Unlinked'}</option>)}</select></label>
      <label className="grid gap-1 text-xs">Operational worker<select aria-label="Operational worker" required className="app-input rounded-lg border p-2" value={workerId} onChange={event => setWorkerId(event.target.value)}><option value="">Select worker</option>{query.data.workers.filter(worker => worker.role === selected?.role && !query.data.accounts.some(account => account.worker_id === worker.id && account.id !== accountId)).map(worker => <option key={worker.id} value={worker.id}>{worker.name} · {worker.id}</option>)}</select></label>
      <Button type="submit" loading={mutation.isPending} disabled={!accountId || !workerId}>Save login mapping</Button>{mutation.isError && <p role="alert" className="text-sm text-danger">{mutation.error.message}</p>}
    </form>}
  </Card>;
}
function Accounts() {
  const [page,setPage] = useState(1);
  const [selected,setSelected] = useState<AccountRecord|null>(null);
  const [workerPage,setWorkerPage] = useState(1);
  const [selectedWorker,setSelectedWorker] = useState<WorkerRecord|null>(null);
  const {user,permissions} = useSessionStore();
  const allowed = user?.role==='SUPERVISOR' && permissions.includes('accounts.manage');
  const query=useQuery({queryKey:['backend',user?.id,'accounts',page],queryFn:()=>backend.accounts(page),enabled:allowed});
  const unlinked=useQuery({queryKey:['backend',user?.id,'unlinked-workers',workerPage],queryFn:()=>backend.workers(workerPage,undefined,true),enabled:allowed});
  if(!allowed) return <PermissionDenied message="Account management requires the accounts.manage permission." />;
  return <div className="space-y-4"><PageHeader title="Account management" description="Register new staff from Workforce overview. Manage Supervisor accounts and existing login access here." />
    <OperationalLinks />

    <Form title="Add Supervisor" label="Create supervisor account" success={loginInstructions} fields={[{name:'name',label:'Supervisor full name'},{name:'email',label:'Supervisor work email',type:'email'},{name:'password',label:'Supervisor initial password (12–128 characters)',type:'password'},{name:'manageAccounts',label:'Allow this Supervisor to add and manage login accounts',type:'checkbox',optional:true},{name:'auditRead',label:'Allow this Supervisor to view audit logs',type:'checkbox',optional:true}]} submit={v=>backend.createAccount({name:v.name,email:v.email,role:'SUPERVISOR',password:v.password,permissions:[...(v.manageAccounts?['accounts.manage']:[]),...(v.auditRead?['audit.read']:[])]})} />
    <h2 className="font-semibold">Existing workers without a login</h2><p className="text-sm text-ink-muted">For workers registered earlier, select Create login. Their name, email and role are filled from their saved record.</p>
    {unlinked.isPending?<LoadingBlock/>:unlinked.isError?<ErrorState error={unlinked.error} onRetry={()=>void unlinked.refetch()}/>:unlinked.data&&<Table page={unlinked.data} current={workerPage} setPage={setWorkerPage} columns={[{key:'worker_number',label:'Worker number'},{key:'name',label:'Name'},{key:'email',label:'Email'},{key:'worker_type',label:'Type'}]} actions={worker=><Button size="sm" variant="secondary" onClick={()=>setSelectedWorker(worker)}>Create login</Button>}/>}
    {selectedWorker&&<Form key={selectedWorker.id} title={`Create login for ${selectedWorker.name} (${selectedWorker.email})`} label="Create worker login" success={loginInstructions} fields={[{name:'password',label:'Worker initial password (12–128 characters)',type:'password'}]} submit={async v=>{await backend.createAccount({name:selectedWorker.name,email:selectedWorker.email,role:selectedWorker.worker_type,workerId:selectedWorker.id,password:v.password});setSelectedWorker(null);toast.success('Worker login created. Share their work email and initial password privately.');}}/>}
    <h2 className="font-semibold">Login accounts</h2>
    {query.isPending?<LoadingBlock/>:query.isError?<ErrorState error={query.error} onRetry={()=>void query.refetch()}/>:query.data&&<Table page={query.data} current={page} setPage={setPage} columns={[{key:'name',label:'Name'},{key:'email',label:'Email'},{key:'role',label:'Role'},{key:'status',label:'Status'}]} actions={account=><Button size="sm" variant="secondary" disabled={account.id===user?.id} onClick={()=>setSelected(account)}>Manage access</Button>}/>}
    {selected&&<><p className="text-xs text-ink-muted">Available permissions: {managementGrants.join(', ')}. Leave permissions blank to keep existing grants; enter NONE to remove all grants.</p><Form key={selected.id} title={`Access for ${selected.name}`} fields={[{name:'status',label:'Account status',options:['ACTIVE','LOCKED']},{name:'permissions',label:'Permissions (comma separated)',optional:true}]} submit={async v=>{const grants=v.permissions.trim();await backend.access(selected.id,v.status,grants?grants==='NONE'?[]:grants.split(',').map(x=>x.trim()):undefined);setSelected(null);}}/></>}
  </div>;
}

function Notices() {
  const [page,setPage]=useState(1);
  const user=useSessionStore(s=>s.user)!;
  const query=useQuery({queryKey:['backend',user.id,'notifications',page],queryFn:()=>backend.notifications(page)});
  const client=useQueryClient();
  const read=useMutation({mutationFn:backend.read,retry:false,onSuccess:()=>void client.invalidateQueries({queryKey:['backend']})});
  return <div className="space-y-4"><PageHeader title="Notifications" description="Your saved in-app notifications."/>{query.isPending?<LoadingBlock/>:query.isError?<ErrorState error={query.error} onRetry={()=>void query.refetch()}/>:<Table page={query.data} current={page} setPage={setPage} columns={[{key:'title',label:'Title'},{key:'body',label:'Message'},{key:'created_at',label:'Created'},{key:'read_at',label:'Read at'}]} actions={item=><Button size="sm" disabled={!!item.read_at||read.isPending} onClick={()=>read.mutate(item.id)}>Mark read</Button>}/>} {read.isError&&<p role="alert">{read.error.message}</p>}</div>;
}

function Audits() {
  const [page,setPage]=useState(1);
  const {user,permissions}=useSessionStore();
  const allowed=user?.role==='SUPERVISOR'&&permissions.includes('audit.read');
  const query=useQuery({queryKey:['backend',user?.id,'audit',page],queryFn:()=>backend.audit(page),enabled:allowed});
  if(!allowed) return <PermissionDenied message="Audit access requires the audit.read permission."/>;
  return <div><PageHeader title="Audit log" description="Saved backend actions and their recorded details."/>{query.isPending?<LoadingBlock/>:query.isError?<ErrorState error={query.error} onRetry={()=>void query.refetch()}/>:query.data&&<Table page={query.data} current={page} setPage={setPage} columns={[{key:'created_at',label:'Time'},{key:'actor_id',label:'Actor ID'},{key:'action',label:'Action'},{key:'entity',label:'Entity'},{key:'entity_id',label:'Entity ID'},{key:'details',label:'Details'}]}/>}</div>;
}

function Profile() {
  const {user,clear}=useSessionStore();
  return <div className="space-y-4"><PageHeader title="My profile" description="Your server-authenticated account."/><Card className="space-y-2 p-5"><p>{user?.name}</p><p>{user?.email}</p><p>{user?.role}</p></Card><Form title="Change password" fields={[{name:'current',label:'Current password',type:'password'},{name:'next',label:'New password',type:'password'}]} submit={async v=>{await backend.password(v.current,v.next);announceSessionChange();clear();}} label="Change password and sign out"/></div>;
}

function Overview() {
  const user=useSessionStore(s=>s.user)!;
  const workers=useQuery({queryKey:['backend',user.id,'workers',1],queryFn:()=>backend.workers()});
  return <div className="space-y-4"><PageHeader title={`Welcome, ${user.name}`} description="Your connected workspace."/><Card className="p-5"><h2 className="font-semibold">Workforce records</h2>{workers.isPending?<LoadingBlock/>:workers.isError?<ErrorState error={workers.error} onRetry={()=>void workers.refetch()}/>:<p className="mt-2 text-sm">{workers.data.total} {user.role==='SUPERVISOR'?'registered workers':'linked worker records'}</p>}<div className="mt-4 flex flex-wrap gap-4 text-sm text-primary"><Link to="/workforce">Workforce</Link>{user.role==='SUPERVISOR'&&<><Link to="/register">Register worker</Link><Link to="/platforms">Platforms</Link><Link to="/categories">Categories</Link><Link to="/settings">Accounts</Link><Link to="/audit">Audit log</Link></>}<Link to="/notifications">Notifications</Link><Link to="/profile">My profile</Link></div></Card><Card className="p-5 text-sm text-ink-muted">Scheduling, placement, attendance, equipment, breaks and disciplinary workflows will become available as their server workflows are completed.</Card></div>;
}

export function BackendWorkspace() {
  const location=useLocation();
  const pathname=location.pathname === '/account-security' ? '/profile' : location.pathname.replace(/^\/account-admin/, '') || '/settings';
  const user=useSessionStore(s=>s.user)!;
  const supervisorOnly=['/employees','/freelancers','/register','/platforms','/categories','/operations','/capacity','/platform-config','/settings','/audit'];
  if(supervisorOnly.includes(pathname)&&user.role!=='SUPERVISOR') return <PermissionDenied/>;
  if(pathname==='/')return <Overview/>;
  if(pathname==='/register')return <Navigate to="/register" replace/>;
  if(['/workforce','/employees','/freelancers'].includes(pathname))return <Workers key={pathname} type={pathname==='/employees'?'EMPLOYEE':pathname==='/freelancers'?'FREELANCER':undefined}/>;
  if(pathname==='/categories')return <Platforms key="categories" categoriesOnly/>;
  if(['/platforms','/operations','/capacity','/platform-config'].includes(pathname))return <Platforms key="platforms"/>;
  if(pathname==='/notifications')return <Notices/>;
  if(pathname==='/audit')return <Audits/>;
  if(pathname==='/settings')return <Accounts/>;
  if(pathname==='/profile')return <Profile/>;
  return <Card className="p-6"><h1 className="text-lg font-semibold">This workflow is not available yet</h1><p className="mt-2 text-sm text-ink-muted">This feature needs its server workflow before it can be used. Your data has not been changed.</p><Link to="/" className="mt-4 inline-block text-sm text-primary underline">Return to dashboard</Link></Card>;
}
