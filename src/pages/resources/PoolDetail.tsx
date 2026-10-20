import { Link,useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card,CardHeader } from '../../components/ui/Card';
import { QueryView } from '../../components/ui/States';
import { LaptopTable } from '../../components/resources/LaptopTable';
import { RegisterPlatformDevice } from '../../components/resources/RegisterPlatformDevice';
export function PoolDetail(){
  const {id=''}=useParams();
  const q=useQuery({queryKey:['pool',id],queryFn:()=>api.getPool(id)});
  return <QueryView query={q}>{({pool:p,laptops,incidents})=><div className="space-y-4"><PageHeader title={p.platformCode+' / '+p.dept} description={p.id+' · '+p.capacity+' shared devices capacity'} actions={<RegisterPlatformDevice poolId={id}/>}/><Card><CardHeader title="Shared device inventory" description="Devices are shared by the platform across shifts."/><LaptopTable rows={laptops}/></Card><Card className="p-4"><h2 className="text-sm font-semibold">Equipment incidents</h2>{incidents.length?incidents.map(i=><p key={i.id} className="mt-2 text-sm">{i.assetId} · {i.title} · {i.status}</p>):<p className="mt-2 text-sm text-ink-muted">No equipment incidents.</p>}</Card><Link to={'/platforms/'+p.platformCode} className="text-sm font-semibold text-primary">View platform</Link></div>}</QueryView>;
}
