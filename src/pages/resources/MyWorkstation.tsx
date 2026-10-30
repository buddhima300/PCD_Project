import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { QueryView } from '../../components/ui/States';
export function MyWorkstation(){
  const q=useQuery({queryKey:['my-work'],queryFn:()=>api.getMyWork(),refetchInterval:15000});
  return <div className="space-y-4"><PageHeader title="Shared platform devices" description="Devices belong to your platform and department. Staff can use any available device during their shift."/><QueryView query={q}>{w=><Card className="space-y-3 p-5"><p className="text-sm font-semibold">{w.platform?.code ?? 'No platform assigned'} · {w.person.dept}</p><p className="text-sm text-ink-muted">Use your platform’s shared devices and return them to the platform at the end of your shift. Contact your supervisor for equipment support.</p></Card>}</QueryView></div>;
}
