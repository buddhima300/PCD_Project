import { useState } from 'react';
import { DownloadIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { Select } from '../ui/Field';
import { api, errorMessage, type ReportFilters } from '../../services/api';
import { reportDefinitions, type ReportKey } from '../../data/reports';
import { exportReport, type ReportFormat } from '../../utils/reportExport';
import { useSessionStore } from '../../hooks/useSessionStore';

export function ReportDownload({report,filters={},choices,label='Download report'}:{report:ReportKey;filters?:ReportFilters;choices?:ReportKey[];label?:string}) {
  const supervisor=useSessionStore(s=>s.user?.role==='SUPERVISOR');
  const [format,setFormat]=useState<ReportFormat>('PDF');
  const [selected,setSelected]=useState<ReportKey>(report);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  if(!supervisor)return null;
  const key=choices?selected:report;
  async function download(){setError('');setBusy(true);try{await exportReport(key,await api.getReport(key,filters),format);}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
  return <div className="flex flex-wrap items-center gap-2">
    {choices&&<Select compact aria-label="Download report type" value={selected} onChange={e=>setSelected(e.target.value as ReportKey)} options={choices.map(k=>({value:k,label:reportDefinitions.find(d=>d.key===k)!.title}))}/>}
    <Select compact className="w-28" aria-label="Report file format" value={format} onChange={e=>setFormat(e.target.value as ReportFormat)} options={[{value:'PDF',label:'PDF'},{value:'XLSX',label:'Excel'},{value:'CSV',label:'CSV'}]}/>
    <Button variant="secondary" size="sm" loading={busy} disabled={busy} icon={<DownloadIcon className="h-4 w-4"/>} onClick={download}>{label}</Button>
    {error&&<p role="alert" className="basis-full text-xs text-danger-600">{error}</p>}
  </div>;
}
